import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"
import { getDb } from "./db"
import { createSettingsRepository } from "./settings"
import { readLanguageSettings } from "../preferred-language"
import {
  application,
  conversation,
  filedIssue,
  message,
  repository,
  repositoryAttachment,
  upload,
  user,
} from "./schema"
import type { Db } from "./db"
import { guardrailContext } from "../guardrail"
import { auditText, historyActivities } from "../conversation-audit"
import type {
  ConversationAudit,
  ConversationFilters,
  ConversationSummary,
  ToolActivity,
} from "@/lib/conversation-history"
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
import { REPLY_TIME_LIMIT_MS } from "@/lib/chat"

export class ConversationError extends Error {
  constructor(
    description: string,
    public readonly status = 400
  ) {
    super(description)
  }
}

export function createConversationsRepository(db: Db = getDb()) {
  function readable(id: string, userId: string, admin = false) {
    const found = db
      .select()
      .from(conversation)
      .where(
        and(
          eq(conversation.id, id),
          ...(admin
            ? []
            : [eq(conversation.userId, userId), isNull(conversation.deletedAt)])
        )
      )
      .get()
    if (!found)
      throw new ConversationError("This Conversation is not available.", 404)
    return found
  }
  const owned = (id: string, userId: string) => readable(id, userId)
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
        refused: row.refused,
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
            .set({
              status: "error",
              content: readLanguageSettings(createSettingsRepository(db))
                .messages.replyFailed,
            })
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
      agentMessages: readLanguageSettings(createSettingsRepository(db))
        .messages,
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
  function finish(
    id: string,
    assistantId: string,
    content: string,
    history?: Array<AgentInputItem>,
    imagesUnread = false,
    /** Makes the answer an open Interactive Question. */
    question?: AskedQuestion,
    /** Refuses both messages atomically, leaving accepted SDK history intact. */
    refusedUserId?: string,
    title?: { previous: string; next: string }
  ) {
    db.transaction(() => {
      const updated = db
        .update(message)
        .set({
          content,
          status: history || refusedUserId ? "complete" : "error",
          refused: !!refusedUserId,
          imagesUnread,
          question: history && question ? JSON.stringify(question) : null,
        })
        .where(
          and(
            eq(message.id, assistantId),
            eq(message.conversationId, id),
            eq(message.status, "pending")
          )
        )
        .returning({ id: message.id })
        .all()
      if (!updated.length) return
      if (title && history)
        db.update(conversation)
          .set({ title: title.next })
          .where(
            and(eq(conversation.id, id), eq(conversation.title, title.previous))
          )
          .run()
      if (refusedUserId)
        db.update(message)
          .set({ refused: true })
          .where(
            and(
              eq(message.id, refusedUserId),
              eq(message.conversationId, id),
              eq(message.role, "user")
            )
          )
          .run()
      db.update(conversation)
        .set({
          runningUntil: null,
          updatedAt: new Date(),
          ...(history ? { history: JSON.stringify(history) } : {}),
        })
        .where(eq(conversation.id, id))
        .run()
    })
  }

  return {
    owned,
    readable,
    get,
    list(filters: ConversationFilters, ownerId?: string) {
      const issues =
        sql<number>`(select count(distinct ${filedIssue.url}) from ${filedIssue} where ${filedIssue.conversationId} = ${conversation.id} and ${filedIssue.outcome} != 'failed')`.mapWith(
          Number
        )
      const refused =
        sql<boolean>`exists(select 1 from ${message} where ${message.conversationId} = ${conversation.id} and ${message.refused} = 1)`.mapWith(
          Boolean
        )
      const where = and(
        ...(ownerId
          ? [eq(conversation.userId, ownerId), isNull(conversation.deletedAt)]
          : []),
        filters.applicationId
          ? eq(conversation.applicationId, filters.applicationId)
          : undefined,
        !ownerId && filters.userId
          ? eq(conversation.userId, filters.userId)
          : undefined,
        filters.q?.trim()
          ? sql`instr(lower(${conversation.title}), lower(${filters.q.trim()})) > 0`
          : undefined,
        !ownerId && filters.hasIssue
          ? filters.hasIssue === "yes"
            ? sql`${issues} > 0`
            : sql`${issues} = 0`
          : undefined
      )
      const total = db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(conversation)
        .where(where)
        .get()!.count
      const pageSize = 20
      const page = Math.min(
        Math.max(1, filters.page ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      const rows: Array<ConversationSummary> = db
        .select({
          id: conversation.id,
          title: conversation.title,
          application: { id: application.id, name: application.name },
          user: { id: user.id, name: user.name, email: user.email },
          updatedAt: conversation.updatedAt,
          deletedAt: conversation.deletedAt,
          issueCount: issues,
          refused,
        })
        .from(conversation)
        .innerJoin(application, eq(application.id, conversation.applicationId))
        .innerJoin(user, eq(user.id, conversation.userId))
        .where(where)
        .orderBy(desc(conversation.updatedAt), desc(conversation.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all()
        .map((row) => ({
          ...row,
          updatedAt: row.updatedAt.getTime(),
          deletedAt: row.deletedAt?.getTime() ?? null,
        }))
      // Options are independent of filters; no other person's titles or identity are exposed to an owner.
      const applications = db
        .selectDistinct({ id: application.id, name: application.name })
        .from(application)
        .innerJoin(conversation, eq(conversation.applicationId, application.id))
        .where(
          ownerId
            ? and(
                eq(conversation.userId, ownerId),
                isNull(conversation.deletedAt)
              )
            : undefined
        )
        .orderBy(asc(application.name))
        .all()
      const users = ownerId
        ? []
        : db
            .selectDistinct({ id: user.id, name: user.name, email: user.email })
            .from(user)
            .innerJoin(conversation, eq(conversation.userId, user.id))
            .orderBy(asc(user.name))
            .all()
      return { conversations: rows, total, page, pageSize, applications, users }
    },
    rename(id: string, userId: string, title: string) {
      owned(id, userId)
      db.update(conversation)
        .set({ title })
        .where(
          and(
            eq(conversation.id, id),
            eq(conversation.userId, userId),
            isNull(conversation.deletedAt)
          )
        )
        .run()
    },
    remove(id: string, userId: string) {
      owned(id, userId)
      db.update(conversation)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(conversation.id, id),
            eq(conversation.userId, userId),
            isNull(conversation.deletedAt)
          )
        )
        .run()
    },
    audit(id: string): ConversationAudit {
      const found = readable(id, "", true)
      const app = db
        .select({ id: application.id, name: application.name })
        .from(application)
        .where(eq(application.id, found.applicationId))
        .get()!
      const owner = db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, found.userId))
        .get()!
      const saved = db
        .select({ id: message.id, activity: message.activity })
        .from(message)
        .where(eq(message.conversationId, id))
        .orderBy(asc(message.createdAt), asc(sql`rowid`))
        .all()
      const activities = saved.flatMap((row) =>
        (JSON.parse(row.activity) as Array<ToolActivity>).map((item) => ({
          ...item,
          input: auditText(item.input),
          ...(item.error ? { error: auditText(item.error) } : {}),
          messageId: row.id,
        }))
      )
      // Older runs have SDK history only. Do not duplicate newly persisted calls.
      const old = historyActivities(
        JSON.parse(found.history) as Array<unknown>
      ).filter(
        (item) => !activities.some((entry) => entry.id.endsWith(`:${item.id}`))
      )
      return {
        id,
        title: found.title,
        application: app,
        user: owner,
        deletedAt: found.deletedAt?.getTime() ?? null,
        updatedAt: found.updatedAt.getTime(),
        messages: messages(id, true),
        activities: [...old, ...activities],
      }
    },
    recordActivity(assistantId: string, item: ToolActivity) {
      const safe = {
        ...item,
        name: auditText(item.name),
        input: auditText(item.input),
        ...(item.error ? { error: auditText(item.error) } : {}),
      }
      // A transaction also protects concurrent tool completions from losing one another.
      db.transaction(() => {
        const row = db
          .select({ activity: message.activity })
          .from(message)
          .where(
            and(eq(message.id, assistantId), eq(message.status, "pending"))
          )
          .get()
        if (!row) return
        const items = JSON.parse(row.activity) as Array<ToolActivity>
        const index = items.findIndex((entry) => entry.id === safe.id)
        if (index < 0) items.push({ createdAt: Date.now(), ...safe })
        else items[index] = { ...items[index], ...safe }
        db.update(message)
          .set({ activity: JSON.stringify(items) })
          .where(eq(message.id, assistantId))
          .run()
      })
    },
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
      images: Array<string> = [],
      initialTitle?: string
    ) {
      const id = randomUUID(),
        now = new Date()
      db.transaction(() => {
        db.insert(conversation)
          .values({
            id,
            userId,
            applicationId,
            title:
              initialTitle ??
              (content.replace(/\s+/g, " ").slice(0, 70) ||
                readLanguageSettings(createSettingsRepository(db)).messages
                  .pictureTitle),
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
            userMessageId: question.id,
            guardrailContext: guardrailContext(rows.slice(0, -2)),
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
    finish,
    refuse(
      id: string,
      assistantId: string,
      userMessageId: string,
      content: string
    ) {
      finish(
        id,
        assistantId,
        content,
        undefined,
        false,
        undefined,
        userMessageId
      )
    },
  }
}
export type ConversationsRepository = ReturnType<
  typeof createConversationsRepository
>
