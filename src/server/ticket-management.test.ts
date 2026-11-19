import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { createFakeGitHub } from "./fake-github"
import { createGitHubIssues } from "./github"
import { AGENT_LABEL } from "./issue-filing"
import { AuthorizationError } from "./session"
import { TicketError, createTicketManagement } from "./ticket-management"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createConversationsRepository } from "./repositories/conversations"
import { createRepositoriesRepository } from "./repositories/repositories"
import { createTicketsRepository } from "./repositories/tickets"
import type { Auth } from "./auth"
import type { FakeGitHub } from "./fake-github"
import type { TicketEdits } from "@/lib/tickets"

let dir: string, auth: Auth
let owner: Headers, other: Headers, admin: Headers
let ownerId: string, otherId: string, adminId: string
let appId: string, portalId: string, billingId: string
let conversations: ReturnType<typeof createConversationsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let tickets: ReturnType<typeof createTicketsRepository>
let github: FakeGitHub
let management: ReturnType<typeof createTicketManagement>

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent6-ticket-management-"))
  const db = openDb(join(dir, "agent6.db"))
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  const headers: Array<Headers> = [],
    ids: Array<string> = []
  for (const name of ["owner", "other", "admin"]) {
    const created = await auth.api.createUser({
      body: {
        name,
        email: `${name}@example.com`,
        password: "test-password",
        role: name === "admin" ? "admin" : "client",
      },
    })
    ids.push(created.user.id)
    const signed = await auth.api.signInEmail({
      body: { email: `${name}@example.com`, password: "test-password" },
      returnHeaders: true,
    })
    headers.push(
      new Headers({
        cookie: signed.headers
          .getSetCookie()
          .map((cookie) => cookie.split(";")[0])
          .join("; "),
      })
    )
  }
  ;[owner, other, admin] = headers
  ;[ownerId, otherId, adminId] = ids
  conversations = createConversationsRepository(db)
  applications = createApplicationsRepository(db)
  tickets = createTicketsRepository(db)
  const repositories = createRepositoriesRepository(db)
  appId = applications.create({ name: "Portal", description: "", notes: "" }).id
  portalId = repositories.create({
    fullName: "halden/portal",
    trackedBranch: "main",
    description: "",
    tags: [],
  }).id
  billingId = repositories.create({
    fullName: "halden/billing",
    trackedBranch: "main",
    description: "",
    tags: [],
  }).id
  applications.attachRepository(appId, portalId)
  applications.attachRepository(appId, billingId)
  github = createFakeGitHub()
  management = createTicketManagement({
    auth,
    tickets,
    applications,
    github: createGitHubIssues("token", github.fetcher),
    baseUrl: "http://localhost:3000",
  })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** A pending Ticket from a new Conversation of `userId`. */
function ticket(userId = ownerId, title = "Invoice fails without a price") {
  const conversation = conversations.create(userId, appId, "Invoice fails")
  const created = tickets.create({
    conversationId: conversation.id,
    messageId: conversation.messages.at(-1)!.id,
    repositoryId: portalId,
    repository: "halden/portal",
    kind: "data-fix",
    title,
    body: "### What the agent found\n\nDelivery 8812 has no price.",
    summary: "Your October invoice cannot be made.",
    targetIssueNumber: null,
    possibleDuplicateOf: null,
  })
  if (typeof created === "string") throw new Error(created)
  return { id: created.id, conversationId: conversation.id }
}

const edits = (overrides: Partial<TicketEdits> = {}): TicketEdits => ({
  title: "Invoice fails without a price",
  body: "### What the agent found\n\nDelivery 8812 has no price.",
  kind: "data-fix",
  repositoryId: portalId,
  targetIssueNumber: null,
  ...overrides,
})

const refusal = (field?: string) =>
  expect.objectContaining(field ? { field } : { status: 409 })

