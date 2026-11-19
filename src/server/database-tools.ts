import "@tanstack/react-start/server-only"

import { decrypt } from "./secrets"
import { createDatabaseConnectionsRepository } from "./repositories/database-connections"
import {
  DATABASE_SCHEMA_QUERY,
  DatabaseQueryError,
  queryPostgres,
} from "./postgres"
import type { DatabaseConnectionsRepository } from "./repositories/database-connections"

/** Check the live Attachment on every invocation, including after a detach. */
export function createDatabaseTools(
  applicationId: string,
  signal?: AbortSignal,
  connections?: DatabaseConnectionsRepository
) {
  async function query(input: { databaseConnectionId: string; sql: string }) {
    signal?.throwIfAborted()
    const available = connections ?? createDatabaseConnectionsRepository()
    if (!available.isAttached(applicationId, input.databaseConnectionId))
      throw new DatabaseQueryError(
        "That Database Connection is not available in this Application."
      )
    const saved = available.credentials(input.databaseConnectionId)
    // A Needs Secret connection is out of scope, like a detached one.
    if (!saved || saved.encryptedPassword === null)
      throw new DatabaseQueryError(
        "That Database Connection is not available in this Application."
      )
    const encryptedPassword = saved.encryptedPassword
    try {
      return await queryPostgres(
        {
          ...saved,
          sslMode: saved.sslMode as "disable" | "require" | "verify-full",
          password: decrypt(encryptedPassword),
        },
        input.sql,
        signal
      )
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof DatabaseQueryError) throw error
      throw new DatabaseQueryError(
        "This Database Connection is unavailable. Ask an Admin to test it."
      )
    }
  }
  return {
    query,
    listTables: (input: { databaseConnectionId: string }) =>
      query({ ...input, sql: DATABASE_SCHEMA_QUERY }),
  }
}
