import "@tanstack/react-start/server-only"

import { createDatabaseConnectionsRepository } from "./repositories/database-connections"
import { createLogConnectionsRepository } from "./repositories/log-connections"
import { createTicketsRepository } from "./repositories/tickets"
import { getSessionUser } from "./session"
import type { Auth } from "./auth"
import type { DatabaseConnectionsRepository } from "./repositories/database-connections"
import type { LogConnectionsRepository } from "./repositories/log-connections"
import type { TicketsRepository } from "./repositories/tickets"
import type { NavCounts } from "@/lib/nav-counts"

/** The counts on the Admin nav items, refreshed with every navigation. */
export function createNavCounts(
  deps: {
    auth?: Auth
    tickets?: Pick<TicketsRepository, "pendingCount">
    databaseConnections?: Pick<
      DatabaseConnectionsRepository,
      "needsSecretCount"
    >
    logConnections?: Pick<LogConnectionsRepository, "needsSecretCount">
  } = {}
) {
  return {
    /** Null for anyone who is not an Admin. */
    async counts(headers: Headers): Promise<NavCounts | null> {
      const user = await getSessionUser({ auth: deps.auth, headers })
      if (user?.role !== "admin") return null
      return {
        pendingTickets: (
          deps.tickets ?? createTicketsRepository()
        ).pendingCount(),
        databaseConnectionsNeedingSecret: (
          deps.databaseConnections ?? createDatabaseConnectionsRepository()
        ).needsSecretCount(),
        logConnectionsNeedingSecret: (
          deps.logConnections ?? createLogConnectionsRepository()
        ).needsSecretCount(),
      }
    },
  }
}
