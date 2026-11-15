import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { and, asc, count, eq, notExists, sql } from "drizzle-orm"
import { getDb } from "./db"
import {
  application,
  conversation,
  repository,
  repositoryAttachment,
} from "./schema"
import { createDatabaseConnectionsRepository } from "./database-connections"
import { createLogConnectionsRepository } from "./log-connections"
import { createRepositoriesRepository } from "./repositories"
import type { Db } from "./db"
import type {
  Application,
  ApplicationInput,
  ApplicationScope,
} from "@/lib/applications"

const columns = {
  id: application.id,
  name: application.name,
  description: application.description,
  notes: application.notes,
}
function matches(search?: string) {
  const text = search?.trim().toLowerCase()
  if (!text) return undefined
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`
  return sql`(lower(${application.name}) like ${pattern} escape '\\' or lower(${application.description}) like ${pattern} escape '\\')`
}

export function createApplicationsRepository(db: Db = getDb()) {
  const repositories = createRepositoriesRepository(db)
  function findById(id: string): Application | undefined {
    return db
      .select(columns)
      .from(application)
      .where(eq(application.id, id))
      .get()
  }
  return {
    findById,
    count(search?: string) {
      return (
        db
          .select({ value: count() })
          .from(application)
          .where(matches(search))
          .get()?.value ?? 0
      )
    },
    list(options: { search?: string; limit: number; offset: number }) {
      return db
        .select({
          ...columns,
          repositoryCount: sql<number>`(select count(*) from ${repositoryAttachment} where ${repositoryAttachment.applicationId} = ${application.id})`,
        })
        .from(application)
        .where(matches(options.search))
        .orderBy(asc(sql`lower(${application.name})`), asc(application.id))
        .limit(options.limit)
        .offset(options.offset)
        .all()
    },
    create(input: ApplicationInput): Application {
      const now = new Date()
      return db
        .insert(application)
        .values({ ...input, id: randomUUID(), createdAt: now, updatedAt: now })
        .returning(columns)
        .get()
    },
    update(id: string, input: ApplicationInput) {
      db.update(application)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(application.id, id))
        .run()
    },
    delete(id: string) {
      // Foreign keys remove only this Application's Attachments, atomically.
      db.delete(application).where(eq(application.id, id)).run()
    },
    hasConversations(id: string) {
      return (
        db
          .select({ id: conversation.id })
          .from(conversation)
          .where(eq(conversation.applicationId, id))
          .limit(1)
          .all().length > 0
      )
    },
    attachRepository(applicationId: string, repositoryId: string) {
      db.insert(repositoryAttachment)
        .values({ applicationId, repositoryId })
        .onConflictDoNothing()
        .run()
    },
    detachRepository(applicationId: string, repositoryId: string) {
      db.delete(repositoryAttachment)
        .where(
          and(
            eq(repositoryAttachment.applicationId, applicationId),
            eq(repositoryAttachment.repositoryId, repositoryId)
          )
        )
        .run()
    },
    /** Explicit Attachments alone determine scope; this query never matches Tags. */
    scope(applicationId: string): ApplicationScope | null {
      const found = findById(applicationId)
      if (!found) return null
      const ids = db
        .select({ id: repository.id })
        .from(repository)
        .innerJoin(
          repositoryAttachment,
          eq(repositoryAttachment.repositoryId, repository.id)
        )
        .where(eq(repositoryAttachment.applicationId, applicationId))
        .orderBy(asc(sql`lower(${repository.fullName})`), asc(repository.id))
        .all()
      return {
        application: found,
        attachments: [
          ...ids.map(({ id }) => ({
            kind: "repository" as const,
            resource: repositories.findById(id)!,
          })),
          ...createDatabaseConnectionsRepository(db)
            .attached(applicationId)
            .map((resource) => ({
              kind: "database-connection" as const,
              resource,
            })),
          ...createLogConnectionsRepository(db)
            .attached(applicationId)
            .map((item) => ({ kind: "log-connection" as const, ...item })),
        ],
      }
    },
    availableRepositories(
      applicationId: string,
      options: { search?: string; page?: number }
    ) {
      const text = options.search?.trim().toLowerCase()
      const pattern = `%${(text ?? "").replace(/[\\%_]/g, "\\$&")}%`
      const where = and(
        notExists(
          db
            .select()
            .from(repositoryAttachment)
            .where(
              and(
                eq(repositoryAttachment.applicationId, applicationId),
                eq(repositoryAttachment.repositoryId, repository.id)
              )
            )
        ),
        text
          ? sql`lower(${repository.fullName}) like ${pattern} escape '\\'`
          : undefined
      )
      const total =
        db.select({ value: count() }).from(repository).where(where).get()
          ?.value ?? 0
      const pageSize = 20
      const page = Math.min(
        Math.max(1, options.page ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      const rows = db
        .select({ id: repository.id })
        .from(repository)
        .where(where)
        .orderBy(asc(sql`lower(${repository.fullName})`), asc(repository.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all()
      return {
        repositories: rows.map((row) => repositories.findById(row.id)!),
        total,
        page,
        pageSize,
      }
    },
  }
}
export type ApplicationsRepository = ReturnType<
  typeof createApplicationsRepository
>
