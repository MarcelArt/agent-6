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
  parseSelector,
} from "@/lib/log-connections"
import { tidyTags } from "@/lib/repositories"

export class LogConnectionError extends Error {
  constructor(
    message: string,
    public readonly field?: LogConnectionField
  ) {
    super(message)
  }
}
function validInput(input: LogConnectionInput): LogConnectionInput {
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
  let url: URL | undefined
  try {
    url = new URL(value.baseUrl)
  } catch {
    // Reported below.
  }
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    value.baseUrl.length > 2000
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
  value.baseUrl = url.href.replace(/\/+$/, "").replace(/\/loki\/api\/v1$/, "")
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
export function createLogConnectionManagement(
  deps: {
    auth?: Auth
    connections?: LogConnectionsRepository
    applications?: ApplicationsRepository
  } = {}
) {
  const auth = deps.auth ?? getAuth(),
    connections = deps.connections ?? createLogConnectionsRepository()
  const admin = (headers: Headers) => requireAdmin({ auth, headers })
  function existing(id: string) {
    const found = connections.findById(id)
    if (!found)
      throw new LogConnectionError(
        "This Log Connection no longer exists. Choose another connection."
      )
    return found
  }
  function application(applicationId: string) {
    if (
      !(deps.applications ?? createApplicationsRepository()).findById(
        applicationId
      )
    )
      throw new LogConnectionError("This Application no longer exists.")
  }
  function target(id: string): LokiTarget {
    const saved = connections.credentials(id)!
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
      const before = id ? (existing(id), connections.credentials(id)!) : null
      const { authSecret, ...value } = validInput(input)
      let encryptedAuthSecret: string | null = null
      if (value.authType !== "none") {
        if (authSecret) encryptedAuthSecret = encrypt(authSecret)
        else if (before?.authType === value.authType)
          encryptedAuthSecret = before.encryptedAuthSecret
        if (!encryptedAuthSecret)
          throw new LogConnectionError(
            value.authType === "basic"
              ? "Enter the password."
              : "Enter the token.",
            "authSecret"
          )
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
      const test = await testLoki({
        baseUrl: saved.baseUrl,
        authHeader: authHeader(saved),
        tenantId: saved.tenantId,
      })
      return id
        ? connections.update(id, saved, test)
        : connections.create(saved, test)
    },
    async test(headers: Headers, id: string) {
      await admin(headers)
      existing(id)
      const test = await testLoki(target(id))
      connections.recordTest(id, test)
      return test
    },
    async remove(headers: Headers, id: string) {
      await admin(headers)
      existing(id)
      connections.delete(id)
    },
    async available(
      headers: Headers,
      applicationId: string,
      options: { search?: string; page?: number }
    ) {
      await admin(headers)
      application(applicationId)
      return connections.list({ ...options, availableFor: applicationId })
    },
    /** How many streams a candidate Base Selector matches right now. */
    async countStreams(headers: Headers, id: string, baseSelector: string) {
      await admin(headers)
      existing(id)
      const selector = canonical(baseSelector)
      try {
        return await countLogStreams(target(id), selector)
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
      existing(id)
      application(applicationId)
      connections.attach(applicationId, id, canonical(baseSelector))
    },
    async detach(headers: Headers, applicationId: string, id: string) {
      await admin(headers)
      connections.detach(applicationId, id)
    },
  }
}
