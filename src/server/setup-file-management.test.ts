import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAuth } from "./auth"
import { createApplicationManagement } from "./application-management"
import { createDatabaseConnectionManagement } from "./database-connection-management"
import { createDatabaseTools } from "./database-tools"
import { createFakeGitHub } from "./fake-github"
import { createGitHub } from "./github"
import { createLogTools } from "./log-tools"
import { createNavCounts } from "./nav-counts"
import { openDb } from "./repositories/db"
import { createSetupFileRepository } from "./repositories/setup-file"
import { createTicketsRepository } from "./repositories/tickets"
import { encrypt } from "./secrets"
import { AuthorizationError } from "./session"
import {
  SetupFileError,
  createSetupFileManagement,
} from "./setup-file-management"
import type { SetupFile } from "@/lib/setup-file"

vi.mock("./config", () => ({
  getConfig: () => ({ encryptionKey: Buffer.alloc(32, 1).toString("base64") }),
}))

const directories: Array<string> = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

/** One Agent 6 instance: its own data directory, database and users. */
async function instance() {
  const directory = mkdtempSync(join(tmpdir(), "agent6-setup-file-"))
  directories.push(directory)
  const file = join(directory, "agent6.db")
  const db = openDb(file)
  const auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  async function signIn(role: "admin" | "client") {
    await auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: `${role}-password`,
        role,
      },
    })
    const { headers } = await auth.api.signInEmail({
      body: { email: `${role}@example.com`, password: `${role}-password` },
      returnHeaders: true,
    })
    return new Headers({
      cookie: headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    })
  }
  const admin = await signIn("admin")
  const client = await signIn("client")
  const store = createSetupFileRepository(db)
  const github = createFakeGitHub()
  const synced: Array<string> = []
  const tested: Array<string> = []
  const management = createSetupFileManagement({
    auth,
    store,
    github: createGitHub("token", github.fetcher),
    sync: {
      sync: async (id: string) => {
        synced.push(id)
      },
    },
    testDatabaseConnection: async (_headers, id) => {
      tested.push(id)
    },
    testLogConnection: async (_headers, id) => {
      tested.push(id)
    },
    now: () => new Date("2026-11-19T10:00:00.000Z"),
  })
  return {
    db,
    file,
    auth,
    admin,
    client,
    store,
    github,
    synced,
    tested,
    management,
  }
}
type Instance = Awaited<ReturnType<typeof instance>>

const NO_TEST = { ok: true, message: "Connection successful." }

