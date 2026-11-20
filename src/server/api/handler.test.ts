import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "../auth"
import { createApplicationActions } from "../application-management"
import { createDatabaseConnectionActions } from "../database-connection-management"
import { createFakeGitHub } from "../fake-github"
import { createGitHub, createGitHubIssues } from "../github"
import { createLogConnectionActions } from "../log-connection-management"
import { createRepositoryActions } from "../repository-management"
import { createRepositorySync } from "../repository-sync"
import { decrypt, encrypt } from "../secrets"
import { createServiceAccountManagement } from "../service-account-management"
import { createSettingsActions } from "../settings-management"
import { createTicketDecisions } from "../ticket-management"
import { openDb } from "../repositories/db"
import { createApiReadsRepository } from "../repositories/api-reads"
import { createApplicationsRepository } from "../repositories/applications"
import { createAuditRepository } from "../repositories/audit"
import { createConversationsRepository } from "../repositories/conversations"
import { createDatabaseConnectionsRepository } from "../repositories/database-connections"
import { createLogConnectionsRepository } from "../repositories/log-connections"
import { createRepositoriesRepository } from "../repositories/repositories"
import { createServiceAccountsRepository } from "../repositories/service-accounts"
import { createSettingsRepository } from "../repositories/settings"
import { createTicketsRepository } from "../repositories/tickets"
import { createWebhooksRepository } from "../repositories/webhooks"
import { createApiHandler } from "./handler"
import { API_ROUTES } from "./routes"
import type { Auth } from "../auth"
import type { FakeGitHub } from "../fake-github"
import type { Db } from "../repositories/db"
import type { ApiHandler } from "./handler"
import type { ApiPermission, NewApiKeyInput } from "@/lib/service-accounts"
import { API_PERMISSIONS } from "@/lib/service-accounts"

const KEY = Buffer.alloc(32, 7).toString("base64")
const BASE = "https://agent6.example.com"

let dir: string, db: Db, auth: Auth, admin: Headers
let clientId: string
let handler: ApiHandler
let github: FakeGitHub
let clock: Date
let ids: Record<string, string>
let management: ReturnType<typeof createServiceAccountManagement>
let accountId: string
let tickets: ReturnType<typeof createTicketsRepository>
let conversations: ReturnType<typeof createConversationsRepository>
let webhooks: ReturnType<typeof createWebhooksRepository>
let tested: Array<string>

async function signIn(email: string, password: string) {
  const signed = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })
  return new Headers({
    cookie: signed.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
  })
}

