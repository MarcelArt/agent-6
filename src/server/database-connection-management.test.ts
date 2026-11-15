import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAuth } from "./auth"
import { createDatabaseConnectionManagement } from "./database-connection-management"
import { createDatabaseTools } from "./database-tools"
import { DatabaseQueryError } from "./postgres"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createDatabaseConnectionsRepository } from "./repositories/database-connections"
import { decrypt } from "./secrets"
import { AuthorizationError } from "./session"
import { supportInstructions } from "./support-agent"
import type { Auth } from "./auth"
import type { DatabaseConnectionInput } from "@/lib/database-connections"

vi.mock("./config", () => ({
  getConfig: () => ({ encryptionKey: Buffer.alloc(32, 1).toString("base64") }),
}))

const INPUT: DatabaseConnectionInput = {
  name: " Orders ",
  host: "db.internal",
  port: 5432,
  database: "orders",
  user: "support_reader",
  password: "database-password-kept-private",
  sslMode: "verify-full",
  tags: ["orders", "billing"],
  description: " Order status and payment information. ",
}
let directory: string, file: string, auth: Auth, admin: Headers, client: Headers
let connections: ReturnType<typeof createDatabaseConnectionsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let management: ReturnType<typeof createDatabaseConnectionManagement>
const probe = vi.fn(async () => ({
  ok: true,
  writable: true,
  message: "Connection successful.",
}))
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-database-"))
  file = join(directory, "agent6.db")
  const db = openDb(file)
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  for (const role of ["admin", "client"] as const)
    await auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: `${role}-password`,
        role,
      },
    })
  async function headers(role: string) {
    const { headers: response } = await auth.api.signInEmail({
      body: { email: `${role}@example.com`, password: `${role}-password` },
      returnHeaders: true,
    })
    return new Headers({
      cookie: response
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    })
  }
  admin = await headers("admin")
  client = await headers("client")
  connections = createDatabaseConnectionsRepository(db)
  applications = createApplicationsRepository(db)
  probe
    .mockReset()
    .mockResolvedValue({
      ok: true,
      writable: true,
      message: "Connection successful.",
    })
  management = createDatabaseConnectionManagement({
    auth,
    connections,
    applications,
    test: probe,
  })
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe("Database Connections", () => {
  it("tests on save, encrypts passwords, preserves an unchanged password and never returns it", async () => {
    const saved = await management.save(admin, INPUT)
    expect(saved).toMatchObject({ name: "Orders", test: { writable: true } })
    expect(probe.mock.calls).toHaveLength(1)
    expect(probe.mock.calls[0]).toEqual([
      expect.objectContaining({ password: INPUT.password }),
    ])
    expect(connections.credentials(saved.id)?.encryptedPassword).not.toContain(
      INPUT.password
    )
    expect(decrypt(connections.credentials(saved.id)!.encryptedPassword)).toBe(
      INPUT.password
    )
    const edited = await management.save(
      admin,
      { ...INPUT, password: "", name: "Renamed" },
      saved.id
    )
    expect(decrypt(connections.credentials(saved.id)!.encryptedPassword)).toBe(
      INPUT.password
    )
    for (const result of [
      saved,
      edited,
      await management.get(admin, saved.id),
      await management.list(admin),
    ]) {
      expect(JSON.stringify(result)).not.toContain(INPUT.password)
      expect(JSON.stringify(result)).not.toMatch(/encryptedPassword|"password"/)
    }
    await management.save(
      admin,
      { ...INPUT, password: "replacement-password" },
      saved.id
    )
    expect(decrypt(connections.credentials(saved.id)!.encryptedPassword)).toBe(
      "replacement-password"
    )
    expect(readFileSync(file).includes(Buffer.from(INPUT.password))).toBe(false)
  })
  it("saves a failed connection test and sanitizes unexpected driver errors", async () => {
    probe.mockRejectedValueOnce(
      new Error(`Could not connect as ${INPUT.user}: ${INPUT.password}`)
    )
    const saved = await management.save(admin, INPUT)
    expect(saved.test.ok).toBe(false)
    expect(JSON.stringify(saved)).not.toContain(INPUT.password)
    expect((await management.test(admin, saved.id)).ok).toBe(true)
    expect((await management.get(admin, saved.id))?.connection.test.ok).toBe(
      true
    )
  })
  it("resolves only explicit Attachments, preserves shared resources and cascades removals", async () => {
    const first = applications.create({
      name: "Portal",
      description: "",
      notes: "",
    })
    const second = applications.create({
      name: "Back Office",
      description: "",
      notes: "",
    })
    const saved = await management.save(admin, INPUT)
    const unrelated = await management.save(admin, {
      ...INPUT,
      name: "Same Tags",
    })
    await management.attach(admin, first.id, saved.id)
    await management.attach(admin, first.id, saved.id)
    await management.attach(admin, second.id, saved.id)
    expect(applications.scope(first.id)?.attachments).toEqual([
      { kind: "database-connection", resource: saved },
    ])
    expect(
      (await management.available(admin, first.id, {})).connections.map(
        (item) => item.id
      )
    ).toEqual([unrelated.id])
    const reopened = createApplicationsRepository(openDb(file)).scope(first.id)
    expect(reopened?.attachments).toHaveLength(1)
    await management.detach(admin, first.id, saved.id)
    expect(applications.scope(first.id)?.attachments).toEqual([])
    expect(applications.scope(second.id)?.attachments).toHaveLength(1)
    expect((await management.get(admin, saved.id))?.applications).toEqual([
      "Back Office",
    ])
    await management.remove(admin, saved.id)
    expect(applications.scope(second.id)?.attachments).toEqual([])
    expect(connections.findById(unrelated.id)).toBeDefined()
  })
  it("refuses queries and schema access without an Attachment, including after detach", async () => {
    const app = applications.create({
      name: "Portal",
      description: "",
      notes: "",
    })
    const saved = await management.save(admin, INPUT)
    const tools = createDatabaseTools(app.id, undefined, connections)
    await expect(
      tools.query({ databaseConnectionId: saved.id, sql: "SELECT 1" })
    ).rejects.toThrow(/not available/)
    await management.attach(admin, app.id, saved.id)
    const activeTools = createDatabaseTools(app.id, undefined, connections)
    await management.detach(admin, app.id, saved.id)
    await expect(
      activeTools.listTables({ databaseConnectionId: saved.id })
    ).rejects.toBeInstanceOf(DatabaseQueryError)
    await expect(
      activeTools.query({ databaseConnectionId: "missing", sql: "SELECT 1" })
    ).rejects.toThrow(/not available/)
  })
  it("gives the model descriptions and Tags without connection credentials, and explicit privacy instructions", async () => {
    const app = applications.create({
      name: "Portal",
      description: "",
      notes: "",
    })
    const saved = await management.save(admin, INPUT)
    await management.attach(admin, app.id, saved.id)
    const instructions = supportInstructions(applications.scope(app.id)!)
    for (const value of [saved.name, saved.description, ...saved.tags])
      expect(instructions).toContain(value)
    for (const value of [INPUT.host, INPUT.user, INPUT.password])
      expect(instructions).not.toContain(value)
    expect(instructions).toContain(
      "Never show raw database rows, ids, table or column names"
    )
    expect(instructions).toContain("Never repeat passwords, tokens")
  })
  it("validates settings, searches and pages connections", async () => {
    for (const [field, value] of [
      ["name", ""],
      ["port", 0],
      ["port", 65536],
      ["host", "/var/run/postgresql"],
      ["description", "x".repeat(4001)],
      ["tags", Array.from({ length: 21 }, (_, i) => `tag-${i}`)],
    ] as const) {
      await expect(
        management.save(admin, { ...INPUT, [field]: value })
      ).rejects.toMatchObject({ field })
    }
    expect(probe).not.toHaveBeenCalled()
    for (let i = 0; i < 22; i++)
      await management.save(admin, {
        ...INPUT,
        name: `Connection ${String(i).padStart(2, "0")}`,
      })
    expect(
      (await management.list(admin, { page: 2 })).connections
    ).toHaveLength(2)
    expect(
      (await management.list(admin, { search: "CONNECTION 21" })).total
    ).toBe(1)
    expect((await management.list(admin, { search: "%" })).total).toBe(0)
  })
  it("requires Admin for every management operation", async () => {
    const app = applications.create({
      name: "Portal",
      description: "",
      notes: "",
    })
    const saved = await management.save(admin, INPUT)
    for (const action of [
      (h: Headers) => management.list(h),
      (h: Headers) => management.get(h, saved.id),
      (h: Headers) => management.save(h, INPUT),
      (h: Headers) => management.save(h, INPUT, saved.id),
      (h: Headers) => management.test(h, saved.id),
      (h: Headers) => management.remove(h, saved.id),
      (h: Headers) => management.available(h, app.id, {}),
      (h: Headers) => management.attach(h, app.id, saved.id),
      (h: Headers) => management.detach(h, app.id, saved.id),
    ]) {
      await expect(action(client)).rejects.toEqual(
        new AuthorizationError("forbidden")
      )
      await expect(action(new Headers())).rejects.toEqual(
        new AuthorizationError("unauthenticated")
      )
    }
  })
})
