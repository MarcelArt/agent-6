import "@tanstack/react-start/server-only"

import { redact } from "./redaction"
import { AGENT_LABEL } from "./issue-filing"
import { GitHubError } from "./github"
import { createApplicationsRepository } from "./repositories/applications"
import { createTicketsRepository } from "./repositories/tickets"
import type { GitHubIssues } from "./github"
import type { TicketsRepository } from "./repositories/tickets"
import type { IssueKind } from "@/lib/chat"
import type { Repository } from "@/lib/repositories"
import { MAX_TICKET_SUMMARY, MAX_TICKET_TITLE } from "@/lib/tickets"

export { redact } from "./redaction"

const MAX_SECTION = 12_000
/** How much of an existing issue or Ticket the agent sees when looking for a match. */
const EXCERPT = 1500

/** A refusal the agent may read. Anything else stays hidden from it. */
export class TicketToolError extends Error {}

export type CreateTicketInput = {
  repositoryId: string
  kind: IssueKind
  /** For developers. */
  title: string
  /** For the person: short, plain, in the Preferred Language. */
  summary: string
  /** What the user experienced, or for a Feature Request what they asked for, in their words. */
  userExperience: string
  /** Paths with line numbers, queries and what they showed, log lines with timestamps. */
  findings: string
  /** A code sketch, corrective SQL, or a possible approach to a Feature Request. */
  potentialFix: string
  /** An open issue from `findExisting` that describes the same fault, or null. */
  existingIssueNumber: number | null
  /** A pending Ticket from `findExisting` that describes the same fault, or null. */
  possibleDuplicateOf: string | null
}

/** Section headings; a Feature Request describes a wish, not a fault. */
const headings = (kind: IssueKind) =>
  kind === "feature-request"
    ? ["What the user asked for", "How it works now", "Possible approach"]
    : ["What the user experienced", "What the agent found", "Potential fix"]