beforeEach(async () => {
  process.env.ENCRYPTION_KEY = KEY
  dir = mkdtempSync(join(tmpdir(), "agent6-api-"))
  db = openDb(join(dir, "agent6.db"))
  auth = createAuth(db, { secret: "s".repeat(32), baseUrl: BASE })
  for (const role of ["admin", "client"] as const) {
    const created = await auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: `${role}-password`,
        role,
      },
    })
    if (role === "client") clientId = created.user.id
  }
  admin = await signIn("admin@example.com", "admin-password")
  clock = new Date("2026-11-20T10:00:00.000Z")
  github = createFakeGitHub()
  for (const name of [
    "halden/billing",
    "halden/portal",
    "halden/shared",
    "halden/loose",
    "halden/new-service",
  ])
    github.addRepository(name, { branches: ["main", "develop"] })

  const repositories = createRepositoriesRepository(db)
  const applications = createApplicationsRepository(db)
  const databaseConnections = createDatabaseConnectionsRepository(db)
  const logConnections = createLogConnectionsRepository(db)
  tickets = createTicketsRepository(db)
  conversations = createConversationsRepository(db)
  webhooks = createWebhooksRepository(db)
  const audit = createAuditRepository(db)
  const serviceAccounts = createServiceAccountsRepository(db)
  tested = []
  const sync = createRepositorySync({
    repositories,
    dataDir: dir,
    git: {
      async sync() {
        return "7d03b18"
      },
    },
  })

  const billing = applications.create({
    name: "Billing",
    description: "",
    notes: "",
  }).id
  const portal = applications.create({
    name: "Portal",
    description: "",
    notes: "",
  }).id
  const repo = (fullName: string) =>
    repositories.create({
      fullName,
      trackedBranch: "main",
      tags: [],
      description: "",
    }).id
  ids = {
    billing,
    portal,
    billingRepo: repo("halden/billing"),
    portalRepo: repo("halden/portal"),
    sharedRepo: repo("halden/shared"),
    looseRepo: repo("halden/loose"),
  }
  applications.attachRepository(billing, ids.billingRepo)
  applications.attachRepository(billing, ids.sharedRepo)
  applications.attachRepository(portal, ids.portalRepo)
  applications.attachRepository(portal, ids.sharedRepo)
  ids.billingDb = databaseConnections.create(
    {
      name: "Billing production",
      host: "db.internal",
      port: 5432,
      database: "billing",
      user: "reader",
      sslMode: "require",
      tags: [],
      description: "",
      encryptedPassword: encrypt("old-secret", KEY),
    },
    { ok: true, message: "Connection successful.", writable: false }
  ).id
  databaseConnections.attach(billing, ids.billingDb)
  ids.portalLogs = logConnections.create(
    {
      name: "Portal Loki",
      baseUrl: "https://loki.internal",
      authType: "bearer",
      authUsername: "",
      tenantId: "",
      tags: [],
      description: "",
      encryptedAuthSecret: encrypt("old-token", KEY),
    },
    { ok: true, message: "Connection successful." }
  ).id
  logConnections.attach(portal, ids.portalLogs, '{app="portal"}')

  management = createServiceAccountManagement({
    auth,
    serviceAccounts,
    applications,
    audit,
    now: () => clock,
  })
  accountId = (
    await management.create(admin, { name: "Review bot", description: "" })
  ).id

  handler = createApiHandler({
    serviceAccounts,
    audit,
    now: () => clock,
    baseUrl: BASE,
    checkResponses: true,
    services: {
      reads: createApiReadsRepository(db),
      repositories: createRepositoryActions({
        repositories,
        sync,
        github: createGitHub("token", github.fetcher),
      }),
      applications: createApplicationActions({ applications, repositories }),
      databaseConnections: createDatabaseConnectionActions({
        connections: databaseConnections,
        applications,
        test: async (input) => {
          tested.push(`${input.host}:${input.password}`)
          return {
            ok: true,
            message: "Connection successful.",
            writable: false,
          }
        },
      }),
      logConnections: createLogConnectionActions({
        connections: logConnections,
        applications,
        test: async (input) => {
          tested.push(`${input.baseUrl}:${input.authHeader ?? ""}`)
          return { ok: true, message: "Connection successful." }
        },
      }),
      settings: createSettingsActions({
        settings: createSettingsRepository(db),
        translate: async () => {
          throw new Error("no model")
        },
      }),
      tickets: createTicketDecisions({
        tickets,
        applications,
        audit,
        github: createGitHubIssues("token", github.fetcher),
        baseUrl: BASE,
        now: () => clock,
      }),
    },
  })
})

afterEach(() => {
  db.$client.close()
  rmSync(dir, { recursive: true, force: true })
})

/** A key of the Review bot with exactly these grants. */
async function key(
  permissions: Array<ApiPermission>,
  applicationIds: Array<string> | "all" = "all",
  expiry: NewApiKeyInput["expiry"] = "never"
) {
  return (
    await management.createKey(admin, accountId, {
      name: "Test key",
      permissions,
      allApplications: applicationIds === "all",
      applicationIds: applicationIds === "all" ? [] : applicationIds,
      expiry,
    })
  ).key
}

