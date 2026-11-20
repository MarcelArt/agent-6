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

it("keeps pending and decided Tickets through the integration migration", () => {
  directory = mkdtempSync(join(tmpdir(), "agent6-migrations-"))
  const file = join(directory, "agent6.db")
  // A database from before Service Accounts and webhooks.
  const sqlite = new Database(file)
  sqlite.pragma("foreign_keys = ON")
  migrate(drizzle(sqlite), { migrationsFolder: migrationsBefore("0014") })
  sqlite.exec(`
    insert into user (id, name, email, email_verified, created_at, updated_at, role) values ('u', 'Admin', 'a@example.com', 1, 0, 0, 'admin');
    insert into application (id, name, created_at, updated_at) values ('a', 'Billing', 0, 0);
    insert into repository (id, full_name, tracked_branch, created_at, updated_at) values ('r', 'halden/billing', 'main', 0, 0);
    insert into conversation (id, user_id, application_id, title, created_at, updated_at) values ('c', 'u', 'a', 'Invoice', 0, 0);
    insert into filed_issue (id, conversation_id, message_id, repository, kind, title, outcome, issue_number, url, created_at)
      values ('f', 'c', 'm', 'halden/billing', 'code-fix', 'Fails', 'new', 4, 'https://github.com/halden/billing/issues/4', 0);
    insert into ticket (id, conversation_id, message_id, repository_id, repository, kind, title, body, summary, status, created_at, updated_at)
      values ('pending', 'c', 'm', 'r', 'halden/billing', 'code-fix', 'Fails', 'Body', 'Summary', 'pending', 0, 0);
    insert into ticket (id, conversation_id, message_id, repository_id, repository, kind, title, body, summary, status, decided_by, decided_at, filed_issue_id, created_at, updated_at)
      values ('accepted', 'c', 'm', 'r', 'halden/billing', 'code-fix', 'Fails', 'Body', 'Summary', 'accepted', 'u', 1, 'f', 0, 0);
    insert into ticket (id, conversation_id, message_id, repository_id, repository, kind, title, body, summary, status, decline_reason, decided_by, decided_at, created_at, updated_at)
      values ('declined', 'c', 'm', 'r', 'halden/billing', 'data-fix', 'Wrong', 'Body', 'Summary', 'declined', 'Works as intended', 'u', 2, 0, 0);
  `)
  sqlite.close()

  const db = openDb(file)
  expect(
    db.$client
      .prepare(
        "select id, status, decided_by, decline_reason, filed_issue_id, decided_by_service_account_id, decided_by_api_key_id, filing_claim from ticket order by id"
      )
      .all()
  ).toEqual([
    {
      id: "accepted",
      status: "accepted",
      decided_by: "u",
      decline_reason: null,
      filed_issue_id: "f",
      decided_by_service_account_id: null,
      decided_by_api_key_id: null,
      filing_claim: null,
    },
    {
      id: "declined",
      status: "declined",
      decided_by: "u",
      decline_reason: "Works as intended",
      filed_issue_id: null,
      decided_by_service_account_id: null,
      decided_by_api_key_id: null,
      filing_claim: null,
    },
    {
      id: "pending",
      status: "pending",
      decided_by: null,
      decline_reason: null,
      filed_issue_id: null,
      decided_by_service_account_id: null,
      decided_by_api_key_id: null,
      filing_claim: null,
    },
  ])
  expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1)
  db.$client.close()
})
