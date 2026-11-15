import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "./auth"
import { GitHubError } from "./github"
import { openDb } from "./repositories/db"
import { createRepositoriesRepository } from "./repositories/repositories"
import {
  RepositoryError,
  createRepositoryManagement,
  parseRepositoryReference,
} from "./repository-management"
import { createRepositorySync } from "./repository-sync"
import { AuthorizationError } from "./session"
import type { Auth } from "./auth"
import type { GitHub } from "./github"
import type { RepositoriesRepository } from "./repositories/repositories"
import type { RepositoryManagement } from "./repository-management"
import type { RepositorySync } from "./repository-sync"

let auth: Auth
let repositories: RepositoriesRepository
let sync: RepositorySync
let management: RepositoryManagement
let admin: Headers
let client: Headers
let dataDir: string
let synced: Array<string>

/** GitHub with one readable repository, halden/billing-service. */
const github: GitHub = {
  async repository(owner, name) {
    if (`${owner}/${name}`.toLowerCase() !== "halden/billing-service") {
      throw new GitHubError("not-found")
    }
    return {
      fullName: "halden/billing-service",
      defaultBranch: "main",
      canRead: true,
    }
  },
  async branches() {
    return ["develop", "main"]
  },
  async branchExists(_owner, _name, branch) {
    return ["develop", "main"].includes(branch)
  },
}

const INPUT = {
  reference: "halden/billing-service",
  trackedBranch: "main",
  tags: ["backend", " Backend ", "invoices"],
  description: " Invoices. ",
}

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
  const db = openDb(":memory:")
  auth = createAuth(db, {
    secret: "s".repeat(32),
    baseUrl: "http://localhost:3000",
  })
  for (const role of ["admin", "client"] as const) {
    await auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: `${role}-password`,
        role,
      },
    })
  }
  admin = await signIn("admin@example.com", "admin-password")
  client = await signIn("client@example.com", "client-password")
  dataDir = mkdtempSync(join(tmpdir(), "agent6-test-"))
  repositories = createRepositoriesRepository(db)
  synced = []
  sync = createRepositorySync({
    repositories,
    dataDir,
    git: {
      async sync({ branch }) {
        synced.push(branch)
        return "7d03b18"
      },
    },
  })
  management = createRepositoryManagement({ auth, repositories, sync, github })
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe("parseRepositoryReference", () => {
  it.each([
    ["halden/billing-service", "halden/billing-service"],
    ["  halden/billing-service/ ", "halden/billing-service"],
    ["https://github.com/halden/billing-service", "halden/billing-service"],
    ["https://github.com/halden/billing-service.git", "halden/billing-service"],
    ["github.com/halden/rates.engine/tree/main", "halden/rates.engine"],
    ["git@github.com:halden/billing-service.git", "halden/billing-service"],
  ])("reads %s", (text, expected) => {
    const parsed = parseRepositoryReference(text)
    expect(parsed && `${parsed.owner}/${parsed.name}`).toBe(expected)
  })

  it.each([
    "",
    "billing-service",
    "halden/billing/service",
    "halden/..",
    "-x/name",
    "halden/na me",
    "https://gitlab.com/halden/billing-service",
  ])("refuses %j", (text) => {
    expect(parseRepositoryReference(text)).toBeNull()
  })
})