async function call(
  apiKey: string | null,
  method: string,
  path: string,
  body?: unknown
) {
  const response = await handler(
    new Request(`${BASE}/api/v1${path}`, {
      method,
      headers: {
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : undefined,
  }
}

/** A pending Ticket in a new Conversation of the Application. */
function ticket(
  applicationId: string,
  repositoryId: string,
  fullName: string,
  target: number | null = null
) {
  const conversation = conversations.create(clientId, applicationId, "It fails")
  const created = tickets.create({
    conversationId: conversation.id,
    messageId: conversation.messages.at(-1)!.id,
    repositoryId,
    repository: fullName,
    kind: "code-fix",
    title: "Invoice fails",
    body: "### What the agent found\n\nThe total is null. Contact jane@example.com.",
    summary: "Your invoice cannot be made.",
    targetIssueNumber: target,
    possibleDuplicateOf: null,
  })
  if (typeof created === "string") throw new Error(created)
  return created.id
}

describe("authentication", () => {
  it("refuses missing, malformed, unknown, revoked, expired and disabled credentials", async () => {
    const valid = await key(["applications:read"])
    expect((await call(null, "GET", "/applications")).status).toBe(401)
    expect((await call("not-a-key", "GET", "/applications")).status).toBe(401)
    const unknown = `agent6_0123456789abcdef_${"A".repeat(43)}`
    expect((await call(unknown, "GET", "/applications")).status).toBe(401)
    // Right lookup id, wrong secret.
    const forged = `${valid.slice(0, 24)}${"B".repeat(43)}`
    const refused = await call(forged, "GET", "/applications")
    expect(refused.status).toBe(401)
    expect(refused.body).toEqual({
      error: expect.objectContaining({ code: "unauthorized" }),
    })
    expect(refused.headers.get("www-authenticate")).toContain("Bearer")
    expect((await call(valid, "GET", "/applications")).status).toBe(200)

    // A browser session never authenticates the API.
    const cookie = await handler(
      new Request(`${BASE}/api/v1/applications`, { headers: admin })
    )
    expect(cookie.status).toBe(401)

    await management.setDisabled(admin, accountId, true)
    expect((await call(valid, "GET", "/applications")).status).toBe(401)
    await management.setDisabled(admin, accountId, false)
    expect((await call(valid, "GET", "/applications")).status).toBe(200)

    const keyId = (await management.get(admin, accountId))!.keys[0].id
    await management.revokeKey(admin, accountId, keyId)
    expect((await call(valid, "GET", "/applications")).status).toBe(401)

    const expiring = await key(["applications:read"], "all", "30")
    expect((await call(expiring, "GET", "/applications")).status).toBe(200)
    clock = new Date(clock.getTime() + 31 * 86_400_000)
    expect((await call(expiring, "GET", "/applications")).status).toBe(401)
  })

  it("gives a new key no access, and applies grant changes to the next request", async () => {
    const created = await management.createKey(admin, accountId, {
      name: "Empty",
      permissions: [],
      allApplications: false,
      applicationIds: [],
      expiry: "never",
    })
    expect(created.apiKey.permissions).toEqual([])
    for (const route of API_ROUTES) {
      const path = route.path.replace(/\{(\w+)\}/g, (_m, name) =>
        name === "kind" ? "repository" : "x"
      )
      const answer = await call(
        created.key,
        route.method,
        path,
        route.body ? {} : undefined
      )
      expect([route.operationId, answer.status]).toEqual([
        route.operationId,
        403,
      ])
    }
    await management.updateKey(admin, accountId, created.apiKey.id, {
      name: "Empty",
      permissions: ["applications:read"],
      allApplications: false,
      applicationIds: [ids.billing],
    })
    expect(
      (await call(created.key, "GET", "/applications")).body.data.map(
        (row: { name: string }) => row.name
      )
    ).toEqual(["Billing"])
    // The key itself is never stored, and its last use is recorded.
    const stored = JSON.stringify(
      db.$client.prepare("select * from api_key").all()
    )
    expect(stored).not.toContain(created.key.slice(24))
    expect((await management.get(admin, accountId))!.keys[0].lastUsedAt).toBe(
      clock.getTime()
    )
  })

  it("rate-limits each key and failed authentications", async () => {
    const valid = await key(["applications:read"])
    let last = 0
    for (let index = 0; index < 125; index++)
      last = (await call(valid, "GET", "/applications")).status
    expect(last).toBe(429)
    let failed = 0
    for (let index = 0; index < 25; index++)
      failed = (await call("nope", "GET", "/applications")).status
    expect(failed).toBe(429)
  })
})

describe("Application scope", () => {
  const READ_ALL: Array<ApiPermission> = [
    "repositories:read",
    "applications:read",
    "attachments:read",
    "database-connections:read",
    "log-connections:read",
    "tickets:read",
  ]

  it("keeps a scoped key to its Applications through IDs, pages, filters and shared resources", async () => {
    const scoped = await key(READ_ALL, [ids.billing])
    const names = async (path: string) =>
      (await call(scoped, "GET", path)).body.data.map(
        (row: { name?: string; fullName?: string }) => row.name ?? row.fullName
      )

    expect(await names("/applications")).toEqual(["Billing"])
    expect((await call(scoped, "GET", "/applications")).body.total).toBe(1)
    expect(
      (await call(scoped, "GET", `/applications/${ids.portal}`)).status
    ).toBe(404)
    expect(
      (await call(scoped, "GET", `/applications/${ids.portal}/attachments`))
        .status
    ).toBe(404)

    expect(await names("/repositories")).toEqual([
      "halden/billing",
      "halden/shared",
    ])
    expect(
      (await call(scoped, "GET", "/repositories?pageSize=1&page=2")).body
    ).toMatchObject({ total: 2, page: 2 })
    expect(await names(`/repositories?applicationId=${ids.portal}`)).toEqual([])
    expect(
      (await call(scoped, "GET", `/repositories/${ids.portalRepo}`)).status
    ).toBe(404)
    expect(
      (await call(scoped, "GET", `/repositories/${ids.looseRepo}`)).status
    ).toBe(404)
    // The shared Repository shows only the allowed Attachment.
    expect(
      (await call(scoped, "GET", `/repositories/${ids.sharedRepo}`)).body
        .applications
    ).toEqual([{ id: ids.billing, name: "Billing" }])

    expect(await names("/database-connections")).toEqual(["Billing production"])
    expect(await names("/log-connections")).toEqual([])
    expect(
      (await call(scoped, "GET", `/log-connections/${ids.portalLogs}`)).status
    ).toBe(404)

    const billingTicket = ticket(ids.billing, ids.billingRepo, "halden/billing")
    const portalTicket = ticket(ids.portal, ids.portalRepo, "halden/portal")
    const listed = (await call(scoped, "GET", "/tickets")).body
    expect(listed.data.map((row: { id: string }) => row.id)).toEqual([
      billingTicket,
    ])
    expect(listed.total).toBe(1)
    expect((await call(scoped, "GET", `/tickets/${portalTicket}`)).status).toBe(
      404
    )
    expect(
      (await call(scoped, "GET", `/tickets?applicationId=${ids.portal}`)).body
        .total
    ).toBe(0)

    // All-Applications access also sees unattached records.
    const everything = await key(READ_ALL)
    expect((await call(everything, "GET", "/repositories")).body.total).toBe(4)
  })

  it("refuses configuration writes to a scoped key, whatever its permissions", async () => {
    const scoped = await key([...API_PERMISSIONS], [ids.billing])
    for (const [method, path, body] of [
      ["POST", "/applications", { name: "New" }],
      ["PATCH", `/applications/${ids.billing}`, { name: "Renamed" }],
      [
        "PUT",
        `/applications/${ids.billing}/attachments/repository/${ids.looseRepo}`,
        {},
      ],
      ["DELETE", `/repositories/${ids.billingRepo}`, undefined],
      ["PUT", "/preferred-language", { preferredLanguage: "Indonesian" }],
    ] as const) {
      const answer = await call(scoped, method, path, body)
      expect([path, answer.status, answer.body.error.code]).toEqual([
        path,
        403,
        "forbidden",
      ])
    }
    // Reads and Ticket decisions stay within scope.
    expect((await call(scoped, "GET", "/preferred-language")).body).toEqual({
      preferredLanguage: "English",
    })
  })
})

describe("resources", () => {
  it("connects, updates and removes Repositories with the existing checks", async () => {
    const writer = await key([
      "repositories:read",
      "repositories:create",
      "repositories:update",
      "repositories:delete",
    ])
    const missingBranch = await call(writer, "POST", "/repositories", {
      fullName: "halden/new-service",
      trackedBranch: "release",
    })
    expect(missingBranch).toMatchObject({
      status: 400,
      body: { error: { code: "validation_failed", field: "trackedBranch" } },
    })
    const unreadable = await call(writer, "POST", "/repositories", {
      fullName: "halden/secret",
      trackedBranch: "main",
    })
    expect(unreadable.body.error.field).toBe("repository")

    const created = await call(writer, "POST", "/repositories", {
      fullName: "https://github.com/halden/new-service",
      trackedBranch: "main",
      tags: ["api"],
    })
    expect(created.status).toBe(201)
    expect(created.headers.get("location")).toBe(
      `/api/v1/repositories/${created.body.id}`
    )
    expect(Object.keys(created.body)).toEqual(["id"])
    const duplicate = await call(writer, "POST", "/repositories", {
      fullName: "halden/new-service",
      trackedBranch: "main",
    })
    expect(duplicate).toMatchObject({
      status: 409,
      body: { error: { code: "conflict" } },
    })

    expect(
      (
        await call(writer, "PATCH", `/repositories/${created.body.id}`, {
          trackedBranch: "develop",
        })
      ).status
    ).toBe(204)
    const read = await call(writer, "GET", `/repositories/${created.body.id}`)
    expect(read.body).toMatchObject({
      fullName: "halden/new-service",
      trackedBranch: "develop",
      tags: ["api"],
    })
    expect(
      (
        await call(writer, "PATCH", `/repositories/${created.body.id}`, {
          trackedBranch: "nope",
        })
      ).status
    ).toBe(400)
    expect(
      (
        await call(writer, "PATCH", `/repositories/${created.body.id}`, {
          unknown: 1,
        })
      ).body.error.field
    ).toBe("unknown")

    expect(
      (await call(writer, "DELETE", `/repositories/${created.body.id}`)).status
    ).toBe(204)
    expect(
      (await call(writer, "DELETE", `/repositories/${created.body.id}`)).status
    ).toBe(404)
  })

  it("refuses to remove an Application with saved Conversations", async () => {
    const writer = await key([
      "applications:create",
      "applications:delete",
      "applications:update",
    ])
    conversations.create(clientId, ids.billing, "Hello")
    expect(
      await call(writer, "DELETE", `/applications/${ids.billing}`)
    ).toMatchObject({
      status: 409,
      body: { error: { code: "conflict" } },
    })
    const created = await call(writer, "POST", "/applications", {
      name: "Fresh",
    })
    expect(created.status).toBe(201)
    expect(
      (
        await call(writer, "PATCH", `/applications/${created.body.id}`, {
          name: " ",
        })
      ).body.error.field
    ).toBe("name")
    expect(
      (await call(writer, "DELETE", `/applications/${created.body.id}`)).status
    ).toBe(204)
  })

  it("manages Attachments with distinct permissions and Base Selector rules", async () => {
    const creator = await key(["attachments:read", "attachments:create"])
    const base = `/applications/${ids.billing}/attachments`
    expect(
      (await call(creator, "PUT", `${base}/repository/${ids.looseRepo}`, {}))
        .status
    ).toBe(201)
    expect(
      (await call(creator, "PUT", `${base}/repository/${ids.looseRepo}`, {}))
        .status
    ).toBe(403)
    expect(
      (await call(creator, "PUT", `${base}/repository/missing`, {})).status
    ).toBe(404)
    expect(
      (await call(creator, "PUT", `${base}/widget/${ids.looseRepo}`, {})).status
    ).toBe(404)
    expect(
      (
        await call(creator, "PUT", `${base}/repository/${ids.portalRepo}`, {
          baseSelector: '{app="x"}',
        })
      ).body.error.field
    ).toBe("baseSelector")
    expect(
      (
        await call(
          creator,
          "PUT",
          `${base}/log-connection/${ids.portalLogs}`,
          {}
        )
      ).body.error.field
    ).toBe("baseSelector")
    expect(
      (
        await call(creator, "PUT", `${base}/log-connection/${ids.portalLogs}`, {
          baseSelector: "app=billing",
        })
      ).body.error.field
    ).toBe("baseSelector")
    const attached = await call(
      creator,
      "PUT",
      `${base}/log-connection/${ids.portalLogs}`,
      { baseSelector: ' { app = "billing" } ' }
    )
    expect(attached.status).toBe(201)
    expect(
      (await call(creator, "GET", `${base}/log-connection/${ids.portalLogs}`))
        .body
    ).toEqual({
      kind: "log-connection",
      resourceId: ids.portalLogs,
      name: "Portal Loki",
      baseSelector: '{app="billing"}',
    })

    const updater = await key(["attachments:update", "attachments:delete"])
    expect(
      (
        await call(updater, "PUT", `${base}/log-connection/${ids.portalLogs}`, {
          baseSelector: '{app="billing", env="prod"}',
        })
      ).status
    ).toBe(204)
    expect(
      createLogConnectionsRepository(db).baseSelector(
        ids.billing,
        ids.portalLogs
      )
    ).toBe('{app="billing", env="prod"}')
    expect(
      (
        await call(
          updater,
          "DELETE",
          `${base}/log-connection/${ids.portalLogs}`
        )
      ).status
    ).toBe(204)
    expect(
      (
        await call(
          updater,
          "DELETE",
          `${base}/log-connection/${ids.portalLogs}`
        )
      ).status
    ).toBe(404)
  })

  it("keeps connection secrets write-only and needs them again for a new destination", async () => {
    const reader = await key([
      "database-connections:read",
      "log-connections:read",
    ])
    const settings = await key([
      "database-connections:read",
      "database-connections:read-config",
      "log-connections:read",
      "log-connections:read-config",
    ])
    const writer = await key([
      "database-connections:create",
      "database-connections:update",
      "log-connections:update",
    ])

    const plain = await call(
      reader,
      "GET",
      `/database-connections/${ids.billingDb}`
    )
    expect(plain.body).not.toHaveProperty("settings")
    expect(plain.body.status).toEqual({ state: "connected", writable: false })
    const detailed = await call(
      settings,
      "GET",
      `/database-connections/${ids.billingDb}`
    )
    expect(detailed.body.settings).toEqual({
      host: "db.internal",
      port: 5432,
      database: "billing",
      user: "reader",
      sslMode: "require",
    })
    // Write permissions alone do not read.
    expect(
      (await call(writer, "GET", `/database-connections/${ids.billingDb}`))
        .status
    ).toBe(403)

    const created = await call(writer, "POST", "/database-connections", {
      name: "Reports",
      host: "reports.internal",
      port: 5432,
      database: "reports",
      user: "reader",
      password: "p4ss",
      sslMode: "require",
    })
    expect(created.status).toBe(201)
    expect(tested).toEqual(["reports.internal:p4ss"])

    // Same destination: the saved password is reused.
    expect(
      (
        await call(writer, "PATCH", `/database-connections/${ids.billingDb}`, {
          name: "Billing",
        })
      ).status
    ).toBe(204)
    expect(tested.at(-1)).toBe("db.internal:old-secret")
    // New destination without the password: refused, nothing changes.
    const retarget = await call(
      writer,
      "PATCH",
      `/database-connections/${ids.billingDb}`,
      { host: "evil.example.com" }
    )
    expect(retarget).toMatchObject({
      status: 400,
      body: { error: { field: "password" } },
    })
    expect(tested.at(-1)).toBe("db.internal:old-secret")
    expect(
      (await call(settings, "GET", `/database-connections/${ids.billingDb}`))
        .body.settings.host
    ).toBe("db.internal")
    expect(
      (
        await call(writer, "PATCH", `/database-connections/${ids.billingDb}`, {
          host: "db2.internal",
          password: "new-secret",
        })
      ).status
    ).toBe(204)
    expect(tested.at(-1)).toBe("db2.internal:new-secret")

    const logRetarget = await call(
      writer,
      "PATCH",
      `/log-connections/${ids.portalLogs}`,
      { baseUrl: "https://evil.example.com" }
    )
    expect(logRetarget.body.error.field).toBe("authSecret")
    expect(
      (
        await call(writer, "PATCH", `/log-connections/${ids.portalLogs}`, {
          description: "Prod",
        })
      ).status
    ).toBe(204)
    expect(tested.at(-1)).toBe("https://loki.internal:Bearer old-token")
    const logSettings = await call(
      settings,
      "GET",
      `/log-connections/${ids.portalLogs}`
    )
    expect(logSettings.body.settings).toEqual({
      baseUrl: "https://loki.internal",
      authType: "bearer",
      authUsername: "",
      tenantId: "",
    })

    const everything = JSON.stringify([
      plain.body,
      detailed.body,
      logSettings.body,
      retarget.body,
      logRetarget.body,
    ])
    for (const secret of ["old-secret", "new-secret", "old-token", "p4ss"])
      expect(everything).not.toContain(secret)
    const audits = JSON.stringify(
      db.$client.prepare("select * from audit_event").all()
    )
    for (const secret of ["old-secret", "new-secret", "p4ss"])
      expect(audits).not.toContain(secret)
    expect(
      decrypt(
        createDatabaseConnectionsRepository(db).credentials(ids.billingDb)!
          .encryptedPassword!,
        KEY
      )
    ).toBe("new-secret")
  })

  it("reads and validates the Preferred Language", async () => {
    const languages = await key([
      "preferred-language:read",
      "preferred-language:update",
    ])
    expect(
      (
        await call(languages, "PUT", "/preferred-language", {
          preferredLanguage: "Indonesian",
        })
      ).status
    ).toBe(204)
    expect((await call(languages, "GET", "/preferred-language")).body).toEqual({
      preferredLanguage: "Indonesian",
    })
    expect(
      (
        await call(languages, "PUT", "/preferred-language", {
          preferredLanguage: "<script>",
        })
      ).body.error.field
    ).toBe("preferredLanguage")
    expect(
      (
        await call(languages, "PUT", "/preferred-language", {
          preferredLanguage: "Klingon",
        })
      ).status
    ).toBe(502)
  })

  it("refuses bad requests consistently", async () => {
    const writer = await key(["applications:create", "applications:read"])
    const raw = await handler(
      new Request(`${BASE}/api/v1/applications`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${writer}`,
          "content-type": "text/plain",
        },
        body: "name=x",
      })
    )
    expect(raw.status).toBe(415)
    const broken = await handler(
      new Request(`${BASE}/api/v1/applications`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${writer}`,
          "content-type": "application/json",
        },
        body: "{",
      })
    )
    expect(broken.status).toBe(400)
    const huge = await call(writer, "POST", "/applications", {
      name: "x",
      notes: "y".repeat(70_000),
    })
    expect(huge.status).toBe(413)
    expect(
      (await call(writer, "GET", "/applications?pageSize=500")).body.error.field
    ).toBe("pageSize")
    expect((await call(writer, "GET", "/nowhere")).status).toBe(404)
    const wrongMethod = await call(writer, "DELETE", "/applications")
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get("allow")).toBe("GET, POST")
  })
})

