import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm"
import { getDb } from "./db"
import {
  apiKey,
  application,
  conversation,
  filedIssue,
  serviceAccount,
  ticket,
  user,
} from "./schema"
import { createWebhooksRepository } from "./webhooks"
import type { Actor } from "./audit"
import type { Db } from "./db"
import type { IssueKind } from "@/lib/chat"
import type {
  AdminTicketsPage,
  FiledIssueLink,
  OwnTicketFilters,
  OwnTicketsPage,
  TicketFilters,
  TicketStatus,
} from "@/lib/tickets"
import { MAX_TICKETS_PER_CONVERSATION, TICKETS_PAGE_SIZE } from "@/lib/tickets"

/** How long an acceptance may take before another Admin can try again. */
export const FILING_LEASE_MS = 2 * 60_000

export type NewTicket = {
  conversationId: string
  messageId: string
  repositoryId: string
  repository: string
  kind: IssueKind
  title: string
  body: string
  summary: string
  targetIssueNumber: number | null
  possibleDuplicateOf: string | null
}

/** What acceptance stores before it files: the Admin's final version. */
export type TicketChanges = {
  title: string
  body: string
  kind: IssueKind
  repositoryId: string
  repository: string
  targetIssueNumber: number | null
}

function pageOf(total: number, requested?: number) {
  return Math.min(
    Math.max(1, requested ?? 1),
    Math.max(1, Math.ceil(total / TICKETS_PAGE_SIZE))
  )
}

const issueLink = (
  row: {
    repository: string | null
    number: number | null
    url: string | null
    outcome: string | null
  } | null
): FiledIssueLink | null =>
  row?.repository && row.number !== null && row.url
    ? {
        repository: row.repository,
        number: row.number,
        url: row.url,
        outcome: row.outcome === "comment" ? "comment" : "new",
      }
    : null

const filedColumns = {
  repository: filedIssue.repository,
  number: filedIssue.issueNumber,
  url: filedIssue.url,
  outcome: filedIssue.outcome,
}

/** The decision columns for an Admin or a Service Account's API Key. */
function decidedByColumns(actor: Actor) {
  return actor.type === "admin"
    ? {
        decidedBy: actor.userId,
        decidedByServiceAccountId: null,
        decidedByApiKeyId: null,
      }
    : {
        decidedBy: null,
        decidedByServiceAccountId: actor.serviceAccountId,
        decidedByApiKeyId: actor.apiKeyId,
      }
}

