import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import {
  ApplicationError,
  createApplicationManagement,
} from "./application-management"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createRepositoriesRepository } from "./repositories/repositories"
import { createRepositoryManagement } from "./repository-management"
import { AuthorizationError } from "./session"
import type { Auth } from "./auth"

let auth: Auth
let applications: ReturnType<typeof createApplicationsRepository>
let repositories: ReturnType<typeof createRepositoriesRepository>
let management: ReturnType<typeof createApplicationManagement>
let admin: Headers
let client: Headers
let directory: string
let file: string
const INPUT = {
  name: " Customer Portal ",
  description: " For Clients. ",
  notes: " Used by the billing team. ",
}

async function signIn(role: string) {
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
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-applications-"))
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
  admin = await signIn("admin")
  client = await signIn("client")
  applications = createApplicationsRepository(db)
  repositories = createRepositoriesRepository(db)
  management = createApplicationManagement({ auth, applications, repositories })
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))
function repository(name: string) {
  return repositories.create({
    fullName: `halden/${name}`,
    trackedBranch: "main",
    tags: ["billing"],
    description: name,
  })
}

describe("Applications and Attachments", () => {
  it("getApplicationScope returns only explicit Attachments, even when another Repository shares all Tags", async () => {
    const application = await management.create(admin, INPUT)
    const attached = repository("billing")
    const unrelated = repository("private-billing")
    await management.attachRepository(admin, application.id, attached.id)
    await management.attachRepository(admin, application.id, attached.id)
    const scope = await management.getApplicationScope(client, application.id)
    expect(scope?.application).toMatchObject({
      name: "Customer Portal",
      description: "For Clients.",
      notes: "Used by the billing team.",
    })
    expect(scope?.attachments).toEqual([
      { kind: "repository", resource: attached },
    ])
    expect(
      scope?.attachments.some((item) => item.resource.id === unrelated.id)
    ).toBe(false)
    await management.detachRepository(admin, application.id, attached.id)
    expect(
      (await management.getApplicationScope(client, application.id))
        ?.attachments
    ).toEqual([])
    expect(repositories.findById(attached.id)).toBeDefined()
  })

  it("keeps a shared Repository and its other Attachment when deleting one Application", async () => {
    const first = await management.create(admin, INPUT)
    const second = await management.create(admin, {
      ...INPUT,
      name: "Back Office",
    })
    const shared = repository("shared")
    for (const application of [first, second])
      await management.attachRepository(admin, application.id, shared.id)
    expect(repositories.applicationsOf(shared.id)).toEqual([
      "Back Office",
      "Customer Portal",
    ])
    await management.remove(admin, first.id)
    expect(await management.getApplicationScope(client, first.id)).toBeNull()
    expect(repositories.findById(shared.id)).toBeDefined()
    expect(
      (await management.getApplicationScope(client, second.id))?.attachments
    ).toHaveLength(1)
    expect(repositories.applicationsOf(shared.id)).toEqual(["Back Office"])
    // A removed Application cannot leave dangling Attachments behind.
    expect(() => applications.attachRepository(first.id, shared.id)).toThrow()
  })

  it("names affected Applications and removes all Attachments when removing a Repository", async () => {
    const first = await management.create(admin, INPUT)
    const second = await management.create(admin, {
      ...INPUT,
      name: "Back Office",
    })
    const shared = repository("shared")
    for (const application of [first, second])
      await management.attachRepository(admin, application.id, shared.id)
    const removed: Array<string> = []
    const repositoryManagement = createRepositoryManagement({
      auth,
      repositories,
      github: undefined,
      sync: {
        cloneDir: (id) => join(directory, id),
        isSyncing: () => false,
        async ensureFresh(id) {
          return repositories.findById(id)
        },
        resume() {},
        async shutdown() {},
        async sync() {},
        async remove(id) {
          removed.push(id)
        },
      },
    })
    expect(
      (await repositoryManagement.get(admin, shared.id))?.applications
    ).toEqual(["Back Office", "Customer Portal"])
    await repositoryManagement.remove(admin, shared.id)
    expect(removed).toEqual([shared.id])
    for (const application of [first, second])
      expect(
        (await management.getApplicationScope(client, application.id))
          ?.attachments
      ).toEqual([])
    // Reusing the id is impossible through the API, and stale Attachments are gone.
    expect(repositories.applicationsOf(shared.id)).toEqual([])
  })

  it("persists fields and Attachments across a new database connection", async () => {
    const application = await management.create(admin, INPUT)
    const attached = repository("billing")
    await management.attachRepository(admin, application.id, attached.id)
    await management.update(admin, application.id, {
      name: "Renamed Portal",
      description: "New description",
      notes: "Plain text <b>notes</b>",
    })
    const reopened = createApplicationsRepository(openDb(file)).scope(
      application.id
    )
    expect(reopened?.application).toEqual({
      id: application.id,
      name: "Renamed Portal",
      description: "New description",
      notes: "Plain text <b>notes</b>",
    })
    expect(reopened?.attachments[0].resource.id).toBe(attached.id)
  })

  it("validates input and refuses Attachments to missing records", async () => {
    await expect(
      management.create(admin, { ...INPUT, name: " " })
    ).rejects.toMatchObject({ field: "name" })
    await expect(
      management.create(admin, { ...INPUT, notes: "x".repeat(10001) })
    ).rejects.toMatchObject({ field: "notes" })
    const application = await management.create(admin, INPUT)
    await expect(
      management.attachRepository(admin, application.id, "missing")
    ).rejects.toBeInstanceOf(ApplicationError)
    await expect(
      management.attachRepository(admin, "missing", repository("billing").id)
    ).rejects.toBeInstanceOf(ApplicationError)
  })

  it("pages and searches Applications and only offers unattached Repositories", async () => {
    for (let i = 0; i < 22; i++)
      applications.create({
        name: `Portal ${String(i).padStart(2, "0")}`,
        description: "",
        notes: "",
      })
    const page = await management.list(admin, { page: 2 })
    expect(page.total).toBe(22)
    expect(page.applications).toHaveLength(2)
    expect(
      (await management.list(admin, { search: "PORTAL 21" })).applications
    ).toHaveLength(1)
    expect((await management.list(admin, { search: "%" })).total).toBe(0)
    const application = page.applications[0]
    const attached = repository("attached")
    const available = repository("available")
    await management.attachRepository(admin, application.id, attached.id)
    expect(
      (
        await management.availableRepositories(admin, application.id, {})
      ).repositories.map((item) => item.id)
    ).toEqual([available.id])
    expect(
      (await management.list(admin, { search: application.name }))
        .applications[0].repositoryCount
    ).toBe(1)
  })

  it("requires Admin for management and a session for scope", async () => {
    const application = applications.create(INPUT)
    const attached = repository("billing")
    const actions = [
      (headers: Headers) => management.list(headers),
      (headers: Headers) => management.get(headers, application.id),
      (headers: Headers) => management.create(headers, INPUT),
      (headers: Headers) => management.update(headers, application.id, INPUT),
      (headers: Headers) => management.remove(headers, application.id),
      (headers: Headers) =>
        management.availableRepositories(headers, application.id, {}),
      (headers: Headers) =>
        management.attachRepository(headers, application.id, attached.id),
      (headers: Headers) =>
        management.detachRepository(headers, application.id, attached.id),
    ]
    for (const action of actions) {
      await expect(action(client)).rejects.toEqual(
        new AuthorizationError("forbidden")
      )
      await expect(action(new Headers())).rejects.toEqual(
        new AuthorizationError("unauthenticated")
      )
    }
    await expect(
      management.getApplicationScope(new Headers(), application.id)
    ).rejects.toBeInstanceOf(AuthorizationError)
    expect(
      (await management.getApplicationScope(client, application.id))
        ?.application.id
    ).toBe(application.id)
  })
})
