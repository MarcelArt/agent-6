import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import { getConfig } from "./config"
import { GitHubError, createGitHub } from "./github"
import { createRepositoriesRepository } from "./repositories/repositories"
import { getRepositorySync } from "./repository-sync"
import { requireAdmin } from "./session"
import type { Auth } from "./auth"
import type { GitHub } from "./github"
import type { RepositoriesRepository } from "./repositories/repositories"
import type { RepositorySync } from "./repository-sync"
import type {
  RepositoriesPage,
  Repository,
  RepositoryDetail,
  RepositoryField,
} from "@/lib/repositories"
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  REPOSITORIES_PAGE_SIZE,
  TOKEN_MISSING_MESSAGE,
  syncState,
  tidyTags,
} from "@/lib/repositories"

/*
 * What an Admin may do to Repositories: connect, edit, sync and remove.
 */

/** A change that was refused, in words for the Admin who asked for it. */
export class RepositoryError extends Error {
  constructor(
    message: string,
    /** The form field the problem belongs to, if any. */
    public readonly field?: RepositoryField
  ) {
    super(message)
    this.name = "RepositoryError"
  }
}

export type RepositoryInput = {
  trackedBranch: string
  tags: Array<string>
  description: string
}

/**
 * Reads "owner/name" out of what an Admin typed: `owner/name`, a GitHub
 * address, or a clone address. Null when it is none of those.
 */
export function parseRepositoryReference(
  text: string
): { owner: string; name: string } | null {
  const typed = text.trim()
  const path = typed
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/^(ssh:\/\/)?git@github\.com[:/]/i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
  const [owner, ...rest] = path.split("/")
  const name = (rest.shift() ?? "").replace(/\.git$/i, "")
  // A pasted address may go deeper (".../tree/main"); bare text may not.
  const isAddress = path.length < typed.replace(/\/+$/, "").length
  if (rest.length > 0 && !isAddress) return null
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(owner)) return null
  if (!/^[\w.-]{1,100}$/.test(name) || name === "." || name === "..") {
    return null
  }
  return { owner, name }
}

/** The rules every saved Repository follows, also applied to imported ones. */
export function validRepositoryInput(input: RepositoryInput): RepositoryInput {
  const trackedBranch = input.trackedBranch.trim()
  if (!trackedBranch) {
    throw new RepositoryError("Pick the Tracked Branch.", "trackedBranch")
  }
  const tags = tidyTags(input.tags)
  if (tags.length > MAX_TAGS) {
    throw new RepositoryError(
      `A Repository can have at most ${MAX_TAGS} Tags. Remove some.`,
      "tags"
    )
  }
  const long = tags.find((tag) => tag.length > MAX_TAG_LENGTH)
  if (long) {
    throw new RepositoryError(
      `The Tag "${long.slice(0, 20)}…" is too long. A Tag can have at most ${MAX_TAG_LENGTH} characters.`,
      "tags"
    )
  }
  const description = input.description.trim()
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new RepositoryError(
      `The description can have at most ${MAX_DESCRIPTION_LENGTH} characters.`,
      "description"
    )
  }
  return { trackedBranch, tags, description }
}

/** A GitHub failure about `fullName`, as what happened plus what to do. */
function fromGitHubError(error: unknown, fullName: string): unknown {
  if (!(error instanceof GitHubError)) return error
  switch (error.problem) {
    case "not-found":
      return new RepositoryError(
        `Agent 6 cannot read ${fullName} with the configured GitHub token. Check the spelling, or give the token read access to this repository, then try again.`,
        "repository"
      )
    case "bad-token":
      return new RepositoryError(
        "GitHub refused the configured token: it is wrong or has expired. Set GITHUB_TOKEN to a working token and restart Agent 6."
      )
    case "rate-limited":
      return new RepositoryError(
        "GitHub is limiting requests from this token right now. Wait a few minutes, then try again."
      )
    case "rejected":
    case "unreachable":
      return new RepositoryError(
        "GitHub could not be reached from the server. Check its network connection, then try again."
      )
  }
}

