import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import { requireAdmin } from "./session"
import { decrypt, encrypt } from "./secrets"
import { testPostgres } from "./postgres"
import { createDatabaseConnectionsRepository } from "./repositories/database-connections"
import { createApplicationsRepository } from "./repositories/applications"
import type { Auth } from "./auth"
import type { DatabaseConnectionsRepository } from "./repositories/database-connections"
import type { ApplicationsRepository } from "./repositories/applications"
import type { DatabaseConnectionInput } from "@/lib/database-connections"
import { NEEDS_PASSWORD_TEST, SSL_MODES } from "@/lib/database-connections"
import { tidyTags } from "@/lib/repositories"

export class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    public readonly field?: keyof DatabaseConnectionInput
  ) {
    super(message)
  }
}
/** The rules every saved Database Connection follows, also applied to imported ones. */
export function validDatabaseConnectionInput(
  input: DatabaseConnectionInput
): DatabaseConnectionInput {
  const value = {
    ...input,
    name: input.name.trim(),
    host: input.host.trim(),
    database: input.database.trim(),
    user: input.user.trim(),
    description: input.description.trim(),
    tags: tidyTags(input.tags),
  }
  for (const field of ["name", "host", "database", "user"] as const) {
    if (
      !value[field] ||
      value[field].length > 255 ||
      value[field].includes("\0")
    )
      throw new DatabaseConnectionError(
        `Enter a ${field} of up to 255 characters.`,
        field
      )
  }
  if (value.host.startsWith("/") || /[\s/]/.test(value.host))
    throw new DatabaseConnectionError("Enter a hostname or IP address.", "host")
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535)
    throw new DatabaseConnectionError("Enter a port from 1 to 65535.", "port")
  if (!SSL_MODES.includes(value.sslMode))
    throw new DatabaseConnectionError("Choose an SSL mode.", "sslMode")
  if (value.password.length > 4096 || value.password.includes("\0"))
    throw new DatabaseConnectionError(
      "The password is invalid or too long.",
      "password"
    )
  if (value.description.length > 4000)
    throw new DatabaseConnectionError(
      "Shorten the description to 4000 characters.",
      "description"
    )
  if (value.tags.length > 20 || value.tags.some((tag) => tag.length > 50))
    throw new DatabaseConnectionError(
      "Use up to 20 Tags of at most 50 characters.",
      "tags"
    )
  return value
}
export function createDatabaseConnectionManagement(
  deps: {
    auth?: Auth
    connections?: DatabaseConnectionsRepository
    applications?: ApplicationsRepository
    test?: typeof testPostgres
  } = {}
) {
  const auth = deps.auth ?? getAuth(),
    connections = deps.connections ?? createDatabaseConnectionsRepository()
  const admin = (headers: Headers) => requireAdmin({ auth, headers })
  function existing(id: string) {
    const found = connections.findById(id)
    if (!found)
      throw new DatabaseConnectionError(
        "This Database Connection no longer exists. Choose another connection."
      )
    return found
  }
  async function probe(input: Parameters<typeof testPostgres>[0]) {
    try {
      return await (deps.test ?? testPostgres)(input)
    } catch {
      return {
        ok: false,
        writable: null,
        message:
          "The connection could not be tested. Check its settings and try again.",
      }
    }
  }
  /** The saved settings and password, or a refusal while it Needs Secret. */
  function credentials(id: string) {
    const saved = connections.credentials(id)!
    if (saved.encryptedPassword === null)
      throw new DatabaseConnectionError(
        "Enter this connection's password and save first. Agent 6 does not try to connect without it."
      )
    try {
      return {
        ...saved,
        sslMode: saved.sslMode as DatabaseConnectionInput["sslMode"],
        password: decrypt(saved.encryptedPassword),
      }
    } catch {
      throw new DatabaseConnectionError(
        "The saved password could not be opened. Enter it again and save.",
        "password"
      )
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
    /**
     * A blank password keeps the saved one, and keeps a Needs Secret
     * connection Needs Secret without testing it. A new connection's blank
     * password is an empty password.
     */
    async save(headers: Headers, input: DatabaseConnectionInput, id?: string) {
      await admin(headers)
      if (id) existing(id)
      const value = validDatabaseConnectionInput(input)
      const password =
        value.password ||
        (!id
          ? ""
          : connections.credentials(id)!.encryptedPassword === null
            ? null
            : credentials(id).password)
      const test =
        password === null
          ? NEEDS_PASSWORD_TEST
          : await probe({ ...value, password })
      const { password: _password, ...publicValues } = value
      const saved = {
        ...publicValues,
        encryptedPassword: password === null ? null : encrypt(password),
      }
      return id
        ? connections.update(id, saved, test)
        : connections.create(saved, test)
    },
    async test(headers: Headers, id: string) {
      await admin(headers)
      existing(id)
      const test = await probe(credentials(id))
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
      if (
        !(deps.applications ?? createApplicationsRepository()).findById(
          applicationId
        )
      )
        throw new DatabaseConnectionError("This Application no longer exists.")
      return connections.list({ ...options, availableFor: applicationId })
    },
    async attach(headers: Headers, applicationId: string, id: string) {
      await admin(headers)
      existing(id)
      if (
        !(deps.applications ?? createApplicationsRepository()).findById(
          applicationId
        )
      )
        throw new DatabaseConnectionError("This Application no longer exists.")
      connections.attach(applicationId, id)
    },
    async detach(headers: Headers, applicationId: string, id: string) {
      await admin(headers)
      connections.detach(applicationId, id)
    },
  }
}
