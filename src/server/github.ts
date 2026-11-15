import "@tanstack/react-start/server-only"

/*
 * The few GitHub REST calls Agent 6 needs to connect a Repository. The token
 * goes in the Authorization header and nowhere else.
 */

export type GitHubProblem =
  /** No such repository, or the token cannot see it. GitHub does not say which. */
  | "not-found"
  /** GitHub refused the token itself. */
  | "bad-token"
  | "rate-limited"
  /** GitHub understood the request and refused its content (422). */
  | "rejected"
  /** GitHub could not be reached, or answered something unexpected. */
  | "unreachable"

export class GitHubError extends Error {
  constructor(public readonly problem: GitHubProblem) {
    super(`GitHub: ${problem}`)
    this.name = "GitHubError"
  }
}

export type GitHubRepository = {
  /** "owner/name" as GitHub spells it. */
  fullName: string
  defaultBranch: string
  /** Whether the token may read the code, as far as GitHub tells. */
  canRead: boolean
}

export type GitHub = {
  repository: (owner: string, name: string) => Promise<GitHubRepository>
  /** Branch names, at most `MAX_BRANCHES`. */
  branches: (owner: string, name: string) => Promise<Array<string>>
  branchExists: (
    owner: string,
    name: string,
    branch: string
  ) => Promise<boolean>
}

const API = "https://api.github.com"
const PAGE_SIZE = 100
export const MAX_BRANCHES = 1000

const repo = (owner: string, name: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`

function requester(token: string, fetcher: typeof fetch) {
  /** `body` makes it a POST. */
  async function get(path: string, body?: unknown): Promise<Response> {
    let response: Response
    try {
      response = await fetcher(`${API}${path}`, {
        ...(body === undefined
          ? {}
          : { method: "POST", body: JSON.stringify(body) }),
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "user-agent": "agent-6",
          "x-github-api-version": "2022-11-28",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new GitHubError("unreachable")
    }
    if (response.ok) return response
    // 410: issues are turned off for the repository.
    if (response.status === 404 || response.status === 410)
      throw new GitHubError("not-found")
    if (response.status === 422) throw new GitHubError("rejected")
    if (response.status === 401) throw new GitHubError("bad-token")
    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      throw new GitHubError("rate-limited")
    }
    // Other 403s: the token is not allowed to see or do this.
    if (response.status === 403) throw new GitHubError("not-found")
    throw new GitHubError("unreachable")
  }

  async function json(path: string, body?: unknown): Promise<unknown> {
    const response = await get(path, body)
    try {
      return await response.json()
    } catch {
      throw new GitHubError("unreachable")
    }
  }
  return { get, json }
}

export function createGitHub(
  token: string,
  fetcher: typeof fetch = fetch
): GitHub {
  const { get, json } = requester(token, fetcher)
  return {
    async repository(owner, name) {
      const body = (await json(repo(owner, name))) as {
        full_name?: unknown
        default_branch?: unknown
        permissions?: { pull?: unknown }
      }
      if (
        typeof body.full_name !== "string" ||
        typeof body.default_branch !== "string"
      ) {
        throw new GitHubError("unreachable")
      }
      return {
        fullName: body.full_name,
        defaultBranch: body.default_branch,
        canRead: body.permissions?.pull !== false,
      }
    },

    async branches(owner, name) {
      const names: Array<string> = []
      for (let page = 1; names.length < MAX_BRANCHES; page++) {
        const body = await json(
          `${repo(owner, name)}/branches?per_page=${PAGE_SIZE}&page=${page}`
        )
        if (!Array.isArray(body)) throw new GitHubError("unreachable")
        for (const branch of body as Array<{ name?: unknown }>) {
          if (typeof branch.name === "string") names.push(branch.name)
        }
        if (body.length < PAGE_SIZE) break
      }
      return names
    },

    async branchExists(owner, name, branch) {
      try {
        // Slashes in a branch name stay slashes in the address.
        const path = branch.split("/").map(encodeURIComponent).join("/")
        await get(`${repo(owner, name)}/branches/${path}`)
        return true
      } catch (error) {
        if (error instanceof GitHubError && error.problem === "not-found") {
          return false
        }
        throw error
      }
    },
  }
}

export type GitHubIssue = {
  number: number
  /** The page on github.com. */
  url: string
  title: string
  body: string
  labels: Array<string>
  open: boolean
}

/** The issue calls Agent 6 needs to report a fault. They need Issues write permission. */
export type GitHubIssues = {
  /** Open issues carrying `label`, newest first, at most 100. Pull requests are left out. */
  openIssues: (
    owner: string,
    name: string,
    label: string
  ) => Promise<Array<GitHubIssue>>
  /** One issue. A pull request counts as "not-found". */
  issue: (owner: string, name: string, number: number) => Promise<GitHubIssue>
  /** Creates the label unless the Repository already has it. */
  ensureLabel: (
    owner: string,
    name: string,
    label: { name: string; color: string; description: string }
  ) => Promise<void>
  createIssue: (
    owner: string,
    name: string,
    issue: { title: string; body: string; labels: Array<string> }
  ) => Promise<GitHubIssue>
  comment: (
    owner: string,
    name: string,
    number: number,
    body: string
  ) => Promise<void>
}

function toIssue(value: unknown): GitHubIssue | null {
  const raw = value as {
    number?: unknown
    html_url?: unknown
    title?: unknown
    body?: unknown
    state?: unknown
    labels?: unknown
    pull_request?: unknown
  } | null
  if (
    !raw ||
    typeof raw.number !== "number" ||
    typeof raw.html_url !== "string" ||
    typeof raw.title !== "string"
  )
    throw new GitHubError("unreachable")
  if (raw.pull_request) return null
  return {
    number: raw.number,
    url: raw.html_url,
    title: raw.title,
    body: typeof raw.body === "string" ? raw.body : "",
    // A label is an object, or a bare name in older responses.
    labels: (Array.isArray(raw.labels) ? raw.labels : []).flatMap(
      (label: unknown) => {
        const text =
          typeof label === "string"
            ? label
            : (label as { name?: unknown } | null)?.name
        return typeof text === "string" ? [text] : []
      }
    ),
    open: raw.state === "open",
  }
}

export function createGitHubIssues(
  token: string,
  fetcher: typeof fetch = fetch
): GitHubIssues {
  const { get, json } = requester(token, fetcher)
  return {
    async openIssues(owner, name, label) {
      const body = await json(
        `${repo(owner, name)}/issues?state=open&labels=${encodeURIComponent(label)}&sort=created&direction=desc&per_page=${PAGE_SIZE}`
      )
      if (!Array.isArray(body)) throw new GitHubError("unreachable")
      return body.flatMap((item) => toIssue(item) ?? [])
    },

    async issue(owner, name, number) {
      const found = toIssue(await json(`${repo(owner, name)}/issues/${number}`))
      if (!found) throw new GitHubError("not-found")
      return found
    },

    async ensureLabel(owner, name, label) {
      try {
        await get(`${repo(owner, name)}/labels`, label)
      } catch (error) {
        // 422: the Repository already has a label of this name.
        if (error instanceof GitHubError && error.problem === "rejected") return
        throw error
      }
    },

    async createIssue(owner, name, issue) {
      const created = toIssue(await json(`${repo(owner, name)}/issues`, issue))
      if (!created) throw new GitHubError("unreachable")
      return created
    },

    async comment(owner, name, number, body) {
      await get(`${repo(owner, name)}/issues/${number}/comments`, { body })
    },
  }
}
