import "@tanstack/react-start/server-only"

import { redact } from "./redaction"

import { GitHubError } from "./github"
import { createApplicationsRepository } from "./repositories/applications"
import { createConversationsRepository } from "./repositories/conversations"
import type { GitHubIssues } from "./github"
import type { ConversationsRepository } from "./repositories/conversations"
import type { IssueKind } from "@/lib/chat"
import type { Repository } from "@/lib/repositories"
import { MAX_NEW_ISSUES, issueKindLabels } from "@/lib/chat"

/** On every issue Agent 6 creates; how it finds its own issues again. */
export const AGENT_LABEL = "agent-6"
const LABELS = [
  {
    name: AGENT_LABEL,
    color: "5319e7",
    description: "Filed by Agent 6 from a support Conversation",
  },
  {
    name: "code-fix",
    color: "d73a4a",
    description: "Needs a change to the code",
  },
  {
    name: "data-fix",
    color: "fbca04",
    description: "Needs a developer to correct data",
  },
]
const MAX_TITLE = 200
export { redact } from "./redaction"

const MAX_SECTION = 12_000
/** How much of an existing issue the agent sees when looking for a match. */
const EXCERPT = 1500

/** A refusal the agent may read. Anything else stays hidden from it. */
export class IssueToolError extends Error {}

const FAILED =
  "The report could not be sent. Do not say the team has been informed. Still explain plainly what is wrong and what the person can do meanwhile."

export type FileIssueInput = {
  repositoryId: string
  kind: IssueKind
  title: string
  /** What the user experienced, in their words. */
  userExperience: string
  /** Paths with line numbers, queries and what they showed, log lines with timestamps. */
  findings: string
  /** A code sketch, or the corrective SQL for a developer to review and run. */
  potentialFix: string
  /** An open issue from `findExisting` that describes the same fault, or null. */
  existingIssueNumber: number | null
}

