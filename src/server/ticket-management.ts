import "@tanstack/react-start/server-only"

import { getConfig } from "./config"
import { createGitHubIssues } from "./github"
import { FilingTargetError, fileIssue, filingProblem } from "./issue-filing"
import { redact } from "./redaction"
import { getSessionUser, requireAdmin, requireSession } from "./session"
import { createApplicationsRepository } from "./repositories/applications"
import { createTicketsRepository } from "./repositories/tickets"
import type { Auth } from "./auth"
import type { GitHubIssues } from "./github"
import type { ApplicationsRepository } from "./repositories/applications"
import type { TicketsRepository } from "./repositories/tickets"
import type {
  AdminTicket,
  OwnTicket,
  OwnTicketFilters,
  TicketEdits,
  TicketField,
  TicketFilters,
} from "@/lib/tickets"
import {
  MAX_DECLINE_REASON,
  MAX_TICKET_BODY,
  MAX_TICKET_TITLE,
} from "@/lib/tickets"

/** A refused Ticket action, with the field it concerns. */
export class TicketError extends Error {
  constructor(
    message: string,
    public readonly field?: TicketField,
    public readonly status = 400
  ) {
    super(message)
  }
}

const BUSY =
  "This Ticket was decided, or another Admin is filing it right now. Reload to see where it stands."

/**
 * Admins review Tickets; owners follow their own. Every method checks the
 * session itself. An owner's view never holds developer content.
 */
