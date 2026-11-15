import { beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { ConfigError } from "./config"
import { ensureFirstAdmin } from "./first-admin"
import { openDb } from "./repositories/db"
import { createUsersRepository } from "./repositories/users"
import {
  AuthorizationError,
  getSessionUser,
  requireAdmin,
  requireSession,
} from "./session"
import type { Auth } from "./auth"
import type { UsersRepository } from "./repositories/users"

const BASE_URL = "http://localhost:3000"

let auth: Auth
let users: UsersRepository

beforeEach(() => {
  // A fresh in-memory database, created by the real migrations.
  const db = openDb(":memory:")
  auth = createAuth(db, { secret: "s".repeat(32), baseUrl: BASE_URL })
  users = createUsersRepository(db)
})

/** Signs in and returns request headers that carry the session cookie. */
async function signIn(email: string, password: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")
  return new Headers({ cookie })
}

async function createUser(role: "admin" | "client"): Promise<Headers> {
  const email = `${role}@example.com`
  const password = `${role}-password`
  await auth.api.createUser({ body: { email, password, name: role, role } })
  return signIn(email, password)
}

describe("ensureFirstAdmin", () => {
  const env = { adminEmail: "first@example.com", adminPassword: "first-pass" }

  it("creates an Admin who can log in when no user exists", async () => {
    expect(await ensureFirstAdmin({ auth, users, ...env })).toBe(true)
    const headers = await signIn(env.adminEmail, env.adminPassword)
    expect(await getSessionUser({ auth, headers })).toMatchObject({
      email: env.adminEmail,
      role: "admin",
    })
  })

  it("does nothing when a user exists, even with other values", async () => {
    await ensureFirstAdmin({ auth, users, ...env })
    const created = await ensureFirstAdmin({
      auth,
      users,
      adminEmail: "second@example.com",
      adminPassword: "second-pass",
    })
    expect(created).toBe(false)
    expect(users.count()).toBe(1)
    // Missing variables are fine too once a user exists.
    expect(await ensureFirstAdmin({ auth, users })).toBe(false)
  })

  it("names the missing or bad variables when no user exists", async () => {
    await expect(ensureFirstAdmin({ auth, users })).rejects.toThrow(ConfigError)
    await expect(ensureFirstAdmin({ auth, users })).rejects.toThrow(
      /ADMIN_EMAIL[\s\S]*ADMIN_PASSWORD/
    )
    await expect(
      ensureFirstAdmin({ auth, users, adminEmail: "nope", adminPassword: "x" })
    ).rejects.toThrow(/must be an email address[\s\S]*at least 8 characters/)
    expect(users.count()).toBe(0)
  })
})

describe("session guards", () => {
  it("rejects a request without a session", async () => {
    const headers = new Headers()
    expect(await getSessionUser({ auth, headers })).toBeNull()
    await expect(requireSession({ auth, headers })).rejects.toMatchObject({
      name: "AuthorizationError",
      reason: "unauthenticated",
    })
    await expect(requireAdmin({ auth, headers })).rejects.toMatchObject({
      reason: "unauthenticated",
    })
  })

  it("lets a Client pass requireSession but not requireAdmin", async () => {
    const headers = await createUser("client")
    expect(await requireSession({ auth, headers })).toMatchObject({
      email: "client@example.com",
      role: "client",
    })
    const error = await requireAdmin({ auth, headers }).catch((e) => e)
    expect(error).toBeInstanceOf(AuthorizationError)
    expect(error.reason).toBe("forbidden")
  })

  it("lets an Admin pass requireAdmin", async () => {
    const headers = await createUser("admin")
    expect(await requireAdmin({ auth, headers })).toMatchObject({
      role: "admin",
    })
  })

  it("rejects a session cookie that was changed", async () => {
    const headers = await createUser("admin")
    const forged = new Headers({ cookie: `${headers.get("cookie")}x` })
    await expect(requireAdmin({ auth, headers: forged })).rejects.toThrow(
      AuthorizationError
    )
  })
})

describe("self-registration", () => {
  it("is refused by the sign-up endpoint and creates no user", async () => {
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({
          name: "Mallory",
          email: "mallory@example.com",
          password: "mallory-password",
        }),
      })
    )
    expect(response.ok).toBe(false)
    expect(users.count()).toBe(0)
  })
})
