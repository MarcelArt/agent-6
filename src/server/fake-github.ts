/**
 * A small in-memory stand-in for GitHub, for tests. It serves the issue
 * endpoints of every repository under `/repos/owner/name/`, and the
 * repository and branch endpoints of the repositories `addRepository` made
 * readable. It records requests.
 */
export type FakeIssue = {
  number: number
  title: string
  body: string
  labels: Array<string>
  state: string
  comments: Array<string>
  pull_request?: object
}

/** A repository the token can read, with its branches. */
export type FakeRepository = {
  /** "owner/name" as GitHub spells it now. */
  fullName: string
  defaultBranch: string
  branches: Array<string>
  /** Earlier names that still lead to it, as after a rename. */
  formerNames: Array<string>
}

export function createFakeGitHub() {
  const repos = new Map<
    string,
    { issues: Array<FakeIssue>; labels: Array<string> }
  >()
  const readable: Array<FakeRepository> = []
  /** GitHub ignores case in names and follows renames. */
  const findReadable = (fullName: string) =>
    readable.find((item) =>
      [item.fullName, ...item.formerNames].some(
        (name) => name.toLowerCase() === fullName.toLowerCase()
      )
    )
  const state = {
    requests: [] as Array<string>,
    /** Status answered to every write, as a token without Issues permission gets. */
    refuseWrites: undefined as number | undefined,
    /** Delay before each answer, to let concurrent callers overlap. */
    delayMs: 0,
    /** Makes a repository readable by the token. */
    addRepository(
      fullName: string,
      options: Partial<Omit<FakeRepository, "fullName">> = {}
    ) {
      const added = {
        fullName,
        defaultBranch: options.defaultBranch ?? "main",
        branches: options.branches ?? ["main"],
        formerNames: options.formerNames ?? [],
      }
      readable.push(added)
      return added
    },
    /** Issues and labels of one repository, "owner/name". */
    repo(fullName: string) {
      let found = repos.get(fullName)
      if (!found) {
        found = { issues: [], labels: ["bug"] }
        repos.set(fullName, found)
      }
      return found
    },
    fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      state.requests.push(`${method} ${url.pathname}`)
      if (state.delayMs)
        await new Promise((resolve) => setTimeout(resolve, state.delayMs))
      const sent = init?.body ? JSON.parse(init.body as string) : undefined
      const answer = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status })
      const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname)
      if (!match) return answer({}, 404)
      const fullName = `${match[1]}/${match[2]}`
      if (method === "GET" && (!match[3] || match[3].startsWith("/branches"))) {
        const found = findReadable(fullName)
        if (!found) return answer({ message: "Not Found" }, 404)
        if (!match[3])
          return answer({
            full_name: found.fullName,
            default_branch: found.defaultBranch,
            permissions: { pull: true },
          })
        const branch = decodeURIComponent(
          match[3].replace(/^\/branches\/?/, "")
        )
        if (!branch) return answer(found.branches.map((name) => ({ name })))
        return found.branches.includes(branch)
          ? answer({ name: branch })
          : answer({ message: "Branch not found" }, 404)
      }
      const repo = state.repo(fullName)
      const path = match[3]
      const issue = (item: FakeIssue) => ({
        number: item.number,
        html_url: `https://github.com/${fullName}/issues/${item.number}`,
        title: item.title,
        body: item.body,
        state: item.state,
        labels: item.labels.map((name) => ({ name })),
        ...(item.pull_request ? { pull_request: {} } : {}),
      })
      if (method === "POST" && state.refuseWrites)
        return answer({}, state.refuseWrites)
      if (path === "/labels" && method === "POST") {
        if (repo.labels.includes(sent.name)) return answer({}, 422)
        repo.labels.push(sent.name)
        return answer({}, 201)
      }
      if (path === "/issues" && method === "GET") {
        const label = url.searchParams.get("labels")!
        return answer(
          repo.issues
            .filter(
              (item) => item.state === "open" && item.labels.includes(label)
            )
            .map(issue)
        )
      }
      if (path === "/issues" && method === "POST") {
        const created: FakeIssue = {
          number: repo.issues.length + 1,
          title: sent.title,
          body: sent.body,
          labels: sent.labels,
          state: "open",
          comments: [],
        }
        repo.issues.push(created)
        return answer(issue(created), 201)
      }
      const numbered = /^\/issues\/(\d+)(\/comments)?$/.exec(path)
      const found = repo.issues.find(
        (item) => item.number === Number(numbered?.[1])
      )
      if (!numbered || !found) return answer({}, 404)
      if (numbered[2] && method === "POST") {
        found.comments.push(sent.body)
        return answer({}, 201)
      }
      return answer(issue(found))
    }) as typeof fetch,
  }
  return state
}
export type FakeGitHub = ReturnType<typeof createFakeGitHub>