/** The developer sections of a Ticket, without the heading and footer added on filing. */
export function ticketBody(
  input: Pick<
    CreateTicketInput,
    "kind" | "userExperience" | "findings" | "potentialFix"
  >,
  repo: Pick<Repository, "fullName" | "trackedBranch" | "lastSyncedCommit">
) {
  const section = (title: string, text: string) =>
    `### ${title}\n\n${redact(text).trim().slice(0, MAX_SECTION) || "_Not provided._"}`
  const [asked, found, suggested] = headings(input.kind)
  return [
    section(asked, input.userExperience),
    section(
      found,
      `${input.findings.trim()}${
        repo.lastSyncedCommit
          ? `\n\nCode references are at commit \`${repo.lastSyncedCommit}\` of \`${repo.trackedBranch}\` in \`${repo.fullName}\`.`
          : ""
      }`
    ),
    section(suggested, input.potentialFix),
  ].join("\n\n")
}

/**
 * The agent's reporting tools. Nothing reaches GitHub from here: a Ticket
 * waits for an Admin. The live Attachment is checked on every invocation.
 */
export function createTicketTools(options: {
  applicationId: string
  conversationId: string
  /** The agent answer being written; Tickets are shown under it. */
  messageId: string
  /** Null when `GITHUB_TOKEN` is not set. */
  github: GitHubIssues | null
  signal?: AbortSignal
  tickets?: TicketsRepository
  /** The Repository when it is attached to the Application. */
  attached?: (applicationId: string, repositoryId: string) => Repository | null
}) {
  const { applicationId, conversationId, messageId, github, signal } = options
  /** Repositories looked at in this reply, and what the agent was shown there. */
  const checked = new Set<string>()
  const seenIssues = new Map<string, Set<number>>()
  const seenTickets = new Map<string, Set<string>>()
  const tickets = () => options.tickets ?? createTicketsRepository()

  function repository(repositoryId: string) {
    signal?.throwIfAborted()
    const found = options.attached
      ? options.attached(applicationId, repositoryId)
      : (createApplicationsRepository()
          .scope(applicationId)
          ?.attachments.flatMap((item) =>
            item.kind === "repository" ? [item.resource] : []
          )
          .find((item) => item.id === repositoryId) ?? null)
    const [owner, name] = found?.fullName.split("/") ?? []
    if (!found || !owner || !name)
      throw new TicketToolError(
        "That Repository is not available in this Application."
      )
    return { ...found, owner, name }
  }

  return {
    /** Open Agent 6 issues and other Conversations' pending Tickets in an attached Repository. */
    async findExisting(input: { repositoryId: string }) {
      const repo = repository(input.repositoryId)
      checked.add(repo.id)
      const pendingTickets = tickets()
        .pendingIn(repo.id, conversationId)
        .map((item) => ({
          id: item.id,
          title: item.title,
          kind: item.kind,
          excerpt: item.body.slice(0, EXCERPT),
          targetIssueNumber: item.targetIssueNumber,
        }))
      seenTickets.set(repo.id, new Set(pendingTickets.map((item) => item.id)))
      try {
        if (!github) throw new GitHubError("bad-token")
        const issues = await github.openIssues(
          repo.owner,
          repo.name,
          AGENT_LABEL
        )
        seenIssues.set(repo.id, new Set(issues.map((issue) => issue.number)))
        return {
          issues: issues.map((issue) => ({
            number: issue.number,
            title: issue.title,
            labels: issue.labels,
            excerpt: issue.body.slice(0, EXCERPT),
          })),
          pendingTickets,
        }
      } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof TicketToolError) throw error
        // Creating a Ticket does not need GitHub; an Admin files it later.
        return {
          issues: [],
          pendingTickets,
          note: "Existing issues could not be read. If the cause is established, continue with create_ticket and existingIssueNumber null.",
        }
      }
    },

    /** Creates a Ticket for an Admin to accept or decline. */
    async createTicket(input: CreateTicketInput) {
      const repo = repository(input.repositoryId)
      if (!checked.has(repo.id))
        throw new TicketToolError(
          "Call find_existing_issues for this Repository first."
        )
      const title = redact(input.title).replace(/\s+/g, " ").trim()
      if (!title || title.length > MAX_TICKET_TITLE)
        throw new TicketToolError(
          `Give a title of up to ${MAX_TICKET_TITLE} characters.`
        )
      const summary = redact(input.summary).replace(/\s+/g, " ").trim()
      if (!summary || summary.length > MAX_TICKET_SUMMARY)
        throw new TicketToolError(
          `Give the person a plain summary of up to ${MAX_TICKET_SUMMARY} characters.`
        )
      if (!input.findings.trim() || !input.userExperience.trim())
        throw new TicketToolError(
          "Describe what the user experienced and the evidence you found."
        )
      if (
        input.existingIssueNumber !== null &&
        !seenIssues.get(repo.id)?.has(input.existingIssueNumber)
      )
        throw new TicketToolError(
          "That is not an open issue from find_existing_issues. Use one of those numbers, or null for a new issue."
        )
      if (
        input.possibleDuplicateOf !== null &&
        !seenTickets.get(repo.id)?.has(input.possibleDuplicateOf)
      )
        throw new TicketToolError(
          "That is not a pending Ticket from find_existing_issues. Use one of those ids, or null."
        )
      const created = tickets().create({
        conversationId,
        messageId,
        repositoryId: repo.id,
        repository: repo.fullName,
        kind: input.kind,
        title,
        body: ticketBody(input, repo),
        summary,
        targetIssueNumber: input.existingIssueNumber,
        possibleDuplicateOf: input.possibleDuplicateOf,
      })
      if (created === "limit")
        throw new TicketToolError(
          "This Conversation has reached its limit of tickets. Do not create another."
        )
      if (created === "already")
        return {
          created: true,
          note: "A ticket from this Conversation already covers this issue.",
        }
      return { created: true }
    },
  }
}
