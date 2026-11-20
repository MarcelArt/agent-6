import "@tanstack/react-start/server-only"

import { ApiError, errorResponse, jsonResponse, unauthorized } from "./errors"
import { createApiAuthenticator } from "./auth"
import { createRateLimiter } from "./rate-limit"
import { API_ROUTES } from "./routes"
import { buildOpenApiDocument } from "./openapi"
import {
  ApplicationError,
  createApplicationActions,
} from "../application-management"
import {
  DatabaseConnectionError,
  createDatabaseConnectionActions,
} from "../database-connection-management"
import {
  LogConnectionError,
  createLogConnectionActions,
} from "../log-connection-management"
import {
  RepositoryError,
  createRepositoryActions,
} from "../repository-management"
import { createSettingsActions } from "../settings-management"
import { TicketError, createTicketDecisions } from "../ticket-management"
import { createApiReadsRepository } from "../repositories/api-reads"
import { createAuditRepository } from "../repositories/audit"
import { createServiceAccountsRepository } from "../repositories/service-accounts"
import type { ZodError } from "zod"
import type { ApiCaller } from "./auth"
import type { ApiReply, ApiRoute, ApiServices, AuditNote } from "./routes"
import type { AuditRepository } from "../repositories/audit"
import type { ServiceAccountsRepository } from "../repositories/service-accounts"
import type { ApiPermission } from "@/lib/service-accounts"

/** Bodies above this are refused before they are read. */
export const MAX_BODY_BYTES = 64 * 1024

/** Requests per API Key: a burst of `capacity`, then `perSecond`. */
export const KEY_RATE = { capacity: 120, perSecond: 2 }
/** Failed authentications per client address before answers become 429. */
export const AUTH_FAILURE_RATE = { capacity: 20, perSecond: 0.2 }

const PREFIX = "/api/v1"

type CompiledRoute = ApiRoute & { pattern: RegExp; names: Array<string> }

function compile(route: ApiRoute): CompiledRoute {
  const names: Array<string> = []
  const source = route.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    names.push(name)
    return "([^/]+)"
  })
  return { ...route, pattern: new RegExp(`^${source}$`), names }
}

const STATUS_CODES: Record<number, string> = {
  400: "validation_failed",
  404: "not_found",
  409: "conflict",
  502: "upstream_failed",
  503: "unavailable",
}

/** A refusal from shared domain logic, as the API's error. */
function fromDomain(error: unknown): ApiError | undefined {
  if (
    error instanceof RepositoryError ||
    error instanceof ApplicationError ||
    error instanceof DatabaseConnectionError ||
    error instanceof LogConnectionError ||
    error instanceof TicketError
  ) {
    const status = error.status
    if (status === 404)
      return new ApiError(
        404,
        "not_found",
        "No record with this ID exists within this API Key's Application scope."
      )
    return new ApiError(
      status,
      STATUS_CODES[status] ?? "validation_failed",
      error.message,
      error.field
    )
  }
  return undefined
}

function validationError(error: ZodError, place: "body" | "query"): ApiError {
  const issue = error.issues[0]
  if (issue.code === "unrecognized_keys") {
    const field = [...issue.path, issue.keys[0]].join(".")
    return new ApiError(
      400,
      "validation_failed",
      `${place === "query" ? "Query parameter" : "Field"} ${field} is not part of this endpoint. Check its spelling against /docs/api.`,
      field
    )
  }
  const field = issue.path.join(".")
  return new ApiError(
    400,
    "validation_failed",
    field
      ? `${place === "query" ? "Query parameter" : "Field"} ${field}: ${issue.message}`
      : `The ${place === "query" ? "query" : "request body"} is invalid: ${issue.message}`,
    field || undefined
  )
}

/** The body as text, or null when it is larger than allowed. */
async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export type ApiHandlerDeps = {
  services?: Partial<ApiServices>
  serviceAccounts?: ServiceAccountsRepository
  audit?: AuditRepository
  now?: () => Date
  /** Address for links in the OpenAPI document. */
  baseUrl?: string
  /** Tests check every successful answer against its documented schema. */
  checkResponses?: boolean
}

/**
 * Agent 6's API v1 as a fetch handler. API Keys are the only credentials;
 * cookies are ignored. Authorization runs before any domain action.
 */
