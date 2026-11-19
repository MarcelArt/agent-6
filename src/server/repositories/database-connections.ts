import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, count, eq, isNull, notExists, sql } from "drizzle-orm"
import { getDb } from "./db"
import {
  application,
  databaseConnection as connection,
  databaseConnectionAttachment as attachment,
} from "./schema"
import type { Db } from "./db"
import type {
  ConnectionTest,
  DatabaseConnection,
  DatabaseConnectionInput,
} from "@/lib/database-connections"

const columns = {
  id: connection.id,
  name: connection.name,
  host: connection.host,
  port: connection.port,
  database: connection.database,
  user: connection.user,
  sslMode: connection.sslMode,
  tags: connection.tags,
  description: connection.description,
  testOk: connection.testOk,
  testMessage: connection.testMessage,
  writable: connection.writable,
  needsSecret: needsSecret(),
}
/** Imported from a Setup File without its password, which is still missing. */
function needsSecret() {
  return sql<boolean>`(${connection.encryptedPassword} is null)`.mapWith(
    Boolean
  )
}
function publicRecord(
  row: Pick<
    typeof connection.$inferSelect,
    Exclude<keyof typeof columns, "needsSecret">
  > & { needsSecret: boolean }
): DatabaseConnection {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    database: row.database,
    user: row.user,
    sslMode: row.sslMode as DatabaseConnection["sslMode"],
    tags: JSON.parse(row.tags),
    description: row.description,
    test: { ok: row.testOk, message: row.testMessage, writable: row.writable },
    needsSecret: row.needsSecret,
  }
}
function testValues(test: ConnectionTest) {
  return { testOk: test.ok, testMessage: test.message, writable: test.writable }
}
export type SavedConnectionInput = Omit<DatabaseConnectionInput, "password"> & {
  /** Null keeps it Needs Secret. */
  encryptedPassword: string | null
}
export function createDatabaseConnectionsRepository(db: Db = getDb()) {
  function findById(id: string) {
    const row = db
      .select(columns)
      .from(connection)
      .where(eq(connection.id, id))
      .get()
    return row && publicRecord(row)
  }
  function where(options: { search?: string; availableFor?: string }) {
    const text = options.search?.trim().toLowerCase()
    const pattern = `%${(text ?? "").replace(/[\\%_]/g, "\\$&")}%`
    return and(
      text
        ? sql`(lower(${connection.name}) like ${pattern} escape '\\' or lower(${connection.description}) like ${pattern} escape '\\' or lower(${connection.tags}) like ${pattern} escape '\\')`
        : undefined,
      options.availableFor
        ? notExists(
            db
              .select()
              .from(attachment)
              .where(
                and(
                  eq(attachment.applicationId, options.availableFor),
                  eq(attachment.databaseConnectionId, connection.id)
                )
              )
          )
        : undefined
    )
  }
  return {
    findById,
    /** Only the executor and management may request a credential, never a loader. */
    credentials(id: string) {
      return db.select().from(connection).where(eq(connection.id, id)).get()
    },
    /** Every connection, oldest first. */
    all() {
      return db
        .select(columns)
        .from(connection)
        .orderBy(asc(connection.createdAt), asc(connection.id))
        .all()
        .map(publicRecord)
    },
    list(
      options: { search?: string; page?: number; availableFor?: string } = {}
    ) {
      const filter = where(options)
      const total =
        db.select({ value: count() }).from(connection).where(filter).get()
          ?.value ?? 0
      const pageSize = 20
      const page = Math.min(
        Math.max(1, options.page ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      return {
        connections: db
          .select(columns)
          .from(connection)
          .where(filter)
          .orderBy(asc(sql`lower(${connection.name})`), asc(connection.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all()
          .map(publicRecord),
        total,
        page,
        pageSize,
      }
    },
    create(input: SavedConnectionInput, test: ConnectionTest) {
      const id = randomUUID(),
        now = new Date()
      db.insert(connection)
        .values({
          ...input,
          tags: JSON.stringify(input.tags),
          ...testValues(test),
          id,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      return findById(id)!
    },
    update(id: string, input: SavedConnectionInput, test: ConnectionTest) {
      db.update(connection)
        .set({
          ...input,
          tags: JSON.stringify(input.tags),
          ...testValues(test),
          updatedAt: new Date(),
        })
        .where(eq(connection.id, id))
        .run()
      return findById(id)!
    },
    /** For the nav badge. */
    needsSecretCount() {
      return (
        db
          .select({ value: count() })
          .from(connection)
          .where(isNull(connection.encryptedPassword))
          .get()?.value ?? 0
      )
    },
    recordTest(id: string, test: ConnectionTest) {
      db.update(connection)
        .set(testValues(test))
        .where(eq(connection.id, id))
        .run()
    },
    isAttached(applicationId: string, id: string) {
      return !!db
        .select()
        .from(attachment)
        .where(
          and(
            eq(attachment.applicationId, applicationId),
            eq(attachment.databaseConnectionId, id)
          )
        )
        .get()
    },
    attached(applicationId: string) {
      return db
        .select(columns)
        .from(connection)
        .innerJoin(
          attachment,
          eq(attachment.databaseConnectionId, connection.id)
        )
        .where(eq(attachment.applicationId, applicationId))
        .orderBy(asc(connection.name))
        .all()
        .map(publicRecord)
    },
    attach(applicationId: string, databaseConnectionId: string) {
      db.insert(attachment)
        .values({ applicationId, databaseConnectionId })
        .onConflictDoNothing()
        .run()
    },
    detach(applicationId: string, databaseConnectionId: string) {
      db.delete(attachment)
        .where(
          and(
            eq(attachment.applicationId, applicationId),
            eq(attachment.databaseConnectionId, databaseConnectionId)
          )
        )
        .run()
    },
    applicationsOf(id: string) {
      return db
        .select({ name: application.name })
        .from(application)
        .innerJoin(attachment, eq(attachment.applicationId, application.id))
        .where(eq(attachment.databaseConnectionId, id))
        .orderBy(asc(application.name))
        .all()
        .map((row) => row.name)
    },
    delete(id: string) {
      db.delete(connection).where(eq(connection.id, id)).run()
    },
  }
}
export type DatabaseConnectionsRepository = ReturnType<
  typeof createDatabaseConnectionsRepository
>
