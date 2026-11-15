import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { asc, count, eq, inArray, or, sql } from "drizzle-orm"
import { getDb } from "./db"
import { application, repository, repositoryAttachment } from "./schema"
import type { Db } from "./db"
import type { Repository, RepositoryStatus } from "@/lib/repositories"

type Row = typeof repository.$inferSelect

const STATUSES: Array<RepositoryStatus> = [
  "pending",
  "syncing",
  "ready",
  "failed",
]

function parseTags(text: string): Array<string> {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? value.filter((tag): tag is string => typeof tag === "string")
      : []
  } catch {
    return []
  }
}

function toRepository(row: Row): Repository {
  return {
    id: row.id,
    fullName: row.fullName,
    trackedBranch: row.trackedBranch,
    tags: parseTags(row.tags),
    description: row.description,
    status: STATUSES.find((status) => status === row.status) ?? "pending",
    error: row.error,
    syncStartedAt: row.syncStartedAt?.getTime() ?? null,
    lastSyncedAt: row.lastSyncedAt?.getTime() ?? null,
    lastSyncedCommit: row.lastSyncedCommit,
  }
}

/** Matches Repositories whose name or Tags contain the text, ignoring case. */
function matches(search: string | undefined) {
  const text = search?.trim().toLowerCase()
  if (!text) return undefined
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`
  return or(
    sql`lower(${repository.fullName}) like ${pattern} escape '\\'`,
    sql`lower(${repository.tags}) like ${pattern} escape '\\'`
  )
}

/** The Repository records. The clones on disk belong to `../repository-sync.ts`. */
export function createRepositoriesRepository(db: Db = getDb()) {
  function update(id: string, values: Partial<Row>): void {
    db.update(repository)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(repository.id, id))
      .run()
  }

  return {
    count(search?: string): number {
      return (
        db
          .select({ value: count() })
          .from(repository)
          .where(matches(search))
          .get()?.value ?? 0
      )
    },

    /** One page of Repositories, by name. */
    list(options: {
      search?: string
      limit: number
      offset: number
    }): Array<Repository> {
      return db
        .select()
        .from(repository)
        .where(matches(options.search))
        .orderBy(asc(sql`lower(${repository.fullName})`), asc(repository.id))
        .limit(options.limit)
        .offset(options.offset)
        .all()
        .map(toRepository)
    },

    findById(id: string): Repository | undefined {
      const row = db
        .select()
        .from(repository)
        .where(eq(repository.id, id))
        .get()
      return row && toRepository(row)
    },

    /** GitHub ignores case in names, so this does too. */
    findByFullName(fullName: string): Repository | undefined {
      const row = db
        .select()
        .from(repository)
        .where(sql`lower(${repository.fullName}) = ${fullName.toLowerCase()}`)
        .get()
      return row && toRepository(row)
    },

    /** Ids of Repositories whose sync never finished: not started, or cut off. */
    unfinishedIds(): Array<string> {
      return db
        .select({ id: repository.id })
        .from(repository)
        .where(inArray(repository.status, ["pending", "syncing"]))
        .all()
        .map((row) => row.id)
    },

    /** Saves a new Repository with status "pending". */
    create(input: {
      fullName: string
      trackedBranch: string
      tags: Array<string>
      description: string
    }): Repository {
      const now = new Date()
      const row = db
        .insert(repository)
        .values({
          id: randomUUID(),
          fullName: input.fullName,
          trackedBranch: input.trackedBranch,
          tags: JSON.stringify(input.tags),
          description: input.description,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()
      return toRepository(row)
    },

    /** Saves the fields an Admin edits. */
    update(
      id: string,
      input: { trackedBranch: string; tags: Array<string>; description: string }
    ): void {
      update(id, {
        trackedBranch: input.trackedBranch,
        tags: JSON.stringify(input.tags),
        description: input.description,
      })
    },

    markSyncing(id: string, at: Date): void {
      update(id, { status: "syncing", error: null, syncStartedAt: at })
    },

    markReady(id: string, at: Date, commit: string): void {
      update(id, {
        status: "ready",
        error: null,
        lastSyncedAt: at,
        lastSyncedCommit: commit,
      })
    },

    markFailed(id: string, error: string): void {
      update(id, { status: "failed", error })
    },

    applicationsOf(repositoryId: string): Array<string> {
      return db
        .select({ name: application.name })
        .from(application)
        .innerJoin(
          repositoryAttachment,
          eq(repositoryAttachment.applicationId, application.id)
        )
        .where(eq(repositoryAttachment.repositoryId, repositoryId))
        .orderBy(asc(sql`lower(${application.name})`), asc(application.id))
        .all()
        .map((row) => row.name)
    },

    delete(id: string): void {
      db.delete(repository).where(eq(repository.id, id)).run()
    },
  }
}

export type RepositoriesRepository = ReturnType<
  typeof createRepositoriesRepository
>