describe("Ticket decisions", () => {
  it("keeps accept and decline permissions apart and records the Service Account", async () => {
    const accepter = await key(["tickets:read", "tickets:accept"])
    const decliner = await key([
      "tickets:read",
      "tickets:decline",
      "tickets:read-details",
    ])
    const first = ticket(ids.billing, ids.billingRepo, "halden/billing")
    const second = ticket(ids.billing, ids.billingRepo, "halden/billing")

    expect(
      (
        await call(accepter, "POST", `/tickets/${first}/decline`, {
          reason: "No",
        })
      ).status
    ).toBe(403)
    expect(
      (await call(decliner, "POST", `/tickets/${first}/accept`)).status
    ).toBe(403)
    expect(
      (await call(decliner, "POST", `/tickets/${first}/decline`, {})).body.error
        .field
    ).toBe("reason")

    expect(
      (await call(accepter, "POST", `/tickets/${first}/accept`)).status
    ).toBe(204)
    expect(
      (
        await call(decliner, "POST", `/tickets/${second}/decline`, {
          reason: "Works as intended.",
        })
      ).status
    ).toBe(204)
    // Decided Tickets are final.
    expect(
      (await call(accepter, "POST", `/tickets/${first}/accept`)).status
    ).toBe(409)
    expect(
      (
        await call(decliner, "POST", `/tickets/${first}/decline`, {
          reason: "No",
        })
      ).status
    ).toBe(409)

    const accepted = await call(decliner, "GET", `/tickets/${first}`)
    expect(accepted.body).toMatchObject({
      status: "accepted",
      decidedBy: {
        type: "service-account",
        serviceAccount: { id: accountId, name: "Review bot" },
      },
      details: {
        filedIssue: { outcome: "new", repository: "halden/billing", number: 1 },
      },
    })
    expect(
      (await call(accepter, "GET", `/tickets/${first}`)).body
    ).not.toHaveProperty("details")
    expect(
      (await call(decliner, "GET", `/tickets/${second}`)).body.details
        .declineReason
    ).toBe("Works as intended.")
    expect(github.repo("halden/billing").issues).toHaveLength(1)
    expect(github.repo("halden/billing").issues[0].body).toContain(
      "accepted after review in Agent 6"
    )

    const audit = db.$client
      .prepare(
        "select operation, actor_type, service_account_id, target_id from audit_event where operation like 'tickets.%' order by operation"
      )
      .all()
    expect(audit).toEqual([
      {
        operation: "tickets.accept",
        actor_type: "service-account",
        service_account_id: accountId,
        target_id: first,
      },
      {
        operation: "tickets.decline",
        actor_type: "service-account",
        service_account_id: accountId,
        target_id: second,
      },
    ])
  })

  it("restricts decisions to the key's Applications", async () => {
    const scoped = await key(
      ["tickets:read", "tickets:accept", "tickets:decline"],
      [ids.billing]
    )
    const portal = ticket(ids.portal, ids.portalRepo, "halden/portal")
    expect(
      (await call(scoped, "POST", `/tickets/${portal}/accept`)).status
    ).toBe(404)
    expect(
      (
        await call(scoped, "POST", `/tickets/${portal}/decline`, {
          reason: "No",
        })
      ).status
    ).toBe(404)
    expect(tickets.get(portal)!.status).toBe("pending")
  })

  it("leaves a Ticket pending without an acceptance event when filing fails", async () => {
    webhooks.create(
      {
        name: "All",
        url: "https://hooks.example.com/a",
        enabled: true,
        eventTypes: [
          "ticket.created",
          "ticket.accepted",
          "ticket.declined",
          "github.issue.created",
        ],
        allApplications: true,
        applicationIds: [],
      },
      "v1:unused"
    )
    const accepter = await key(["tickets:read", "tickets:accept"])
    const id = ticket(ids.billing, ids.billingRepo, "halden/billing")
    github.refuseWrites = 403
    const failed = await call(accepter, "POST", `/tickets/${id}/accept`)
    expect(failed).toMatchObject({
      status: 502,
      body: { error: { code: "upstream_failed" } },
    })
    expect(tickets.get(id)).toMatchObject({
      status: "pending",
      filingUntil: null,
    })
    const types = () =>
      (
        db.$client
          .prepare("select type from webhook_event order by type")
          .all() as Array<{ type: string }>
      ).map((row) => row.type)
    expect(types()).toEqual(["ticket.created"])
    github.refuseWrites = undefined
    expect((await call(accepter, "POST", `/tickets/${id}/accept`)).status).toBe(
      204
    )
    expect(types()).toEqual([
      "github.issue.created",
      "ticket.accepted",
      "ticket.created",
    ])
  })

  it("emits only ticket.accepted for an occurrence comment", async () => {
    const accepter = await key([
      "tickets:accept",
      "tickets:read",
      "tickets:read-details",
    ])
    github
      .repo("halden/billing")
      .issues.push({
        number: 7,
        title: "Invoice fails",
        body: "",
        labels: ["agent-6"],
        state: "open",
        comments: [],
      })
    const id = ticket(ids.billing, ids.billingRepo, "halden/billing", 7)
    expect((await call(accepter, "POST", `/tickets/${id}/accept`)).status).toBe(
      204
    )
    const events = db.$client
      .prepare(
        "select type, payload from webhook_event where ticket_id = ? order by type"
      )
      .all(id) as Array<{ type: string; payload: string }>
    expect(events.map((row) => row.type)).toEqual([
      "ticket.accepted",
      "ticket.created",
    ])
    const accepted = JSON.parse(events[0].payload)
    expect(accepted.data.ticket.filedIssue).toMatchObject({
      outcome: "comment",
      number: 7,
    })
    expect(accepted.data.ticket.description).not.toContain("jane@example.com")
    expect(github.repo("halden/billing").issues[0].comments).toHaveLength(1)
  })

  it("lets only one of concurrent decisions commit", async () => {
    const accepter = await key(["tickets:accept"])
    const decliner = await key(["tickets:decline"])
    const id = ticket(ids.billing, ids.billingRepo, "halden/billing")
    github.delayMs = 30
    const results = await Promise.all([
      call(accepter, "POST", `/tickets/${id}/accept`),
      call(accepter, "POST", `/tickets/${id}/accept`),
      call(decliner, "POST", `/tickets/${id}/decline`, { reason: "No" }),
    ])
    expect(results.map((item) => item.status).sort()).toEqual([204, 409, 409])
    expect(github.repo("halden/billing").issues).toHaveLength(1)
    expect(tickets.get(id)!.status).toBe("accepted")
  })

  it("does not let an expired claim complete after another decision", async () => {
    const id = ticket(ids.billing, ids.billingRepo, "halden/billing")
    const changes = {
      title: "Invoice fails",
      body: "Body",
      kind: "code-fix" as const,
      repositoryId: ids.billingRepo,
      repository: "halden/billing",
      targetIssueNumber: null,
    }
    const stale = tickets.claim(id, changes, new Date(Date.now() - 3 * 60_000))!
    const fresh = tickets.claim(id, changes)!
    expect(fresh).not.toBe(stale)
    const filed = {
      outcome: "new" as const,
      number: 1,
      url: "https://github.com/halden/billing/issues/1",
      title: "Invoice fails",
    }
    const actor = {
      type: "service-account" as const,
      serviceAccountId: accountId,
      apiKeyId: "k",
    }
    expect(tickets.accept(id, stale, actor, filed)).toBe(false)
    tickets.release(id, stale, "late failure")
    expect(tickets.get(id)!.lastError).toBeNull()
    expect(
      tickets.accept(id, fresh, { type: "admin", userId: clientId }, filed)
    ).toBe(true)
  })
})