export function createApiHandler(deps: ApiHandlerDeps = {}) {
  const now = () => deps.now?.() ?? new Date()
  const serviceAccounts =
    deps.serviceAccounts ?? createServiceAccountsRepository()
  const audit = deps.audit ?? createAuditRepository()
  const authenticate = createApiAuthenticator({ serviceAccounts, now })
  const services: ApiServices = {
    reads: deps.services?.reads ?? createApiReadsRepository(),
    repositories: deps.services?.repositories ?? createRepositoryActions(),
    applications: deps.services?.applications ?? createApplicationActions(),
    databaseConnections:
      deps.services?.databaseConnections ?? createDatabaseConnectionActions(),
    logConnections:
      deps.services?.logConnections ?? createLogConnectionActions(),
    settings: deps.services?.settings ?? createSettingsActions(),
    tickets: deps.services?.tickets ?? createTicketDecisions({ audit }),
  }
  const routes = API_ROUTES.map(compile)
  const keyLimiter = createRateLimiter({
    ...KEY_RATE,
    now: () => now().getTime(),
  })
  const failureLimiter = createRateLimiter({
    ...AUTH_FAILURE_RATE,
    now: () => now().getTime(),
  })
  let document: unknown

  async function dispatch(
    request: Request,
    caller: ApiCaller,
    path: string
  ): Promise<Response> {
    const method = request.method.toUpperCase()
    const candidates = routes
      .map((route) => ({ route, match: route.pattern.exec(path) }))
      .filter((item) => item.match)
    if (!candidates.length)
      throw new ApiError(404, "not_found", "No such endpoint. See /docs/api.")
    const found = candidates.find((item) => item.route.method === method)
    if (!found)
      throw new ApiError(
        405,
        "method_not_allowed",
        `Use ${candidates.map((item) => item.route.method).join(", ")} here.`,
        undefined,
        { allow: candidates.map((item) => item.route.method).join(", ") }
      )
    const { route, match } = found

    // Authorization comes before parsing and before any domain action.
    const needed =
      typeof route.permission === "string"
        ? [route.permission]
        : route.permission
    if (!needed.some((permission) => caller.permissions.has(permission)))
      throw new ApiError(
        403,
        "forbidden",
        `This API Key lacks the ${needed.join(" or ")} permission.`
      )
    if (route.allApplications && caller.scope !== "all")
      throw new ApiError(
        403,
        "forbidden",
        "Configuration changes need an API Key with access to All Applications."
      )

    const params: Record<string, string> = {}
    try {
      route.names.forEach((name, index) => {
        params[name] = decodeURIComponent(match![index + 1])
      })
    } catch {
      throw new ApiError(404, "not_found", "No such endpoint. See /docs/api.")
    }

    let query: unknown = {}
    if (route.query) {
      const url = new URL(request.url)
      const parsed = route.query.safeParse(Object.fromEntries(url.searchParams))
      if (!parsed.success) throw validationError(parsed.error, "query")
      query = parsed.data
    }

    let body: unknown = {}
    const text = await readBody(request)
    if (text === null)
      throw new ApiError(
        413,
        "payload_too_large",
        `Send a body of at most ${MAX_BODY_BYTES / 1024} KB.`
      )
    if (route.body) {
      if (text.trim()) {
        if (
          !/^application\/json\b/i.test(
            request.headers.get("content-type") ?? ""
          )
        )
          throw new ApiError(
            415,
            "unsupported_media_type",
            "Send the body as JSON with Content-Type: application/json."
          )
        try {
          body = JSON.parse(text)
        } catch {
          throw new ApiError(
            400,
            "invalid_json",
            "The request body is not valid JSON."
          )
        }
      }
      const parsed = route.body.safeParse(body)
      if (!parsed.success) throw validationError(parsed.error, "body")
      body = parsed.data
    } else if (text.trim())
      throw new ApiError(
        400,
        "validation_failed",
        "This endpoint takes no request body."
      )

    const notes: Array<AuditNote> = []
    const can = (permission: ApiPermission) =>
      caller.permissions.has(permission)
    let reply: ApiReply
    try {
      reply = await route.handle({
        caller,
        params,
        query,
        body,
        services,
        can,
        require: (permission) => {
          if (!can(permission))
            throw new ApiError(
              403,
              "forbidden",
              `This API Key lacks the ${permission} permission.`
            )
        },
        audit: (note) => notes.push(note),
      })
    } catch (error) {
      throw fromDomain(error) ?? error
    }
    for (const note of notes) audit.record(caller.actor, note, now())

    if (deps.checkResponses) {
      const documented = route.success.find(
        (item) => item.status === reply.status
      )
      if (!documented)
        throw new Error(
          `${route.operationId} answered an undocumented ${reply.status}`
        )
      if ("schema" in documented && "body" in reply)
        documented.schema.parse(reply.body)
    }
    if (reply.status === 204)
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      })
    if (reply.status === 201)
      return jsonResponse(201, reply.body, { location: reply.location })
    return jsonResponse(200, reply.body)
  }

  return async function handle(
    request: Request,
    options: { clientAddress?: string } = {}
  ): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(PREFIX))
      return errorResponse(new ApiError(404, "not_found", "No such endpoint."))
    const path = url.pathname.slice(PREFIX.length).replace(/\/+$/, "") || "/"
    try {
      if (path === "/openapi.json" && request.method === "GET") {
        document ??= buildOpenApiDocument(API_ROUTES, {
          baseUrl: deps.baseUrl ?? url.origin,
        })
        return jsonResponse(200, document, {
          "cache-control": "public, max-age=300",
        })
      }
      const caller = authenticate(request.headers.get("authorization"))
      if (!caller) {
        const limited = failureLimiter.take(options.clientAddress ?? "unknown")
        if (!limited.ok)
          throw new ApiError(
            429,
            "rate_limited",
            "Too many failed authentications. Wait, then try again with a valid API Key.",
            undefined,
            { "retry-after": String(limited.retryAfter) }
          )
        throw unauthorized()
      }
      const limited = keyLimiter.take(caller.apiKeyId)
      if (!limited.ok)
        throw new ApiError(
          429,
          "rate_limited",
          `Too many requests for this API Key. Wait ${limited.retryAfter} s, then try again.`,
          undefined,
          { "retry-after": String(limited.retryAfter) }
        )
      return await dispatch(request, caller, path)
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error)
      // Never log request bodies or key material; the error's own text only.
      console.error(
        `API ${request.method} ${path} failed:`,
        error instanceof Error ? error.message : "unknown error"
      )
      return errorResponse(
        new ApiError(
          500,
          "internal_error",
          "Agent 6 could not finish this request. Try again later."
        )
      )
    }
  }
}
export type ApiHandler = ReturnType<typeof createApiHandler>

let handler: ApiHandler | undefined
/** The API handler of this process. */
export function handleApiRequest(request: Request, clientAddress?: string) {
  handler ??= createApiHandler()
  return handler(request, { clientAddress })
}
