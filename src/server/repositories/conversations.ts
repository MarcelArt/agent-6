import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, eq, sql } from "drizzle-orm"
import { getDb } from "./db"
import {
  application,
  conversation,
  filedIssue,
  message,
  repository,
  repositoryAttachment,
} from "./schema"
import type { Db } from "./db"
import type { AgentInputItem } from "@openai/agents"
import type {
  ChatMessage,
  Conversation,
  FiledIssueRecord,
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
  function queue(id: string, content: string, now: Date) {
    db.insert(message)
      .values([
        {
          id: randomUUID(),
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
    create(userId: string, applicationId: string, content: string) {
      const id = randomUUID(),
        now = new Date()
      db.transaction(() => {
        db.insert(conversation)
          .values({
            id,
            userId,
            applicationId,
            title: content.replace(/\s+/g, " ").slice(0, 70),
            createdAt: now,
            updatedAt: now,
          })
          .run()
        queue(id, content, now)
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
            queue(id, input.message, new Date())
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
            .set({ id: assistantId, status: "pending", content: "" })
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
          return {
            conversation: found,
            assistantId,
            question: question.content,
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
      history?: Array<AgentInputItem>
    ) {
      db.transaction(() => {
        const updated = db
          .update(message)
          .set({ content, status: history ? "complete" : "error" })
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
