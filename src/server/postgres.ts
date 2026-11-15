import "@tanstack/react-start/server-only"

import { Client } from "pg"
import type { ClientConfig, QueryConfig } from "pg"
import type {
  ConnectionTest,
  DatabaseConnectionInput,
} from "@/lib/database-connections"

export const DATABASE_CAPS = {
  rows: 200,
  resultBytes: 48_000,
  sqlBytes: 24_000,
  statementMs: 3000,
  lockMs: 500,
  connectionMs: 3000,
  totalMs: 8000,
}
export type PostgresCredentials = Pick<
  DatabaseConnectionInput,
  "host" | "port" | "database" | "user" | "password" | "sslMode"
>
export class DatabaseQueryError extends Error {}

/** Deliberately map codes to fixed messages: PG errors may echo SQL and secrets. */
function safeError(error: unknown): DatabaseQueryError {
  const code = (error as { code?: string } | null)?.code
  const message =
    code === "57014"
      ? "The database query exceeded its time limit. Try a narrower query."
      : code === "55P03"
        ? "The database is busy. Try again shortly."
        : code === "25006"
          ? "Only read-only queries are allowed."
          : code === "42601"
            ? "Use one read-only SELECT statement per call. Multiple statements are refused."
            : code === "28P01" || code === "28000"
              ? "Authentication failed. Ask an Admin to check the saved credentials."
              : code === "3D000"
                ? "The database could not be opened. Ask an Admin to check the database name."
                : code === "42501"
                  ? "This database role does not have permission to read the requested data."
                  : "The database query could not be completed. Check the query or ask an Admin to test the connection."
  return new DatabaseQueryError(message)
}
function config(credentials: PostgresCredentials): ClientConfig {
  return {
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    user: credentials.user,
    password: credentials.password,
    ssl:
      credentials.sslMode === "disable"
        ? false
        : { rejectUnauthorized: credentials.sslMode === "verify-full" },
    application_name: "agent6-read-only",
    connectionTimeoutMillis: DATABASE_CAPS.connectionMs,
    statement_timeout: DATABASE_CAPS.statementMs,
    lock_timeout: DATABASE_CAPS.lockMs,
    query_timeout: DATABASE_CAPS.totalMs,
  }
}

async function readOnly<T>(
  credentials: PostgresCredentials,
  signal: AbortSignal | undefined,
  read: (client: Client) => Promise<T>
): Promise<T> {
  signal?.throwIfAborted()
  const client = new Client(config(credentials))
  // Socket errors are also handled by pending queries. Never emit raw errors.
  client.on("error", () => {})
  const deadline = { expired: false }
  const close = () => {
    void client.end().catch(() => {})
  }
  const timer = setTimeout(() => {
    deadline.expired = true
    close()
  }, DATABASE_CAPS.totalMs)
  signal?.addEventListener("abort", close, { once: true })
  try {
    await client.connect()
    signal?.throwIfAborted()
    await client.query("BEGIN READ ONLY")
    await client.query(
      `SET LOCAL statement_timeout = ${DATABASE_CAPS.statementMs}`
    )
    await client.query(`SET LOCAL lock_timeout = ${DATABASE_CAPS.lockMs}`)
    await client.query(
      `SET LOCAL idle_in_transaction_session_timeout = ${DATABASE_CAPS.totalMs}`
    )
    // Acquire a snapshot before running untrusted SQL, preventing a function
    // from changing transaction_read_only back to off, even as a superuser.
    await client.query("SELECT 1")
    return await read(client)
  } catch (error) {
    signal?.throwIfAborted()
    if (deadline.expired)
      throw new DatabaseQueryError(
        "The database query exceeded its time limit. Try a narrower query."
      )
    if (error instanceof DatabaseQueryError) throw error
    throw safeError(error)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", close)
    // Also attempted after an error. A lost connection rolls back on the server.
    try {
      await client.query("ROLLBACK")
    } catch {
      /* socket already closed */
    }
    await client.end().catch(() => {})
  }
}

