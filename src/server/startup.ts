import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import { ConfigError, getConfig } from "./config"
import { ensureFirstAdmin } from "./first-admin"
import { getDb } from "./repositories/db"
import { createUsersRepository } from "./repositories/users"

/** A configuration problem stops the process with a readable message. */
function exitOnConfigError(error: unknown): never {
  if (!(error instanceof ConfigError)) throw error
  console.error(`\n${error.message}\n`)
  process.exit(1)
}

/**
 * Validates configuration, then creates and migrates the database.
 * A configuration problem stops the process.
 */
export function startup(): void {
  try {
    getConfig()
  } catch (error) {
    exitOnConfigError(error)
  }
  getDb()
}

/**
 * Runs once when the server starts: `startup`, then creates the first Admin
 * if no user exists yet.
 */
export async function startServer(): Promise<void> {
  startup()
  const { adminEmail, adminPassword } = getConfig()
  try {
    const created = await ensureFirstAdmin({
      auth: getAuth(),
      users: createUsersRepository(),
      adminEmail,
      adminPassword,
    })
    if (created) console.log(`Created the first Admin: ${adminEmail}`)
  } catch (error) {
    exitOnConfigError(error)
  }
}
