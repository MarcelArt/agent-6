import { z } from "zod"
import type { IssueKind } from "./chat"

/** A Ticket waits for an Admin; accepting files the issue, declining needs a reason. */
export type TicketStatus = "pending" | "accepted" | "declined"
export const TICKET_STATUSES: Array<TicketStatus> = [
  "pending",
  "accepted",
  "declined",
]
export const ticketStatusLabels: Record<TicketStatus, string> = {
  pending: "Waiting for review",
  accepted: "Accepted",
  declined: "Declined",
}

/** Every Ticket of a Conversation counts, whatever its target or outcome. */
export const MAX_TICKETS_PER_CONVERSATION = 2
export const MAX_TICKET_TITLE = 200
/** GitHub accepts 65 536 characters; the heading and footer need the rest. */
export const MAX_TICKET_BODY = 60_000
export const MAX_TICKET_SUMMARY = 400
export const MAX_DECLINE_REASON = 2000
export const TICKETS_PAGE_SIZE = 20

/** Admin list. No status means pending, the work still to do. */
export const ticketSearch = z.object({
  status: z
    .enum(["pending", "accepted", "declined", "all"])
    .optional()
    .catch(undefined),
  applicationId: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})
export type TicketFilters = z.infer<typeof ticketSearch>

/**
 * The owner's list under `/chat`, which already uses `q` and `page` for the
 * Conversation history; these keys stay apart from them.
 */
export const ownTicketSearch = z.object({
  status: z
    .enum(["pending", "accepted", "declined"])
    .optional()
    .catch(undefined),
  ticketPage: z.number().int().min(1).optional().catch(undefined),
})
export type OwnTicketFilters = z.infer<typeof ownTicketSearch>

export type AdminTicketSummary = {
  id: string
  title: string
  kind: IssueKind
  status: TicketStatus
  repository: string
  application: { id: string; name: string }
  user: { id: string; name: string; email: string }
  createdAt: number
  decidedAt: number | null
}

export type AdminTicketsPage = {
  tickets: Array<AdminTicketSummary>
  total: number
  page: number
  pageSize: number
  /** Applications that have Tickets, for the filter. */
  applications: Array<{ id: string; name: string }>
}

export type FiledIssueLink = {
  repository: string
  number: number
  url: string
  /** "new": the Ticket opened it; "comment": added an occurrence to it. */
  outcome: "new" | "comment"
}

/** Everything an Admin needs to decide; never sent to an owner. */
export type AdminTicket = {
  id: string
  status: TicketStatus
  kind: IssueKind
  title: string
  body: string
  summary: string
  /** "owner/name" when the Ticket was last changed. */
  repository: string
  /** Null once the Repository was removed. */
  repositoryId: string | null
  targetIssueNumber: number | null
  application: { id: string; name: string }
  user: { id: string; name: string; email: string }
  conversation: { id: string; title: string; deleted: boolean }
  possibleDuplicate: {
    id: string
    title: string
    status: TicketStatus
    issue: FiledIssueLink | null
  } | null
  declineReason: string | null
  /** The Admin who decided in Agent 6. */
  decidedBy: { id: string; name: string } | null
  /** Set instead when a Service Account decided through the API. */
  decidedByServiceAccount: {
    id: string
    name: string
    apiKey: { id: string; name: string } | null
  } | null
  decidedAt: number | null
  lastError: string | null
  /** An acceptance is filing the issue right now. */
  filing: boolean
  issue: FiledIssueLink | null
  /** Repositories the Ticket may be filed in. */
  attachedRepositories: Array<{ id: string; fullName: string }>
  githubConfigured: boolean
  createdAt: number
}

/** What the Conversation's owner sees: no developer content at all. */
export type OwnTicketSummary = {
  id: string
  summary: string
  status: TicketStatus
  application: { id: string; name: string }
  createdAt: number
  decidedAt: number | null
}

export type OwnTicket = OwnTicketSummary & {
  declineReason: string | null
  /** Null when the owner deleted the Conversation. */
  conversationId: string | null
}

export type OwnTicketsPage = {
  tickets: Array<OwnTicketSummary>
  total: number
  page: number
  pageSize: number
}

export const ticketEdits = z.object({
  title: z.string(),
  body: z.string(),
  kind: z.enum(["code-fix", "data-fix", "feature-request"]),
  repositoryId: z.string(),
  targetIssueNumber: z.number().int().min(1).nullable(),
})
export type TicketEdits = z.infer<typeof ticketEdits>

export type TicketField = keyof TicketEdits | "reason"

export type TicketResult =
  { ok: true } | { ok: false; message: string; field?: TicketField }
