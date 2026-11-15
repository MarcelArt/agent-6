import "@tanstack/react-start/server-only"

import { MaxTurnsExceededError } from "@openai/agents"
import { z } from "zod"
import { getConfig } from "./config"
import { requireSession } from "./session"
import { createApplicationManagement } from "./application-management"
import {
  ConversationError,
  createConversationsRepository,
} from "./repositories/conversations"
import { ensureFresh } from "./repository-sync"
import { createSupportRun } from "./support-agent"
import { createGuardrailClassifier } from "./guardrail"
import { createUploads } from "./uploads"
import type { Auth } from "./auth"
import type { ConversationsRepository } from "./repositories/conversations"
import type { SupportRun } from "./support-agent"
import type { GuardrailClassifier } from "./guardrail"
import type { Uploads } from "./uploads"
import type { ApplicationScope } from "@/lib/applications"
import type { ChatEvent, ReplyInput } from "@/lib/chat"
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  MAX_QUESTIONS_IN_A_ROW,
  MAX_QUESTION_OPTIONS,
  REPLY_FAILED,
  REPLY_LIMIT,
  REPLY_TIME_LIMIT_MS,
  GUARDRAIL_FAILED,
  GUARDRAIL_REFUSED,
} from "@/lib/chat"

/** A message needs text, pictures or both. */
export const chatMessageInput = z
  .object({
    message: z.string().trim().max(MAX_MESSAGE_LENGTH),
    images: z
      .array(z.string().min(1).max(64))
      .max(MAX_IMAGES_PER_MESSAGE)
      .optional(),
    choices: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_QUESTION_OPTIONS - 1)
      )
      .max(MAX_QUESTION_OPTIONS)
      .optional(),
  })
  .strict()
  .refine(
    (input) => input.message || input.images?.length || input.choices?.length
  )
export const replyInput = z.union([
  chatMessageInput,
  z.object({ retry: z.literal(true) }).strict(),
  z.object({ start: z.literal(true) }).strict(),
])