/** Billing, Reports and Internal, sharing some resources. */
function seed({ store }: Instance) {
  const billingApi = store.repositories.create({
    fullName: "acme/billing-api",
    trackedBranch: "main",
    tags: ["backend"],
    description: "Invoices.",
  })
  const shared = store.repositories.create({
    fullName: "acme/shared-ui",
    trackedBranch: "develop",
    tags: [],
    description: "",
  })
  const internal = store.repositories.create({
    fullName: "acme/internal-tools",
    trackedBranch: "main",
    tags: [],
    description: "",
  })
  const billingDb = store.databaseConnections.create(
    {
      name: "Billing production",
      host: "DB.internal",
      port: 5432,
      database: "billing",
      user: "agent6_reader",
      sslMode: "require",
      tags: ["billing"],
      description: "",
      encryptedPassword: encrypt("database-password-kept-private"),
    },
    { ...NO_TEST, writable: false }
  )
  const reportsDb = store.databaseConnections.create(
    {
      name: "Reports",
      host: "reports.internal",
      port: 5432,
      database: "reports",
      user: "reader",
      sslMode: "disable",
      tags: [],
      description: "",
      encryptedPassword: encrypt(""),
    },
    { ...NO_TEST, writable: false }
  )
  const loki = store.logConnections.create(
    {
      name: "Loki",
      baseUrl: "https://loki.internal",
      authType: "bearer",
      authUsername: "",
      tenantId: "",
      tags: [],
      description: "",
      encryptedAuthSecret: encrypt("log-token-kept-private"),
    },
    NO_TEST
  )
  const openLoki = store.logConnections.create(
    {
      name: "Open Loki",
      baseUrl: "http://loki:3100",
      authType: "none",
      authUsername: "",
      tenantId: "team-a",
      tags: [],
      description: "",
      encryptedAuthSecret: null,
    },
    NO_TEST
  )
  const internalLoki = store.logConnections.create(
    {
      name: "Internal Loki",
      baseUrl: "http://internal-loki:3100",
      authType: "none",
      authUsername: "",
      tenantId: "",
      tags: [],
      description: "",
      encryptedAuthSecret: null,
    },
    NO_TEST
  )
  const billing = store.applications.create({
    name: "Billing",
    description: "Invoices and payments.",
    notes: "",
  })
  const reports = store.applications.create({
    name: "Reports",
    description: "",
    notes: "Monthly.",
  })
  const internalApp = store.applications.create({
    name: "Internal",
    description: "",
    notes: "",
  })
  store.applications.attachRepository(billing.id, billingApi.id)
  store.applications.attachRepository(billing.id, shared.id)
  store.applications.attachRepository(reports.id, shared.id)
  store.applications.attachRepository(internalApp.id, internal.id)
  store.databaseConnections.attach(billing.id, billingDb.id)
  store.databaseConnections.attach(reports.id, reportsDb.id)
  store.logConnections.attach(billing.id, loki.id, '{app="billing"}')
  store.logConnections.attach(reports.id, openLoki.id, '{app="reports"}')
  store.logConnections.attach(
    internalApp.id,
    internalLoki.id,
    '{app="internal"}'
  )
  return { billing, reports, internalApp, billingDb, loki }
}

/** A source instance's export of Billing and Reports, as text. */
async function exported() {
  const source = await instance()
  const { billing, reports } = seed(source)
  const result = await source.management.export(source.admin, [
    billing.id,
    reports.id,
  ])
  return { source, result, text: JSON.stringify(result.file, null, 2) }
}

function readable(target: Instance) {
  target.github.addRepository("acme/billing-api")
  target.github.addRepository("acme/shared-ui", { branches: ["develop"] })
}

