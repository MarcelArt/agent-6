import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { createGitHubIssues } from "./github"
import {
  AGENT_LABEL,
  IssueToolError,
  createIssueTools,
  redact,
} from "./issue-tools"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createConversationsRepository } from "./repositories/conversations"
import { createRepositoriesRepository } from "./repositories/repositories"
import type { FileIssueInput } from "./issue-tools"
import { MAX_NEW_ISSUES } from "@/lib/chat"

type Stored = {
  number: number
  title: string
  body: string
  labels: Array<string>
  state: string
  comments: Array<string>
  pull_request?: object
}

let directory: string
let conversations: ReturnType<typeof createConversationsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let applicationId: string, repositoryId: string, otherRepositoryId: string
let userId: string
/** A small stand-in for GitHub's issue endpoints of halden/portal. */
let github: {
  issues: Array<Stored>
  labels: Array<string>
  requests: Array<string>
  /** Status answered to every write, as a token without Issues permission gets. */
  refuseWrites?: number
}

function fetcher(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? "GET"
    github.requests.push(`${method} ${url.pathname}`)
    const sent = init?.body ? JSON.parse(init.body as string) : undefined
    const answer = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status })
    const issue = (item: Stored) => ({
      number: item.number,
      html_url: `https://github.com/halden/portal/issues/${item.number}`,
      title: item.title,
      body: item.body,
      state: item.state,
      labels: item.labels.map((name) => ({ name })),
      ...(item.pull_request ? { pull_request: {} } : {}),
    })
    if (!url.pathname.startsWith("/repos/halden/portal/"))
      return answer({}, 404)
    if (method === "POST" && github.refuseWrites)
      return answer({}, github.refuseWrites)
    const path = url.pathname.replace("/repos/halden/portal", "")
    if (path === "/labels" && method === "POST") {
      if (github.labels.includes(sent.name)) return answer({}, 422)
      github.labels.push(sent.name)
      return answer({}, 201)
    }
    if (path === "/issues" && method === "GET") {
      expect(url.searchParams.get("state")).toBe("open")
      const label = url.searchParams.get("labels")!
      return answer(
        github.issues
          .filter(
            (item) => item.state === "open" && item.labels.includes(label)
          )
          .map(issue)
      )
    }
    if (path === "/issues" && method === "POST") {
      const created: Stored = {
        number: github.issues.length + 1,
        title: sent.title,
        body: sent.body,
        labels: sent.labels,
        state: "open",
        comments: [],
      }
      github.issues.push(created)
      return answer(issue(created), 201)
    }
    const match = /^\/issues\/(\d+)(\/comments)?$/.exec(path)
    const found = github.issues.find(
      (item) => item.number === Number(match?.[1])
    )
    if (!match || !found) return answer({}, 404)
    if (match[2] && method === "POST") {
      found.comments.push(sent.body)
      return answer({}, 201)
    }
    return answer(issue(found))
  }
}

const input: FileIssueInput = {
  repositoryId: "",
  kind: "data-fix",
  title: "October invoice cannot be created: delivery without a price",
  userExperience: "The October invoice will not download.",
  findings:
    "`src/invoice.ts:42` throws when `delivery.price` is null.\n\n`select id from delivery where price is null` returned 1 row (id 8812).\n\n2026-11-15T09:10:02Z ERROR price missing",
  potentialFix:
    "```sql\nupdate delivery set price = 120000 where id = 8812;\n```",
  existingIssueNumber: null,
}

function conversation(text = "The October invoice will not download") {
  const created = conversations.create(userId, applicationId, text)
  return { id: created.id, messageId: created.messages.at(-1)!.id }
}