export function createChatManagement(
  deps: {
    auth?: Auth
    conversations?: ConversationsRepository
    getScope?: (
      headers: Headers,
      applicationId: string
    ) => Promise<ApplicationScope | null>
    fresh?: typeof ensureFresh
    run?: SupportRun
    classify?: GuardrailClassifier
    uploads?: Pick<Uploads, "modelInput">
    timeLimitMs?: number
  } = {}
) {
  const conversations = deps.conversations ?? createConversationsRepository()
  const scope =
    deps.getScope ??
    ((headers, applicationId) =>
      createApplicationManagement().getApplicationScope(headers, applicationId))
  const user = (headers: Headers) =>
    requireSession({ auth: deps.auth, headers })
  return {
    async applications(headers: Headers) {
      await user(headers)
      return conversations.applications()
    },
    async create(
      headers: Headers,
      applicationId: string,
      text: string,
      images: Array<string> = []
    ) {
      const owner = await user(headers)
      const parsed = chatMessageInput.safeParse({ message: text, images })
      if (!parsed.success)
        throw new ConversationError(
          `Write a message of up to ${MAX_MESSAGE_LENGTH} characters, with at most ${MAX_IMAGES_PER_MESSAGE} pictures.`
        )
      const application = conversations
        .applications()
        .find((item) => item.id === applicationId)
      if (!application?.ready)
        throw new ConversationError(
          "This Application is not ready for questions yet. Please choose another Application."
        )
      return conversations.create(
        owner.id,
        applicationId,
        parsed.data.message,
        parsed.data.images
      )
    },
    async get(headers: Headers, id: string) {
      const reader = await user(headers)
      return conversations.get(id, reader.id, reader.role === "admin")
    },
    async reply(headers: Headers, id: string, input: ReplyInput) {
      const owner = await user(headers)
      const parsed = replyInput.safeParse(input)
      if (!parsed.success)
        throw new ConversationError(
          "Please write a shorter message and try again."
        )
      const claim = conversations.begin(id, owner.id, parsed.data)
      const current = () =>
        conversations.get(id, owner.id, owner.role === "admin")
      let connected = true
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          function emit(event: ChatEvent) {
            if (connected) {
              try {
                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
              } catch {
                connected = false
              }
            }
          }
          // Keep saving after a browser disconnect/reload; the next page polls
          // the persisted reply. The deadline bounds this independent work.
          void (async () => {
            const abort = new AbortController()
            let timer: ReturnType<typeof setTimeout> | undefined
            const deadline = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                abort.abort()
                reject(new Error("Reply deadline"))
              }, deps.timeLimitMs ?? REPLY_TIME_LIMIT_MS)
            })
            let content = ""
            const guardrail = { passed: false }
            emit({
              type: "snapshot",
              conversation: current(),
            })
            emit({ type: "progress" })
            try {
              const result = await Promise.race([
                deadline,
                (async () => {
                  const applicationScope = await scope(
                    headers,
                    claim.conversation.applicationId
                  )
                  if (!applicationScope)
                    throw new Error("Application unavailable")
                  const allowed = await (
                    deps.classify ?? createGuardrailClassifier(getConfig())
                  )(
                    {
                      application: {
                        name: applicationScope.application.name,
                        description: applicationScope.application.description,
                      },
                      recent: claim.guardrailContext,
                      message: claim.question,
                      hasImages: claim.images.length > 0,
                    },
                    abort.signal
                  )
                  abort.signal.throwIfAborted()
                  if (allowed !== true) return { refused: true as const }
                  guardrail.passed = true
                  if (!claim.conversation.refreshedAt) {
                    await Promise.allSettled(
                      applicationScope.attachments
                        .filter((item) => item.kind === "repository")
                        .map(({ resource }) =>
                          (deps.fresh ?? ensureFresh)(resource.id, 3 * 60_000)
                        )
                    )
                    abort.signal.throwIfAborted()
                    conversations.markRefreshed(id)
                  }
                  abort.signal.throwIfAborted()
                  const prepared = await (
                    deps.uploads ?? createUploads({ conversations })
                  ).modelInput(claim.history, claim.images)
                  abort.signal.throwIfAborted()
                  const answer = await (
                    deps.run ?? createSupportRun(getConfig())
                  )({
                    scope: applicationScope,
                    conversationId: id,
                    messageId: claim.assistantId,
                    history: prepared.history,
                    question: claim.question,
                    images: prepared.images,
                    mayAsk: claim.questionsInARow < MAX_QUESTIONS_IN_A_ROW,
                    signal: abort.signal,
                    onText(text) {
                      if (abort.signal.aborted) return
                      // Bound persisted/browser output too, even for a bad server.
                      content += text
                      if (content.length > 24_000) {
                        abort.abort()
                        throw new Error("Answer too long")
                      }
                      conversations.savePartial(claim.assistantId, content)
                      emit({ type: "delta", text })
                    },
                    onProgress() {
                      emit({ type: "progress" })
                    },
                    onActivity(activity) {
                      if (!abort.signal.aborted)
                        conversations.recordActivity(claim.assistantId, {
                          ...activity,
                          id: `${claim.assistantId}:${activity.id}`,
                        })
                    },
                  })
                  return { ...answer, history: prepared.store(answer.history) }
                })(),
              ])
              if ("refused" in result) {
                conversations.refuse(
                  id,
                  claim.assistantId,
                  claim.userMessageId,
                  GUARDRAIL_REFUSED
                )
              } else {
                conversations.finish(
                  id,
                  claim.assistantId,
                  result.text,
                  result.history,
                  result.imagesUnread,
                  result.asked
                )
              }
            } catch (error) {
              conversations.recordActivity(claim.assistantId, {
                id: `${claim.assistantId}:error`,
                name: guardrail.passed ? "Agent run" : "Guardrail",
                input: "",
                status: "error",
                createdAt: Date.now(),
                error: abort.signal.aborted
                  ? "The reply reached its time limit."
                  : error instanceof MaxTurnsExceededError
                    ? "The agent reached its turn limit."
                    : error &&
                        typeof error === "object" &&
                        "status" in error &&
                        typeof error.status === "number"
                      ? `The model request failed (HTTP ${error.status}).`
                      : "The reply failed. Check the model and Application connections, then retry.",
              })
              if (!guardrail.passed) {
                conversations.refuse(
                  id,
                  claim.assistantId,
                  claim.userMessageId,
                  GUARDRAIL_FAILED
                )
              } else {
                conversations.finish(
                  id,
                  claim.assistantId,
                  error instanceof MaxTurnsExceededError || abort.signal.aborted
                    ? REPLY_LIMIT
                    : REPLY_FAILED
                )
              }
            } finally {
              clearTimeout(timer)
              emit({
                type: "done",
                conversation: current(),
              })
              if (connected) controller.close()
            }
          })().catch(() => {
            if (connected) controller.close()
          })
        },
        cancel() {
          connected = false
        },
      })
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      })
    },
  }
}
