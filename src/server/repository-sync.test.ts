import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GitError, createGit } from "./git"
import { openDb } from "./repositories/db"
import { createRepositoriesRepository } from "./repositories/repositories"
import { createRepositorySync } from "./repository-sync"
import type { Git } from "./git"
import type { RepositoriesRepository } from "./repositories/repositories"
import type { RepositorySync } from "./repository-sync"

const MINUTE = 60_000

let dataDir: string
let repositories: RepositoriesRepository
let sync: RepositorySync
let clock: Date
/** Every call to the fake git, and a way to let each one finish. */
let calls: Array<{
  branch: string
  finish: (commit: string) => void
  fail: (message: string) => void
}>

const fakeGit: Git = {
  sync: ({ branch, signal }) =>
    new Promise((resolve, reject) => {
      calls.push({
        branch,
        finish: resolve,
        fail: (message) => reject(new GitError(message)),
      })
      signal?.addEventListener("abort", () =>
        reject(new GitError("The sync was stopped."))
      )
    }),
}

function connect(fullName = "halden/billing-service") {
  return repositories.create({
    fullName,
    trackedBranch: "main",
    tags: [],
    description: "",
  })
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "agent6-test-"))
  repositories = createRepositoriesRepository(openDb(":memory:"))
  clock = new Date("2026-11-15T10:00:00Z")
  calls = []
  sync = createRepositorySync({
    repositories,
    git: fakeGit,
    dataDir,
    now: () => clock,
  })
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe("sync", () => {
  it("records syncing, then ready with the time and commit", async () => {
    const { id } = connect()
    expect(repositories.findById(id)?.status).toBe("pending")
    const done = sync.sync(id)
    expect(repositories.findById(id)).toMatchObject({
      status: "syncing",
      syncStartedAt: clock.getTime(),
    })
    clock = new Date(clock.getTime() + MINUTE)
    calls[0].finish("7d03b18")
    await done
    expect(repositories.findById(id)).toMatchObject({
      status: "ready",
      error: null,
      lastSyncedAt: clock.getTime(),
      lastSyncedCommit: "7d03b18",
    })
  })

  it("records failed with the error text and keeps the last good sync", async () => {
    const { id } = connect()
    const first = sync.sync(id)
    calls[0].finish("7d03b18")
    await first
    const second = sync.sync(id)
    calls[1].fail("The GitHub token cannot read this repository.")
    await second
    expect(repositories.findById(id)).toMatchObject({
      status: "failed",
      error: "The GitHub token cannot read this repository.",
      lastSyncedCommit: "7d03b18",
    })
  })

  it("never runs two syncs of the same Repository at the same time", async () => {
    const { id } = connect()
    const first = sync.sync(id)
    const second = sync.sync(id)
    const third = sync.ensureFresh(id, 0)
    expect(second).toBe(first)
    expect(calls).toHaveLength(1)
    calls[0].finish("7d03b18")
    await Promise.all([first, second, third])
    expect(calls).toHaveLength(1)
    // Once it is over, a new one may start.
    void sync.sync(id)
    expect(calls).toHaveLength(2)
  })

  it("syncs different Repositories side by side", () => {
    void sync.sync(connect("halden/one").id)
    void sync.sync(connect("halden/two").id)
    expect(calls).toHaveLength(2)
  })

  it("syncs again when the Tracked Branch changed during a sync", async () => {
    const { id } = connect()
    const done = sync.sync(id)
    repositories.update(id, {
      trackedBranch: "develop",
      tags: [],
      description: "",
    })
    // The request for the new branch joins the running sync.
    expect(sync.sync(id)).toBe(done)
    calls[0].finish("aaaaaaa")
    await new Promise((resolve) => setImmediate(resolve))
    expect(calls.map((call) => call.branch)).toEqual(["main", "develop"])
    calls[1].finish("bbbbbbb")
    await done
    expect(repositories.findById(id)).toMatchObject({
      status: "ready",
      lastSyncedCommit: "bbbbbbb",
    })
  })

  it("resumes syncs that a restart cut off", () => {
    const pending = connect("halden/pending")
    const cutOff = connect("halden/cut-off")
    repositories.markSyncing(cutOff.id, clock)
    const ready = connect("halden/ready")
    repositories.markReady(ready.id, clock, "7d03b18")
    sync.resume()
    expect(calls).toHaveLength(2)
    expect(sync.isSyncing(pending.id)).toBe(true)
    expect(sync.isSyncing(cutOff.id)).toBe(true)
    expect(sync.isSyncing(ready.id)).toBe(false)
  })

  it("stops a running sync and deletes the clone on removal", async () => {
    const { id } = connect()
    mkdirSync(sync.cloneDir(id), { recursive: true })
    writeFileSync(join(sync.cloneDir(id), "file.txt"), "x")
    void sync.sync(id)
    repositories.delete(id)
    await sync.remove(id)
    expect(sync.isSyncing(id)).toBe(false)
    expect(existsSync(sync.cloneDir(id))).toBe(false)
  })
})