function tools(target: { id: string; messageId: string }, withToken = true) {
  return createIssueTools({
    applicationId,
    conversationId: target.id,
    messageId: target.messageId,
    conversationUrl: `http://localhost:3000/chat/${target.id}`,
    github: withToken ? createGitHubIssues("token", fetcher()) : null,
    conversations,
    attached: (application, id) =>
      applications
        .scope(application)
        ?.attachments.flatMap((item) =>
          item.kind === "repository" ? [item.resource] : []
        )
        .find((item) => item.id === id) ?? null,
  })
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-issues-"))
  const db = openDb(join(directory, "agent6.db"))
  const auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  const created = await auth.api.createUser({
    body: {
      name: "client",
      email: "client@example.com",
      password: "client-password",
      role: "client",
    },
  })
  userId = created.user.id
  conversations = createConversationsRepository(db)
  applications = createApplicationsRepository(db)
  const repositories = createRepositoriesRepository(db)
  applicationId = applications.create({
    name: "Customer Portal",
    description: "",
    notes: "",
  }).id
  repositoryId = repositories.create({
    fullName: "halden/portal",
    trackedBranch: "main",
    description: "",
    tags: [],
  }).id
  repositories.markReady(repositoryId, new Date(), "abc123")
  applications.attachRepository(applicationId, repositoryId)
  otherRepositoryId = repositories.create({
    fullName: "halden/secret",
    trackedBranch: "main",
    description: "",
    tags: [],
  }).id
  input.repositoryId = repositoryId
  github = { issues: [], labels: ["bug"], requests: [] }
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe("Issue filing", () => {
  it("files one issue with every section and both labels, and records the Filed Issue", async () => {
    const target = conversation()
    const issues = tools(target)
    expect(await issues.findExisting({ repositoryId })).toEqual({ issues: [] })
    expect(await issues.file(input)).toEqual({ reported: true })

    expect(github.issues).toHaveLength(1)
    const [filed] = github.issues
    expect(filed.title).toBe(input.title)
    expect(filed.labels).toEqual([AGENT_LABEL, "data-fix"])
    expect(github.labels).toEqual(["bug", AGENT_LABEL, "data-fix"])
    for (const part of [
      "**Kind:** Data Fix",
      "### What the user experienced",
      "The October invoice will not download.",
      "### What the agent found",
      "src/invoice.ts:42",
      "commit `abc123` of `main`",
      "### Potential fix",
      "update delivery set price",
      `[Conversation in Agent 6](http://localhost:3000/chat/${target.id})`,
    ])
      expect(filed.body).toContain(part)

    expect(conversations.filedIssues(target.id)).toEqual([
      {
        messageId: target.messageId,
        repository: "halden/portal",
        kind: "data-fix",
        title: input.title,
        outcome: "new",
        number: 1,
        url: "https://github.com/halden/portal/issues/1",
        error: null,
      },
    ])
    // A Client sees the bare notice; an Admin sees where the issue is.
    const report = { id: expect.any(String), outcome: "new" }
    expect(
      conversations.get(target.id, userId).messages.at(-1)!.reports
    ).toEqual([report])
    expect(
      conversations.get(target.id, userId, true).messages.at(-1)!.reports
    ).toEqual([
      {
        ...report,
        issue: {
          repository: "halden/portal",
          number: 1,
          url: "https://github.com/halden/portal/issues/1",
        },
      },
    ])
  })

  it("adds a comment to the matching issue from a second Conversation instead of filing another", async () => {
    const first = tools(conversation())
    await first.findExisting({ repositoryId })
    await first.file(input)

    const target = conversation("Invoice for October fails again")
    const second = tools(target)
    const found = await second.findExisting({ repositoryId })
    expect(found.issues).toEqual([
      expect.objectContaining({ number: 1, title: input.title }),
    ])
    const again = { ...input, existingIssueNumber: 1 }
    expect(await second.file(again)).toEqual({ reported: true })
    expect(github.issues).toHaveLength(1)
    expect(github.issues[0].comments).toHaveLength(1)
    expect(github.issues[0].comments[0]).toContain("## New occurrence")
    expect(github.issues[0].comments[0]).toContain(`/chat/${target.id}`)
    expect(conversations.filedIssues(target.id)).toEqual([
      expect.objectContaining({ outcome: "comment", number: 1 }),
    ])
    // The same Conversation does not pile comments onto the issue.
    await second.file(again)
    expect(github.issues[0].comments).toHaveLength(1)
    expect(conversations.filedIssues(target.id)).toHaveLength(1)
  })

  it("refuses a Repository that is not attached to the Conversation's Application", async () => {
    const target = conversation()
    const issues = tools(target)
    await expect(
      issues.findExisting({ repositoryId: otherRepositoryId })
    ).rejects.toThrow(IssueToolError)
    await expect(
      issues.file({ ...input, repositoryId: otherRepositoryId })
    ).rejects.toThrow("not available in this Application")
    // Detaching takes effect at once.
    await issues.findExisting({ repositoryId })
    applications.detachRepository(applicationId, repositoryId)
    await expect(issues.file(input)).rejects.toThrow(IssueToolError)
    expect(github.requests.filter((item) => item.startsWith("POST"))).toEqual(
      []
    )
    expect(conversations.filedIssues(target.id)).toEqual([])
  })

  it("requires the check for existing issues, and only comments on open issues Agent 6 filed", async () => {
    const issues = tools(conversation())
    await expect(issues.file(input)).rejects.toThrow("find_existing_issues")
    github.issues.push(
      {
        number: 1,
        title: "Someone else's",
        body: "",
        labels: ["bug"],
        state: "open",
        comments: [],
      },
      {
        number: 2,
        title: "Closed",
        body: "",
        labels: [AGENT_LABEL],
        state: "closed",
        comments: [],
      },
      {
        number: 3,
        title: "A pull request",
        body: "",
        labels: [AGENT_LABEL],
        state: "open",
        comments: [],
        pull_request: {},
      }
    )
    expect(await issues.findExisting({ repositoryId })).toEqual({ issues: [] })
    for (const existingIssueNumber of [1, 2])
      await expect(
        issues.file({ ...input, existingIssueNumber })
      ).rejects.toThrow("not an open issue")
    expect(github.issues.flatMap((item) => item.comments)).toEqual([])
  })

  it("records that reporting failed, for Admins only, when the token may not write issues", async () => {
    const target = conversation()
    github.refuseWrites = 403
    const issues = tools(target)
    await issues.findExisting({ repositoryId })
    await expect(issues.file(input)).rejects.toThrow(
      "Do not say the team has been informed"
    )
    await expect(issues.file(input)).rejects.toThrow(IssueToolError)
    expect(conversations.filedIssues(target.id)).toEqual([
      expect.objectContaining({
        outcome: "failed",
        number: null,
        error: expect.stringContaining("Issues"),
      }),
    ])
    expect(
      conversations.get(target.id, userId).messages.at(-1)!.reports
    ).toEqual([])
    expect(
      conversations.get(target.id, userId, true).messages.at(-1)!.reports
    ).toEqual([
      {
        id: expect.any(String),
        outcome: "failed",
        repository: "halden/portal",
        reason: expect.stringContaining("GITHUB_TOKEN"),
      },
    ])

    const without = conversation("Another")
    const unconfigured = tools(without, false)
    expect(await unconfigured.findExisting({ repositoryId })).toEqual({
      issues: [],
      note: expect.any(String),
    })
    await expect(unconfigured.file(input)).rejects.toThrow(IssueToolError)
    expect(conversations.filedIssues(without.id)[0].error).toContain(
      "GITHUB_TOKEN is not set"
    )
  })

  it("stops at the limit of new issues per Conversation", async () => {
    const issues = tools(conversation())
    await issues.findExisting({ repositoryId })
    for (let index = 0; index < MAX_NEW_ISSUES; index++)
      await issues.file({ ...input, title: `Fault ${index}` })
    await expect(issues.file({ ...input, title: "One more" })).rejects.toThrow(
      "limit"
    )
    expect(github.issues).toHaveLength(MAX_NEW_ISSUES)
  })

  it("keeps a Filed Issue with its answer when the answer is retried", async () => {
    const target = conversation()
    conversations.begin(target.id, userId, { start: true })
    const issues = tools(target)
    await issues.findExisting({ repositoryId })
    await issues.file(input)
    conversations.finish(target.id, target.messageId, "Failed")
    const retry = conversations.begin(target.id, userId, { retry: true })
    expect(retry.assistantId).not.toBe(target.messageId)
    expect(conversations.filedIssues(target.id)[0].messageId).toBe(
      retry.assistantId
    )
  })

  it("blanks emails, phone numbers and credentials in what it sends", async () => {
    expect(
      redact(
        [
          "user rina@halden.example called from +62 812 3456 7890",
          'password: "hunter2", token=abc123def',
          "Authorization: Bearer abcdefghijklmnop.qrstuv",
          "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
          "postgres://app:s3cret@db.internal:5432/portal",
        ].join("\n")
      )
    ).toBe(
      [
        "user [redacted email] called from [redacted phone]",
        "password: [redacted], token=[redacted]",
        "Authorization: [redacted] [redacted]",
        "[redacted token]",
        "postgres://[redacted]@db.internal:5432/portal",
      ].join("\n")
    )
    // Evidence stays readable.
    const evidence =
      "src/invoice.ts:42 at 2026-11-15T09:10:02+07:00, delivery 8812, where token = $1 and id = 120000"
    expect(redact(evidence)).toBe(evidence)

    const issues = tools(conversation())
    await issues.findExisting({ repositoryId })
    await issues.file({
      ...input,
      userExperience: "Mail me at rina@halden.example",
    })
    expect(github.issues[0].body).not.toContain("rina@")
  })
})
