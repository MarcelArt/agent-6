import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { AuthorizationError } from "./session"
import {
  ServiceAccountError,
  createServiceAccountManagement,
} from "./service-account-management"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createAuditRepository } from "./repositories/audit"
import { createServiceAccountsRepository } from "./repositories/service-accounts"
import type { Auth } from "./auth"
import type { Db } from "./repositories/db"

let db: Db, auth: Auth, admin: Headers, client: Headers, adminId: string
let management: ReturnType<typeof createServiceAccountManagement>
let clock: Date
let billing: string

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
  db = openDb(":memory:")
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  for (const role of ["admin", "client"] as const) {
    const created = await auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: `${role}-password`,
        role,
      },
    })
    if (role === "admin") adminId = created.user.id
  }
  admin = await signIn("admin@example.com", "admin-password")
  client = await signIn("client@example.com", "client-password")
  clock = new Date("2026-11-20T10:00:00.000Z")
  const applications = createApplicationsRepository(db)
  billing = applications.create({
    name: "Billing",
    description: "",
    notes: "",
  }).id
  management = createServiceAccountManagement({
    auth,
    serviceAccounts: createServiceAccountsRepository(db),
    applications,
    audit: createAuditRepository(db),
    now: () => clock,
  })
})
afterEach(() => db.$client.close())

const grants = {
  name: "CI",
  permissions: ["tickets:read", "tickets:accept"],
  allApplications: false,
  applicationIds: [] as Array<string>,
}

describe("Service Account management", () => {
  it("is for Admins only", async () => {
    const { id } = await management.create(admin, {
      name: "Bot",
      description: "",
    })
    for (const call of [
      () => management.list(client),
      () => management.get(client, id),
      () => management.create(client, { name: "x", description: "" }),
      () => management.setDisabled(client, id, true),
      () => management.createKey(client, id, { ...grants, expiry: "never" }),
    ])
      await expect(call()).rejects.toThrow(AuthorizationError)
  })

  it("issues keys shown once, with grants, expiry and an audit trail", async () => {
    const { id } = await management.create(admin, {
      name: " Review bot ",
      description: "Triage",
    })
    const created = await management.createKey(admin, id, {
      ...grants,
      permissions: ["tickets:accept", "tickets:read", "tickets:read"],
      applicationIds: [billing, billing],
      expiry: "90",
    })
    expect(created.key).toMatch(/^agent6_[0-9a-f]{16}_[\w-]{43}$/)
    expect(created.key.startsWith(created.apiKey.prefix)).toBe(true)
    expect(created.apiKey).toMatchObject({
      state: "active",
      permissions: ["tickets:read", "tickets:accept"],
      allApplications: false,
      applications: [{ id: billing, name: "Billing" }],
      expiresAt: clock.getTime() + 90 * 86_400_000,
    })
    const detail = await management.get(admin, id)
    expect(detail).toMatchObject({ name: "Review bot", activeKeys: 1 })
    expect(JSON.stringify(detail)).not.toContain(created.key.slice(24))

    await expect(
      management.createKey(admin, id, {
        ...grants,
        permissions: ["tickets:everything"],
        expiry: "never",
      })
    ).rejects.toMatchObject({ field: "permissions" })
    await expect(
      management.createKey(admin, id, {
        ...grants,
        applicationIds: ["missing"],
        expiry: "never",
      })
    ).rejects.toMatchObject({ field: "applicationIds" })
    await expect(
      management.createKey(admin, id, { ...grants, name: " ", expiry: "never" })
    ).rejects.toThrow(ServiceAccountError)

    const updated = await management.updateKey(admin, id, created.apiKey.id, {
      ...grants,
      allApplications: true,
      applicationIds: [billing],
    })
    expect(updated).toMatchObject({ allApplications: true, applications: [] })
    expect(
      (await management.revokeKey(admin, id, created.apiKey.id)).state
    ).toBe("revoked")
    await expect(
      management.updateKey(admin, id, created.apiKey.id, grants)
    ).rejects.toMatchObject({ status: 409 })
    expect((await management.get(admin, id))!.activeKeys).toBe(0)

    const trail = db.$client
      .prepare(
        "select operation, actor_type, user_id from audit_event order by created_at, rowid"
      )
      .all()
    expect(trail).toEqual(
      [
        "service-accounts.create",
        "api-keys.create",
        "api-keys.update",
        "api-keys.revoke",
      ].map((operation) => ({
        operation,
        actor_type: "admin",
        user_id: adminId,
      }))
    )
    expect(JSON.stringify(trail)).not.toContain(created.key.slice(24))
  })

  it("keeps keys apart per account and reports expiry", async () => {
    const first = (
      await management.create(admin, { name: "One", description: "" })
    ).id
    const second = (
      await management.create(admin, { name: "Two", description: "" })
    ).id
    const { apiKey } = await management.createKey(admin, first, {
      ...grants,
      expiry: "30",
    })
    expect(await management.getKey(admin, second, apiKey.id)).toBeNull()
    await expect(
      management.revokeKey(admin, second, apiKey.id)
    ).rejects.toMatchObject({ status: 404 })
    clock = new Date(clock.getTime() + 31 * 86_400_000)
    expect((await management.getKey(admin, first, apiKey.id))!.state).toBe(
      "expired"
    )
    expect(
      (await management.list(admin)).serviceAccounts.map((item) => [
        item.name,
        item.activeKeys,
      ])
    ).toEqual([
      ["One", 0],
      ["Two", 0],
    ])
    await management.setDisabled(admin, first, true)
    expect(
      (await management.list(admin, { search: "one" })).serviceAccounts[0]
        .disabled
    ).toBe(true)
  })
})
