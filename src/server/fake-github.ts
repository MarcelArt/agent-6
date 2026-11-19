/**
 * A small in-memory stand-in for GitHub's issue endpoints, for tests. It
 * serves every repository under `/repos/owner/name/` and records requests.
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

export function createFakeGitHub() {
  const repos = new Map<
    string,
    { issues: Array<FakeIssue>; labels: Array<string> }
  >()
  const state = {
    requests: [] as Array<string>,
    /** Status answered to every write, as a token without Issues permission gets. */
    refuseWrites: undefined as number | undefined,
    /** Delay before each answer, to let concurrent callers overlap. */
    delayMs: 0,
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
      const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)$/.exec(url.pathname)
      if (!match) return answer({}, 404)
      const fullName = `${match[1]}/${match[2]}`
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