export function createTicketsRepository(db: Db = getDb()) {
  const events = createWebhooksRepository(db)
  return {
    /**
     * Counts and inserts in one synchronous transaction, so tool calls the
     * model makes in parallel cannot pass the limit together.
     */
    create(input: NewTicket): { id: string } | "limit" | "already" {
      return db.transaction(
        () => {
          const earlier = db
            .select({
              repository: ticket.repository,
              target: ticket.targetIssueNumber,
            })
            .from(ticket)
            .where(eq(ticket.conversationId, input.conversationId))
            .all()
          const target = input.targetIssueNumber
          if (
            target !== null &&
            (earlier.some(
              (item) =>
                item.repository === input.repository && item.target === target
            ) ||
              db
                .select({ id: filedIssue.id })
                .from(filedIssue)
                .where(
                  and(
                    eq(filedIssue.conversationId, input.conversationId),
                    eq(filedIssue.repository, input.repository),
                    eq(filedIssue.issueNumber, target),
                    ne(filedIssue.outcome, "failed")
                  )
                )
                .get())
          )
            return "already"
          if (earlier.length >= MAX_TICKETS_PER_CONVERSATION) return "limit"
          const id = randomUUID()
          const now = new Date()
          db.insert(ticket)
            .values({ ...input, id, createdAt: now, updatedAt: now })
            .run()
          events.recordTicketEvent("ticket.created", id, now)
          return { id }
        },
        { behavior: "immediate" }
      )
    },

    /** Pending Tickets of other Conversations, so the agent can flag a duplicate. */
    pendingIn(repositoryId: string, exceptConversationId: string) {
      return db
        .select({
          id: ticket.id,
          title: ticket.title,
          kind: ticket.kind,
          body: ticket.body,
          targetIssueNumber: ticket.targetIssueNumber,
        })
        .from(ticket)
        .where(
          and(
            eq(ticket.repositoryId, repositoryId),
            eq(ticket.status, "pending"),
            ne(ticket.conversationId, exceptConversationId)
          )
        )
        .orderBy(desc(ticket.createdAt))
        .limit(50)
        .all()
    },

    list(filters: TicketFilters): AdminTicketsPage {
      const status = filters.status ?? "pending"
      const search = filters.q?.trim()
      const where = and(
        status === "all" ? undefined : eq(ticket.status, status),
        filters.applicationId
          ? eq(conversation.applicationId, filters.applicationId)
          : undefined,
        search
          ? sql`(instr(lower(${ticket.title}), lower(${search})) > 0 or instr(lower(${ticket.repository}), lower(${search})) > 0)`
          : undefined
      )
      const total = db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(ticket)
        .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
        .where(where)
        .get()!.count
      const page = pageOf(total, filters.page)
      const tickets = db
        .select({
          id: ticket.id,
          title: ticket.title,
          kind: ticket.kind,
          status: ticket.status,
          repository: ticket.repository,
          application: { id: application.id, name: application.name },
          user: { id: user.id, name: user.name, email: user.email },
          createdAt: ticket.createdAt,
          decidedAt: ticket.decidedAt,
        })
        .from(ticket)
        .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
        .innerJoin(application, eq(application.id, conversation.applicationId))
        .innerJoin(user, eq(user.id, conversation.userId))
        .where(where)
        .orderBy(desc(ticket.createdAt), desc(ticket.id))
        .limit(TICKETS_PAGE_SIZE)
        .offset((page - 1) * TICKETS_PAGE_SIZE)
        .all()
        .map((row) => ({
          ...row,
          kind: row.kind as IssueKind,
          status: row.status as TicketStatus,
          createdAt: row.createdAt.getTime(),
          decidedAt: row.decidedAt?.getTime() ?? null,
        }))
      const applications = db
        .selectDistinct({ id: application.id, name: application.name })
        .from(application)
        .innerJoin(conversation, eq(conversation.applicationId, application.id))
        .innerJoin(ticket, eq(ticket.conversationId, conversation.id))
        .orderBy(asc(application.name))
        .all()
      return {
        tickets,
        total,
        page,
        pageSize: TICKETS_PAGE_SIZE,
        applications,
      }
    },

    /** Includes Tickets from Conversations the owner deleted. */
    listOwn(ownerId: string, filters: OwnTicketFilters): OwnTicketsPage {
      const where = and(
        eq(conversation.userId, ownerId),
        filters.status ? eq(ticket.status, filters.status) : undefined
      )
      const total = db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(ticket)
        .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
        .where(where)
        .get()!.count
      const page = pageOf(total, filters.ticketPage)
      const tickets = db
        .select({
          id: ticket.id,
          summary: ticket.summary,
          status: ticket.status,
          application: { id: application.id, name: application.name },
          createdAt: ticket.createdAt,
          decidedAt: ticket.decidedAt,
        })
        .from(ticket)
        .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
        .innerJoin(application, eq(application.id, conversation.applicationId))
        .where(where)
        .orderBy(desc(ticket.createdAt), desc(ticket.id))
        .limit(TICKETS_PAGE_SIZE)
        .offset((page - 1) * TICKETS_PAGE_SIZE)
        .all()
        .map((row) => ({
          ...row,
          status: row.status as TicketStatus,
          createdAt: row.createdAt.getTime(),
          decidedAt: row.decidedAt?.getTime() ?? null,
        }))
      return { tickets, total, page, pageSize: TICKETS_PAGE_SIZE }
    },

    /** One Ticket with its Conversation, people and Filed Issue; undefined when missing. */
    get(id: string) {
      const row = db
        .select({
          ticket,
          conversation: {
            id: conversation.id,
            title: conversation.title,
            userId: conversation.userId,
            applicationId: conversation.applicationId,
            deletedAt: conversation.deletedAt,
          },
          application: { id: application.id, name: application.name },
          user: { id: user.id, name: user.name, email: user.email },
          issue: filedColumns,
        })
        .from(ticket)
        .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
        .innerJoin(application, eq(application.id, conversation.applicationId))
        .innerJoin(user, eq(user.id, conversation.userId))
        .leftJoin(filedIssue, eq(filedIssue.id, ticket.filedIssueId))
        .where(eq(ticket.id, id))
        .get()
      if (!row) return undefined
      const decidedBy = row.ticket.decidedBy
        ? (db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(eq(user.id, row.ticket.decidedBy))
            .get() ?? null)
        : null
      const decidedByServiceAccount = row.ticket.decidedByServiceAccountId
        ? (db
            .select({
              id: serviceAccount.id,
              name: serviceAccount.name,
              keyId: apiKey.id,
              keyName: apiKey.name,
            })
            .from(serviceAccount)
            .leftJoin(apiKey, eq(apiKey.id, row.ticket.decidedByApiKeyId ?? ""))
            .where(eq(serviceAccount.id, row.ticket.decidedByServiceAccountId))
            .get() ?? null)
        : null
      const duplicate = row.ticket.possibleDuplicateOf
        ? db
            .select({
              id: ticket.id,
              title: ticket.title,
              status: ticket.status,
              issue: filedColumns,
            })
            .from(ticket)
            .leftJoin(filedIssue, eq(filedIssue.id, ticket.filedIssueId))
            .where(eq(ticket.id, row.ticket.possibleDuplicateOf))
            .get()
        : undefined
      return {
        ...row.ticket,
        kind: row.ticket.kind as IssueKind,
        status: row.ticket.status as TicketStatus,
        conversation: row.conversation,
        application: row.application,
        user: row.user,
        issue: issueLink(row.issue),
        decidedBy,
        decidedByServiceAccount: decidedByServiceAccount && {
          id: decidedByServiceAccount.id,
          name: decidedByServiceAccount.name,
          apiKey:
            decidedByServiceAccount.keyId && decidedByServiceAccount.keyName
              ? {
                  id: decidedByServiceAccount.keyId,
                  name: decidedByServiceAccount.keyName,
                }
              : null,
        },
        possibleDuplicate: duplicate
          ? {
              id: duplicate.id,
              title: duplicate.title,
              status: duplicate.status as TicketStatus,
              issue: issueLink(duplicate.issue),
            }
          : null,
      }
    },

    /**
     * Saves the final version and holds the Ticket while its issue is filed.
     * Answers the claim that alone may complete or release the hold; null
     * when the Ticket is decided or another acceptance holds it.
     */
    claim(id: string, changes: TicketChanges, now = new Date()) {
      const claim = randomUUID()
      const held =
        db
          .update(ticket)
          .set({
            ...changes,
            filingUntil: new Date(now.getTime() + FILING_LEASE_MS),
            filingClaim: claim,
            updatedAt: now,
          })
          .where(
            and(
              eq(ticket.id, id),
              eq(ticket.status, "pending"),
              or(isNull(ticket.filingUntil), lt(ticket.filingUntil, now))
            )
          )
          .run().changes > 0
      return held ? claim : null
    },

    /**
     * Filing failed: the Ticket stays pending, with the reason for Admins.
     * Only the acceptance holding `claim` may release it.
     */
    release(id: string, claim: string, lastError: string | null) {
      db.update(ticket)
        .set({
          filingUntil: null,
          filingClaim: null,
          lastError,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(ticket.id, id),
            eq(ticket.status, "pending"),
            eq(ticket.filingClaim, claim)
          )
        )
        .run()
    },

    /**
     * Records the Filed Issue on the Conversation, decides the Ticket and
     * saves its webhook events, in one transaction. False when `claim` no
     * longer holds the Ticket: another decision came first.
     */
    accept(
      id: string,
      claim: string,
      actor: Actor,
      filed: {
        outcome: "new" | "comment"
        number: number
        url: string
        title: string
      },
      now = new Date()
    ): boolean {
      return db.transaction(
        () => {
          const found = db
            .select()
            .from(ticket)
            .where(
              and(
                eq(ticket.id, id),
                eq(ticket.status, "pending"),
                eq(ticket.filingClaim, claim)
              )
            )
            .get()
          if (!found) return false
          const filedIssueId = randomUUID()
          db.insert(filedIssue)
            .values({
              id: filedIssueId,
              conversationId: found.conversationId,
              messageId: found.messageId,
              repository: found.repository,
              kind: found.kind,
              title: filed.title,
              outcome: filed.outcome,
              issueNumber: filed.number,
              url: filed.url,
              error: null,
              createdAt: now,
            })
            .run()
          db.update(ticket)
            .set({
              status: "accepted",
              ...decidedByColumns(actor),
              decidedAt: now,
              filingUntil: null,
              filingClaim: null,
              lastError: null,
              filedIssueId,
              updatedAt: now,
            })
            .where(eq(ticket.id, id))
            .run()
          events.recordTicketEvent("ticket.accepted", id, now)
          if (filed.outcome === "new")
            events.recordTicketEvent("github.issue.created", id, now)
          return true
        },
        { behavior: "immediate" }
      )
    },

    /**
     * Declines with the reason and saves the webhook event, in one
     * transaction. False when the Ticket is decided or an acceptance is
     * filing it.
     */
    decline(id: string, actor: Actor, reason: string, now = new Date()) {
      return db.transaction(
        () => {
          const changed =
            db
              .update(ticket)
              .set({
                status: "declined",
                declineReason: reason,
                ...decidedByColumns(actor),
                decidedAt: now,
                filingClaim: null,
                updatedAt: now,
              })
              .where(
                and(
                  eq(ticket.id, id),
                  eq(ticket.status, "pending"),
                  or(isNull(ticket.filingUntil), lt(ticket.filingUntil, now))
                )
              )
              .run().changes > 0
          if (changed) events.recordTicketEvent("ticket.declined", id, now)
          return changed
        },
        { behavior: "immediate" }
      )
    },

    pendingCount() {
      return db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(ticket)
        .where(eq(ticket.status, "pending"))
        .get()!.count
    },
  }
}
export type TicketsRepository = ReturnType<typeof createTicketsRepository>