describe("ensureFresh", () => {
  async function synced() {
    const { id } = connect()
    const done = sync.sync(id)
    calls[0].finish("7d03b18")
    await done
    return id
  }

  it("does not fetch while the last sync is younger than the maximum age", async () => {
    const id = await synced()
    clock = new Date(clock.getTime() + 4 * MINUTE)
    const repository = await sync.ensureFresh(id, 5 * MINUTE)
    expect(calls).toHaveLength(1)
    expect(repository).toMatchObject({ status: "ready" })
  })

  it("fetches when the last sync is older than the maximum age", async () => {
    const id = await synced()
    clock = new Date(clock.getTime() + 6 * MINUTE)
    const fresh = sync.ensureFresh(id, 5 * MINUTE)
    expect(calls).toHaveLength(2)
    calls[1].finish("9f1c2ab")
    expect(await fresh).toMatchObject({
      status: "ready",
      lastSyncedAt: clock.getTime(),
      lastSyncedCommit: "9f1c2ab",
    })
  })

  it("fetches a Repository that was never synced", async () => {
    const { id } = connect()
    const fresh = sync.ensureFresh(id, 5 * MINUTE)
    expect(calls).toHaveLength(1)
    calls[0].finish("7d03b18")
    expect((await fresh)?.status).toBe("ready")
  })

  it("answers instead of throwing when the fetch fails", async () => {
    const id = await synced()
    clock = new Date(clock.getTime() + 6 * MINUTE)
    const fresh = sync.ensureFresh(id, 5 * MINUTE)
    calls[1].fail("GitHub could not be reached.")
    // The earlier clone is still there to read.
    expect(await fresh).toMatchObject({
      status: "failed",
      lastSyncedCommit: "7d03b18",
    })
  })

  it("answers undefined for a Repository that does not exist", async () => {
    expect(await sync.ensureFresh("nope", 5 * MINUTE)).toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})

describe("git", () => {
  const TOKEN = "ghp_secretTokenForTests"
  let upstream: string

  function git(cwd: string, ...args: Array<string>): string {
    return execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      { cwd, encoding: "utf8" }
    ).trim()
  }

  function commit(file: string, content: string): string {
    writeFileSync(join(upstream, file), content)
    git(upstream, "add", ".")
    git(upstream, "commit", "--quiet", "-m", `change ${file}`)
    return git(upstream, "rev-parse", "HEAD")
  }

  beforeEach(() => {
    upstream = join(dataDir, "upstream")
    mkdirSync(upstream)
    git(upstream, "init", "--quiet", "--initial-branch=main")
  })

  it("clones only the Tracked Branch, then follows new commits", async () => {
    const first = commit("a.txt", "one")
    git(upstream, "checkout", "--quiet", "-b", "develop")
    commit("only-develop.txt", "x")
    git(upstream, "checkout", "--quiet", "main")

    const dir = join(dataDir, "repos", "r1")
    const url = `file://${upstream}`
    const client = createGit(TOKEN)
    expect(await client.sync({ dir, url, branch: "main" })).toBe(first)
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("one")
    expect(existsSync(join(dir, "only-develop.txt"))).toBe(false)
    // Shallow: one commit.
    expect(git(dir, "rev-list", "--count", "HEAD")).toBe("1")

    const second = commit("a.txt", "two")
    expect(await client.sync({ dir, url, branch: "main" })).toBe(second)
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("two")

    // Changing the Tracked Branch re-syncs the same clone to it.
    await client.sync({ dir, url, branch: "develop" })
    expect(existsSync(join(dir, "only-develop.txt"))).toBe(true)

    // The token is nowhere in the clone's git config.
    const config = readFileSync(join(dir, ".git", "config"), "utf8")
    expect(config).not.toContain(TOKEN)
    expect(config.toLowerCase()).not.toContain("authorization")
    expect(config).not.toContain(
      Buffer.from(`x-access-token:${TOKEN}`).toString("base64")
    )
  })

  it("says so when the branch does not exist, without the token", async () => {
    commit("a.txt", "one")
    const error = await createGit(TOKEN)
      .sync({
        dir: join(dataDir, "repos", "r2"),
        url: `file://${upstream}`,
        branch: "gone",
      })
      .catch((e) => e)
    expect(error).toBeInstanceOf(GitError)
    expect(error.message).toMatch(/branch gone does not exist/)
    expect(error.message).not.toContain(TOKEN)
  })
})
