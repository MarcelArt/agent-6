import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { getDb } from "./db"
import {
  application,
  conversation,
  filedIssue,
  message,
  repository,
  repositoryAttachment,
  upload,
} from "./schema"
import type { Db } from "./db"
import type { AgentInputItem } from "@openai/agents"
import type {
  AskedQuestion,
  ChatImage,
  ChatMessage,
  Conversation,
  FiledIssueRecord,
  InteractiveQuestion,
  ReplyInput,
  Report,
} from "@/lib/chat"
import { REPLY_FAILED, REPLY_TIME_LIMIT_MS } from "@/lib/chat"

export class ConversationError extends Error {
  constructor(
    description: string,
    public readonly status = 400
  ) {
    super(description)
  }
}

export function createConversationsRepository(db: Db = getDb()) {
  function owned(id: string, userId: string) {
    const found = db
      .select()
      .from(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
      .get()
    if (!found)
      throw new ConversationError("This Conversation is not available.", 404)
    return found
  }
  function messages(id: string, admin = false): Array<ChatMessage> {
    const reports = new Map<string, Array<Report>>()
    for (const row of db
      .select()
      .from(filedIssue)
      .where(eq(filedIssue.conversationId, id))
      .orderBy(asc(filedIssue.createdAt), asc(sql`rowid`))
      .all()) {
      // Issue details and failures never reach a Client's browser.
      const report: Report | null =
        row.outcome === "failed"
          ? admin
            ? {
                id: row.id,
                outcome: "failed",
                repository: row.repository,
                reason: row.error ?? "",
              }
            : null
          : {
              id: row.id,
              outcome: row.outcome as "new" | "comment",
              ...(admin && row.issueNumber !== null && row.url
                ? {
                    issue: {
                      repository: row.repository,
                      number: row.issueNumber,
                      url: row.url,
                    },
                  }
                : {}),
            }
      if (report)
        reports.set(row.messageId, [
          ...(reports.get(row.messageId) ?? []),
          report,
        ])
    }
    const images = new Map<string, Array<ChatImage>>()
    for (const row of db
      .select({ upload })
      .from(upload)
      .innerJoin(message, eq(message.id, upload.messageId))
      .where(eq(message.conversationId, id))
      .orderBy(asc(upload.position))
      .all()
      .map((found) => found.upload))
      images.set(row.messageId!, [
        ...(images.get(row.messageId!) ?? []),
        { id: row.id, name: row.name, width: row.width, height: row.height },
      ])
    return db
      .select()
      .from(message)
      .where(eq(message.conversationId, id))
      .orderBy(asc(message.createdAt), asc(sql`rowid`))
      .all()
      .map((row) => ({
        id: row.id,
        role: row.role as ChatMessage["role"],
        content: row.content,
        status: row.status as ChatMessage["status"],
        createdAt: row.createdAt.getTime(),
        reports: reports.get(row.id) ?? [],
        images: images.get(row.id) ?? [],
        imagesUnread: row.imagesUnread,
        ...(row.question
          ? {
              question: {
                ...(JSON.parse(row.question) as AskedQuestion),
                answer: row.answer
                  ? (JSON.parse(row.answer) as InteractiveQuestion["answer"])
                  : null,
              },
            }
          : {}),
      }))
  }
  function recover(id: string, userId: string) {
    db.transaction(
      () => {
        const found = owned(id, userId)
        if (found.runningUntil && found.runningUntil.getTime() < Date.now()) {
          db.update(message)
            .set({ status: "error", content: REPLY_FAILED })
            .where(
              and(eq(message.conversationId, id), eq(message.status, "pending"))
            )
            .run()
          db.update(conversation)
            .set({ runningUntil: null })
            .where(eq(conversation.id, id))
            .run()
        }
      },
      { behavior: "immediate" }
    )
  }
  /** `admin` adds what only Admins may see about Filed Issues. */
  function get(id: string, userId: string, admin = false): Conversation {
    recover(id, userId)
    const found = owned(id, userId)
    const app = db
      .select({ id: application.id, name: application.name })
      .from(application)
      .where(eq(application.id, found.applicationId))
      .get()!
    return {
      id,
      title: found.title,
      application: app,
      messages: messages(id, admin),
    }
  }
  /** Adds the user's message with the pictures they picked, and the answer to write. */
  function queue(
    id: string,
    userId: string,
    content: string,
    images: Array<string>,
    now: Date
  ) {
    const messageId = randomUUID()
    db.insert(message)
      .values([
        {
          id: messageId,
          conversationId: id,
          role: "user",
          content,
          status: "complete",
          createdAt: now,
        },
        {
          id: randomUUID(),
          conversationId: id,
          role: "assistant",
          content: "",
          status: "queued",
          createdAt: now,
        },
      ])
      .run()
    images.forEach((imageId, position) => {
      // Only the user's own pictures, and each on one message only.
      const linked = db
        .update(upload)
        .set({ messageId, position })
        .where(
          and(
            eq(upload.id, imageId),
            eq(upload.userId, userId),
            isNull(upload.messageId)
          )
        )
        .returning({ id: upload.id })
        .all()
      if (!linked.length)
        throw new ConversationError(
          "A picture could not be added. Please attach it again."
        )
    })
  }
  return {
    owned,
    get,
    applications() {
      return db
        .select({
          id: application.id,
          name: application.name,
          description: application.description,
          ready:
            sql<boolean>`count(case when ${repository.status} = 'ready' then 1 end) > 0`.mapWith(
              Boolean
            ),
        })
        .from(application)
        .leftJoin(
          repositoryAttachment,
          eq(repositoryAttachment.applicationId, application.id)
        )
        .leftJoin(
          repository,
          eq(repository.id, repositoryAttachment.repositoryId)
        )
        .groupBy(application.id)
        .orderBy(asc(sql`lower(${application.name})`), asc(application.id))
        .all()
    },
    create(
      userId: string,
      applicationId: string,
      content: string,
      images: Array<string> = []
    ) {
      const id = randomUUID(),
        now = new Date()
      db.transaction(() => {
        db.insert(conversation)
          .values({
            id,
            userId,
            applicationId,
            title: content.replace(/\s+/g, " ").slice(0, 70) || "Picture",
            createdAt: now,
            updatedAt: now,
          })
          .run()
        queue(id, userId, content, images, now)
      })
      return get(id, userId)
    },
    /** Atomically claims one reply, including across tabs/processes. Expired claims can be retried. */
    begin(id: string, userId: string, input: ReplyInput) {
      return db.transaction(
        () => {
          recover(id, userId)
          const found = owned(id, userId)
          if (found.runningUntil)
            throw new ConversationError("An answer is already on its way.", 409)
          let rows = messages(id)
          const last = rows.at(-1)
          if ("message" in input) {
            if (last && last.status !== "complete")
              throw new ConversationError(
                "Please retry the last answer first.",
                409
              )
            let content = input.message
            const open = last?.question && !last.question.answer
            if (open) {
              // Any message while a question is open is its answer.
              const { options, multiple } = last.question!
              const choices = [...new Set(input.choices ?? [])].sort()
              if (
                choices.some((choice) => choice >= options.length) ||
                (!multiple && choices.length > 1)
              )
                throw new ConversationError("Please choose one of the options.")
              content = [
                choices.map((choice) => options[choice]).join(", "),
                input.message,
              ]
                .filter(Boolean)
                .join("\n")
              db.update(message)
                .set({
                  answer: JSON.stringify({ choices, other: !!input.message }),
                })
                .where(eq(message.id, last.id))
                .run()
            } else if (input.choices?.length)
              throw new ConversationError(
                "This question has already been answered.",
                409
              )
            queue(id, userId, content, input.images ?? [], new Date())
            rows = messages(id)
          } else if ("retry" in input) {
            if (last?.status !== "error")
              throw new ConversationError("There is no answer to retry.", 409)
          } else if (last?.status !== "queued")
            throw new ConversationError("This answer has already started.", 409)
          const assistant = rows.at(-1)!,
            question = rows.at(-2)!
          // A retry gets a new claim id so a worker from an expired lease can
          // never write into a later attempt at the same answer.
          const assistantId = "retry" in input ? randomUUID() : assistant.id
          db.update(message)
            .set({
              id: assistantId,
              status: "pending",
              content: "",
              imagesUnread: false,
              question: null,
            })
            .where(eq(message.id, assistant.id))
            .run()
          // What a failed attempt already reported stays with the answer.
          db.update(filedIssue)
            .set({ messageId: assistantId })
            .where(eq(filedIssue.messageId, assistant.id))
            .run()
          db.update(conversation)
            .set({
              runningUntil: new Date(Date.now() + REPLY_TIME_LIMIT_MS + 5000),
              updatedAt: new Date(),
            })
            .where(eq(conversation.id, id))
            .run()
          // Interactive Questions asked back to back, up to this answer.
          const earlier = rows.filter((row) => row.role === "assistant")
          earlier.pop()
          let questionsInARow = 0
          while (earlier.pop()?.question) questionsInARow++
          return {
            conversation: found,
            assistantId,
            questionsInARow,
            question: question.content,
            images: question.images.map((image) => image.id),
            history: JSON.parse(found.history) as Array<AgentInputItem>,
          }
        },
        { behavior: "immediate" }
      )
    },
    /** Filed Issues and failed reports of a Conversation, oldest first. */
    filedIssues(id: string): Array<FiledIssueRecord & { messageId: string }> {
      return db
        .select()
        .from(filedIssue)
        .where(eq(filedIssue.conversationId, id))
        .orderBy(asc(filedIssue.createdAt), asc(sql`rowid`))
        .all()
        .map((row) => ({
          messageId: row.messageId,
          repository: row.repository,
          kind: row.kind as FiledIssueRecord["kind"],
          title: row.title,
          outcome: row.outcome as FiledIssueRecord["outcome"],
          number: row.issueNumber,
          url: row.url,
          error: row.error,
        }))
    },
    recordFiledIssue(id: string, messageId: string, record: FiledIssueRecord) {
      db.insert(filedIssue)
        .values({
          id: randomUUID(),
          conversationId: id,
          messageId,
          repository: record.repository,
          kind: record.kind,
          title: record.title,
          outcome: record.outcome,
          issueNumber: record.number,
          url: record.url,
          error: record.error,
          createdAt: new Date(),
        })
        .run()
    },
    markRefreshed(id: string) {
      db.update(conversation)
        .set({ refreshedAt: new Date() })
        .where(eq(conversation.id, id))
        .run()
    },
    savePartial(assistantId: string, content: string) {
      db.update(message)
        .set({ content })
        .where(and(eq(message.id, assistantId), eq(message.status, "pending")))
        .run()
    },
    finish(
      id: string,
      assistantId: string,
      content: string,
      history?: Array<AgentInputItem>,
      imagesUnread = false,
      /** Makes the answer an open Interactive Question. */
      question?: AskedQuestion
    ) {
      db.transaction(() => {
        const updated = db
          .update(message)
          .set({
            content,
            status: history ? "complete" : "error",
            imagesUnread,
            question: history && question ? JSON.stringify(question) : null,
          })
          .where(
            and(eq(message.id, assistantId), eq(message.status, "pending"))
          )
          .returning({ id: message.id })
          .all()
        if (!updated.length) return
        db.update(conversation)
          .set({
            runningUntil: null,
            updatedAt: new Date(),
            ...(history ? { history: JSON.stringify(history) } : {}),
          })
          .where(eq(conversation.id, id))
          .run()
      })
    },
  }
}
export type ConversationsRepository = ReturnType<
  typeof createConversationsRepository
>
