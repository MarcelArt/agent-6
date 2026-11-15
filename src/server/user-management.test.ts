import { beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { openDb } from "./repositories/db"
import { createUsersRepository } from "./repositories/users"
import { AuthorizationError, getSessionUser } from "./session"
import {
  UserManagementError,
  createUserManagement,
  safetyProblem,
} from "./user-management"
import type { Auth } from "./auth"
import type { UsersRepository } from "./repositories/users"
import type { UserManagement } from "./user-management"
import type { ManagedUser } from "@/lib/users"

let auth: Auth
let users: UsersRepository
let management: UserManagement
/** Session of the Admin every test starts with. */
let admin: Headers
let adminId: string

const ADMIN = { email: "admin@example.com", password: "admin-password" }
const RINA = {
  name: "Rina",
  email: "rina@example.com",
  role: "client" as const,
  password: "rina-password",
}

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

beforeEach(async () => {
  // A fresh in-memory database, created by the real migrations.
  const db = openDb(":memory:")
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  users = createUsersRepository(db)
  management = createUserManagement({ auth, users })
  const created = await auth.api.createUser({
    body: { ...ADMIN, name: "Admin", role: "admin" },
  })
  adminId = created.user.id
  admin = await signIn(ADMIN.email, ADMIN.password)
})

describe("safety rule: an Admin cannot disable or demote themselves", () => {
  beforeEach(async () => {
    // A second Admin, so the last-Admin rule is not what refuses.
    await management.create(admin, {
      name: "Second",
      email: "second@example.com",
      role: "admin",
      password: "second-password",
    })
  })

  it("refuses to demote yourself and changes nothing", async () => {
    const error = await management
      .update(admin, adminId, {
        name: "Renamed",
        email: ADMIN.email,
        role: "client",
      })
      .catch((e) => e)
    expect(error).toBeInstanceOf(UserManagementError)
    expect(error.field).toBe("role")
    expect(error.message).toMatch(/from yourself/)
    expect(users.findById(adminId)).toMatchObject({
      name: "Admin",
      role: "admin",
    })
  })

  it("refuses to disable yourself and keeps your session", async () => {
    await expect(management.setDisabled(admin, adminId, true)).rejects.toThrow(
      /cannot disable your own account/
    )
    expect(users.findById(adminId)?.disabled).toBe(false)
    expect(await getSessionUser({ auth, headers: admin })).not.toBeNull()
  })

  it("lets you demote or disable another Admin", async () => {
    const second = users.list({ search: "second", limit: 1, offset: 0 })[0]
    const demoted = await management.update(admin, second.id, {
      name: second.name,
      email: second.email,
      role: "client",
    })
    expect(demoted.role).toBe("client")
  })
})

describe("safety rule: the last active Admin cannot be disabled or demoted", () => {
  it("refuses to demote the only Admin and changes nothing", async () => {
    const error = await management
      .update(admin, adminId, {
        name: "Renamed",
        email: "renamed@example.com",
        role: "client",
      })
      .catch((e) => e)
    expect(error).toBeInstanceOf(UserManagementError)
    expect(error.field).toBe("role")
    expect(error.message).toMatch(/only active Admin/)
    expect(users.findById(adminId)).toMatchObject({
      name: "Admin",
      email: ADMIN.email,
      role: "admin",
    })
  })

  it("refuses to disable the only Admin", async () => {
    await expect(management.setDisabled(admin, adminId, true)).rejects.toThrow(
      /only active Admin/
    )
    expect(users.findById(adminId)?.disabled).toBe(false)
  })

  it("does not count a disabled Admin as one who is left", async () => {
    const second = await management.create(admin, {
      name: "Second",
      email: "second@example.com",
      role: "admin",
      password: "second-password",
    })
    await management.setDisabled(admin, second.id, true)
    expect(users.countActiveAdmins()).toBe(1)
    await expect(management.setDisabled(admin, adminId, true)).rejects.toThrow(
      /only active Admin/
    )
  })

  it("applies whoever asks, not only to yourself", () => {
    const target: ManagedUser = {
      id: "last",
      name: "Last",
      email: "last@example.com",
      role: "admin",
      disabled: false,
    }
    const ask = (next: { role: "admin" | "client"; disabled: boolean }) =>
      safetyProblem({ actorId: "other", target, next, activeAdmins: 1 })
    expect(ask({ role: "client", disabled: false })?.message).toMatch(
      /only active Admin/
    )
    expect(ask({ role: "admin", disabled: true })?.message).toMatch(
      /only active Admin/
    )
    expect(ask({ role: "admin", disabled: false })).toBeNull()
    // With a second active Admin, another Admin may do it.
    expect(
      safetyProblem({
        actorId: "other",
        target,
        next: { role: "client", disabled: false },
        activeAdmins: 2,
      })
    ).toBeNull()
  })

  it("lets the only Admin change their own name, email and password", async () => {
    const saved = await management.update(admin, adminId, {
      name: "Renamed",
      email: "Renamed@Example.com",
      role: "admin",
      password: "another-password",
    })
    expect(saved).toMatchObject({
      name: "Renamed",
      email: "renamed@example.com",
      role: "admin",
    })
    await signIn("renamed@example.com", "another-password")
  })
})

describe("creating and editing users", () => {
  it("creates a Client who can log in", async () => {
    const rina = await management.create(admin, RINA)
    expect(rina).toMatchObject({ role: "client", disabled: false })
    const headers = await signIn(RINA.email, RINA.password)
    expect(await getSessionUser({ auth, headers })).toMatchObject({
      email: RINA.email,
      role: "client",
    })
  })

  it("names the field of a value it refuses", async () => {
    const field = (input: Partial<typeof RINA>) =>
      management.create(admin, { ...RINA, ...input }).catch((e) => e.field)
    expect(await field({ name: "  " })).toBe("name")
    expect(await field({ email: "rina" })).toBe("email")
    expect(await field({ password: "short" })).toBe("password")
    expect(await field({ email: ADMIN.email.toUpperCase() })).toBe("email")
    expect(users.count()).toBe(1)
  })

  it("keeps the password when the edit leaves it empty", async () => {
    const rina = await management.create(admin, RINA)
    await management.update(admin, rina.id, {
      name: "Rina W",
      email: RINA.email,
      role: "admin",
      password: "",
    })
    expect(users.findById(rina.id)).toMatchObject({
      name: "Rina W",
      role: "admin",
    })
    await signIn(RINA.email, RINA.password)
  })

  it("changes the password when the edit fills it in", async () => {
    const rina = await management.create(admin, RINA)
    await management.update(admin, rina.id, {
      ...RINA,
      password: "new-password",
    })
    await signIn(RINA.email, "new-password")
    await expect(signIn(RINA.email, RINA.password)).rejects.toThrow()
  })

  it("refuses an email another user has", async () => {
    const rina = await management.create(admin, RINA)
    const error = await management
      .update(admin, rina.id, { ...RINA, email: ADMIN.email })
      .catch((e) => e)
    expect(error.field).toBe("email")
    expect(users.findById(rina.id)?.email).toBe(RINA.email)
  })

  it("is closed to Clients and to people who are not logged in", async () => {
    await management.create(admin, RINA)
    const client = await signIn(RINA.email, RINA.password)
    for (const headers of [client, new Headers()]) {
      await expect(management.list(headers)).rejects.toThrow(AuthorizationError)
      await expect(management.get(headers, adminId)).rejects.toThrow(
        AuthorizationError
      )
      await expect(
        management.create(headers, { ...RINA, email: "x@example.com" })
      ).rejects.toThrow(AuthorizationError)
      await expect(
        management.update(headers, adminId, { ...RINA, role: "client" })
      ).rejects.toThrow(AuthorizationError)
      await expect(
        management.setDisabled(headers, adminId, true)
      ).rejects.toThrow(AuthorizationError)
    }
    expect(users.count()).toBe(2)
  })
})

describe("disabling users", () => {
  it("rejects a disabled user at login and ends their open sessions", async () => {
    const rina = await management.create(admin, RINA)
    const session = await signIn(RINA.email, RINA.password)

    const disabled = await management.setDisabled(admin, rina.id, true)
    expect(disabled.disabled).toBe(true)
    expect(await getSessionUser({ auth, headers: session })).toBeNull()
    await expect(signIn(RINA.email, RINA.password)).rejects.toMatchObject({
      body: { code: "BANNED_USER" },
    })
  })

  it("lets a re-enabled user log in again", async () => {
    const rina = await management.create(admin, RINA)
    await management.setDisabled(admin, rina.id, true)
    const enabled = await management.setDisabled(admin, rina.id, false)
    expect(enabled.disabled).toBe(false)
    await signIn(RINA.email, RINA.password)
  })
})

describe("listing users", () => {
  beforeEach(async () => {
    for (let i = 1; i <= 24; i++) {
      const n = String(i).padStart(2, "0")
      await auth.api.createUser({
        body: {
          name: `Client ${n}`,
          email: `c${n}@example.com`,
          password: "client-password",
          role: "client",
        },
      })
    }
  })

  it("pages through all users by name", async () => {
    const first = await management.list(admin)
    expect(first).toMatchObject({ total: 25, page: 1, pageSize: 20 })
    expect(first.users).toHaveLength(20)
    expect(first.users[0].name).toBe("Admin")
    const second = await management.list(admin, { page: 2 })
    expect(second.users.map((user) => user.name)).toEqual([
      "Client 20",
      "Client 21",
      "Client 22",
      "Client 23",
      "Client 24",
    ])
  })

  it("returns the last page when asked for one beyond it", async () => {
    expect(await management.list(admin, { page: 9 })).toMatchObject({ page: 2 })
  })

  it("searches name and email, ignoring case", async () => {
    const byName = await management.list(admin, { search: "client 0" })
    expect(byName.total).toBe(9)
    const byEmail = await management.list(admin, { search: "C17@EXAMPLE" })
    expect(byEmail.users.map((user) => user.name)).toEqual(["Client 17"])
    // "%" and "_" are plain characters, not wildcards.
    expect((await management.list(admin, { search: "%" })).total).toBe(0)
    expect((await management.list(admin, { search: "c_1" })).total).toBe(0)
  })
})

describe("changing your own password", () => {
  it("changes it for someone who knows the current one", async () => {
    await management.create(admin, RINA)
    const rina = await signIn(RINA.email, RINA.password)
    await management.changeOwnPassword(rina, {
      currentPassword: RINA.password,
      newPassword: "rina-new-password",
    })
    await signIn(RINA.email, "rina-new-password")
    await expect(signIn(RINA.email, RINA.password)).rejects.toThrow()
  })

  it("refuses a wrong current password or a short new one", async () => {
    const wrong = await management
      .changeOwnPassword(admin, {
        currentPassword: "not-the-password",
        newPassword: "long-enough-password",
      })
      .catch((e) => e)
    expect(wrong).toBeInstanceOf(UserManagementError)
    expect(wrong.field).toBe("currentPassword")
    const short = await management
      .changeOwnPassword(admin, {
        currentPassword: ADMIN.password,
        newPassword: "short",
      })
      .catch((e) => e)
    expect(short.field).toBe("password")
    await signIn(ADMIN.email, ADMIN.password)
  })

  it("needs a login", async () => {
    await expect(
      management.changeOwnPassword(new Headers(), {
        currentPassword: ADMIN.password,
        newPassword: "long-enough-password",
      })
    ).rejects.toThrow(AuthorizationError)
  })
})
