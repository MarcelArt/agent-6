import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import { requireAdmin } from "./session"
import { decrypt, encrypt } from "./secrets"
import { LogQueryError, countLogStreams, testLoki } from "./loki"
import { authHeader } from "./log-tools"
import { createLogConnectionsRepository } from "./repositories/log-connections"
import { createApplicationsRepository } from "./repositories/applications"
import type { Auth } from "./auth"
import type { LokiTarget } from "./loki"
import type { LogConnectionsRepository } from "./repositories/log-connections"
import type { ApplicationsRepository } from "./repositories/applications"
import type {
  LogConnectionField,
  LogConnectionInput,
} from "@/lib/log-connections"
import {
  LOG_AUTH_TYPES,
  SelectorError,
  formatSelector,
  needsSecretTest,
  parseSelector,
} from "@/lib/log-connections"
import { tidyTags } from "@/lib/repositories"

export class LogConnectionError extends Error {
  constructor(
    message: string,
    public readonly field?: LogConnectionField,
    /** For the API: 404 missing; 400 otherwise. */
    public readonly status = 400
  ) {
    super(message)
  }
}
/**
 * A base URL in the form it is stored and matched in. A Setup File's Log
 * Connections are matched on this form.
 */
export function canonicalLogBaseUrl(text: string): string {
  const baseUrl = text.trim()
  let url: URL | undefined
  try {
    url = new URL(baseUrl)
  } catch {
    // Reported below.
  }
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    baseUrl.length > 2000
  )
    throw new LogConnectionError(
      "Enter an http or https URL, for example http://loki:3100.",
      "baseUrl"
    )
  if (url.username || url.password || url.search || url.hash)
    throw new LogConnectionError(
      "Remove the credentials, query string and fragment from the URL. Put credentials in the auth header fields.",
      "baseUrl"
    )
  // Accept a pasted API URL; requests add this path themselves.
  return url.href.replace(/\/+$/, "").replace(/\/loki\/api\/v1$/, "")
}
/** The rules every saved Log Connection follows, also applied to imported ones. */
export function validLogConnectionInput(
  input: LogConnectionInput
): LogConnectionInput {
  const value = {
    ...input,
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim(),
    authUsername: input.authType === "basic" ? input.authUsername.trim() : "",
    authSecret: input.authType === "none" ? "" : input.authSecret,
    tenantId: input.tenantId.trim(),
    description: input.description.trim(),
    tags: tidyTags(input.tags),
  }
  if (!value.name || value.name.length > 255)
    throw new LogConnectionError(
      "Enter a name of up to 255 characters.",
      "name"
    )
  value.baseUrl = canonicalLogBaseUrl(value.baseUrl)
  if (!LOG_AUTH_TYPES.includes(value.authType))
    throw new LogConnectionError("Choose an auth header type.", "authType")
  if (
    value.authType === "basic" &&
    (!value.authUsername ||
      value.authUsername.length > 255 ||
      value.authUsername.includes(":"))
  )
    throw new LogConnectionError(
      "Enter a username of up to 255 characters without a colon.",
      "authUsername"
    )
  if (value.authSecret.length > 4096 || /[\0\r\n]/.test(value.authSecret))
    throw new LogConnectionError(
      "The password or token is invalid or too long.",
      "authSecret"
    )
  if (value.tenantId.length > 255 || /[\0\r\n]/.test(value.tenantId))
    throw new LogConnectionError(
      "Enter a tenant ID of up to 255 characters.",
      "tenantId"
    )
  if (value.description.length > 4000)
    throw new LogConnectionError(
      "Shorten the description to 4000 characters.",
      "description"
    )
  if (value.tags.length > 20 || value.tags.some((tag) => tag.length > 50))
    throw new LogConnectionError(
      "Use up to 20 Tags of at most 50 characters.",
      "tags"
    )
  return value
}
type LogConnectionDeps = {
  connections?: LogConnectionsRepository
  applications?: ApplicationsRepository
  test?: typeof testLoki
}

/**
 * The changes to Log Connections and their Attachments, shared by the Admin
 * screens and the API. Callers authorize first.
 */