/**
 * The GitHub checks a new Repository passes: the token can read it, and its
 * Tracked Branch exists. Both throw a `RepositoryError` for the Admin.
 * `github` is undefined when `GITHUB_TOKEN` is not set.
 */
export function createGitHubChecks(github: GitHub | undefined) {
  function requireGitHub(): GitHub {
    if (!github) throw new RepositoryError(TOKEN_MISSING_MESSAGE)
    return github
  }

  /** The repository on GitHub that `reference` names, if the token can read it. */
  async function lookUp(reference: string) {
    const parsed = parseRepositoryReference(reference)
    if (!parsed) {
      throw new RepositoryError(
        "Enter the repository as owner/name, for example halden/billing-service, or paste its GitHub address.",
        "repository"
      )
    }
    const typed = `${parsed.owner}/${parsed.name}`
    const api = requireGitHub()
    try {
      const found = await api.repository(parsed.owner, parsed.name)
      if (!found.canRead) throw new GitHubError("not-found")
      const [owner, name] = found.fullName.split("/")
      return { ...found, owner, name }
    } catch (error) {
      throw fromGitHubError(error, typed)
    }
  }

  async function requireBranch(fullName: string, branch: string) {
    const [owner, name] = fullName.split("/")
    let exists: boolean
    try {
      exists = await requireGitHub().branchExists(owner, name, branch)
    } catch (error) {
      throw fromGitHubError(error, fullName)
    }
    if (!exists) {
      throw new RepositoryError(
        `${fullName} has no branch named ${branch}. Pick another Tracked Branch.`,
        "trackedBranch"
      )
    }
  }

  return { requireGitHub, lookUp, requireBranch }
}

/** The configured GitHub client, or undefined when `GITHUB_TOKEN` is not set. */
export function configuredGitHub(): GitHub | undefined {
  const { githubToken } = getConfig()
  return githubToken ? createGitHub(githubToken) : undefined
}

