import "@tanstack/react-start/server-only"

import { mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { getConfig } from "../config"
import * as schema from "./schema"

export type Db = ReturnType<typeof openDb>

/** Migration files made by `npm run db:generate`, relative to the working directory. */
const MIGRATIONS_FOLDER = resolve("drizzle")

/** Opens a database and brings it up to the latest migration. */
export function openDb(file: string) {
  const sqlite = new Database(file)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}

let cached: Db | undefined

/** Called only once background work has stopped. SQLite checkpoints its WAL on close. */
export function closeDb(): void {
  cached?.$client.close()
  cached = undefined
}

/** A minimal live database check; callers must not expose database details. */
export function checkDb(): void {
  getDb().$client.prepare("SELECT 1").get()
}

/** Agent 6's own database at `DATA_DIR/agent6.db`, created and migrated on first use. */
export function getDb(): Db {
  if (!cached) {
    const { dataDir } = getConfig()
    mkdirSync(dataDir, { recursive: true })
    cached = openDb(join(dataDir, "agent6.db"))
  }
  return cached
}