export async function testPostgres(
  credentials: PostgresCredentials
): Promise<ConnectionTest> {
  try {
    const writable = await readOnly(credentials, undefined, async (client) => {
      const result = await client.query<{ writable: boolean }>(`SELECT (
        (SELECT rolsuper OR rolcreatedb FROM pg_roles WHERE rolname = current_user)
        OR has_database_privilege(current_database(), 'CREATE')
        OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' AND has_schema_privilege(oid, 'CREATE'))
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f')
          AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') ELSE false END)
        OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind = 'S' AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege(c.oid, 'UPDATE') ELSE false END)
      ) AS writable`)
      return result.rows[0].writable
    })
    return { ok: true, message: "Connection successful.", writable }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DatabaseQueryError
          ? error.message
          : "The connection could not be tested.",
      writable: null,
    }
  }
}

export type DatabaseQueryResult = {
  columns: Array<string>
  rows: Array<Array<string | null>>
  truncated: boolean
}
export async function queryPostgres(
  credentials: PostgresCredentials,
  sql: string,
  signal?: AbortSignal
): Promise<DatabaseQueryResult> {
  if (!sql.trim() || Buffer.byteLength(sql) > DATABASE_CAPS.sqlBytes)
    throw new DatabaseQueryError("Supply one read-only query of at most 24 KB.")
  return readOnly(credentials, signal, async (client) => {
    // DECLARE accepts a SELECT/VALUES query, not transaction/session commands.
    // Extended protocol makes PostgreSQL itself refuse multiple statements.
    // No SQL write-detection parser: READ ONLY is the write barrier.
    const statement: QueryConfig & { queryMode: "extended" } = {
      text: `DECLARE agent6_result NO SCROLL CURSOR FOR ${sql}`,
      queryMode: "extended",
    }
    await client.query(statement)
    const result: DatabaseQueryResult = {
      columns: [],
      rows: [],
      truncated: false,
    }
    let first = true
    const redact = (value: string) => {
      for (const secret of [
        credentials.password,
        credentials.host,
        credentials.database,
        credentials.user,
      ])
        if (secret) value = value.split(secret).join("[redacted]")
      return value
    }
    for (;;) {
      signal?.throwIfAborted()
      // One row at a time: never accumulate the full table in the driver.
      const batch = await client.query<Array<string | null>>({
        text: "FETCH FORWARD 1 FROM agent6_result",
        rowMode: "array",
        types: { getTypeParser: () => (value: string) => value },
      })
      if (first) {
        result.columns = batch.fields.map((field) => redact(field.name))
        first = false
        if (
          Buffer.byteLength(JSON.stringify(result)) > DATABASE_CAPS.resultBytes
        ) {
          return { columns: [], rows: [], truncated: true }
        }
      }
      if (!batch.rows.length) break
      if (result.rows.length >= DATABASE_CAPS.rows) {
        result.truncated = true
        break
      }
      const row = batch.rows[0].map((value, i) =>
        /password|passwd|secret|token|credential|api.?key/i.test(
          batch.fields[i].name
        )
          ? "[redacted]"
          : value === null
            ? null
            : redact(value)
      )
      result.rows.push(row)
      if (
        Buffer.byteLength(JSON.stringify(result)) > DATABASE_CAPS.resultBytes
      ) {
        result.rows.pop()
        result.truncated = true
        break
      }
    }
    return result
  })
}

export const DATABASE_SCHEMA_QUERY = `SELECT t.table_schema, t.table_name, t.table_type,
 c.column_name, c.data_type, c.is_nullable
 FROM information_schema.tables t JOIN information_schema.columns c
 ON c.table_schema = t.table_schema AND c.table_name = t.table_name
 WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
 ORDER BY t.table_schema, t.table_name, c.ordinal_position`
