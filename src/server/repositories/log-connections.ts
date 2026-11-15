import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, count, eq, notExists, sql } from "drizzle-orm"
import { getDb } from "./db"
import {
  application,
  logConnection as connection,
  logConnectionAttachment as attachment,
} from "./schema"
import type { Db } from "./db"
import type {
  LogConnection,
  LogConnectionInput,
  LogConnectionTest,
} from "@/lib/log-connections"

const columns = {
  id: connection.id,
  name: connection.name,
  baseUrl: connection.baseUrl,
  authType: connection.authType,
  authUsername: connection.authUsername,
  tenantId: connection.tenantId,
  tags: connection.tags,
  description: connection.description,
  testOk: connection.testOk,
  testMessage: connection.testMessage,
}
function publicRecord(
  row: Pick<typeof connection.$inferSelect, keyof typeof columns>
): LogConnection {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    authType: row.authType as LogConnection["authType"],
    authUsername: row.authUsername,
    tenantId: row.tenantId,
    tags: JSON.parse(row.tags),
    description: row.description,
    test: { ok: row.testOk, message: row.testMessage },
  }
}
function testValues(test: LogConnectionTest) {
  return { testOk: test.ok, testMessage: test.message }
}
export type SavedLogConnectionInput = Omit<LogConnectionInput, "authSecret"> & {
  encryptedAuthSecret: string | null
}
export function createLogConnectionsRepository(db: Db = getDb()) {
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
                  eq(attachment.logConnectionId, connection.id)
                )
              )
          )
        : undefined
    )
  }
  return {
    findById,
    /** Only the Loki client's callers may request a credential, never a loader. */
    credentials(id: string) {
      return db.select().from(connection).where(eq(connection.id, id)).get()
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
    create(input: SavedLogConnectionInput, test: LogConnectionTest) {
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
    update(
      id: string,
      input: SavedLogConnectionInput,
      test: LogConnectionTest
    ) {
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
    recordTest(id: string, test: LogConnectionTest) {
      db.update(connection)
        .set(testValues(test))
        .where(eq(connection.id, id))
        .run()
    },
    /** The Base Selector of the live Attachment, or undefined without one. */
    baseSelector(applicationId: string, id: string) {
      return db
        .select({ baseSelector: attachment.baseSelector })
        .from(attachment)
        .where(
          and(
            eq(attachment.applicationId, applicationId),
            eq(attachment.logConnectionId, id)
          )
        )
        .get()?.baseSelector
    },
    attached(applicationId: string) {
      return db
        .select({ ...columns, baseSelector: attachment.baseSelector })
        .from(connection)
        .innerJoin(attachment, eq(attachment.logConnectionId, connection.id))
        .where(eq(attachment.applicationId, applicationId))
        .orderBy(asc(connection.name))
        .all()
        .map((row) => ({
          resource: publicRecord(row),
          baseSelector: row.baseSelector,
        }))
    },
    attach(
      applicationId: string,
      logConnectionId: string,
      baseSelector: string
    ) {
      db.insert(attachment)
        .values({ applicationId, logConnectionId, baseSelector })
        .onConflictDoUpdate({
          target: [attachment.applicationId, attachment.logConnectionId],
          set: { baseSelector },
        })
        .run()
    },
    detach(applicationId: string, logConnectionId: string) {
      db.delete(attachment)
        .where(
          and(
            eq(attachment.applicationId, applicationId),
            eq(attachment.logConnectionId, logConnectionId)
          )
        )
        .run()
    },
    applicationsOf(id: string) {
      return db
        .select({ name: application.name })
        .from(application)
        .innerJoin(attachment, eq(attachment.applicationId, application.id))
        .where(eq(attachment.logConnectionId, id))
        .orderBy(asc(application.name))
        .all()
        .map((row) => row.name)
    },
    delete(id: string) {
      db.delete(connection).where(eq(connection.id, id)).run()
    },
  }
}
export type LogConnectionsRepository = ReturnType<
  typeof createLogConnectionsRepository
>
