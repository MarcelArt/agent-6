import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { createAuth } from "./auth"
import { createLogConnectionManagement } from "./log-connection-management"
import { createLogTools } from "./log-tools"
import { LOG_CAPS, LogQueryError } from "./loki"
import { openDb } from "./repositories/db"
import { createApplicationsRepository } from "./repositories/applications"
import { createLogConnectionsRepository } from "./repositories/log-connections"
import { AuthorizationError } from "./session"
import { supportInstructions } from "./support-agent"
import type { AddressInfo } from "node:net"
import type { IncomingHttpHeaders, Server } from "node:http"
import type { Auth } from "./auth"
import type { LogQueryInput } from "./log-tools"
import type { LogConnectionInput } from "@/lib/log-connections"
import {
  SelectorError,
  formatSelector,
  parseSelector,
} from "@/lib/log-connections"

vi.mock("./config", () => ({
  getConfig: () => ({ encryptionKey: Buffer.alloc(32, 1).toString("base64") }),
}))

/** A fake Loki: records every request and answers from `respond`. */
type Seen = {
  path: string
  params: URLSearchParams
  headers: IncomingHttpHeaders
}
let server: Server, baseUrl: string
let seen: Array<Seen> = []
let respond: (request: Seen) => {
  status?: number
  body: unknown
  delayMs?: number
}
const streams = (values: Array<[string, string]>) => ({
  body: {
    status: "success",
    data: {
      resultType: "streams",
      result: [{ stream: { app: "billing" }, values }],
    },
  },
})
beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, "http://loki")
    const item = {
      path: url.pathname,
      params: url.searchParams,
      headers: request.headers,
    }
    seen.push(item)
    const { status = 200, body, delayMs = 0 } = respond(item)
    setTimeout(() => {
      response.writeHead(status, { "Content-Type": "application/json" })
      response.end(typeof body === "string" ? body : JSON.stringify(body))
    }, delayMs)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.closeAllConnections()
  server.close()
})

