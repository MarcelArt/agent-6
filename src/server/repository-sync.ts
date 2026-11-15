import "@tanstack/react-start/server-only"

import { rm } from "node:fs/promises"
import { join } from "node:path"
import { getConfig } from "./config"
import { GitError, createGit } from "./git"
import { createRepositoriesRepository } from "./repositories/repositories"
import type { Git } from "./git"
import type { RepositoriesRepository } from "./repositories/repositories"
import type { Repository } from "@/lib/repositories"
import { TOKEN_MISSING_MESSAGE } from "@/lib/repositories"

/*
 * Keeps the clone of each Repository in `DATA_DIR/repos/<id>` in step with
 * its Tracked Branch. Syncs run in the background of this process; their
 * state is in the Repository record, so any screen can show it.
 */

export function createRepositorySync(deps: {
  repositories: RepositoriesRepository
  git: Git
  /** Absolute path of `DATA_DIR`. */
  dataDir: string
  now?: () => Date
}) {
  const { repositories, git } = deps
  const now = deps.now ?? (() => new Date())
  let stopping = false
  /** The sync in flight for each Repository. At most one per Repository. */
  const running = new Map<
    string,
    { done: Promise<void>; abort: AbortController }
  >()

  function cloneDir(repositoryId: string): string {
    return join(deps.dataDir, "repos", repositoryId)
  }

  async function run(id: string, signal: AbortSignal): Promise<void> {
    for (;;) {
      const repository = repositories.findById(id)
      if (!repository) return
      const branch = repository.trackedBranch
      repositories.markSyncing(id, now())
      try {
        signal.throwIfAborted()
        const commit = await git.sync({
          dir: cloneDir(id),
          url: `https://github.com/${repository.fullName}.git`,
          branch,
          signal,
        })
        signal.throwIfAborted()
        repositories.markReady(id, now(), commit)
      } catch (error) {
        // Keep status "syncing" so startup resumes a sync interrupted by shutdown.
        if (signal.aborted && stopping) return
        if (!(error instanceof GitError)) console.error(error)
        repositories.markFailed(
          id,
          error instanceof GitError
            ? error.message
            : "Agent 6 hit an unexpected problem while syncing. The server log has the details."
        )
      }
      // The Tracked Branch was changed meanwhile: sync again, to the new one.
      if (repositories.findById(id)?.trackedBranch === branch) return
    }
  }

  /**
   * Syncs the Repository in the background. While a sync of it is running,
   * no second one starts: the caller gets the running one. The promise
   * settles when the sync is over and never rejects; a failure is recorded
   * on the Repository.
   */
  function sync(id: string): Promise<void> {
    if (stopping) return Promise.resolve()
    const current = running.get(id)
    if (current) return current.done
    const abort = new AbortController()
    const done = run(id, abort.signal)
      .catch((error: unknown) => console.error(error))
      .then(async () => {
        running.delete(id)
        // Removed while it was syncing.
        if (!repositories.findById(id)) await deleteClone(id)
      })
    running.set(id, { done, abort })
    return done
  }

  async function deleteClone(id: string): Promise<void> {
    await rm(cloneDir(id), { recursive: true, force: true })
  }

  return {
    cloneDir,
    sync,

    isSyncing(id: string): boolean {
      return running.has(id)
    },

    /**
     * Makes sure the clone is at most `maxAgeMs` old: fetches only when the
     * last successful sync is older than that (or never happened), and
     * waits for a sync that is already running. Answers the Repository as
     * it is afterwards; a failed sync shows in its `status`, and an older
     * clone may still be there (`lastSyncedCommit`).
     */
    async ensureFresh(
      repositoryId: string,
      maxAgeMs: number
    ): Promise<Repository | undefined> {
      const current = running.get(repositoryId)
      if (current) {
        await current.done
      } else {
        const repository = repositories.findById(repositoryId)
        if (!repository) return undefined
        const age =
          repository.lastSyncedAt === null
            ? Infinity
            : now().getTime() - repository.lastSyncedAt
        if (age > maxAgeMs) await sync(repositoryId)
      }
      return repositories.findById(repositoryId)
    },

    /** Stops a running sync and deletes the clone. Call after deleting the record. */
    async remove(id: string): Promise<void> {
      const current = running.get(id)
      if (current) {
        current.abort.abort()
        // The sync deletes the clone itself once it has stopped.
        await current.done
      }
      await deleteClone(id)
    },

    /** Starts the syncs a restart cut off, or that never started. */
    resume(): void {
      for (const id of repositories.unfinishedIds()) void sync(id)
    },

    /** Stop git children and leave interrupted syncs available for startup to resume. */
    async shutdown(): Promise<void> {
      stopping = true
      const current = [...running.values()]
      for (const { abort } of current) abort.abort()
      await Promise.all(current.map(({ done }) => done))
    },
  }
}

export type RepositorySync = ReturnType<typeof createRepositorySync>

let cached: RepositorySync | undefined

/** The one syncer of this process, so its "one sync at a time" guard holds. */
export function getRepositorySync(): RepositorySync {
  if (!cached) {
    const { dataDir, githubToken } = getConfig()
    const git: Git = githubToken
      ? createGit(githubToken)
      : { sync: () => Promise.reject(new GitError(TOKEN_MISSING_MESSAGE)) }
    cached = createRepositorySync({
      repositories: createRepositoriesRepository(),
      git,
      dataDir,
    })
  }
  return cached
}

/**
 * Fetches the Repository's Tracked Branch only when the last sync is older
 * than `maxAgeMs`. Step 07 calls this before the agent reads the clone.
 */
export function ensureFresh(
  repositoryId: string,
  maxAgeMs: number
): Promise<Repository | undefined> {
  return getRepositorySync().ensureFresh(repositoryId, maxAgeMs)
}
