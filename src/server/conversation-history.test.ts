import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import sharp from "sharp"
import { createAuth } from "./auth"
import { createConversationHistory } from "./conversation-history"
import { createChatManagement } from "./chat-management"
import { auditText, historyActivities } from "./conversation-audit"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createConversationsRepository } from "./repositories/conversations"
import { createUploadsRepository } from "./repositories/uploads"
import { createUploads } from "./uploads"
import { AuthorizationError } from "./session"
import { historySearch, auditSearch } from "@/lib/conversation-history"
import type { Auth } from "./auth"

let dir: string, auth: Auth
let owner: Headers, other: Headers, admin: Headers
let ownerId: string, otherId: string, appId: string, secondApp: string
let conversations: ReturnType<typeof createConversationsRepository>
let history: ReturnType<typeof createConversationHistory>
let chat: ReturnType<typeof createChatManagement>
let uploads: ReturnType<typeof createUploads>
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent6-history-"))
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
  ;[ownerId, otherId] = ids
  const applications = createApplicationsRepository(db)
  appId = applications.create({ name: "Portal", description: "", notes: "" }).id
  secondApp = applications.create({
    name: "Billing",
    description: "",
    notes: "",
  }).id
  conversations = createConversationsRepository(db)
  history = createConversationHistory({ auth, conversations })
  chat = createChatManagement({ auth, conversations })
  uploads = createUploads({
    auth,
    conversations,
    uploads: createUploadsRepository(db),
    dir: join(dir, "uploads"),
  })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("Conversation history access", () => {
  it("lists only the caller's Conversations and refuses foreign reads, writes and Admin audits", async () => {
    const mine = conversations.create(ownerId, appId, "Invoice question")
    const theirs = conversations.create(otherId, secondApp, "Private title")
    const own = await history.list(owner, { userId: otherId })
    expect(own.conversations.map((row) => row.id)).toEqual([mine.id])
    expect(JSON.stringify(own)).not.toMatch(
      /Private title|other@example|history|activities|deletedAt|refused/
    )
    expect(own.applications).toEqual([{ id: appId, name: "Portal" }])
    for (const headers of [other, admin]) {
      await expect(chat.get(headers, mine.id)).rejects.toMatchObject({
        status: 404,
      })
      await expect(
        history.rename(headers, mine.id, "Stolen")
      ).rejects.toMatchObject({ status: 404 })
      await expect(history.remove(headers, mine.id)).rejects.toMatchObject({
        status: 404,
      })
      for (const input of [
        { start: true },
        { retry: true },
        { message: "Hi" },
      ] as const)
        await expect(chat.reply(headers, mine.id, input)).rejects.toMatchObject(
          { status: 404 }
        )
    }
    for (const headers of [owner, other, new Headers()]) {
      await expect(history.listAll(headers, {})).rejects.toBeInstanceOf(
        AuthorizationError
      )
      await expect(history.audit(headers, theirs.id)).rejects.toBeInstanceOf(
        AuthorizationError
      )
    }
    await expect(history.list(new Headers(), {})).rejects.toBeInstanceOf(
      AuthorizationError
    )
    expect((await history.audit(admin, mine.id)).user.email).toBe(
      "owner@example.com"
    )
  })
  it("renames and soft-deletes, preserving messages, tools, Filed Issues and images for Admins", async () => {
    const image = await uploads.add(owner, {
      name: "error.png",
      bytes: await sharp({
        create: { width: 10, height: 10, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
    })
    const mine = conversations.create(ownerId, appId, "Invoice error", [
      image.id,
    ])
    const claim = conversations.begin(mine.id, ownerId, { start: true })
    conversations.recordActivity(claim.assistantId, {
      id: `${claim.assistantId}:call-1`,
      name: "query_database",
      input: JSON.stringify({
        sql: "select id from invoices where password = 'hidden-password'",
      }),
      status: "error",
      error: "Authorization: Bearer hidden-token",
    })
    conversations.recordFiledIssue(mine.id, claim.assistantId, {
      repository: "team/portal",
      kind: "code-fix",
      title: "Fix",
      outcome: "new",
      number: 7,
      url: "https://github.com/team/portal/issues/7",
      error: null,
    })
    conversations.finish(mine.id, claim.assistantId, "Reported.", [])
    await history.rename(owner, mine.id, "  Invoice   download ")
    expect((await chat.get(owner, mine.id)).title).toBe("Invoice download")
    await expect(history.rename(owner, mine.id, " ")).rejects.toThrow(/title/)
    await expect(
      history.rename(owner, mine.id, "x".repeat(121))
    ).rejects.toThrow(/title/)
    expect(JSON.stringify(await chat.get(owner, mine.id))).not.toMatch(
      /query_database|hidden-password|call-1|activities|issues\/7/
    )
    await expect(uploads.read(other, image.id)).rejects.toMatchObject({
      status: 404,
    })
    expect((await uploads.read(admin, image.id)).name).toBe("error.png")
    await history.remove(owner, mine.id)
    expect((await history.list(owner, {})).total).toBe(0)
    await expect(chat.get(owner, mine.id)).rejects.toMatchObject({
      status: 404,
    })
    await expect(
      chat.reply(owner, mine.id, { message: "Again" })
    ).rejects.toMatchObject({ status: 404 })
    await expect(uploads.read(owner, image.id)).rejects.toMatchObject({
      status: 404,
    })
    expect((await uploads.read(admin, image.id)).name).toBe("error.png")
    const audit = await history.audit(admin, mine.id)
    expect(audit.deletedAt).toEqual(expect.any(Number))
    expect(audit.activities).toMatchObject([
      { name: "query_database", status: "error", messageId: claim.assistantId },
    ])
    expect(JSON.stringify(audit)).not.toMatch(/hidden-password|hidden-token/)
    expect(audit.messages[1].reports).toMatchObject([{ issue: { number: 7 } }])
    expect((await history.listAll(admin, {})).conversations[0]).toMatchObject({
      id: mine.id,
      deletedAt: expect.any(Number),
      issueCount: 1,
    })
    const reopened = createConversationHistory({
      auth,
      conversations: createConversationsRepository(
        openDb(join(dir, "agent6.db"))
      ),
    })
    expect((await reopened.audit(admin, mine.id)).activities).toEqual(
      audit.activities
    )
  })
  it("paginates newest first with stable ties, combines filters, and counts unique successful issues", async () => {
    const ids = Array.from(
      { length: 23 },
      (_, index) =>
        conversations.create(
          ownerId,
          index % 2 ? secondApp : appId,
          `Invoice ${index} 100%_`
        ).id
    )
    conversations.create(otherId, secondApp, "Foreign")
    const first = await history.list(owner, {})
    const second = await history.list(owner, { page: 2 })
    expect(first.conversations).toHaveLength(20)
    expect(second.conversations).toHaveLength(3)
    expect(
      new Set(
        [...first.conversations, ...second.conversations].map((row) => row.id)
      ).size
    ).toBe(23)
    expect(first.conversations.map((row) => row.updatedAt)).toEqual(
      first.conversations.map((row) => row.updatedAt).sort((a, b) => b - a)
    )
    expect(
      (await history.list(owner, { q: "100%_", applicationId: appId })).total
    ).toBe(12)
    expect((await history.list(owner, { q: "100%_x" })).total).toBe(0)
    expect((await history.list(owner, { page: 999 })).page).toBe(2)
    const claim = conversations.begin(ids[0], ownerId, { start: true })
    for (const outcome of ["new", "comment", "failed"] as const)
      conversations.recordFiledIssue(ids[0], claim.assistantId, {
        repository: "team/portal",
        kind: "code-fix",
        title: "Fix",
        outcome,
        number: outcome === "failed" ? null : 1,
        url:
          outcome === "failed"
            ? null
            : "https://github.com/team/portal/issues/1",
        error: outcome === "failed" ? "Unavailable" : null,
      })
    conversations.refuse(
      ids[0],
      claim.assistantId,
      claim.userMessageId,
      "Refused"
    )
    const filtered = await history.listAll(admin, {
      userId: ownerId,
      applicationId: appId,
      hasIssue: "yes",
    })
    expect(filtered.conversations).toMatchObject([
      { id: ids[0], issueCount: 1, refused: true },
    ])
    expect((await history.listAll(admin, { hasIssue: "no" })).total).toBe(23)
    expect(
      historySearch.parse({
        q: "invoice",
        page: "invalid",
        applicationId: appId,
      })
    ).toEqual({ q: "invoice", page: undefined, applicationId: appId })
    expect(auditSearch.parse({ hasIssue: "yes", userId: ownerId })).toEqual({
      hasIssue: "yes",
      userId: ownerId,
    })
  })
  it("projects legacy SDK history without raw results or reasoning and tolerates missing tool details", async () => {
    const mine = conversations.create(ownerId, appId, "Help")
    const claim = conversations.begin(mine.id, ownerId, { start: true })
    conversations.finish(mine.id, claim.assistantId, "Try Billing", [
      {
        type: "function_call",
        callId: "old",
        name: "read_file",
        arguments: '{"path":"billing.ts"}',
      },
      {
        type: "function_call_result",
        status: "completed",
        callId: "old",
        name: "read_file",
        output: { type: "text", text: '{"error":"password=old-secret"}' },
      },
    ])
    const audit = await history.audit(admin, mine.id)
    expect(audit.activities).toMatchObject([
      {
        id: "old",
        name: "read_file",
        status: "error",
        input: '{"path":"billing.ts"}',
      },
    ])
    expect(JSON.stringify(audit)).not.toContain("old-secret")
    expect(
      historyActivities([{ type: "reasoning", content: "secret" }, null])
    ).toEqual([])
    expect(
      (
        await history.audit(
          admin,
          conversations.create(ownerId, appId, "Old").id
        )
      ).activities
    ).toEqual([])
  })
})

it("redacts nested credentials, authorization and images in audit inputs", () => {
  const output = auditText({
    apiKey: "key-value",
    headers: { Cookie: "session-cookie", Authorization: "Bearer tiny" },
    query: "password = 'sql-secret'",
    image: "data:image/png;base64,AAA=",
  })
  expect(output).not.toMatch(/key-value|session-cookie|tiny|sql-secret|AAA=/)
})

it("omits Decision AI evidence excerpts from both live and replayed audit activity", () => {
  const activities = historyActivities([
    {
      type: "function_call",
      callId: "review-1",
      name: "review_investigation",
      arguments: JSON.stringify({
        evidence: "private incident evidence with customer names",
      }),
    },
    {
      type: "function_call_result",
      callId: "review-1",
      output: { text: JSON.stringify({ resources: [] }) },
    },
  ])
  expect(activities).toMatchObject([
    {
      name: "review_investigation",
      input: "[Evidence omitted]",
      status: "complete",
    },
  ])
  expect(JSON.stringify(activities)).not.toContain("private incident evidence")
})