/** Check the live Attachment on every invocation, including after a detach. */
export function createIssueTools(options: {
  applicationId: string
  conversationId: string
  /** The agent answer being written; Filed Issues are shown under it. */
  messageId: string
  /** Address of the Conversation in Agent 6, for the link back. */
  conversationUrl: string
  /** Null when `GITHUB_TOKEN` is not set. */
  github: GitHubIssues | null
  signal?: AbortSignal
  conversations?: ConversationsRepository
  /** The Repository when it is attached to the Application. */
  attached?: (applicationId: string, repositoryId: string) => Repository | null
}) {
  const { applicationId, conversationId, messageId, github, signal } = options
  /** Repositories whose existing issues were looked at in this reply. */
  const checked = new Set<string>()
  const conversations = () =>
    options.conversations ?? createConversationsRepository()

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
      throw new IssueToolError(
        "That Repository is not available in this Application."
      )
    return { ...found, owner, name }
  }

  function reason(error: unknown, fullName: string) {
    if (!github)
      return "GITHUB_TOKEN is not set, so Agent 6 cannot file issues."
    switch (error instanceof GitHubError ? error.problem : "unreachable") {
      case "not-found":
        return `GitHub did not allow filing an issue in ${fullName}. Give GITHUB_TOKEN read and write access to Issues in this repository, and check that issues are turned on there.`
      case "bad-token":
        return "GitHub refused GITHUB_TOKEN: it is wrong or has expired."
      case "rate-limited":
        return "GitHub is limiting requests from this token right now."
      case "rejected":
        return `GitHub rejected the issue for ${fullName}.`
      default:
        return "GitHub could not be reached from the server."
    }
  }

  function body(input: FileIssueInput, repo: Repository, heading: string) {
    const section = (title: string, text: string) =>
      `### ${title}\n\n${redact(text).trim().slice(0, MAX_SECTION) || "_Not provided._"}`
    return [
      heading,
      section("What the user experienced", input.userExperience),
      section(
        "What the agent found",
        `${input.findings.trim()}${
          repo.lastSyncedCommit
            ? `\n\nCode references are at commit \`${repo.lastSyncedCommit}\` of \`${repo.trackedBranch}\`.`
            : ""
        }`
      ),
      section("Potential fix", input.potentialFix),
      `---\n[Conversation in Agent 6](${options.conversationUrl})\n\n_Filed automatically by Agent 6. Review the suggested fix before applying it._`,
    ].join("\n\n")
  }

  return {
    /** Open issues Agent 6 filed earlier in an attached Repository. */
    async findExisting(input: { repositoryId: string }) {
      const repo = repository(input.repositoryId)
      checked.add(repo.id)
      try {
        if (!github) throw new GitHubError("bad-token")
        const issues = await github.openIssues(
          repo.owner,
          repo.name,
          AGENT_LABEL
        )
        return {
          issues: issues.map((issue) => ({
            number: issue.number,
            title: issue.title,
            labels: issue.labels,
            excerpt: issue.body.slice(0, EXCERPT),
          })),
        }
      } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof IssueToolError) throw error
        // Filing records the failure for Admins; this must not hide it.
        return {
          issues: [],
          note: "Existing issues could not be read. Continue with file_issue if the cause is established.",
        }
      }
    },

    /** Files a new issue, or adds the occurrence to an existing one. */
    async file(input: FileIssueInput) {
      const repo = repository(input.repositoryId)
      if (!checked.has(repo.id))
        throw new IssueToolError(
          "Check find_existing_issues for this Repository first."
        )
      const title = redact(input.title).replace(/\s+/g, " ").trim()
      if (!title || title.length > MAX_TITLE)
        throw new IssueToolError(
          `Give a title of up to ${MAX_TITLE} characters.`
        )
      if (!input.findings.trim() || !input.userExperience.trim())
        throw new IssueToolError(
          "Describe what the user experienced and the evidence you found."
        )
      const saved = conversations()
      const earlier = saved.filedIssues(conversationId)
      const record = { repository: repo.fullName, kind: input.kind, title }
      const kind = `**Kind:** ${issueKindLabels[input.kind]}`
      try {
        if (!github) throw new GitHubError("bad-token")
        if (input.existingIssueNumber !== null) {
          const number = input.existingIssueNumber
          if (
            earlier.some(
              (item) =>
                item.outcome !== "failed" &&
                item.number === number &&
                item.repository === repo.fullName
            )
          )
            return {
              reported: true,
              note: "Already reported from this Conversation.",
            }
          const existing = await github.issue(repo.owner, repo.name, number)
          if (!existing.open || !existing.labels.includes(AGENT_LABEL))
            throw new IssueToolError(
              "That is not an open issue from find_existing_issues. Use one of those numbers, or null to file a new issue."
            )
          signal?.throwIfAborted()
          await github.comment(
            repo.owner,
            repo.name,
            number,
            body(input, repo, `## New occurrence\n\n${kind}`)
          )
          saved.recordFiledIssue(conversationId, messageId, {
            ...record,
            title: existing.title,
            outcome: "comment",
            number,
            url: existing.url,
            error: null,
          })
          return { reported: true }
        }
        if (
          earlier.filter((item) => item.outcome === "new").length >=
          MAX_NEW_ISSUES
        )
          throw new IssueToolError(
            "This Conversation has reached its limit of new issues. Do not file another."
          )
        for (const label of LABELS) {
          if (label.name !== AGENT_LABEL && label.name !== input.kind) continue
          // The issue request below is what decides whether filing works.
          await github.ensureLabel(repo.owner, repo.name, label).catch(() => {})
        }
        signal?.throwIfAborted()
        const created = await github.createIssue(repo.owner, repo.name, {
          title,
          body: body(input, repo, kind),
          labels: [AGENT_LABEL, input.kind],
        })
        saved.recordFiledIssue(conversationId, messageId, {
          ...record,
          outcome: "new",
          number: created.number,
          url: created.url,
          error: null,
        })
        return { reported: true }
      } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof IssueToolError) throw error
        // One record per answer, however often the agent tries again.
        if (
          !earlier.some(
            (item) => item.outcome === "failed" && item.messageId === messageId
          )
        )
          saved.recordFiledIssue(conversationId, messageId, {
            ...record,
            outcome: "failed",
            number: null,
            url: null,
            error: reason(error, repo.fullName),
          })
        throw new IssueToolError(FAILED)
      }
    },
  }
}
