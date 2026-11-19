import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { afterEach, expect, it } from "vitest"
import { openDb } from "./db"

let directory: string
afterEach(() => rmSync(directory, { recursive: true, force: true }))

/** The migrations folder as it was before `tag`, the first left out. */
function migrationsBefore(tag: string) {
  const folder = join(directory, "drizzle")
  mkdirSync(join(folder, "meta"), { recursive: true })
  cpSync(resolve("drizzle"), folder, { recursive: true })
  const journal = JSON.parse(
    readFileSync(join(folder, "meta", "_journal.json"), "utf8")
  ) as { entries: Array<{ tag: string }> }
  const at = journal.entries.findIndex((entry) => entry.tag.startsWith(tag))
  expect(at).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, at)
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify(journal))
  return folder
}

it("keeps the rows that point at a table a migration rebuilds", () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-migrations-"))
  const file = join(directory, "agent6.db")
  // A database from before Database Connection passwords became nullable.
  const sqlite = new Database(file)
  sqlite.pragma("foreign_keys = ON")
  migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore("0013") })
  sqlite.exec(`
    insert into application (id, name, created_at, updated_at) values ('a', 'Billing', 0, 0);
    insert into database_connection (id, name, host, port, database, user, encrypted_password, ssl_mode, test_ok, test_message, created_at, updated_at)
      values ('c', 'Billing production', 'db', 5432, 'billing', 'reader', 'v1:x', 'require', 1, 'ok', 0, 0);
    insert into database_connection_attachment (application_id, database_connection_id) values ('a', 'c');
  `)
  sqlite.close()

  const db = openDb(file)
  expect(
    db.$client.prepare("select * from database_connection_attachment").all()
  ).toEqual([{ application_id: "a", database_connection_id: "c" }])
  expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1)
  // Needs Secret is now possible.
  db.$client
    .prepare("update database_connection set encrypted_password = null")
    .run()
  db.$client.close()
})