describe("OpenAPI contract", () => {
  it("documents every route with its permission, schemas and errors, without authentication", async () => {
    const response = await handler(new Request(`${BASE}/api/v1/openapi.json`))
    expect(response.status).toBe(200)
    const document = await response.json()
    expect(document.openapi).toBe("3.1.0")
    expect(document.servers).toEqual([{ url: `${BASE}/api/v1` }])
    for (const route of API_ROUTES) {
      const operation = document.paths[route.path]?.[route.method.toLowerCase()]
      expect(operation, `${route.method} ${route.path}`).toBeDefined()
      expect(operation.operationId).toBe(route.operationId)
      expect(operation.description).toContain("Requires")
      for (const status of [401, 403, 429])
        expect(operation.responses[status]).toBeDefined()
      for (const success of route.success)
        expect(operation.responses[success.status]).toBeDefined()
      if (route.body)
        expect(
          operation.requestBody.content["application/json"].schema
            .additionalProperties
        ).toBe(false)
      for (const name of route.path.match(/\{(\w+)\}/g) ?? [])
        expect(
          operation.parameters.map((item: { name: string }) => item.name)
        ).toContain(name.slice(1, -1))
    }
    expect(new Set(API_ROUTES.map((route) => route.operationId)).size).toBe(
      API_ROUTES.length
    )
    expect(JSON.stringify(document)).not.toMatch(
      /password"\s*:\s*\{[^}]*"readOnly"/
    )
  })
})
