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

export function createGitHub(
  token: string,
  fetcher: typeof fetch = fetch
): GitHub {
  async function get(path: string): Promise<Response> {
    let response: Response
    try {
      response = await fetcher(`${API}${path}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "user-agent": "agent-6",
          "x-github-api-version": "2022-11-28",
        },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new GitHubError("unreachable")
    }
    if (response.ok) return response
    if (response.status === 404) throw new GitHubError("not-found")
    if (response.status === 401) throw new GitHubError("bad-token")
    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      throw new GitHubError("rate-limited")
    }
    // Other 403s: the token is not allowed to see this repository.
    if (response.status === 403) throw new GitHubError("not-found")
    throw new GitHubError("unreachable")
  }

  async function json(path: string): Promise<unknown> {
    const response = await get(path)
    try {
      return await response.json()
    } catch {
      throw new GitHubError("unreachable")
    }
  }

  const repo = (owner: string, name: string) =>
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`

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