describe("Export", () => {
  it("holds exactly the chosen Applications' resources, Attachments and Base Selectors, without secrets or ids", async () => {
    const { source, result, text } = await exported()
    expect(result.fileName).toBe("agent6-setup-2026-11-19.json")
    expect(result.leftOut).toEqual({
      repositories: 1,
      databaseConnections: 0,
      logConnections: 1,
    })
    expect(result.file).toEqual({
      format: "agent6-setup",
      version: 1,
      exportedAt: "2026-11-19T10:00:00.000Z",
      repositories: [
        {
          fullName: "acme/billing-api",
          trackedBranch: "main",
          tags: ["backend"],
          description: "Invoices.",
        },
        {
          fullName: "acme/shared-ui",
          trackedBranch: "develop",
          tags: [],
          description: "",
        },
      ],
      databaseConnections: [
        {
          name: "Billing production",
          host: "DB.internal",
          port: 5432,
          database: "billing",
          user: "agent6_reader",
          sslMode: "require",
          hasPassword: true,
          tags: ["billing"],
          description: "",
        },
        {
          name: "Reports",
          host: "reports.internal",
          port: 5432,
          database: "reports",
          user: "reader",
          sslMode: "disable",
          hasPassword: false,
          tags: [],
          description: "",
        },
      ],
      logConnections: [
        {
          name: "Loki",
          baseUrl: "https://loki.internal",
          authType: "bearer",
          authUsername: "",
          tenantId: "",
          tags: [],
          description: "",
        },
        {
          name: "Open Loki",
          baseUrl: "http://loki:3100",
          authType: "none",
          authUsername: "",
          tenantId: "team-a",
          tags: [],
          description: "",
        },
      ],
      applications: [
        {
          name: "Billing",
          description: "Invoices and payments.",
          notes: "",
          repositories: ["acme/billing-api", "acme/shared-ui"],
          databaseConnections: [
            {
              host: "DB.internal",
              port: 5432,
              database: "billing",
              user: "agent6_reader",
            },
          ],
          logConnections: [
            {
              baseUrl: "https://loki.internal",
              tenantId: "",
              baseSelector: '{app="billing"}',
            },
          ],
        },
        {
          name: "Reports",
          description: "",
          notes: "Monthly.",
          repositories: ["acme/shared-ui"],
          databaseConnections: [
            {
              host: "reports.internal",
              port: 5432,
              database: "reports",
              user: "reader",
            },
          ],
          logConnections: [
            {
              baseUrl: "http://loki:3100",
              tenantId: "team-a",
              baseSelector: '{app="reports"}',
            },
          ],
        },
      ],
    })
    expect(text).not.toMatch(/kept-private|encrypted|"id"|v1:/)
    const ids = source.store.snapshot().applications.map((item) => item.id)
    for (const id of ids) expect(text).not.toContain(id)
  })

  it("lists every Application with what is attached, and the totals", async () => {
    const source = await instance()
    const { billing } = seed(source)
    const options = await source.management.exportOptions(source.admin)
    expect(options.applications.map((item) => item.name)).toEqual([
      "Billing",
      "Internal",
      "Reports",
    ])
    expect(
      options.applications.find((item) => item.id === billing.id)
    ).toMatchObject({
      repositoryIds: expect.any(Array),
      databaseConnectionIds: [expect.any(String)],
    })
    expect(options.totals).toEqual({
      repositories: 3,
      databaseConnections: 2,
      logConnections: 3,
    })
  })

  it("refuses Applications sharing a name and connections sharing a natural identity, naming them", async () => {
    const source = await instance()
    const { billing, billingDb } = seed(source)
    const twin = source.store.applications.create({
      name: " billing ",
      description: "",
      notes: "",
    })
    await expect(
      source.management.export(source.admin, [billing.id, twin.id])
    ).rejects.toMatchObject({
      problems: [expect.stringMatching(/"Billing" and " billing "/)],
    })
    const copy = source.store.databaseConnections.create(
      {
        name: "Billing copy",
        host: "db.INTERNAL",
        port: 5432,
        database: "billing",
        user: "agent6_reader",
        sslMode: "require",
        tags: [],
        description: "",
        encryptedPassword: encrypt("x"),
      },
      { ...NO_TEST, writable: false }
    )
    source.store.databaseConnections.attach(twin.id, copy.id)
    source.store.applications.update(twin.id, {
      name: "Other",
      description: "",
      notes: "",
    })
    const refused = await source.management
      .export(source.admin, [billing.id, twin.id])
      .catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(SetupFileError)
    expect((refused as SetupFileError).problems).toEqual([
      expect.stringContaining('"Billing production" and "Billing copy"'),
    ])
    expect(billingDb.id).toBeTruthy()
  })
})

