import "@tanstack/react-start/server-only"

import { and, asc, count, desc, eq, exists, inArray, sql } from "drizzle-orm"
import { keyPrefix } from "../api-keys"
import { getDb } from "./db"
import {
  apiKey,
  application,
  conversation,
  databaseConnection,
  databaseConnectionAttachment,
  filedIssue,
  logConnection,
  logConnectionAttachment,
  repository,
  repositoryAttachment,
  serviceAccount,
  ticket,
} from "./schema"
import type { AnySQLiteColumn, SQLiteColumn } from "drizzle-orm/sqlite-core"
import type { SQL } from "drizzle-orm"
import type { Db } from "./db"

/*
 * The API's reads. Every query applies the caller's Application scope to
 * rows, totals, filters and lookups, so a scoped API Key cannot learn about
 * records outside it. A shared resource is in scope through an Attachment to
 * an allowed Application; unattached records need all-Applications access.
 */

/** "all", or the ids of the Applications an API Key may reach. */
export type Scope = "all" | Array<string>

export type Paging = { page: number; pageSize: number }

const iso = (date: Date) => date.toISOString()
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null)

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

function contains(column: SQLiteColumn, text?: string) {
  const search = text?.trim().toLowerCase()
  if (!search) return undefined
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`
  return sql`lower(${column}) like ${pattern} escape '\\'`
}

/** The Application filter a caller may use: out of scope matches nothing. */
function applicationFilter(scope: Scope, applicationId?: string) {
  if (!applicationId) return undefined
  return scope === "all" || scope.includes(applicationId) ? [applicationId] : []
}

export function createApiReadsRepository(db: Db = getDb()) {
  /** Some Attachment of the resource is to one of `ids` (or to any, for "all"). */
  function attachedTo(
    table:
      | typeof repositoryAttachment
      | typeof databaseConnectionAttachment
      | typeof logConnectionAttachment,
    resourceColumn: AnySQLiteColumn,
    resourceId: AnySQLiteColumn,
    ids: Scope
  ) {
    return exists(
      db
        .select({ one: sql`1` })
        .from(table)
        .where(
          and(
            eq(resourceColumn, resourceId),
            ids === "all" ? undefined : inArray(table.applicationId, ids)
          )
        )
    )
  }

  /** In scope: everything for "all", otherwise attached to an allowed Application. */
  function visible(
    scope: Scope,
    table:
      | typeof repositoryAttachment
      | typeof databaseConnectionAttachment
      | typeof logConnectionAttachment,
    resourceColumn: AnySQLiteColumn,
    resourceId: AnySQLiteColumn,
    applicationId?: string
  ): SQL | undefined {
    const filter = applicationFilter(scope, applicationId)
    return and(
      scope === "all"
        ? undefined
        : attachedTo(table, resourceColumn, resourceId, scope),
      filter ? attachedTo(table, resourceColumn, resourceId, filter) : undefined
    )
  }

  /** Allowed Applications each resource is attached to, for list rows and details. */
  function applicationsOf(
    table:
      | typeof repositoryAttachment
      | typeof databaseConnectionAttachment
      | typeof logConnectionAttachment,
    resourceColumn: SQLiteColumn,
    ids: Array<string>,
    scope: Scope
  ) {
    const byResource = new Map<string, Array<{ id: string; name: string }>>()
    if (!ids.length) return byResource
    const rows = db
      .select({
        resourceId: resourceColumn,
        id: application.id,
        name: application.name,
      })
      .from(table)
      .innerJoin(application, eq(application.id, table.applicationId))
      .where(
        and(
          inArray(resourceColumn, ids),
          scope === "all" ? undefined : inArray(application.id, scope)
        )
      )
      .orderBy(asc(sql`lower(${application.name})`), asc(application.id))
      .all() as Array<{ resourceId: string; id: string; name: string }>
    for (const row of rows) {
      const list = byResource.get(row.resourceId) ?? []
      list.push({ id: row.id, name: row.name })
      byResource.set(row.resourceId, list)
    }
    return byResource
  }

  function page<T>(paging: Paging, total: number, rows: Array<T>) {
    return { data: rows, page: paging.page, pageSize: paging.pageSize, total }
  }

  // Repositories

  function repositoryRows(
    where: SQL | undefined,
    scope: Scope,
    paging?: Paging
  ) {
    const query = db
      .select()
      .from(repository)
      .where(where)
      .orderBy(asc(sql`lower(${repository.fullName})`), asc(repository.id))
    const rows = paging
      ? query
          .limit(paging.pageSize)
          .offset((paging.page - 1) * paging.pageSize)
          .all()
      : query.all()
    const applications = applicationsOf(
      repositoryAttachment,
      repositoryAttachment.repositoryId,
      rows.map((row) => row.id),
      scope
    )
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      trackedBranch: row.trackedBranch,
      tags: parseTags(row.tags),
      description: row.description,
      sync: {
        status: row.status as "pending" | "syncing" | "ready" | "failed",
        lastSyncedAt: isoOrNull(row.lastSyncedAt),
        lastSyncedCommit: row.lastSyncedCommit,
      },
      applications: applications.get(row.id) ?? [],
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }))
  }

  const repositoryScope = (scope: Scope, applicationId?: string) =>
    visible(
      scope,
      repositoryAttachment,
      repositoryAttachment.repositoryId,
      repository.id,
      applicationId
    )

  // Connections

  function databaseConnectionRows(
    where: SQL | undefined,
    scope: Scope,
    withSettings: boolean,
    paging?: Paging
  ) {
    const query = db
      .select()
      .from(databaseConnection)
      .where(where)
      .orderBy(
        asc(sql`lower(${databaseConnection.name})`),
        asc(databaseConnection.id)
      )
    const rows = paging
      ? query
          .limit(paging.pageSize)
          .offset((paging.page - 1) * paging.pageSize)
          .all()
      : query.all()
    const applications = applicationsOf(
      databaseConnectionAttachment,
      databaseConnectionAttachment.databaseConnectionId,
      rows.map((row) => row.id),
      scope
    )
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tags: parseTags(row.tags),
      description: row.description,
      status: {
        state:
          row.encryptedPassword === null
            ? ("needs-secret" as const)
            : row.testOk
              ? ("connected" as const)
              : ("failed" as const),
        writable: row.encryptedPassword === null ? null : row.writable,
      },
      applications: applications.get(row.id) ?? [],
      ...(withSettings
        ? {
            settings: {
              host: row.host,
              port: row.port,
              database: row.database,
              user: row.user,
              sslMode: row.sslMode as "disable" | "require" | "verify-full",
            },
          }
        : {}),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }))
  }

  const databaseConnectionScope = (scope: Scope, applicationId?: string) =>
    visible(
      scope,
      databaseConnectionAttachment,
      databaseConnectionAttachment.databaseConnectionId,
      databaseConnection.id,
      applicationId
    )

  function logConnectionRows(
    where: SQL | undefined,
    scope: Scope,
    withSettings: boolean,
    paging?: Paging
  ) {
    const query = db
      .select()
      .from(logConnection)
      .where(where)
      .orderBy(asc(sql`lower(${logConnection.name})`), asc(logConnection.id))
    const rows = paging
      ? query
          .limit(paging.pageSize)
          .offset((paging.page - 1) * paging.pageSize)
          .all()
      : query.all()
    const applications = applicationsOf(
      logConnectionAttachment,
      logConnectionAttachment.logConnectionId,
      rows.map((row) => row.id),
      scope
    )
    return rows.map((row) => {
      const needsSecret =
        row.authType !== "none" && row.encryptedAuthSecret === null
      return {
        id: row.id,
        name: row.name,
        tags: parseTags(row.tags),
        description: row.description,
        status: {
          state: needsSecret
            ? ("needs-secret" as const)
            : row.testOk
              ? ("connected" as const)
              : ("failed" as const),
        },
        applications: applications.get(row.id) ?? [],
        ...(withSettings
          ? {
              settings: {
                baseUrl: row.baseUrl,
                authType: row.authType as "none" | "basic" | "bearer",
                authUsername: row.authUsername,
                tenantId: row.tenantId,
              },
            }
          : {}),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }
    })
  }

  const logConnectionScope = (scope: Scope, applicationId?: string) =>
    visible(
      scope,
      logConnectionAttachment,
      logConnectionAttachment.logConnectionId,
      logConnection.id,
      applicationId
    )

  // Applications

  const applicationScope = (scope: Scope) =>
    scope === "all" ? undefined : inArray(application.id, scope)

  function applicationRow(row: typeof application.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      notes: row.notes,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }
  }

  // Tickets

  const ticketColumns = {
    ticket,
    application: { id: application.id, name: application.name },
    issue: {
      outcome: filedIssue.outcome,
      repository: filedIssue.repository,
      number: filedIssue.issueNumber,
      url: filedIssue.url,
    },
    serviceAccount: { id: serviceAccount.id, name: serviceAccount.name },
    apiKey: { id: apiKey.id, name: apiKey.name, lookupId: apiKey.lookupId },
  }

  function ticketQuery(where: SQL | undefined) {
    return db
      .select(ticketColumns)
      .from(ticket)
      .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
      .innerJoin(application, eq(application.id, conversation.applicationId))
      .leftJoin(filedIssue, eq(filedIssue.id, ticket.filedIssueId))
      .leftJoin(
        serviceAccount,
        eq(serviceAccount.id, ticket.decidedByServiceAccountId)
      )
      .leftJoin(apiKey, eq(apiKey.id, ticket.decidedByApiKeyId))
      .where(where)
  }

  function ticketRow(
    row: ReturnType<ReturnType<typeof ticketQuery>["all"]>[number],
    withDetails: boolean,
    now: Date
  ) {
    const found = row.ticket
    const issue = row.issue
    return {
      id: found.id,
      status: found.status as "pending" | "accepted" | "declined",
      kind: found.kind as "code-fix" | "data-fix" | "feature-request",
      summary: found.summary,
      application: row.application,
      repository: { id: found.repositoryId, fullName: found.repository },
      filing:
        found.status === "pending" &&
        found.filingUntil !== null &&
        found.filingUntil > now,
      createdAt: iso(found.createdAt),
      decidedAt: isoOrNull(found.decidedAt),
      decidedBy:
        found.status === "pending"
          ? null
          : row.serviceAccount
            ? {
                type: "service-account" as const,
                serviceAccount: row.serviceAccount,
                apiKey: row.apiKey
                  ? {
                      id: row.apiKey.id,
                      name: row.apiKey.name,
                      prefix: keyPrefix(row.apiKey.lookupId),
                    }
                  : null,
              }
            : { type: "admin" as const },
      ...(withDetails
        ? {
            details: {
              title: found.title,
              description: found.body,
              declineReason: found.declineReason,
              targetIssue:
                found.targetIssueNumber === null
                  ? null
                  : { number: found.targetIssueNumber },
              filedIssue:
                issue &&
                issue.number !== null &&
                issue.url &&
                issue.repository &&
                (issue.outcome === "new" || issue.outcome === "comment")
                  ? {
                      outcome: issue.outcome,
                      repository: issue.repository,
                      number: issue.number,
                      url: issue.url,
                    }
                  : null,
            },
          }
        : {}),
    }
  }

  const ticketScope = (scope: Scope) =>
    scope === "all" ? undefined : inArray(conversation.applicationId, scope)

  return {
    repositories: {
      list(
        scope: Scope,
        paging: Paging,
        filters: { q?: string; applicationId?: string }
      ) {
        const where = and(
          repositoryScope(scope, filters.applicationId),
          contains(repository.fullName, filters.q)
        )
        const total =
          db.select({ value: count() }).from(repository).where(where).get()
            ?.value ?? 0
        return page(paging, total, repositoryRows(where, scope, paging))
      },
      get(scope: Scope, id: string) {
        return repositoryRows(
          and(eq(repository.id, id), repositoryScope(scope)),
          scope
        ).at(0)
      },
    },

    applications: {
      list(scope: Scope, paging: Paging, filters: { q?: string }) {
        const where = and(
          applicationScope(scope),
          contains(application.name, filters.q)
        )
        const total =
          db.select({ value: count() }).from(application).where(where).get()
            ?.value ?? 0
        const rows = db
          .select()
          .from(application)
          .where(where)
          .orderBy(asc(sql`lower(${application.name})`), asc(application.id))
          .limit(paging.pageSize)
          .offset((paging.page - 1) * paging.pageSize)
          .all()
        return page(paging, total, rows.map(applicationRow))
      },
      get(scope: Scope, id: string) {
        const row = db
          .select()
          .from(application)
          .where(and(eq(application.id, id), applicationScope(scope)))
          .get()
        return row && applicationRow(row)
      },
      /** Every Attachment of an allowed Application, by kind and name. */
      attachments(scope: Scope, id: string) {
        if (scope !== "all" && !scope.includes(id)) return undefined
        if (
          !db
            .select({ id: application.id })
            .from(application)
            .where(eq(application.id, id))
            .get()
        )
          return undefined
        return [
          ...db
            .select({ resourceId: repository.id, name: repository.fullName })
            .from(repositoryAttachment)
            .innerJoin(
              repository,
              eq(repository.id, repositoryAttachment.repositoryId)
            )
            .where(eq(repositoryAttachment.applicationId, id))
            .orderBy(
              asc(sql`lower(${repository.fullName})`),
              asc(repository.id)
            )
            .all()
            .map((row) => ({ kind: "repository" as const, ...row })),
          ...db
            .select({
              resourceId: databaseConnection.id,
              name: databaseConnection.name,
            })
            .from(databaseConnectionAttachment)
            .innerJoin(
              databaseConnection,
              eq(
                databaseConnection.id,
                databaseConnectionAttachment.databaseConnectionId
              )
            )
            .where(eq(databaseConnectionAttachment.applicationId, id))
            .orderBy(
              asc(sql`lower(${databaseConnection.name})`),
              asc(databaseConnection.id)
            )
            .all()
            .map((row) => ({ kind: "database-connection" as const, ...row })),
          ...db
            .select({
              resourceId: logConnection.id,
              name: logConnection.name,
              baseSelector: logConnectionAttachment.baseSelector,
            })
            .from(logConnectionAttachment)
            .innerJoin(
              logConnection,
              eq(logConnection.id, logConnectionAttachment.logConnectionId)
            )
            .where(eq(logConnectionAttachment.applicationId, id))
            .orderBy(
              asc(sql`lower(${logConnection.name})`),
              asc(logConnection.id)
            )
            .all()
            .map((row) => ({ kind: "log-connection" as const, ...row })),
        ]
      },
    },

    databaseConnections: {
      list(
        scope: Scope,
        paging: Paging,
        filters: { q?: string; applicationId?: string },
        withSettings: boolean
      ) {
        const where = and(
          databaseConnectionScope(scope, filters.applicationId),
          contains(databaseConnection.name, filters.q)
        )
        const total =
          db
            .select({ value: count() })
            .from(databaseConnection)
            .where(where)
            .get()?.value ?? 0
        return page(
          paging,
          total,
          databaseConnectionRows(where, scope, withSettings, paging)
        )
      },
      get(scope: Scope, id: string, withSettings: boolean) {
        return databaseConnectionRows(
          and(eq(databaseConnection.id, id), databaseConnectionScope(scope)),
          scope,
          withSettings
        ).at(0)
      },
    },

    logConnections: {
      list(
        scope: Scope,
        paging: Paging,
        filters: { q?: string; applicationId?: string },
        withSettings: boolean
      ) {
        const where = and(
          logConnectionScope(scope, filters.applicationId),
          contains(logConnection.name, filters.q)
        )
        const total =
          db.select({ value: count() }).from(logConnection).where(where).get()
            ?.value ?? 0
        return page(
          paging,
          total,
          logConnectionRows(where, scope, withSettings, paging)
        )
      },
      get(scope: Scope, id: string, withSettings: boolean) {
        return logConnectionRows(
          and(eq(logConnection.id, id), logConnectionScope(scope)),
          scope,
          withSettings
        ).at(0)
      },
    },

    tickets: {
      list(
        scope: Scope,
        paging: Paging,
        filters: {
          status?: "pending" | "accepted" | "declined"
          kind?: "code-fix" | "data-fix" | "feature-request"
          applicationId?: string
        },
        withDetails: boolean,
        now = new Date()
      ) {
        const filter = applicationFilter(scope, filters.applicationId)
        const where = and(
          ticketScope(scope),
          filter ? inArray(conversation.applicationId, filter) : undefined,
          filters.status ? eq(ticket.status, filters.status) : undefined,
          filters.kind ? eq(ticket.kind, filters.kind) : undefined
        )
        const total =
          db
            .select({ value: count() })
            .from(ticket)
            .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
            .where(where)
            .get()?.value ?? 0
        const rows = ticketQuery(where)
          .orderBy(desc(ticket.createdAt), desc(ticket.id))
          .limit(paging.pageSize)
          .offset((paging.page - 1) * paging.pageSize)
          .all()
        return page(
          paging,
          total,
          rows.map((row) => ticketRow(row, withDetails, now))
        )
      },
      get(scope: Scope, id: string, withDetails: boolean, now = new Date()) {
        const row = ticketQuery(
          and(eq(ticket.id, id), ticketScope(scope))
        ).get()
        return row && ticketRow(row, withDetails, now)
      },
    },

    /** Whether an Attachment exists, for choosing create or update. */
    attachmentExists(
      kind: "repository" | "database-connection" | "log-connection",
      applicationId: string,
      resourceId: string
    ) {
      const [table, column] =
        kind === "repository"
          ? ([repositoryAttachment, repositoryAttachment.repositoryId] as const)
          : kind === "database-connection"
            ? ([
                databaseConnectionAttachment,
                databaseConnectionAttachment.databaseConnectionId,
              ] as const)
            : ([
                logConnectionAttachment,
                logConnectionAttachment.logConnectionId,
              ] as const)
      return !!db
        .select({ one: sql`1` })
        .from(table)
        .where(
          and(eq(table.applicationId, applicationId), eq(column, resourceId))
        )
        .get()
    },
  }
}
export type ApiReadsRepository = ReturnType<typeof createApiReadsRepository>
