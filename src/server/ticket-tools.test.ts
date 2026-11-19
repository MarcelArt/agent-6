import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { createFakeGitHub } from "./fake-github"
import { createGitHubIssues } from "./github"
import { AGENT_LABEL } from "./issue-filing"
import { TicketToolError, createTicketTools, redact } from "./ticket-tools"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createConversationsRepository } from "./repositories/conversations"
import { createRepositoriesRepository } from "./repositories/repositories"
import { createTicketsRepository } from "./repositories/tickets"
import type { FakeGitHub } from "./fake-github"
import type { CreateTicketInput } from "./ticket-tools"
import { MAX_TICKETS_PER_CONVERSATION } from "@/lib/tickets"

let directory: string
let conversations: ReturnType<typeof createConversationsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let tickets: ReturnType<typeof createTicketsRepository>
let applicationId: string, repositoryId: string, otherRepositoryId: string
let userId: string
let github: FakeGitHub

const input: CreateTicketInput = {
  repositoryId: "",
  kind: "data-fix",
  title: "October invoice cannot be created: delivery without a price",
  summary:
    "The October invoice cannot be made because one delivery has no price.",
  userExperience: "The October invoice will not download.",
  findings:
    "`src/invoice.ts:42` throws when `delivery.price` is null.\n\n`select id from delivery where price is null` returned 1 row (id 8812).\n\n2026-11-15T09:10:02Z ERROR price missing",
  potentialFix:
    "```sql\nupdate delivery set price = 120000 where id = 8812;\n```",
  existingIssueNumber: null,
  possibleDuplicateOf: null,
}

function conversation(text = "The October invoice will not download") {
  const created = conversations.create(userId, applicationId, text)
  return { id: created.id, messageId: created.messages.at(-1)!.id }
}

function tools(target: { id: string; messageId: string }, withToken = true) {
  return createTicketTools({
    applicationId,
    conversationId: target.id,
    messageId: target.messageId,
    github: withToken ? createGitHubIssues("token", github.fetcher) : null,
    tickets,
    attached: (application: string, id: string) =>
      applications
        .scope(application)
        ?.attachments.flatMap((item) =>
          item.kind === "repository" ? [item.resource] : []
        )
        .find((item) => item.id === id) ?? null,
  })
}