describe("Import", () => {
  it("creates the Applications with all their Attachments in an empty instance, syncs Repositories and leaves secret-holding connections Needs Secret", async () => {
    const { text } = await exported()
    const target = await instance()
    readable(target)
    const preview = await target.management.preview(target.admin, text)
    expect(preview.problems).toEqual([])
    expect(preview.changes).toBe(true)
    expect(
      [
        ...preview.repositories,
        ...preview.databaseConnections,
        ...preview.logConnections,
        ...preview.applications,
      ].every((record) => record.status === "new")
    ).toBe(true)
    expect(
      preview.databaseConnections.map((item) => [item.name, item.needsSecret])
    ).toEqual([
      ["Billing production", true],
      ["Reports", false],
    ])
    // The preview writes nothing.
    expect(target.store.snapshot().applications).toEqual([])

    const result = await target.management.import(target.admin, text)
    expect(result).toEqual({
      ok: true,
      summary: {
        created: {
          applications: 2,
          repositories: 2,
          databaseConnections: 2,
          logConnections: 2,
        },
        reused: {
          applications: 0,
          repositories: 0,
          databaseConnections: 0,
          logConnections: 0,
        },
        attachments: 7,
        needsSecret: 2,
      },
    })
    const after = target.store.snapshot()
    expect(target.synced.sort()).toEqual(
      after.repositories.map((item) => item.id).sort()
    )
    expect(after.repositories.every((item) => item.status === "pending")).toBe(
      true
    )
    const byName = <T extends { name: string }>(
      items: Array<T>,
      name: string
    ) => items.find((item) => item.name === name)!
    expect(
      byName(after.databaseConnections, "Billing production")
    ).toMatchObject({ needsSecret: true, test: { ok: false } })
    expect(byName(after.databaseConnections, "Reports").needsSecret).toBe(false)
    expect(byName(after.logConnections, "Loki")).toMatchObject({
      needsSecret: true,
      authType: "bearer",
    })
    expect(byName(after.logConnections, "Open Loki").needsSecret).toBe(false)
    // Only connections that need no secret are tested.
    expect(target.tested.sort()).toEqual(
      [
        byName(after.databaseConnections, "Reports").id,
        byName(after.logConnections, "Open Loki").id,
      ].sort()
    )
    const billing = byName(after.applications, "Billing")
    const scope = target.store.applications.scope(billing.id, {
      includeNeedsSecret: true,
    })!
    expect(
      scope.attachments.map((item) =>
        item.kind === "repository"
          ? item.resource.fullName
          : item.kind === "log-connection"
            ? `${item.resource.name} ${item.baseSelector}`
            : item.resource.name
      )
    ).toEqual([
      "acme/billing-api",
      "acme/shared-ui",
      "Billing production",
      'Loki {app="billing"}',
    ])
    expect(
      await createNavCounts({
        auth: target.auth,
        tickets: createTicketsRepository(target.db),
        databaseConnections: target.store.databaseConnections,
        logConnections: target.store.logConnections,
      }).counts(target.admin)
    ).toEqual({
      pendingTickets: 0,
      databaseConnectionsNeedingSecret: 1,
      logConnectionsNeedingSecret: 1,
    })
    expect(readFileSync(target.file).includes("kept-private")).toBe(false)
  })

  it("creates nothing the second time", async () => {
    const { text } = await exported()
    const target = await instance()
    readable(target)
    await target.management.import(target.admin, text)
    const before = target.store.snapshot()
    target.github.requests.length = 0
    const preview = await target.management.preview(target.admin, text)
    expect(preview.problems).toEqual([])
    expect(preview.changes).toBe(false)
    const again = await target.management.import(target.admin, text)
    expect(again).toMatchObject({
      ok: true,
      summary: {
        created: {
          applications: 0,
          repositories: 0,
          databaseConnections: 0,
          logConnections: 0,
        },
        reused: {
          applications: 2,
          repositories: 2,
          databaseConnections: 2,
          logConnections: 2,
        },
        attachments: 0,
        needsSecret: 0,
      },
    })
    expect(target.store.snapshot()).toEqual(before)
    // Repositories found by name here need no GitHub lookup.
    expect(target.github.requests).toEqual([])
  })

  it("reuses an existing Repository and an Application named in another case unchanged, and adds only the missing Attachments", async () => {
    const { text } = await exported()
    const target = await instance()
    readable(target)
    const repository = target.store.repositories.create({
      fullName: "acme/billing-api",
      trackedBranch: "release",
      tags: ["mine"],
      description: "Kept.",
    })
    const application = target.store.applications.create({
      name: "BILLING",
      description: "Ours.",
      notes: "",
    })
    target.store.applications.attachRepository(application.id, repository.id)
    const loki = target.store.logConnections.create(
      {
        name: "Our Loki",
        baseUrl: "https://loki.internal",
        authType: "bearer",
        authUsername: "",
        tenantId: "",
        tags: [],
        description: "",
        encryptedAuthSecret: encrypt("our-token"),
      },
      NO_TEST
    )
    target.store.logConnections.attach(
      application.id,
      loki.id,
      '{app="billing", env="prod"}'
    )

    const preview = await target.management.preview(target.admin, text)
    expect(preview.problems).toEqual([])
    const billing = preview.applications.find(
      (item) => item.name === "Billing"
    )!
    expect(billing).toMatchObject({
      status: "existing",
      differences: [
        { label: "Name", file: "Billing", existing: "BILLING" },
        {
          label: "Description",
          file: "Invoices and payments.",
          existing: "Ours.",
        },
      ],
      attachments: [
        { kind: "repository", name: "acme/billing-api", status: "existing" },
        { kind: "repository", name: "acme/shared-ui", status: "new" },
        {
          kind: "database-connection",
          name: "Billing production",
          status: "new",
        },
        {
          kind: "log-connection",
          name: "Loki",
          status: "existing",
          baseSelector: '{app="billing"}',
          existingBaseSelector: '{app="billing", env="prod"}',
        },
      ],
    })
    expect(
      preview.repositories.find((item) => item.name === "acme/billing-api")
    ).toMatchObject({
      status: "existing",
      differences: [
        { label: "Tracked Branch", file: "main", existing: "release" },
        { label: "Tags", file: "backend", existing: "mine" },
        { label: "Description", file: "Invoices.", existing: "Kept." },
      ],
    })
    expect(
      preview.logConnections.find((item) => item.name === "Loki")
    ).toMatchObject({ status: "existing", needsSecret: false })

    const result = await target.management.import(target.admin, text)
    expect(result).toMatchObject({
      ok: true,
      summary: {
        created: { applications: 1, repositories: 1, logConnections: 1 },
        reused: { applications: 1, repositories: 1, logConnections: 1 },
        // Billing: shared-ui and its database. Reports: all three.
        attachments: 5,
      },
    })
    const after = target.store.snapshot()
    expect(
      after.applications.find((item) => item.id === application.id)
    ).toEqual({
      id: application.id,
      name: "BILLING",
      description: "Ours.",
      notes: "",
    })
    expect(
      after.repositories.find((item) => item.id === repository.id)
    ).toMatchObject({ trackedBranch: "release", tags: ["mine"] })
    expect(
      target.store.logConnections.baseSelector(application.id, loki.id)
    ).toBe('{app="billing", env="prod"}')
    expect(target.store.logConnections.findById(loki.id)!.needsSecret).toBe(
      false
    )
    expect(target.synced).toHaveLength(1)
  })

  it("matches a renamed Repository by its new name on GitHub, and connections by normalized identity", async () => {
    const { text } = await exported()
    const target = await instance()
    target.github.addRepository("acme/billing-service", {
      formerNames: ["acme/billing-api"],
    })
    target.github.addRepository("acme/shared-ui", { branches: ["develop"] })
    const renamed = target.store.repositories.create({
      fullName: "acme/billing-service",
      trackedBranch: "main",
      tags: [],
      description: "",
    })
    target.store.databaseConnections.create(
      {
        name: "Billing here",
        host: "db.INTERNAL",
        port: 5432,
        database: "billing",
        user: "agent6_reader",
        sslMode: "require",
        tags: [],
        description: "",
        encryptedPassword: encrypt("pw"),
      },
      { ...NO_TEST, writable: false }
    )
    target.store.logConnections.create(
      {
        name: "Open Loki here",
        baseUrl: "http://loki:3100",
        authType: "none",
        authUsername: "",
        tenantId: "team-a",
        tags: [],
        description: "",
        encryptedAuthSecret: null,
      },
      NO_TEST
    )
    // The same Loki under another tenant is another Log Connection.
    target.store.logConnections.create(
      {
        name: "Loki, other tenant",
        baseUrl: "https://loki.internal",
        authType: "none",
        authUsername: "",
        tenantId: "team-b",
        tags: [],
        description: "",
        encryptedAuthSecret: null,
      },
      NO_TEST
    )
    const preview = await target.management.preview(
      target.admin,
      text.replace(
        '"baseUrl": "http://loki:3100"',
        '"baseUrl": "HTTP://LOKI:3100/loki/api/v1/"'
      )
    )
    expect(preview.problems).toEqual([])
    expect(
      preview.repositories.map((item) => [item.name, item.status])
    ).toEqual([
      ["acme/billing-api", "existing"],
      ["acme/shared-ui", "new"],
    ])
    expect(
      preview.databaseConnections.map((item) => [item.name, item.status])
    ).toEqual([
      ["Billing production", "existing"],
      ["Reports", "new"],
    ])
    expect(
      preview.logConnections.map((item) => [item.name, item.status])
    ).toEqual([
      ["Loki", "new"],
      ["Open Loki", "existing"],
    ])
    await target.management.import(target.admin, text)
    expect(
      target.store
        .snapshot()
        .repositories.map((item) => item.fullName)
        .sort()
    ).toEqual(["acme/billing-service", "acme/shared-ui"])
    expect(renamed.id).toBeTruthy()
  })

  it("blocks the whole import on any invalid record, listing each problem, and writes nothing", async () => {
    const { result } = await exported()
    const target = await instance()
    // acme/shared-ui is not readable, and billing-api has no "main".
    target.github.addRepository("acme/billing-api", { branches: ["trunk"] })
    const file: SetupFile = structuredClone(result.file)
    file.applications[0].logConnections[0].baseSelector = "app=billing"
    file.databaseConnections[1].port = 70000
    target.store.applications.create({
      name: "Reports",
      description: "",
      notes: "",
    })
    target.store.applications.create({
      name: "reports ",
      description: "",
      notes: "",
    })
    const text = JSON.stringify(file)

    const preview = await target.management.preview(target.admin, text)
    expect(preview.problems).toEqual([
      {
        record: "Repository acme/billing-api",
        message: expect.stringContaining("has no branch named main"),
      },
      {
        record: "Repository acme/shared-ui",
        message: expect.stringContaining(
          "cannot read acme/shared-ui with the configured GitHub token"
        ),
      },
      {
        record: "Database Connection Reports",
        message: expect.stringContaining("Enter a port from 1 to 65535."),
      },
      {
        record: "Application Billing",
        message: expect.stringContaining("Base Selector"),
      },
      {
        record: "Application Reports",
        message: expect.stringContaining(
          "2 Applications here are named Reports"
        ),
      },
    ])
    const before = target.store.snapshot()
    expect(await target.management.import(target.admin, text)).toEqual({
      ok: false,
      preview,
    })
    expect(target.store.snapshot()).toEqual(before)
    expect(target.synced).toEqual([])
    expect(target.tested).toEqual([])
  })

  it("rejects two records of one natural identity in the file, and Attachments to records the file does not list", async () => {
    const { result } = await exported()
    const target = await instance()
    readable(target)
    const file: SetupFile = structuredClone(result.file)
    file.repositories.push({
      ...file.repositories[0],
      fullName: "ACME/Billing-API",
    })
    file.logConnections.push({
      ...file.logConnections[1],
      name: "Same Loki",
      baseUrl: "http://loki:3100/",
    })
    file.applications.push({ ...file.applications[0], name: " billing" })
    file.applications[1].repositories.push("acme/unknown")
    const preview = await target.management.preview(
      target.admin,
      JSON.stringify(file)
    )
    expect(preview.problems.map((item) => item.record)).toEqual([
      "Repository ACME/Billing-API",
      "Log Connection Same Loki",
      "Application Reports",
      "Application billing",
    ])
    expect(preview.problems[2].message).toContain("acme/unknown")
  })

  it("writes everything in one transaction: a failure part way leaves nothing behind", async () => {
    const { text } = await exported()
    const target = await instance()
    readable(target)
    const failing = createSetupFileManagement({
      auth: target.auth,
      store: {
        ...target.store,
        logConnections: {
          ...target.store.logConnections,
          create: () => {
            throw new Error("disk full")
          },
        },
      },
      github: createGitHub("token", target.github.fetcher),
      sync: { sync: async () => {} },
    })
    await expect(failing.import(target.admin, text)).rejects.toThrow(
      "disk full"
    )
    const after = target.store.snapshot()
    expect(after.repositories).toEqual([])
    expect(after.databaseConnections).toEqual([])
    expect(after.applications).toEqual([])
  })

  it("repeats every check on confirm and writes nothing when something became invalid", async () => {
    const { text } = await exported()
    const target = await instance()
    readable(target)
    const preview = await target.management.preview(target.admin, text)
    expect(preview.problems).toEqual([])
    target.store.applications.create({
      name: "Billing",
      description: "",
      notes: "",
    })
    target.store.applications.create({
      name: "billing",
      description: "",
      notes: "",
    })
    const result = await target.management.import(target.admin, text)
    expect(result).toMatchObject({
      ok: false,
      preview: {
        problems: [{ record: "Application Billing" }],
      },
    })
    expect(target.store.snapshot().repositories).toEqual([])
  })

  it.each([
    [
      "a wrong format",
      JSON.stringify({ format: "other", version: 1 }),
      /format is "other"/,
    ],
    [
      "a newer version",
      JSON.stringify({ format: "agent6-setup", version: 2 }),
      /newer Agent 6 \(file version 2/,
    ],
    ["malformed JSON", "{ not json", /not valid JSON/],
    [
      "a key the format does not know",
      JSON.stringify({
        format: "agent6-setup",
        version: 1,
        exportedAt: "",
        repositories: [],
        databaseConnections: [
          {
            name: "x",
            host: "h",
            port: 1,
            database: "d",
            user: "u",
            sslMode: "require",
            hasPassword: true,
            password: "leaked",
            tags: [],
            description: "",
          },
        ],
        logConnections: [],
        applications: [],
      }),
      /databaseConnections\[0\]: Unrecognized key: "password"/,
    ],
  ])("rejects %s with a clear message", async (_case, text, message) => {
    const target = await instance()
    for (const call of [
      () => target.management.preview(target.admin, text),
      () => target.management.import(target.admin, text),
    ]) {
      const error = await call().catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(SetupFileError)
      expect((error as Error).message).toMatch(message)
    }
  })

  it("lets only Admins export or import", async () => {
    const { text } = await exported()
    const target = await instance()
    for (const headers of [target.client, new Headers()])
      for (const call of [
        () => target.management.exportOptions(headers),
        () => target.management.export(headers, ["x"]),
        () => target.management.preview(headers, text),
        () => target.management.import(headers, text),
      ])
        await expect(call()).rejects.toBeInstanceOf(AuthorizationError)
    expect(target.store.snapshot().repositories).toEqual([])
  })
})

describe("Needs Secret", () => {
  it("leaves imported connections out of scope and the agent's tools until the secret is entered", async () => {
    const { text } = await exported()
    const target = await instance()
    readable(target)
    await target.management.import(target.admin, text)
    const snapshot = target.store.snapshot()
    const billing = snapshot.applications.find(
      (item) => item.name === "Billing"
    )!
    const database = snapshot.databaseConnections.find(
      (item) => item.name === "Billing production"
    )!
    const loki = snapshot.logConnections.find((item) => item.name === "Loki")!

    const applications = createApplicationManagement({
      auth: target.auth,
      applications: target.store.applications,
      repositories: target.store.repositories,
    })
    const kinds = (scope: Awaited<ReturnType<typeof applications.get>>) =>
      scope!.attachments.map((item) => item.kind)
    expect(
      kinds(await applications.getApplicationScope(target.client, billing.id))
    ).toEqual(["repository", "repository"])
    // The Admin's screen still lists them, to show the badge.
    expect(kinds(await applications.get(target.admin, billing.id))).toEqual([
      "repository",
      "repository",
      "database-connection",
      "log-connection",
    ])
    await expect(
      createDatabaseTools(
        billing.id,
        undefined,
        target.store.databaseConnections
      ).query({ databaseConnectionId: database.id, sql: "select 1" })
    ).rejects.toThrow("not available in this Application")
    await expect(
      createLogTools(billing.id, undefined, target.store.logConnections).labels(
        {
          logConnectionId: loki.id,
          label: null,
        }
      )
    ).rejects.toThrow("not available in this Application")

    const probe = vi.fn(async () => ({
      ok: true,
      writable: false,
      message: "Connection successful.",
    }))
    const connections = createDatabaseConnectionManagement({
      auth: target.auth,
      connections: target.store.databaseConnections,
      applications: target.store.applications,
      test: probe,
    })
    const input = {
      ...database,
      password: "",
    }
    // Test answers without trying to connect.
    await expect(connections.test(target.admin, database.id)).rejects.toThrow(
      /Enter this connection's password/
    )
    // Saving with the field blank keeps the other fields and Needs Secret.
    const blank = await connections.save(
      target.admin,
      { ...input, description: "Renamed tables." },
      database.id
    )
    expect(blank).toMatchObject({
      needsSecret: true,
      description: "Renamed tables.",
      test: { ok: false, message: expect.stringMatching(/Enter the password/) },
    })
    expect(probe).not.toHaveBeenCalled()
    // Entering it clears the state and runs the usual test.
    const entered = await connections.save(
      target.admin,
      { ...input, password: "the-password" },
      database.id
    )
    expect(entered).toMatchObject({ needsSecret: false, test: { ok: true } })
    expect(probe).toHaveBeenCalledWith(
      expect.objectContaining({ password: "the-password" })
    )
    expect(
      kinds(await applications.getApplicationScope(target.client, billing.id))
    ).toEqual(["repository", "repository", "database-connection"])
    // Blank on later saves keeps the entered password.
    await connections.save(target.admin, input, database.id)
    expect(probe).toHaveBeenLastCalledWith(
      expect.objectContaining({ password: "the-password" })
    )
  })

  it("keeps a connection whose test fails in scope", async () => {
    const target = await instance()
    const application = target.store.applications.create({
      name: "Billing",
      description: "",
      notes: "",
    })
    const failing = target.store.databaseConnections.create(
      {
        name: "Down",
        host: "db",
        port: 5432,
        database: "d",
        user: "u",
        sslMode: "require",
        tags: [],
        description: "",
        encryptedPassword: encrypt("pw"),
      },
      { ok: false, writable: null, message: "Connection refused." }
    )
    target.store.databaseConnections.attach(application.id, failing.id)
    expect(
      target.store.applications.scope(application.id)!.attachments
    ).toHaveLength(1)
  })

  it("counts nothing for anyone but an Admin", async () => {
    const target = await instance()
    const counts = createNavCounts({
      auth: target.auth,
      tickets: createTicketsRepository(target.db),
      databaseConnections: target.store.databaseConnections,
      logConnections: target.store.logConnections,
    })
    expect(await counts.counts(target.client)).toBeNull()
    expect(await counts.counts(new Headers())).toBeNull()
  })
})
