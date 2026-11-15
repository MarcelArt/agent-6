import "@tanstack/react-start/server-only"

import { ConfigError, getConfig } from "./config"
import { getDb } from "./repositories/db"

/**
 * Runs once when the server starts: validates configuration, then creates
 * and migrates the database. A configuration problem stops the process.
 */
export function startup(): void {
  try {
    getConfig()
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(`\n${error.message}\n`)
    process.exit(1)
  }
  getDb()
}