export function createRepositoryManagement(
  deps: {
    auth?: Auth
    repositories?: RepositoriesRepository
    sync?: RepositorySync
    /** Undefined when `GITHUB_TOKEN` is not set. */
    github?: GitHub
    /** Names of the Applications a Repository is attached to. */
    applicationsOf?: (repositoryId: string) => Array<string>
  } = {}
) {
  const auth = deps.auth ?? getAuth()
  const repositories = deps.repositories ?? createRepositoriesRepository()
  const sync = deps.sync ?? getRepositorySync()
  const github = "github" in deps ? deps.github : configuredGitHub()
  const applicationsOf = deps.applicationsOf ?? repositories.applicationsOf
  const { requireGitHub, lookUp, requireBranch } = createGitHubChecks(github)

  function existing(repositoryId: string): Repository {
    const repository = repositories.findById(repositoryId)
    if (!repository) {
      throw new RepositoryError(
        "This Repository no longer exists. Go back to the list of Repositories."
      )
    }
    return repository
  }

  function refuseConnected(fullName: string) {
    if (repositories.findByFullName(fullName)) {
      throw new RepositoryError(
        `${fullName} is already connected. Open it from the list instead.`,
        "repository"
      )
    }
  }

  return {
    /** One page of Repositories whose name or Tags contain `search`. */
    async list(
      headers: Headers,
      options: { search?: string; page?: number } = {}
    ): Promise<RepositoriesPage> {
      await requireAdmin({ auth, headers })
      const pageSize = REPOSITORIES_PAGE_SIZE
      const total = repositories.count(options.search)
      const lastPage = Math.max(1, Math.ceil(total / pageSize))
      const page = Math.min(Math.max(1, options.page ?? 1), lastPage)
      return {
        repositories: repositories.list({
          search: options.search,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        total,
        page,
        pageSize,
        now: Date.now(),
        tokenMissing: !github,
      }
    },

    async get(
      headers: Headers,
      repositoryId: string
    ): Promise<RepositoryDetail | null> {
      await requireAdmin({ auth, headers })
      const repository = repositories.findById(repositoryId)
      if (!repository) return null
      return {
        repository,
        applications: applicationsOf(repositoryId),
        now: Date.now(),
      }
    },

    /**
     * `syncState` of each of the given Repositories. Those that no longer
     * exist are left out.
     */
    async syncStates(
      headers: Headers,
      repositoryIds: Array<string>
    ): Promise<Record<string, string>> {
      await requireAdmin({ auth, headers })
      const states: Record<string, string> = {}
      for (const id of repositoryIds) {
        const repository = repositories.findById(id)
        if (repository) states[id] = syncState(repository)
      }
      return states
    },

    /**
     * Checks that the token can read the repository an Admin typed, and
     * answers its branches. Saves nothing.
     */
    async check(headers: Headers, reference: string) {
      await requireAdmin({ auth, headers })
      const found = await lookUp(reference)
      refuseConnected(found.fullName)
      try {
        const branches = await requireGitHub().branches(found.owner, found.name)
        // Past the cap the default branch may be missing from the list.
        if (!branches.includes(found.defaultBranch)) {
          branches.unshift(found.defaultBranch)
        }
        return {
          fullName: found.fullName,
          defaultBranch: found.defaultBranch,
          branches,
        }
      } catch (error) {
        throw fromGitHubError(error, found.fullName)
      }
    },

    /** The branches of a connected Repository, for changing the Tracked Branch. */
    async branches(
      headers: Headers,
      repositoryId: string
    ): Promise<Array<string>> {
      await requireAdmin({ auth, headers })
      const repository = existing(repositoryId)
      const [owner, name] = repository.fullName.split("/")
      try {
        const branches = await requireGitHub().branches(owner, name)
        if (!branches.includes(repository.trackedBranch)) {
          branches.unshift(repository.trackedBranch)
        }
        return branches
      } catch (error) {
        throw fromGitHubError(error, repository.fullName)
      }
    },

    /**
     * Saves a new Repository and starts its first clone in the background.
     * Saves nothing unless the token can read the repository and the branch
     * exists.
     */
    async connect(
      headers: Headers,
      input: RepositoryInput & { reference: string }
    ): Promise<Repository> {
      await requireAdmin({ auth, headers })
      const found = await lookUp(input.reference)
      const valid = validRepositoryInput(input)
      await requireBranch(found.fullName, valid.trackedBranch)
      // Checked last, with nothing awaited before the insert.
      refuseConnected(found.fullName)
      const created = repositories.create({
        fullName: found.fullName,
        ...valid,
      })
      void sync.sync(created.id)
      return existing(created.id)
    },

    /** Saves Tracked Branch, Tags and description. A new branch syncs again. */
    async update(
      headers: Headers,
      repositoryId: string,
      input: RepositoryInput
    ): Promise<Repository> {
      await requireAdmin({ auth, headers })
      const valid = validRepositoryInput(input)
      const before = existing(repositoryId)
      const branchChanged = valid.trackedBranch !== before.trackedBranch
      if (branchChanged) {
        await requireBranch(before.fullName, valid.trackedBranch)
        existing(repositoryId)
      }
      repositories.update(repositoryId, valid)
      // A sync that is running notices the new branch and syncs once more.
      if (branchChanged) void sync.sync(repositoryId)
      return existing(repositoryId)
    },

    /** "Sync now": starts a sync unless one is already running. */
    async syncNow(headers: Headers, repositoryId: string): Promise<Repository> {
      await requireAdmin({ auth, headers })
      existing(repositoryId)
      void sync.sync(repositoryId)
      return existing(repositoryId)
    },

    /** Deletes the Repository and its clone. */
    async remove(headers: Headers, repositoryId: string): Promise<void> {
      await requireAdmin({ auth, headers })
      if (!repositories.findById(repositoryId)) return
      // Foreign keys cascade to its Attachments in the same statement.
      repositories.delete(repositoryId)
      await sync.remove(repositoryId)
    },
  }
}

export type RepositoryManagement = ReturnType<typeof createRepositoryManagement>
