import "@tanstack/react-start/server-only"

import { getAuth } from "./auth"
import { ConfigError, getConfig } from "./config"
import { ensureFirstAdmin } from "./first-admin"
import { getDb } from "./repositories/db"
import { createUsersRepository } from "./repositories/users"
import { getRepositorySync } from "./repository-sync"
import { createUploads } from "./uploads"
import { getWebhookDispatcher } from "./webhook-dispatcher"
import { TOKEN_MISSING_MESSAGE } from "@/lib/repositories"

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
 * if no user exists yet, picks up Repository syncs a restart cut off and
 * starts sending Webhook Deliveries, including those a restart cut off.
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
  if (!getConfig().githubToken)
    console.warn(`\nWarning: ${TOKEN_MISSING_MESSAGE}\n`)
  getRepositorySync().resume()
  getWebhookDispatcher().start()
  void createUploads()
    .sweep()
    .catch(() => {})
}