describe("connecting", () => {
  it("answers the branches and default branch of a readable repository", async () => {
    expect(
      await management.check(admin, "https://github.com/Halden/Billing-Service")
    ).toEqual({
      fullName: "halden/billing-service",
      defaultBranch: "main",
      branches: ["develop", "main"],
    })
    expect(repositories.count()).toBe(0)
  })

  it("saves the Repository and clones it in the background", async () => {
    const created = await management.connect(admin, INPUT)
    expect(created).toMatchObject({
      fullName: "halden/billing-service",
      trackedBranch: "main",
      tags: ["backend", "invoices"],
      description: "Invoices.",
      status: "syncing",
    })
    await sync.ensureFresh(created.id, Infinity)
    expect(repositories.findById(created.id)).toMatchObject({
      status: "ready",
      lastSyncedCommit: "7d03b18",
    })
    expect(synced).toEqual(["main"])
  })

  it("shows a plain error and saves nothing when the token cannot read it", async () => {
    for (const attempt of [
      () => management.check(admin, "halden/rates-engine"),
      () =>
        management.connect(admin, {
          ...INPUT,
          reference: "halden/rates-engine",
        }),
    ]) {
      const error = await attempt().catch((e) => e)
      expect(error).toBeInstanceOf(RepositoryError)
      expect(error.field).toBe("repository")
      expect(error.message).toMatch(/cannot read halden\/rates-engine/)
    }
    expect(repositories.count()).toBe(0)
    expect(synced).toEqual([])
  })

  it("refuses a branch that does not exist, and a second connection", async () => {
    const missing = await management
      .connect(admin, { ...INPUT, trackedBranch: "gone" })
      .catch((e) => e)
    expect(missing.field).toBe("trackedBranch")
    expect(repositories.count()).toBe(0)
    await management.connect(admin, INPUT)
    await expect(management.connect(admin, INPUT)).rejects.toThrow(
      /already connected/
    )
    expect(repositories.count()).toBe(1)
  })

  it("says the token is missing when it is", async () => {
    const without = createRepositoryManagement({
      auth,
      repositories,
      sync,
      github: undefined,
    })
    await expect(without.check(admin, INPUT.reference)).rejects.toThrow(
      /GITHUB_TOKEN is not set/
    )
    expect((await without.list(admin)).tokenMissing).toBe(true)
  })
})

describe("editing and removing", () => {
  it("syncs again only when the Tracked Branch changes", async () => {
    const { id } = await management.connect(admin, INPUT)
    await sync.ensureFresh(id, Infinity)
    await management.update(admin, id, {
      trackedBranch: "main",
      tags: ["payments"],
      description: "",
    })
    expect(synced).toEqual(["main"])
    await management.update(admin, id, {
      trackedBranch: "develop",
      tags: ["payments"],
      description: "",
    })
    await sync.ensureFresh(id, Infinity)
    expect(synced).toEqual(["main", "develop"])
    expect(repositories.findById(id)).toMatchObject({
      trackedBranch: "develop",
      tags: ["payments"],
      status: "ready",
    })
  })

  it("removes the record", async () => {
    const { id } = await management.connect(admin, INPUT)
    await management.remove(admin, id)
    expect(await management.get(admin, id)).toBeNull()
    expect(repositories.count()).toBe(0)
  })
})

it("is for Admins only", async () => {
  const { id } = await management.connect(admin, INPUT)
  for (const attempt of [
    () => management.list(client),
    () => management.get(client, id),
    () => management.check(client, INPUT.reference),
    () => management.branches(client, id),
    () => management.connect(client, INPUT),
    () => management.update(client, id, INPUT),
    () => management.syncNow(client, id),
    () => management.remove(client, id),
    () => management.list(new Headers()),
  ]) {
    await expect(attempt()).rejects.toThrow(AuthorizationError)
  }
  expect(repositories.count()).toBe(1)
})

it("answers the sync state of the Repositories that still exist", async () => {
  const { id } = await management.connect(admin, INPUT)
  const before = await management.syncStates(admin, [id, "gone"])
  expect(Object.keys(before)).toEqual([id])
  await sync.ensureFresh(id, Infinity)
  const after = await management.syncStates(admin, [id])
  expect(after[id]).toMatch(/^ready .* 7d03b18$/)
  // A sync that moves on changes the state.
  repositories.markSyncing(id, new Date())
  expect((await management.syncStates(admin, [id]))[id]).not.toBe(after[id])
  await expect(management.syncStates(client, [id])).rejects.toThrow(
    AuthorizationError
  )
})