describe("Ticket review", () => {
  it("lets only Admins review, and gives everyone else no count", async () => {
    const { id } = ticket()
    for (const call of [
      () => management.list(owner, {}),
      () => management.get(owner, id),
      () => management.accept(owner, id, edits()),
      () => management.decline(owner, id, "No"),
    ])
      await expect(call()).rejects.toThrow(AuthorizationError)
    expect(await management.pendingCount(owner)).toBeNull()
    expect(await management.pendingCount(new Headers())).toBeNull()
    expect(await management.pendingCount(admin)).toBe(1)
    expect(github.requests).toEqual([])
  })

  it("lists pending Tickets by default, with filters", async () => {
    const first = ticket()
    ticket(otherId, "Delivery list is empty")
    await management.decline(admin, first.id, "Works as intended.")
    expect(
      (await management.list(admin, {})).tickets.map((row) => row.title)
    ).toEqual(["Delivery list is empty"])
    expect((await management.list(admin, { status: "all" })).total).toBe(2)
    expect(
      (await management.list(admin, { status: "declined" })).tickets
    ).toEqual([expect.objectContaining({ id: first.id, status: "declined" })])
    expect(
      (await management.list(admin, { status: "all", q: "DELIVERY" })).tickets
    ).toHaveLength(1)
    expect(
      (await management.list(admin, { applicationId: "other" })).tickets
    ).toEqual([])
    expect(await management.pendingCount(admin)).toBe(1)
  })

  it("files the Admin's edited version and records the Filed Issue", async () => {
    const { id, conversationId } = ticket()
    expect((await management.get(admin, id)).attachedRepositories).toEqual(
      expect.arrayContaining([
        { id: portalId, fullName: "halden/portal" },
        { id: billingId, fullName: "halden/billing" },
      ])
    )
    await management.accept(
      admin,
      id,
      edits({
        title: "Billing rejects deliveries without a price",
        body: "### What the agent found\n\nBilling throws. Ask rina@halden.example.",
        kind: "code-fix",
        repositoryId: billingId,
      })
    )
    const [issue] = github.repo("halden/billing").issues
    expect(issue.title).toBe("Billing rejects deliveries without a price")
    expect(issue.labels).toEqual([AGENT_LABEL, "code-fix"])
    expect(issue.body).toContain("**Kind:** Code Fix")
    expect(issue.body).toContain("Billing throws.")
    expect(issue.body).not.toContain("rina@")
    expect(issue.body).toContain(
      `[Ticket in Agent 6](http://localhost:3000/admin/tickets/${id})`
    )
    expect(issue.body).toContain(
      `[Conversation in Agent 6](http://localhost:3000/admin/conversations/${conversationId})`
    )
    expect(github.repo("halden/portal").issues).toEqual([])

    const accepted = await management.get(admin, id)
    expect(accepted).toMatchObject({
      status: "accepted",
      kind: "code-fix",
      repository: "halden/billing",
      decidedBy: { id: adminId, name: "admin" },
      lastError: null,
      filing: false,
      issue: {
        repository: "halden/billing",
        number: 1,
        url: "https://github.com/halden/billing/issues/1",
        outcome: "new",
      },
    })
    expect(accepted.decidedAt).toEqual(expect.any(Number))
    // One Filed Issue on the Conversation, shown on the Ticket's marker.
    expect(conversations.list({ hasIssue: "yes" }).conversations).toEqual([
      expect.objectContaining({
        id: conversationId,
        issueCount: 1,
        ticketCount: 1,
      }),
    ])
    const marker = { id, outcome: "ticket", status: "accepted" }
    expect(
      conversations.audit(conversationId).messages.at(-1)!.reports
    ).toEqual([
      {
        ...marker,
        issue: {
          repository: "halden/billing",
          number: 1,
          url: "https://github.com/halden/billing/issues/1",
        },
      },
    ])
    expect(
      conversations.get(conversationId, ownerId).messages.at(-1)!.reports
    ).toEqual([marker])
    expect(await management.pendingCount(admin)).toBe(0)
  })

  it("files a Feature Request with its own label", async () => {
    const { id } = ticket()
    await management.accept(admin, id, edits({ kind: "feature-request" }))
    const [issue] = github.repo("halden/portal").issues
    expect(issue.labels).toEqual([AGENT_LABEL, "feature-request"])
    expect(issue.body).toContain("**Kind:** Feature Request")
    expect(github.repo("halden/portal").labels).toContain("feature-request")
  })

  it("adds an occurrence only to an open Agent 6 issue", async () => {
    const portal = github.repo("halden/portal")
    portal.issues.push(
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
        title: "Invoices fail",
        body: "",
        labels: [AGENT_LABEL],
        state: "open",
        comments: [],
      }
    )
    const { id } = ticket()
    for (const targetIssueNumber of [1, 9])
      await expect(
        management.accept(admin, id, edits({ targetIssueNumber }))
      ).rejects.toEqual(refusal("targetIssueNumber"))
    // The refusal released the Ticket.
    expect((await management.get(admin, id)).status).toBe("pending")
    await management.accept(admin, id, edits({ targetIssueNumber: 2 }))
    expect(portal.issues).toHaveLength(2)
    expect(portal.issues[1].comments).toEqual([
      expect.stringContaining("## New occurrence\n\n**Kind:** Data Fix"),
    ])
    expect((await management.get(admin, id)).issue).toMatchObject({
      number: 2,
      outcome: "comment",
    })
  })

  it("refuses a Repository that is not attached to the Application", async () => {
    const { id } = ticket()
    applications.detachRepository(appId, portalId)
    await expect(management.accept(admin, id, edits())).rejects.toEqual(
      refusal("repositoryId")
    )
    for (const field of ["title", "body"] as const)
      await expect(
        management.accept(admin, id, edits({ [field]: "   " }))
      ).rejects.toEqual(refusal(field))
    expect(github.requests).toEqual([])
  })

  it("keeps the Ticket pending with the reason when GitHub refuses, and files it later", async () => {
    const { id } = ticket()
    github.refuseWrites = 403
    await expect(
      management.accept(admin, id, edits({ title: "Edited title" }))
    ).rejects.toThrow("Issues")
    const failed = await management.get(admin, id)
    expect(failed).toMatchObject({
      status: "pending",
      filing: false,
      title: "Edited title",
      lastError: expect.stringContaining("GITHUB_TOKEN"),
    })
    github.refuseWrites = undefined
    await management.accept(admin, id, edits({ title: "Edited title" }))
    expect(await management.get(admin, id)).toMatchObject({
      status: "accepted",
      lastError: null,
    })

    const unconfigured = createTicketManagement({
      auth,
      tickets,
      applications,
      github: null,
    })
    const second = ticket()
    expect((await unconfigured.get(admin, second.id)).githubConfigured).toBe(
      false
    )
    await expect(
      unconfigured.accept(admin, second.id, edits())
    ).rejects.toThrow("GITHUB_TOKEN is not set")
  })

  it("files a Ticket once when two Admins accept it together", async () => {
    const { id } = ticket()
    github.delayMs = 30
    const results = await Promise.allSettled([
      management.accept(admin, id, edits()),
      management.accept(admin, id, edits()),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    expect(github.repo("halden/portal").issues).toHaveLength(1)
  })

  it("declines with a required reason, shown exactly as written, and never reopens", async () => {
    const { id } = ticket()
    await expect(management.decline(admin, id, "  \n ")).rejects.toEqual(
      refusal("reason")
    )
    await expect(
      management.decline(admin, id, "x".repeat(2001))
    ).rejects.toEqual(refusal("reason"))
    const reason =
      "This is how invoices work.\n\nAdd the price on the Delivery screen."
    await management.decline(admin, id, `  ${reason}  `)
    expect(await management.get(admin, id)).toMatchObject({
      status: "declined",
      declineReason: reason,
      decidedBy: { id: adminId },
    })
    expect(github.requests).toEqual([])
    await expect(management.decline(admin, id, "Again")).rejects.toEqual(
      refusal()
    )
    await expect(management.accept(admin, id, edits())).rejects.toEqual(
      refusal()
    )
  })

  it("does not decline a Ticket while it is being filed, until the hold expires", async () => {
    const { id } = ticket()
    const changes = {
      ...edits(),
      repository: "halden/portal",
    }
    expect(tickets.claim(id, changes)).toBe(true)
    await expect(management.decline(admin, id, "No")).rejects.toEqual(refusal())
    expect((await management.get(admin, id)).filing).toBe(true)
    // A hold taken long ago has expired, as after a crash.
    tickets.release(id, null)
    expect(tickets.claim(id, changes, new Date(Date.now() - 3 * 60_000))).toBe(
      true
    )
    await management.decline(admin, id, "Works as intended.")
    expect((await management.get(admin, id)).status).toBe("declined")
  })
})

describe("The owner's Tickets", () => {
  it("lists only the owner's Tickets, including those of deleted Conversations, without developer content", async () => {
    const mine = ticket()
    const theirs = ticket(otherId)
    conversations.remove(mine.conversationId, ownerId)
    const page = await management.listOwn(owner, {})
    expect(page.tickets).toEqual([
      {
        id: mine.id,
        summary: "Your October invoice cannot be made.",
        status: "pending",
        application: { id: appId, name: "Portal" },
        createdAt: expect.any(Number),
        decidedAt: null,
      },
    ])
    expect(await management.getOwn(owner, mine.id)).toEqual({
      ...page.tickets[0],
      declineReason: null,
      conversationId: null,
    })
    await expect(management.getOwn(owner, theirs.id)).rejects.toEqual(
      expect.objectContaining({ status: 404 })
    )
    // An Admin's own list holds only their own Tickets too.
    expect((await management.listOwn(admin, {})).tickets).toEqual([])
    await expect(management.getOwn(admin, mine.id)).rejects.toThrow(TicketError)

    await management.decline(admin, theirs.id, "Already fixed.")
    const declined = await management.getOwn(other, theirs.id)
    expect(declined).toMatchObject({
      status: "declined",
      declineReason: "Already fixed.",
      conversationId: theirs.conversationId,
    })
    const text = JSON.stringify([declined, await management.listOwn(other, {})])
    for (const hidden of [
      "Invoice fails without a price",
      "halden/portal",
      "Delivery 8812",
      "data-fix",
    ])
      expect(text).not.toContain(hidden)
    expect(
      (await management.listOwn(other, { status: "pending" })).tickets
    ).toEqual([])
  })
})