export function createLogConnectionActions(deps: LogConnectionDeps = {}) {
  const connections = deps.connections ?? createLogConnectionsRepository()
  function existing(id: string) {
    const found = connections.findById(id)
    if (!found)
      throw new LogConnectionError(
        "This Log Connection no longer exists. Choose another connection.",
        undefined,
        404
      )
    return found
  }
  function application(applicationId: string) {
    if (
      !(deps.applications ?? createApplicationsRepository()).findById(
        applicationId
      )
    )
      throw new LogConnectionError(
        "This Application no longer exists.",
        undefined,
        404
      )
  }
  /** Where and how to reach Loki, or a refusal while it Needs Secret. */
  function target(id: string): LokiTarget {
    const saved = connections.credentials(id)!
    if (saved.authType !== "none" && saved.encryptedAuthSecret === null)
      throw new LogConnectionError(
        `Enter this connection's ${saved.authType === "basic" ? "password" : "token"} and save first. Agent 6 does not try to connect without it.`
      )
    try {
      return {
        baseUrl: saved.baseUrl,
        authHeader: authHeader(saved),
        tenantId: saved.tenantId,
      }
    } catch {
      throw new LogConnectionError(
        "The saved auth header could not be opened. Enter it again and save.",
        "authSecret"
      )
    }
  }
  function canonical(baseSelector: string) {
    try {
      return formatSelector(parseSelector(baseSelector))
    } catch (error) {
      if (!(error instanceof SelectorError)) throw error
      throw new LogConnectionError(error.message, "baseSelector")
    }
  }
  return {
    existing,
    application,
    target,
    canonical,
    /**
     * A blank secret keeps the saved one of the same auth type, as long as
     * the destination and account stay the same. Without one, the connection
     * is saved Needs Secret and not tested.
     */
    async save(input: LogConnectionInput, id?: string) {
      const before = id ? (existing(id), connections.credentials(id)!) : null
      const { authSecret, ...value } = validLogConnectionInput(input)
      let encryptedAuthSecret: string | null = null
      if (value.authType !== "none") {
        if (authSecret) encryptedAuthSecret = encrypt(authSecret)
        else if (before?.authType === value.authType) {
          if (
            before.encryptedAuthSecret !== null &&
            (before.baseUrl !== value.baseUrl ||
              before.tenantId !== value.tenantId ||
              before.authUsername !== value.authUsername)
          )
            throw new LogConnectionError(
              `Enter the ${value.authType === "basic" ? "password" : "token"} again. Changing the base URL, tenant ID or username needs fresh credentials.`,
              "authSecret"
            )
          encryptedAuthSecret = before.encryptedAuthSecret
        }
        if (encryptedAuthSecret)
          try {
            decrypt(encryptedAuthSecret)
          } catch {
            throw new LogConnectionError(
              "The saved auth header could not be opened. Enter it again and save.",
              "authSecret"
            )
          }
      }
      const saved = { ...value, encryptedAuthSecret }
      const test =
        value.authType !== "none" && !encryptedAuthSecret
          ? needsSecretTest(value.authType)
          : await (deps.test ?? testLoki)({
              baseUrl: saved.baseUrl,
              authHeader: authHeader(saved),
              tenantId: saved.tenantId,
            })
      return id
        ? connections.update(id, saved, test)
        : connections.create(saved, test)
    },
    async test(id: string) {
      existing(id)
      const test = await (deps.test ?? testLoki)(target(id))
      connections.recordTest(id, test)
      return test
    },
    remove(id: string) {
      existing(id)
      connections.delete(id)
    },
    /** Creates the Log Attachment, or changes its Base Selector. */
    attach(applicationId: string, id: string, baseSelector: string) {
      existing(id)
      application(applicationId)
      connections.attach(applicationId, id, canonical(baseSelector))
    },
    detach(applicationId: string, id: string) {
      connections.detach(applicationId, id)
    },
  }
}

export function createLogConnectionManagement(
  deps: LogConnectionDeps & { auth?: Auth } = {}
) {
  const auth = deps.auth ?? getAuth(),
    connections = deps.connections ?? createLogConnectionsRepository()
  const actions = createLogConnectionActions({ ...deps, connections })
  const admin = (headers: Headers) => requireAdmin({ auth, headers })
  return {
    async list(
      headers: Headers,
      options: { search?: string; page?: number } = {}
    ) {
      await admin(headers)
      return connections.list(options)
    },
    async get(headers: Headers, id: string) {
      await admin(headers)
      const found = connections.findById(id)
      return found
        ? { connection: found, applications: connections.applicationsOf(id) }
        : null
    },
    async save(headers: Headers, input: LogConnectionInput, id?: string) {
      await admin(headers)
      return actions.save(input, id)
    },
    async test(headers: Headers, id: string) {
      await admin(headers)
      return actions.test(id)
    },
    async remove(headers: Headers, id: string) {
      await admin(headers)
      actions.remove(id)
    },
    async available(
      headers: Headers,
      applicationId: string,
      options: { search?: string; page?: number }
    ) {
      await admin(headers)
      actions.application(applicationId)
      return connections.list({ ...options, availableFor: applicationId })
    },
    /** How many streams a candidate Base Selector matches right now. */
    async countStreams(headers: Headers, id: string, baseSelector: string) {
      await admin(headers)
      actions.existing(id)
      const selector = actions.canonical(baseSelector)
      try {
        return await countLogStreams(actions.target(id), selector)
      } catch (error) {
        if (!(error instanceof LogQueryError)) throw error
        throw new LogConnectionError(error.message)
      }
    },
    async attach(
      headers: Headers,
      applicationId: string,
      id: string,
      baseSelector: string
    ) {
      await admin(headers)
      actions.attach(applicationId, id, baseSelector)
    },
    async detach(headers: Headers, applicationId: string, id: string) {
      await admin(headers)
      actions.detach(applicationId, id)
    },
  }
}
