import "@tanstack/react-start/server-only"

import { GitHubError } from "./github"
import type { GitHubIssues } from "./github"
import type { IssueKind } from "@/lib/chat"
import { issueKindLabels } from "@/lib/chat"

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
  {
    name: "feature-request",
    color: "a2eeef",
    description: "Asks for something the application does not do yet",
  },
]

/** The occurrence target is not an issue Agent 6 may add to. */
export class FilingTargetError extends Error {}

/** Why filing failed, in words an Admin can act on. */
export function filingProblem(
  error: unknown,
  fullName: string,
  hasToken: boolean
) {
  if (!hasToken)
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

/**
 * Files an accepted Ticket: a new issue, or a new occurrence on an open
 * Agent 6 issue. `body` holds the sections; the heading and `footer` are
 * added here so kind and target can change until then.
 */
export async function fileIssue(
  github: GitHubIssues,
  repo: { owner: string; name: string; fullName: string },
  issue: {
    kind: IssueKind
    title: string
    body: string
    targetIssueNumber: number | null
  },
  footer: string
): Promise<{
  outcome: "new" | "comment"
  number: number
  url: string
  title: string
}> {
  const kind = `**Kind:** ${issueKindLabels[issue.kind]}`
  if (issue.targetIssueNumber !== null) {
    const number = issue.targetIssueNumber
    const existing = await github
      .issue(repo.owner, repo.name, number)
      .catch((error: unknown) => {
        if (error instanceof GitHubError && error.problem === "not-found")
          return null
        throw error
      })
    if (!existing?.open || !existing.labels.includes(AGENT_LABEL))
      throw new FilingTargetError(
        `Issue #${number} in ${repo.fullName} is not an open Agent 6 issue. Choose another issue, or file a new one.`
      )
    await github.comment(
      repo.owner,
      repo.name,
      number,
      [`## New occurrence\n\n${kind}`, issue.body, footer].join("\n\n")
    )
    return {
      outcome: "comment",
      number,
      url: existing.url,
      title: existing.title,
    }
  }
  for (const label of LABELS) {
    if (label.name !== AGENT_LABEL && label.name !== issue.kind) continue
    // The issue request below is what decides whether filing works.
    await github.ensureLabel(repo.owner, repo.name, label).catch(() => {})
  }
  const created = await github.createIssue(repo.owner, repo.name, {
    title: issue.title,
    body: [kind, issue.body, footer].join("\n\n"),
    labels: [AGENT_LABEL, issue.kind],
  })
  return {
    outcome: "new",
    number: created.number,
    url: created.url,
    title: issue.title,
  }
}