const SECRET = "log-token-kept-private"
let INPUT: LogConnectionInput
let directory: string, file: string, auth: Auth, admin: Headers, client: Headers
let connections: ReturnType<typeof createLogConnectionsRepository>
let applications: ReturnType<typeof createApplicationsRepository>
let management: ReturnType<typeof createLogConnectionManagement>
beforeEach(async () => {
  seen = []
  respond = () => ({ body: { status: "success", data: [] } })
  INPUT = {
    name: " Production logs ",
    baseUrl: `${baseUrl}/loki/api/v1/`,
    authType: "bearer",
    authUsername: "",
    authSecret: SECRET,
    tenantId: "tenant-a",
    tags: ["production"],
    description: " Logs of every service. ",
  }
  directory = mkdtempSync(join(tmpdir(), "agent6-logs-"))
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
  async function headers(role: string) {
    const { headers: response } = await auth.api.signInEmail({
      body: { email: `${role}@example.com`, password: `${role}-password` },
      returnHeaders: true,
    })
    return new Headers({
      cookie: response
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    })
  }
  admin = await headers("admin")
  client = await headers("client")
  connections = createLogConnectionsRepository(db)
  applications = createApplicationsRepository(db)
  management = createLogConnectionManagement({
    auth,
    connections,
    applications,
  })
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

const application = (name = "Billing") =>
  applications.create({ name, description: "", notes: "" })
const query = (logConnectionId: string, rest: Partial<LogQueryInput> = {}) => ({
  logConnectionId,
  matchers: [],
  filter: null,
  start: null,
  end: null,
  limit: null,
  ...rest,
})

describe("Base Selector", () => {
  it("parses and reformats well-formed selectors", () => {
    expect(
      formatSelector(
        parseSelector(' { app = "billing",env=~`prod|stg`, x!="a\\"b" } ')
      )
    ).toBe('{app="billing", env=~"prod|stg", x!="a\\"b"}')
  })
  it("rejects malformed selectors", () => {
    for (const text of [
      "",
      "{}",
      'app="billing"',
      "{app=billing}",
      '{app="billing"',
      '{app="billing"} |= "x"',
      '{app="billing"} or {app="other"}',
      '{app=="billing"}',
      '{1app="billing"}',
      '{app="a", app="b"}',
      '{app="billing}',
    ])
      expect(() => parseSelector(text), text).toThrow(SelectorError)
  })
})

describe("Log Connections", () => {
  it("tests on save with the auth header and tenant, encrypts the secret and never returns it", async () => {
    const saved = await management.save(admin, INPUT)
    expect(saved).toMatchObject({
      name: "Production logs",
      baseUrl,
      test: { ok: true },
    })
    expect(seen).toHaveLength(1)
    expect(seen[0].path).toBe("/loki/api/v1/labels")
    expect(seen[0].headers.authorization).toBe(`Bearer ${SECRET}`)
    expect(seen[0].headers["x-scope-orgid"]).toBe("tenant-a")
    const edited = await management.save(
      admin,
      { ...INPUT, authSecret: "", name: "Renamed" },
      saved.id
    )
    expect(seen[1].headers.authorization).toBe(`Bearer ${SECRET}`)
    for (const result of [
      saved,
      edited,
      await management.get(admin, saved.id),
      await management.list(admin),
    ]) {
      expect(JSON.stringify(result)).not.toContain(SECRET)
      expect(JSON.stringify(result)).not.toMatch(/[sS]ecret/)
    }
    expect(readFileSync(file).includes(Buffer.from(SECRET))).toBe(false)
    // Changing the auth type needs a new secret; basic sends user:password.
    await expect(
      management.save(
        admin,
        { ...INPUT, authType: "basic", authUsername: "reader", authSecret: "" },
        saved.id
      )
    ).rejects.toMatchObject({ field: "authSecret" })
    await management.save(
      admin,
      { ...INPUT, authType: "basic", authUsername: "reader", authSecret: "pw" },
      saved.id
    )
    expect(seen.at(-1)!.headers.authorization).toBe(
      `Basic ${Buffer.from("reader:pw").toString("base64")}`
    )
    await management.save(admin, { ...INPUT, authType: "none" }, saved.id)
    expect(seen.at(-1)!.headers.authorization).toBeUndefined()
    expect(connections.credentials(saved.id)?.encryptedAuthSecret).toBeNull()
  })
  it("saves a failed test and reports the error without the auth header", async () => {
    respond = (request) => ({
      status: 400,
      body: `bad request from ${request.headers.authorization}`,
    })
    const saved = await management.save(admin, INPUT)
    expect(saved.test.ok).toBe(false)
    expect(saved.test.message).toContain("rejected")
    expect(JSON.stringify(saved)).not.toContain(SECRET)
    respond = () => ({ status: 401, body: "no" })
    expect((await management.test(admin, saved.id)).message).toContain(
      "credentials"
    )
    respond = () => ({ body: { status: "success", data: ["app"] } })
    expect(await management.test(admin, saved.id)).toMatchObject({ ok: true })
    expect((await management.get(admin, saved.id))?.connection.test.ok).toBe(
      true
    )
  })
  it("rejects a malformed Base Selector and counts the streams a selector matches", async () => {
    const app = application()
    const saved = await management.save(admin, INPUT)
    for (const text of ["", "{}", "app=billing", '{app="billing"} |= "x"']) {
      await expect(
        management.attach(admin, app.id, saved.id, text)
      ).rejects.toMatchObject({ field: "baseSelector" })
      await expect(
        management.countStreams(admin, saved.id, text)
      ).rejects.toMatchObject({ field: "baseSelector" })
    }
    expect(applications.scope(app.id)?.attachments).toEqual([])
    respond = (request) => ({
      body: {
        status: "success",
        data:
          request.params.get("match[]") === '{app="billing"}'
            ? [
                { app: "billing", pod: "a" },
                { app: "billing", pod: "b" },
              ]
            : [],
      },
    })
    expect(
      await management.countStreams(admin, saved.id, '{ app = "billing" }')
    ).toBe(2)
    expect(seen.at(-1)!.path).toBe("/loki/api/v1/series")
    expect(
      await management.countStreams(admin, saved.id, '{app="biling"}')
    ).toBe(0)
    await management.attach(admin, app.id, saved.id, '{ app = "billing" }')
    expect(applications.scope(app.id)?.attachments).toEqual([
      {
        kind: "log-connection",
        resource: expect.objectContaining({ id: saved.id }),
        baseSelector: '{app="billing"}',
      },
    ])
    expect((await management.available(admin, app.id, {})).connections).toEqual(
      []
    )
    await management.remove(admin, saved.id)
    expect(applications.scope(app.id)?.attachments).toEqual([])
  })
  it("requires Admin for every management operation", async () => {
    const app = application()
    const saved = await management.save(admin, INPUT)
    for (const action of [
      (h: Headers) => management.list(h),
      (h: Headers) => management.get(h, saved.id),
      (h: Headers) => management.save(h, INPUT),
      (h: Headers) => management.save(h, INPUT, saved.id),
      (h: Headers) => management.test(h, saved.id),
      (h: Headers) => management.remove(h, saved.id),
      (h: Headers) => management.available(h, app.id, {}),
      (h: Headers) => management.countStreams(h, saved.id, '{app="x"}'),
      (h: Headers) => management.attach(h, app.id, saved.id, '{app="x"}'),
      (h: Headers) => management.detach(h, app.id, saved.id),
    ]) {
      await expect(action(client)).rejects.toEqual(
        new AuthorizationError("forbidden")
      )
      await expect(action(new Headers())).rejects.toEqual(
        new AuthorizationError("unauthenticated")
      )
    }
  })
})

describe("Log tools", () => {
  async function attached(baseSelector = '{app="billing", env="prod"}') {
    const app = application()
    const saved = await management.save(admin, INPUT)
    await management.attach(admin, app.id, saved.id, baseSelector)
    seen = []
    return { app, saved, tools: createLogTools(app.id, undefined, connections) }
  }
  it("puts the Base Selector matchers in every request", async () => {
    const { saved, tools } = await attached()
    respond = (request) =>
      request.path.endsWith("query_range")
        ? streams([["1700000000000000000", "saved failed"]])
        : { body: { status: "success", data: ["app", "level"] } }
    expect(
      await tools.labels({ logConnectionId: saved.id, label: null })
    ).toMatchObject({ fixedLabels: ["app", "env"], values: ["app", "level"] })
    await tools.labels({ logConnectionId: saved.id, label: "level" })
    const result = await tools.query(
      query(saved.id, {
        matchers: [
          { label: "level", operator: "=", value: 'err"} or {app="other' },
          { label: "app", operator: "=", value: "billing" },
        ],
        filter: { kind: "text", value: 'save" or {app="other"}' },
      })
    )
    expect(result.lines).toEqual([
      { time: "2023-11-14T22:13:20.000Z", stream: 0, line: "saved failed" },
    ])
    expect(seen.map((item) => item.path)).toEqual([
      "/loki/api/v1/labels",
      "/loki/api/v1/label/level/values",
      "/loki/api/v1/query_range",
    ])
    for (const item of seen) {
      expect(item.params.get("query")).toMatch(/^\{app="billing", env="prod"/)
      expect(item.headers.authorization).toBe(`Bearer ${SECRET}`)
      expect(item.headers["x-scope-orgid"]).toBe("tenant-a")
    }
    // Model input stays inside quoted strings; it cannot add a selector.
    expect(seen[2].params.get("query")).toBe(
      '{app="billing", env="prod", level="err\\"} or {app=\\"other"} |= "save\\" or {app=\\"other\\"}"'
    )
    const { start, end } = Object.fromEntries(seen[2].params)
    expect(BigInt(end) - BigInt(start)).toBe(
      BigInt(LOG_CAPS.defaultRangeMs) * 1_000_000n
    )
    expect(seen[2].params.get("limit")).toBe(String(LOG_CAPS.defaultLines))
  })
  it("refuses a matcher that overrides a Base Selector label, and invalid matchers", async () => {
    const { saved, tools } = await attached()
    for (const matcher of [
      { label: "app", operator: "=", value: "other" },
      { label: "app", operator: "=~", value: ".*" },
      { label: "env", operator: "!=", value: "prod" },
      { label: 'x"} or {app="other', operator: "=", value: "y" },
      { label: "level", operator: "} or {", value: "y" },
    ] as LogQueryInput["matchers"])
      await expect(
        tools.query(query(saved.id, { matchers: [matcher] }))
      ).rejects.toBeInstanceOf(LogQueryError)
    await expect(
      tools.labels({ logConnectionId: saved.id, label: "../../series" })
    ).rejects.toBeInstanceOf(LogQueryError)
    expect(seen).toEqual([])
  })
  it("holds the range, line, length and size caps and reports what was cut", async () => {
    const { saved, tools } = await attached()
    await expect(
      tools.query(
        query(saved.id, {
          start: "2026-01-01T00:00:00Z",
          end: "2026-01-02T00:00:01Z",
        })
      )
    ).rejects.toThrow(/at most 24 hours/)
    await expect(
      tools.query(query(saved.id, { start: "yesterday" }))
    ).rejects.toThrow(/ISO 8601/)
    await expect(
      tools.query(
        query(saved.id, {
          start: "2026-01-02T00:00:00Z",
          end: "2026-01-01T00:00:00Z",
        })
      )
    ).rejects.toThrow(/before/)
    expect(seen).toEqual([])
    // A server that ignores `limit` still cannot exceed the caps.
    respond = () =>
      streams(
        Array.from({ length: 500 }, (_, i): [string, string] => [
          `${1700000000000 + i}000000`,
          "x".repeat(i === 499 ? 5000 : 10),
        ])
      )
    const result = await tools.query(query(saved.id, { limit: 5000 }))
    expect(seen[0].params.get("limit")).toBe(String(LOG_CAPS.maxLines))
    expect(result.lines).toHaveLength(LOG_CAPS.maxLines)
    expect(result.lines[0].line).toHaveLength(
      LOG_CAPS.lineChars + "… [line cut]".length
    )
    expect(result.truncated).toBe(true)
    expect(result.truncation.join(" ")).toMatch(/limit of 200.*were cut/s)
    respond = () =>
      streams(
        Array.from({ length: 100 }, (_, i): [string, string] => [
          `${1700000000000 + i}000000`,
          "y".repeat(1500),
        ])
      )
    const big = await tools.query(query(saved.id, { limit: 150 }))
    expect(JSON.stringify(big.lines).length).toBeLessThan(
      LOG_CAPS.resultBytes + 10_000
    )
    expect(big.lines.length).toBeLessThan(100)
    expect(big.truncation.join(" ")).toMatch(/size cap/)
    respond = () => streams([["1700000000000000000", "one line"]])
    expect((await tools.query(query(saved.id))).truncated).toBe(false)
  })
  it("times out, and keeps the auth header out of errors", async () => {
    const { saved, tools } = await attached()
    vi.spyOn(LOG_CAPS, "timeoutMs", "get").mockReturnValue(50)
    respond = () => ({ body: {}, delayMs: 400 })
    await expect(tools.query(query(saved.id))).rejects.toThrow(/in time/)
    vi.restoreAllMocks()
    for (const status of [400, 401, 404, 500]) {
      respond = (request) => ({
        status,
        body: `failed for ${request.headers.authorization}`,
      })
      const error = await tools.query(query(saved.id)).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(LogQueryError)
      expect((error as Error).message).not.toContain(SECRET)
    }
    respond = () => ({ body: "<html>login</html>" })
    await expect(tools.query(query(saved.id))).rejects.toThrow(/like Loki/)
  })
  it("refuses a Log Connection that is not attached to the Application, including after detach", async () => {
    const { app, saved, tools } = await attached()
    const other = application("Back Office")
    const otherTools = createLogTools(other.id, undefined, connections)
    await expect(otherTools.query(query(saved.id))).rejects.toThrow(
      /not available/
    )
    await expect(
      otherTools.labels({ logConnectionId: saved.id, label: null })
    ).rejects.toThrow(/not available/)
    await expect(tools.query(query("missing"))).rejects.toThrow(/not available/)
    await management.detach(admin, app.id, saved.id)
    await expect(tools.query(query(saved.id))).rejects.toThrow(/not available/)
    expect(seen).toEqual([])
  })
  it("gives the model descriptions and Tags, not the URL, secret or Base Selector, and the log privacy rule", async () => {
    const { app, saved } = await attached('{app="billing-svc"}')
    const instructions = supportInstructions(applications.scope(app.id)!)
    for (const value of [saved.name, saved.description, ...saved.tags])
      expect(instructions).toContain(value)
    for (const value of [baseUrl, SECRET, "tenant-a", "billing-svc"])
      expect(instructions).not.toContain(value)
    expect(instructions).toContain(
      "Never quote log lines, stack traces or service names"
    )
    expect(instructions).toContain("ask when the problem happened")
  })
})
