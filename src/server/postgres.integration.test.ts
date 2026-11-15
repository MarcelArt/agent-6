import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  DATABASE_CAPS,
  DATABASE_SCHEMA_QUERY,
  DatabaseQueryError,
  queryPostgres,
  testPostgres,
} from "./postgres"
import type { PostgresCredentials } from "./postgres"

const exec = promisify(execFile)
const enabled = process.env.RUN_POSTGRES_TESTS === "1"

describe.skipIf(!enabled)(
  "Postgres read-only enforcement (isolated Docker container)",
  () => {
    const name = `agent6-postgres-test-${process.pid}`
    let started = false
    let admin: Client | undefined
    let credentials: PostgresCredentials
    beforeAll(async () => {
      await exec("docker", [
        "run",
        "--rm",
        "-d",
        "--name",
        name,
        "-e",
        "POSTGRES_PASSWORD=acceptance-password",
        "-e",
        "POSTGRES_DB=support_data",
        "-p",
        "127.0.0.1::5432",
        "postgres:17",
      ])
      started = true
      const { stdout } = await exec("docker", ["port", name, "5432/tcp"])
      const port = Number(stdout.trim().split(":").at(-1))
      credentials = {
        host: "127.0.0.1",
        port,
        database: "support_data",
        user: "postgres",
        password: "acceptance-password",
        sslMode: "disable",
      }
      for (let attempt = 0; attempt < 100; attempt++) {
        admin = new Client({ ...credentials, connectionTimeoutMillis: 1000 })
        try {
          await admin.connect()
          break
        } catch (error) {
          await admin.end()
          if (attempt === 99) throw error
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
      await admin!
        .query(`CREATE TABLE orders (id int primary key, status text, reason text);
      INSERT INTO orders VALUES (1, 'pending', 'Payment is awaiting confirmation');
      CREATE VIEW pending_orders AS SELECT * FROM orders WHERE status = 'pending';
      CREATE FUNCTION change_order() RETURNS int LANGUAGE plpgsql AS $$ BEGIN UPDATE orders SET status = 'changed'; RETURN 1; END $$;
      CREATE FUNCTION escape_read_only() RETURNS int LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('transaction_read_only', 'off', true); UPDATE orders SET status = 'changed'; RETURN 1; END $$;
      CREATE ROLE reader LOGIN PASSWORD 'reader-password';
      GRANT CONNECT ON DATABASE support_data TO reader;
      GRANT USAGE ON SCHEMA public TO reader;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;`)
    }, 30_000)
    afterAll(async () => {
      await admin?.end()
      if (started) await exec("docker", ["rm", "-f", name])
    })
    const writes = [
      "INSERT INTO orders VALUES (2, 'changed', '')",
      "UPDATE orders SET status = 'changed'",
      "DELETE FROM orders",
      "DROP TABLE orders",
      "CREATE TABLE unwanted (id int)",
      "WITH changed AS (UPDATE orders SET status = 'changed' RETURNING *) SELECT * FROM changed",
      "SELECT change_order()",
      "SELECT escape_read_only()",
      "SELECT set_config('transaction_read_only', 'off', true)",
      "SET TRANSACTION READ WRITE",
      "COMMIT",
      "SELECT 1; DELETE FROM orders",
      "SELECT 1; COMMIT; DELETE FROM orders",
    ]
    it.each(writes)(
      "refuses %s, even as superuser, without changing data",
      async (sql) => {
        await expect(queryPostgres(credentials, sql)).rejects.toBeInstanceOf(
          DatabaseQueryError
        )
        expect((await admin!.query("SELECT * FROM orders")).rows).toEqual([
          {
            id: 1,
            status: "pending",
            reason: "Payment is awaiting confirmation",
          },
        ])
        expect(
          (await admin!.query("SELECT to_regclass('unwanted') AS table_name"))
            .rows[0].table_name
        ).toBeNull()
      }
    )
    it("uses Postgres statement handling, allowing semicolons inside literals and comments", async () => {
      const result = await queryPostgres(
        credentials,
        "SELECT '; DELETE FROM orders' AS example /* ; */;"
      )
      expect(result.rows).toEqual([["; DELETE FROM orders"]])
    })
    it("lists tables, views and columns and reads useful data", async () => {
      const schema = await queryPostgres(credentials, DATABASE_SCHEMA_QUERY)
      expect(JSON.stringify(schema)).toContain("pending_orders")
      expect(JSON.stringify(schema)).toContain("reason")
      expect(
        (
          await queryPostgres(
            credentials,
            "SELECT reason FROM orders WHERE id = 1"
          )
        ).rows
      ).toEqual([["Payment is awaiting confirmation"]])
    })
    it("stops a slow query and closes its connection", async () => {
      const start = Date.now()
      await expect(
        queryPostgres(credentials, "SELECT pg_sleep(10)")
      ).rejects.toThrow(/time limit/)
      expect(Date.now() - start).toBeLessThan(DATABASE_CAPS.totalMs)
      expect((await queryPostgres(credentials, "SELECT 1")).rows).toEqual([
        ["1"],
      ])
    }, 12_000)
    it("stops waiting for a locked table", async () => {
      await admin!.query("BEGIN")
      try {
        await admin!.query("LOCK TABLE orders IN ACCESS EXCLUSIVE MODE")
        const start = Date.now()
        await expect(
          queryPostgres(credentials, "SELECT * FROM orders")
        ).rejects.toThrow(/busy/)
        expect(Date.now() - start).toBeLessThan(DATABASE_CAPS.statementMs)
      } finally {
        await admin!.query("ROLLBACK")
      }
    })
    it("caps rows and total output, marking truncation accurately", async () => {
      const large = await queryPostgres(
        credentials,
        "SELECT generate_series(1, 1000) AS number"
      )
      expect(large.rows).toHaveLength(DATABASE_CAPS.rows)
      expect(large.truncated).toBe(true)
      const exact = await queryPostgres(
        credentials,
        `SELECT generate_series(1, ${DATABASE_CAPS.rows}) AS number`
      )
      expect(exact.truncated).toBe(false)
      const wide = await queryPostgres(
        credentials,
        "SELECT repeat('x', 20000) FROM generate_series(1, 100)"
      )
      expect(wide.truncated).toBe(true)
      expect(wide.rows).toHaveLength(2)
      expect(Buffer.byteLength(JSON.stringify(wide))).toBeLessThanOrEqual(
        DATABASE_CAPS.resultBytes
      )
      expect(
        (await queryPostgres(credentials, "SELECT repeat('x', 100000)")).rows
      ).toEqual([])
    })
    it("warns on writable roles and not on read-only roles", async () => {
      expect(await testPostgres(credentials)).toMatchObject({
        ok: true,
        writable: true,
      })
      const reader = {
        ...credentials,
        user: "reader",
        password: "reader-password",
      }
      expect(await testPostgres(reader)).toMatchObject({
        ok: true,
        writable: false,
      })
      expect(
        (await queryPostgres(reader, "SELECT status FROM orders")).rows
      ).toEqual([["pending"]])
      await admin!.query("GRANT CREATE ON SCHEMA public TO reader")
      expect(await testPostgres(reader)).toMatchObject({
        ok: true,
        writable: true,
      })
      await admin!.query("REVOKE CREATE ON SCHEMA public FROM reader")
      await admin!.query("GRANT UPDATE ON orders TO reader")
      expect(await testPostgres(reader)).toMatchObject({
        ok: true,
        writable: true,
      })
      await admin!.query("REVOKE UPDATE ON orders FROM reader")
    })
    it("redacts connection values, data secrets and errors", async () => {
      const result = await queryPostgres(
        credentials,
        "SELECT current_database(), current_user, inet_server_addr(), 'hidden' AS api_token"
      )
      const text = JSON.stringify(result)
      for (const secret of [
        credentials.host,
        credentials.database,
        credentials.user,
        credentials.password,
      ])
        expect(text).not.toContain(secret)
      expect(text).not.toContain("hidden")
      await expect(
        queryPostgres(credentials, "SELECT missing_secret FROM orders")
      ).rejects.not.toThrow(
        /missing_secret|support_data|127\.0\.0\.1|acceptance-password/
      )
      const failed = await testPostgres({
        ...credentials,
        password: "not-the-password",
      })
      expect(failed.ok).toBe(false)
      expect(JSON.stringify(failed)).not.toMatch(
        /postgres|support_data|not-the-password/i
      )
    })
    it("closes active queries on cancellation and leaves no sessions open after failures", async () => {
      const abort = new AbortController()
      const query = queryPostgres(
        credentials,
        "SELECT pg_sleep(10)",
        abort.signal
      )
      setTimeout(() => abort.abort(), 100)
      await expect(query).rejects.toThrow()
      // Postgres observes a closed socket at an interrupt check, bounded by
      // statement_timeout; no client connection or pool survives cancellation.
      await expect
        .poll(
          async () => {
            const result = await admin!.query(
              "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'agent6-read-only'"
            )
            return result.rows[0].count
          },
          { timeout: DATABASE_CAPS.statementMs + 2000 }
        )
        .toBe(0)
    })
  }
)