export function createTicketManagement(
  deps: {
    auth?: Auth
    tickets?: TicketsRepository
    applications?: ApplicationsRepository
    /** Null when `GITHUB_TOKEN` is not set. */
    github?: GitHubIssues | null
    baseUrl?: string
    now?: () => Date
  } = {}
) {
  const tickets = deps.tickets ?? createTicketsRepository()
  const applications = deps.applications ?? createApplicationsRepository()
  const github = () => {
    if (deps.github !== undefined) return deps.github
    const token = getConfig().githubToken
    return token ? createGitHubIssues(token) : null
  }
  const now = () => deps.now?.() ?? new Date()
  const source = (headers: Headers) => ({ auth: deps.auth, headers })

  function attached(applicationId: string) {
    return (
      applications
        .scope(applicationId)
        ?.attachments.flatMap((item) =>
          item.kind === "repository" ? [item.resource] : []
        ) ?? []
    )
  }

  function found(id: string) {
    const ticket = tickets.get(id)
    if (!ticket)
      throw new TicketError("This Ticket is not available.", undefined, 404)
    return ticket
  }

  /** Links developers can open: the Admin pages, not the owner's chat. */
  function footer(ticket: { id: string; conversationId: string }) {
    const base = deps.baseUrl ?? getConfig().baseUrl
    return `---\n[Ticket in Agent 6](${base}/admin/tickets/${ticket.id}) · [Conversation in Agent 6](${base}/admin/conversations/${ticket.conversationId})\n\n_Proposed by Agent 6 and accepted after Admin review. Review the suggested fix before applying it._`
  }

  return {
    async list(headers: Headers, filters: TicketFilters) {
      await requireAdmin(source(headers))
      return tickets.list(filters)
    },

    async get(headers: Headers, id: string): Promise<AdminTicket> {
      await requireAdmin(source(headers))
      const ticket = found(id)
      return {
        id: ticket.id,
        status: ticket.status,
        kind: ticket.kind,
        title: ticket.title,
        body: ticket.body,
        summary: ticket.summary,
        repository: ticket.repository,
        repositoryId: ticket.repositoryId,
        targetIssueNumber: ticket.targetIssueNumber,
        application: ticket.application,
        user: ticket.user,
        conversation: {
          id: ticket.conversation.id,
          title: ticket.conversation.title,
          deleted: ticket.conversation.deletedAt !== null,
        },
        possibleDuplicate: ticket.possibleDuplicate,
        declineReason: ticket.declineReason,
        decidedBy: ticket.decidedBy,
        decidedAt: ticket.decidedAt?.getTime() ?? null,
        lastError: ticket.lastError,
        filing:
          ticket.status === "pending" &&
          ticket.filingUntil !== null &&
          ticket.filingUntil > now(),
        issue: ticket.issue,
        attachedRepositories: attached(ticket.conversation.applicationId).map(
          (repo) => ({ id: repo.id, fullName: repo.fullName })
        ),
        githubConfigured: github() !== null,
        createdAt: ticket.createdAt.getTime(),
      }
    },

    /** For the nav badge; null for anyone who is not an Admin. */
    async pendingCount(headers: Headers) {
      const user = await getSessionUser(source(headers))
      return user?.role === "admin" ? tickets.pendingCount() : null
    },

    /** Files the Admin's version of the Ticket on GitHub. */
    async accept(headers: Headers, id: string, edits: TicketEdits) {
      const admin = await requireAdmin(source(headers))
      const ticket = found(id)
      if (ticket.status !== "pending")
        throw new TicketError(BUSY, undefined, 409)
      // An Admin's edits are checked like the agent's text.
      const title = redact(edits.title).replace(/\s+/g, " ").trim()
      if (!title || title.length > MAX_TICKET_TITLE)
        throw new TicketError(
          `Give a title of up to ${MAX_TICKET_TITLE} characters.`,
          "title"
        )
      const body = redact(edits.body).trim()
      if (!body || body.length > MAX_TICKET_BODY)
        throw new TicketError(
          `Give a description of up to ${MAX_TICKET_BODY.toLocaleString("en")} characters.`,
          "body"
        )
      const repo = attached(ticket.conversation.applicationId).find(
        (item) => item.id === edits.repositoryId
      )
      const [owner, name] = repo?.fullName.split("/") ?? []
      if (!repo || !owner || !name)
        throw new TicketError(
          "Choose a Repository attached to this Ticket's Application.",
          "repositoryId"
        )
      const client = github()
      if (!client)
        throw new TicketError(filingProblem(null, repo.fullName, false))
      if (
        !tickets.claim(
          id,
          {
            title,
            body,
            kind: edits.kind,
            repositoryId: repo.id,
            repository: repo.fullName,
            targetIssueNumber: edits.targetIssueNumber,
          },
          now()
        )
      )
        throw new TicketError(BUSY, undefined, 409)
      let filed: Awaited<ReturnType<typeof fileIssue>>
      try {
        filed = await fileIssue(
          client,
          { owner, name, fullName: repo.fullName },
          {
            kind: edits.kind,
            title,
            body,
            targetIssueNumber: edits.targetIssueNumber,
          },
          footer({ id, conversationId: ticket.conversation.id })
        )
      } catch (error) {
        if (error instanceof FilingTargetError) {
          tickets.release(id, null)
          throw new TicketError(error.message, "targetIssueNumber")
        }
        const problem = filingProblem(error, repo.fullName, true)
        tickets.release(id, problem)
        throw new TicketError(problem)
      }
      tickets.accept(id, admin.id, filed, now())
    },

    /** The owner reads the reason exactly as written. */
    async decline(headers: Headers, id: string, reason: string) {
      const admin = await requireAdmin(source(headers))
      const ticket = found(id)
      const text = reason.trim()
      if (!text || text.length > MAX_DECLINE_REASON)
        throw new TicketError(
          `Give a reason of up to ${MAX_DECLINE_REASON.toLocaleString("en")} characters.`,
          "reason"
        )
      if (
        ticket.status !== "pending" ||
        !tickets.decline(id, admin.id, text, now())
      )
        throw new TicketError(BUSY, undefined, 409)
    },

    async listOwn(headers: Headers, filters: OwnTicketFilters) {
      const owner = await requireSession(source(headers))
      return tickets.listOwn(owner.id, filters)
    },

    /** Only the Conversation's owner, Admins included, sees it here. */
    async getOwn(headers: Headers, id: string): Promise<OwnTicket> {
      const owner = await requireSession(source(headers))
      const ticket = tickets.get(id)
      if (!ticket || ticket.conversation.userId !== owner.id)
        throw new TicketError("This Ticket is not available.", undefined, 404)
      return {
        id: ticket.id,
        summary: ticket.summary,
        status: ticket.status,
        application: ticket.application,
        createdAt: ticket.createdAt.getTime(),
        decidedAt: ticket.decidedAt?.getTime() ?? null,
        declineReason: ticket.declineReason,
        conversationId:
          ticket.conversation.deletedAt === null
            ? ticket.conversation.id
            : null,
      }
    },
  }
}
