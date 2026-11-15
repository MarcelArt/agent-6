export type RepositoryStatus = "pending" | "syncing" | "ready" | "failed"

/** A Repository as the Admin screens show it. Times are milliseconds since 1970. */
export type Repository = {
  id: string
  /** "owner/name" on GitHub. */
  fullName: string
  trackedBranch: string
  tags: Array<string>
  description: string
  status: RepositoryStatus
  /** Why the last sync failed. Null unless the status is "failed". */
  error: string | null
  syncStartedAt: number | null
  /** The last sync that succeeded, and the commit it fetched. */
  lastSyncedAt: number | null
  lastSyncedCommit: string | null
}

/**
 * Where a Repository's sync stands, as one short text. A screen compares it
 * with the server's to notice that a background sync moved on.
 */
export function syncState(repository: Repository): string {
  return [
    repository.status,
    repository.syncStartedAt,
    repository.lastSyncedAt,
    repository.lastSyncedCommit,
  ].join(" ")
}

export type RepositoriesPage = {
  repositories: Array<Repository>
  /** Repositories that match the search, over all pages. */
  total: number
  /** The page that was returned, starting at 1. */
  page: number
  pageSize: number
  /** The server's clock, for "4 min ago". */
  now: number
  /** `GITHUB_TOKEN` is not set, so nothing can be connected or synced. */
  tokenMissing: boolean
}

export type RepositoryDetail = {
  repository: Repository
  /** Names of the Applications it is attached to. */
  applications: Array<string>
  now: number
}

export const REPOSITORIES_PAGE_SIZE = 20
export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 40
export const MAX_DESCRIPTION_LENGTH = 1000

export const TOKEN_MISSING_MESSAGE =
  "GITHUB_TOKEN is not set, so Agent 6 cannot read GitHub. Set it in the server's environment to a token that can read your repositories, then restart Agent 6."

/** The form fields an error can belong to. */
export type RepositoryField =
  "repository" | "trackedBranch" | "tags" | "description"

export type RepositoryProblem = {
  ok: false
  message: string
  field?: RepositoryField
}

/** What a change to a Repository answers: the saved Repository, or what went wrong. */
export type RepositoryResult =
  { ok: true; repository: Repository } | RepositoryProblem

/** What checking a GitHub repository answers. */
export type RepositoryCheck =
  | {
      ok: true
      /** "owner/name" as GitHub spells it. */
      fullName: string
      defaultBranch: string
      branches: Array<string>
    }
  | RepositoryProblem

export type RemoveResult = { ok: true } | RepositoryProblem

/** Trims Tags and drops empty ones and repeats (ignoring case). */
export function tidyTags(tags: Array<string>): Array<string> {
  const seen = new Set<string>()
  const result: Array<string> = []
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ")
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

/** "4 min ago", "20 s ago", "3 d ago". */
export function timeAgo(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