const writes = () =>
  github.requests.filter((request) => request.startsWith("POST"))

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-tickets-"))
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
  tickets = createTicketsRepository(db)
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
  github = createFakeGitHub()
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe("Ticket tools", () => {
  it("creates a pending Ticket with every section and sends nothing to GitHub", async () => {
    const target = conversation()
    const reports = tools(target)
    expect(await reports.findExisting({ repositoryId })).toEqual({
      issues: [],
      pendingTickets: [],
    })
    expect(await reports.createTicket(input)).toEqual({ created: true })
    expect(writes()).toEqual([])

    const [created] = conversations.tickets(target.id)
    expect(created).toMatchObject({
      kind: "data-fix",
      title: input.title,
      summary: input.summary,
      status: "pending",
      repository: "halden/portal",
      targetIssueNumber: null,
      declineReason: null,
    })
    const stored = tickets.get(created.id)!
    expect(stored.messageId).toBe(target.messageId)
    expect(stored.repositoryId).toBe(repositoryId)
    for (const part of [
      "### What the user experienced",
      "The October invoice will not download.",
      "### What the agent found",
      "src/invoice.ts:42",
      "commit `abc123` of `main` in `halden/portal`",
      "### Potential fix",
      "update delivery set price",
    ])
      expect(stored.body).toContain(part)
    // Heading and footer are added on filing, so kind and target stay editable.
    expect(stored.body).not.toContain("**Kind:**")
    expect(stored.body).not.toContain("Agent 6](")

    // Owner and Admin see the status; nobody sees an issue yet.
    const report = { id: created.id, outcome: "ticket", status: "pending" }
    expect(
      conversations.get(target.id, userId).messages.at(-1)!.reports
    ).toEqual([report])
    expect(
      conversations.get(target.id, userId, true).messages.at(-1)!.reports
    ).toEqual([report])
    expect(conversations.list({}, userId).conversations[0]).toMatchObject({
      ticketCount: 1,
      issueCount: 0,
    })
  })

  it("describes a Feature Request as a request, not a fault", async () => {
    const target = conversation("Please add a gate choice to the sorting form")
    const reports = tools(target)
    await reports.findExisting({ repositoryId })
    expect(
      await reports.createTicket({
        ...input,
        kind: "feature-request",
        title: "Sorting form: choose the truck's entry gate for olah pisah",
        summary: "Anda meminta pilihan pintu masuk truk di form sortasi.",
        userExperience: "Add an olah pisah checkbox with a gate choice.",
        findings: "`src/grading/sorting-form.tsx:120` has no such field.",
        potentialFix: "Add a checkbox that reveals a gate select.",
      })
    ).toEqual({ created: true })
    const [created] = conversations.tickets(target.id)
    expect(created.kind).toBe("feature-request")
    const { body } = tickets.get(created.id)!
    for (const heading of [
      "### What the user asked for",
      "### How it works now",
      "### Possible approach",
    ])
      expect(body).toContain(heading)
    expect(body).not.toContain("Potential fix")
  })

  it("shows open issues and other Conversations' pending Tickets, and only accepts targets from them", async () => {
    github.repo("halden/portal").issues.push({
      number: 7,
      title: "Invoices fail without a price",
      body: "Earlier report",
      labels: [AGENT_LABEL, "data-fix"],
      state: "open",
      comments: [],
    })
    const first = tools(conversation())
    await first.findExisting({ repositoryId })
    await first.createTicket(input)
    const firstId = tickets.pendingIn(repositoryId, "")[0].id

    const target = conversation("Invoice for October fails again")
    const second = tools(target)
    await expect(
      second.createTicket({ ...input, existingIssueNumber: 7 })
    ).rejects.toThrow("find_existing_issues")
    const found = await second.findExisting({ repositoryId })
    expect(found.issues).toEqual([
      expect.objectContaining({
        number: 7,
        title: "Invoices fail without a price",
      }),
    ])
    expect(found.pendingTickets).toEqual([
      {
        id: firstId,
        title: input.title,
        kind: "data-fix",
        excerpt: expect.stringContaining("What the agent found"),
        targetIssueNumber: null,
      },
    ])
    await expect(
      second.createTicket({ ...input, existingIssueNumber: 8 })
    ).rejects.toThrow("not an open issue")
    await expect(
      second.createTicket({ ...input, possibleDuplicateOf: "made-up" })
    ).rejects.toThrow("not a pending Ticket")
    expect(
      await second.createTicket({
        ...input,
        existingIssueNumber: 7,
        possibleDuplicateOf: firstId,
      })
    ).toEqual({ created: true })
    const [created] = conversations.tickets(target.id)
    expect(created.targetIssueNumber).toBe(7)
    expect(tickets.get(created.id)!.possibleDuplicate).toMatchObject({
      id: firstId,
      status: "pending",
    })
    // The same Conversation does not ticket the same issue twice.
    expect(
      await second.createTicket({ ...input, existingIssueNumber: 7 })
    ).toEqual({ created: true, note: expect.stringContaining("already") })
    expect(conversations.tickets(target.id)).toHaveLength(1)
    // Its own Tickets are not offered back as duplicates.
    expect((await first.findExisting({ repositoryId })).pendingTickets).toEqual(
      [expect.objectContaining({ id: created.id })]
    )
    expect(writes()).toEqual([])
  })

  it("refuses a Repository that is not attached to the Conversation's Application", async () => {
    const target = conversation()
    const reports = tools(target)
    await expect(
      reports.findExisting({ repositoryId: otherRepositoryId })
    ).rejects.toThrow(TicketToolError)
    await expect(
      reports.createTicket({ ...input, repositoryId: otherRepositoryId })
    ).rejects.toThrow("not available in this Application")
    // Detaching takes effect at once.
    await reports.findExisting({ repositoryId })
    applications.detachRepository(applicationId, repositoryId)
    await expect(reports.createTicket(input)).rejects.toThrow(TicketToolError)
    expect(conversations.tickets(target.id)).toEqual([])
  })

  it("creates a Ticket without GitHub, for a new issue only", async () => {
    const target = conversation()
    const reports = tools(target, false)
    expect(await reports.findExisting({ repositoryId })).toEqual({
      issues: [],
      pendingTickets: [],
      note: expect.stringContaining("existingIssueNumber null"),
    })
    await expect(
      reports.createTicket({ ...input, existingIssueNumber: 1 })
    ).rejects.toThrow("not an open issue")
    expect(await reports.createTicket(input)).toEqual({ created: true })
    expect(conversations.tickets(target.id)).toHaveLength(1)

    github.refuseWrites = 403
    const unreadable = tools(conversation("Another"))
    expect((await unreadable.findExisting({ repositoryId })).issues).toEqual([])
  })

  it("stops at the limit of Tickets per Conversation, whatever their status", async () => {
    const target = conversation()
    const reports = tools(target)
    await reports.findExisting({ repositoryId })
    await reports.createTicket({ ...input, title: "Fault 1" })
    const [first] = conversations.tickets(target.id)
    expect(tickets.decline(first.id, userId, "Not a fault")).toBe(true)
    // Calls the model makes in parallel cannot pass the limit together.
    const results = await Promise.allSettled(
      ["Fault 2", "Fault 3", "Fault 4"].map((title) =>
        reports.createTicket({ ...input, title })
      )
    )
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      MAX_TICKETS_PER_CONVERSATION - 1
    )
    expect(
      results
        .filter((item) => item.status === "rejected")
        .map((item) => String(item.reason))
    ).toEqual([
      expect.stringContaining("limit"),
      expect.stringContaining("limit"),
    ])
    expect(conversations.tickets(target.id)).toHaveLength(
      MAX_TICKETS_PER_CONVERSATION
    )
  })

  it("refuses an empty summary or one that is too long", async () => {
    const reports = tools(conversation())
    await reports.findExisting({ repositoryId })
    await expect(
      reports.createTicket({ ...input, summary: "   " })
    ).rejects.toThrow("summary")
    await expect(
      reports.createTicket({ ...input, summary: "x".repeat(401) })
    ).rejects.toThrow("summary")
    await expect(
      reports.createTicket({ ...input, title: "x".repeat(201) })
    ).rejects.toThrow("title")
  })

  it("keeps a Ticket with its answer when the answer is retried", async () => {
    const target = conversation()
    conversations.begin(target.id, userId, { start: true })
    const reports = tools(target)
    await reports.findExisting({ repositoryId })
    await reports.createTicket(input)
    conversations.finish(target.id, target.messageId, "Failed")
    const retry = conversations.begin(target.id, userId, { retry: true })
    expect(retry.assistantId).not.toBe(target.messageId)
    const [created] = conversations.tickets(target.id)
    expect(tickets.get(created.id)!.messageId).toBe(retry.assistantId)
  })

  it("blanks emails, phone numbers and credentials in what it stores", async () => {
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
    // Long source/log tokens must not cause the email pattern to backtrack quadratically.
    const longEvidence = "x".repeat(64 * 1024)
    expect(redact(longEvidence)).toBe(longEvidence)

    const target = conversation()
    const reports = tools(target)
    await reports.findExisting({ repositoryId })
    await reports.createTicket({
      ...input,
      summary: "Rina (rina@halden.example) cannot get her invoice.",
      userExperience: "Mail me at rina@halden.example",
    })
    const [created] = conversations.tickets(target.id)
    expect(created.summary).not.toContain("rina@")
    expect(tickets.get(created.id)!.body).not.toContain("rina@")
  })
})
