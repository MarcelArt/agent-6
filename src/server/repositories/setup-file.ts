import "@tanstack/react-start/server-only"

import { getDb } from "./db"
import {
  databaseConnectionAttachment,
  logConnectionAttachment,
  repositoryAttachment,
} from "./schema"
import { createApplicationsRepository } from "./applications"
import { createDatabaseConnectionsRepository } from "./database-connections"
import { createLogConnectionsRepository } from "./log-connections"
import { createRepositoriesRepository } from "./repositories"
import type { Db } from "./db"

/**
 * What Setup File export and import read and write: every record and
 * Attachment at once, and one transaction around an import's writes.
 */
export function createSetupFileRepository(db: Db = getDb()) {
  const applications = createApplicationsRepository(db)
  const repositories = createRepositoriesRepository(db)
  const databaseConnections = createDatabaseConnectionsRepository(db)
  const logConnections = createLogConnectionsRepository(db)
  return {
    applications,
    repositories,
    databaseConnections,
    logConnections,
    /** Every record and Attachment. Records come oldest first. */
    snapshot() {
      return {
        applications: applications.all(),
        repositories: repositories.all(),
        databaseConnections: databaseConnections.all(),
        logConnections: logConnections.all(),
        repositoryAttachments: db.select().from(repositoryAttachment).all(),
        databaseConnectionAttachments: db
          .select()
          .from(databaseConnectionAttachment)
          .all(),
        logConnectionAttachments: db
          .select()
          .from(logConnectionAttachment)
          .all(),
      }
    },
    /**
     * Runs `work` in one synchronous transaction: reads see one state, and
     * either every write lands or none does.
     */
    transaction<T>(work: () => T): T {
      return db.transaction(work, { behavior: "immediate" })
    },
  }
}
export type SetupFileRepository = ReturnType<typeof createSetupFileRepository>
export type SetupSnapshot = ReturnType<SetupFileRepository["snapshot"]>
