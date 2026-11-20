import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm"
import { keyPrefix } from "../api-keys"
import { getDb } from "./db"
import {
  apiKey,
  apiKeyApplication,
  application,
  serviceAccount,
} from "./schema"
import type { Db } from "./db"
import type {
  ApiKeyState,
  ApiKeySummary,
  ApiPermission,
  ServiceAccountSummary,
  ServiceAccountsPage,
} from "@/lib/service-accounts"
import {
  SERVICE_ACCOUNTS_PAGE_SIZE,
  tidyPermissions,
} from "@/lib/service-accounts"

type KeyRow = typeof apiKey.$inferSelect

function parsePermissions(text: string): Array<ApiPermission> {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? tidyPermissions(
          value.filter((item): item is string => typeof item === "string")
        )
      : []
  } catch {
    return []
  }
}

export function keyState(
  row: Pick<KeyRow, "revokedAt" | "expiresAt">,
  now = new Date()
): ApiKeyState {
  if (row.revokedAt) return "revoked"
  if (row.expiresAt && row.expiresAt <= now) return "expired"
  return "active"
}

/** What authentication needs to know about a key, its account and grants. */
export type KeyCredential = {
  keyId: string
  keyName: string
  digest: string
  state: ApiKeyState
  lastUsedAt: Date | null
  permissions: Array<ApiPermission>
  allApplications: boolean
  applicationIds: Array<string>
  serviceAccount: { id: string; name: string; disabled: boolean }
}

export type KeyGrants = {
  name: string
  permissions: Array<ApiPermission>
  allApplications: boolean
  applicationIds: Array<string>
}

export function createServiceAccountsRepository(db: Db = getDb()) {
  // Qualified by hand: Drizzle leaves single-table columns unqualified, and
  // an unqualified "id" here would mean the key's id.
  const activeKeys = (now: Date) =>
    sql<number>`(select count(*) from "api_key" as "k" where "k"."service_account_id" = "service_account"."id" and "k"."revoked_at" is null and ("k"."expires_at" is null or "k"."expires_at" > ${now.getTime()}))`.mapWith(
      Number
    )

  function summary(row: {
    id: string
    name: string
    description: string
    disabledAt: Date | null
    activeKeys: number
    createdAt: Date
  }): ServiceAccountSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      disabled: row.disabledAt !== null,
      activeKeys: row.activeKeys,
      createdAt: row.createdAt.getTime(),
    }
  }

  function applicationsOf(keyIds: Array<string>) {
    if (!keyIds.length)
      return new Map<string, Array<{ id: string; name: string }>>()
    const rows = db
      .select({
        keyId: apiKeyApplication.apiKeyId,
        id: application.id,
        name: application.name,
      })
      .from(apiKeyApplication)
      .innerJoin(
        application,
        eq(application.id, apiKeyApplication.applicationId)
      )
      .where(inArray(apiKeyApplication.apiKeyId, keyIds))
      .orderBy(asc(sql`lower(${application.name})`), asc(application.id))
      .all()
    const byKey = new Map<string, Array<{ id: string; name: string }>>()
    for (const row of rows) {
      const list = byKey.get(row.keyId) ?? []
      list.push({ id: row.id, name: row.name })
      byKey.set(row.keyId, list)
    }
    return byKey
  }

  function toKey(
    row: KeyRow,
    applications: Array<{ id: string; name: string }>,
    now: Date
  ): ApiKeySummary {
    return {
      id: row.id,
      name: row.name,
      prefix: keyPrefix(row.lookupId),
      state: keyState(row, now),
      permissions: parsePermissions(row.permissions),
      allApplications: row.allApplications,
      applications: row.allApplications ? [] : applications,
      createdAt: row.createdAt.getTime(),
      lastUsedAt: row.lastUsedAt?.getTime() ?? null,
      expiresAt: row.expiresAt?.getTime() ?? null,
      revokedAt: row.revokedAt?.getTime() ?? null,
    }
  }

  function setApplications(keyId: string, applicationIds: Array<string>) {
    db.delete(apiKeyApplication)
      .where(eq(apiKeyApplication.apiKeyId, keyId))
      .run()
    const known = applicationIds.length
      ? db
          .select({ id: application.id })
          .from(application)
          .where(inArray(application.id, applicationIds))
          .all()
      : []
    for (const { id } of known)
      db.insert(apiKeyApplication)
        .values({ apiKeyId: keyId, applicationId: id })
        .onConflictDoNothing()
        .run()
  }

  return {
    list(
      options: { search?: string; page?: number } = {},
      now = new Date()
    ): ServiceAccountsPage {
      const text = options.search?.trim().toLowerCase()
      const pattern = `%${(text ?? "").replace(/[\\%_]/g, "\\$&")}%`
      const where = text
        ? sql`(lower(${serviceAccount.name}) like ${pattern} escape '\\' or lower(${serviceAccount.description}) like ${pattern} escape '\\')`
        : undefined
      const total =
        db.select({ value: count() }).from(serviceAccount).where(where).get()
          ?.value ?? 0
      const pageSize = SERVICE_ACCOUNTS_PAGE_SIZE
      const page = Math.min(
        Math.max(1, options.page ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      return {
        serviceAccounts: db
          .select({
            id: serviceAccount.id,
            name: serviceAccount.name,
            description: serviceAccount.description,
            disabledAt: serviceAccount.disabledAt,
            activeKeys: activeKeys(now),
            createdAt: serviceAccount.createdAt,
          })
          .from(serviceAccount)
          .where(where)
          .orderBy(
            asc(sql`lower(${serviceAccount.name})`),
            asc(serviceAccount.id)
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all()
          .map(summary),
        total,
        page,
        pageSize,
      }
    },

    findById(id: string, now = new Date()): ServiceAccountSummary | undefined {
      const row = db
        .select({
          id: serviceAccount.id,
          name: serviceAccount.name,
          description: serviceAccount.description,
          disabledAt: serviceAccount.disabledAt,
          activeKeys: activeKeys(now),
          createdAt: serviceAccount.createdAt,
        })
        .from(serviceAccount)
        .where(eq(serviceAccount.id, id))
        .get()
      return row && summary(row)
    },

    create(input: { name: string; description: string }, now = new Date()) {
      const id = randomUUID()
      db.insert(serviceAccount)
        .values({ ...input, id, createdAt: now, updatedAt: now })
        .run()
      return id
    },

    update(id: string, input: { name: string; description: string }) {
      db.update(serviceAccount)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(serviceAccount.id, id))
        .run()
    },

    setDisabled(id: string, disabled: boolean, now = new Date()) {
      db.update(serviceAccount)
        .set({ disabledAt: disabled ? now : null, updatedAt: now })
        .where(eq(serviceAccount.id, id))
        .run()
    },

    /** Active keys first, then newest. */
    keys(serviceAccountId: string, now = new Date()): Array<ApiKeySummary> {
      const rows = db
        .select()
        .from(apiKey)
        .where(eq(apiKey.serviceAccountId, serviceAccountId))
        .orderBy(desc(apiKey.createdAt), desc(apiKey.id))
        .all()
      const applications = applicationsOf(rows.map((row) => row.id))
      const order: Record<ApiKeyState, number> = {
        active: 0,
        expired: 1,
        revoked: 2,
      }
      return rows
        .map((row) => toKey(row, applications.get(row.id) ?? [], now))
        .sort((a, b) => order[a.state] - order[b.state])
    },

    findKey(
      serviceAccountId: string,
      keyId: string,
      now = new Date()
    ): ApiKeySummary | undefined {
      const row = db
        .select()
        .from(apiKey)
        .where(
          and(
            eq(apiKey.id, keyId),
            eq(apiKey.serviceAccountId, serviceAccountId)
          )
        )
        .get()
      return row && toKey(row, applicationsOf([row.id]).get(row.id) ?? [], now)
    },

    createKey(
      input: KeyGrants & {
        serviceAccountId: string
        lookupId: string
        digest: string
        expiresAt: Date | null
      },
      now = new Date()
    ): string {
      const id = randomUUID()
      db.transaction(
        () => {
          db.insert(apiKey)
            .values({
              id,
              serviceAccountId: input.serviceAccountId,
              name: input.name,
              lookupId: input.lookupId,
              digest: input.digest,
              permissions: JSON.stringify(input.permissions),
              allApplications: input.allApplications,
              expiresAt: input.expiresAt,
              createdAt: now,
              updatedAt: now,
            })
            .run()
          setApplications(id, input.allApplications ? [] : input.applicationIds)
        },
        { behavior: "immediate" }
      )
      return id
    },

    /** Grant changes apply to the next request the key makes. */
    updateKey(keyId: string, grants: KeyGrants, now = new Date()) {
      db.transaction(
        () => {
          db.update(apiKey)
            .set({
              name: grants.name,
              permissions: JSON.stringify(grants.permissions),
              allApplications: grants.allApplications,
              updatedAt: now,
            })
            .where(eq(apiKey.id, keyId))
            .run()
          setApplications(
            keyId,
            grants.allApplications ? [] : grants.applicationIds
          )
        },
        { behavior: "immediate" }
      )
    },

    revokeKey(keyId: string, now = new Date()) {
      db.update(apiKey)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(apiKey.id, keyId), isNull(apiKey.revokedAt)))
        .run()
    },

    /** Everything authentication checks, read fresh on every request. */
    credential(lookupId: string, now = new Date()): KeyCredential | undefined {
      const row = db
        .select({
          key: apiKey,
          account: {
            id: serviceAccount.id,
            name: serviceAccount.name,
            disabledAt: serviceAccount.disabledAt,
          },
        })
        .from(apiKey)
        .innerJoin(
          serviceAccount,
          eq(serviceAccount.id, apiKey.serviceAccountId)
        )
        .where(eq(apiKey.lookupId, lookupId))
        .get()
      if (!row) return undefined
      return {
        keyId: row.key.id,
        keyName: row.key.name,
        digest: row.key.digest,
        state: keyState(row.key, now),
        lastUsedAt: row.key.lastUsedAt,
        permissions: parsePermissions(row.key.permissions),
        allApplications: row.key.allApplications,
        applicationIds: row.key.allApplications
          ? []
          : db
              .select({ id: apiKeyApplication.applicationId })
              .from(apiKeyApplication)
              .where(eq(apiKeyApplication.apiKeyId, row.key.id))
              .all()
              .map((item) => item.id),
        serviceAccount: {
          id: row.account.id,
          name: row.account.name,
          disabled: row.account.disabledAt !== null,
        },
      }
    },

    /** Records use at most once a minute, to keep requests read-mostly. */
    touchKey(keyId: string, now = new Date()) {
      db.update(apiKey)
        .set({ lastUsedAt: now })
        .where(
          and(
            eq(apiKey.id, keyId),
            or(
              isNull(apiKey.lastUsedAt),
              sql`${apiKey.lastUsedAt} < ${now.getTime() - 60_000}`
            )
          )
        )
        .run()
    },

    /** Names for decisions and audit entries. */
    names(serviceAccountId: string, keyId: string | null) {
      const account = db
        .select({ id: serviceAccount.id, name: serviceAccount.name })
        .from(serviceAccount)
        .where(eq(serviceAccount.id, serviceAccountId))
        .get()
      const key = keyId
        ? db
            .select({
              id: apiKey.id,
              name: apiKey.name,
              lookupId: apiKey.lookupId,
            })
            .from(apiKey)
            .where(eq(apiKey.id, keyId))
            .get()
        : undefined
      return account
        ? {
            serviceAccount: account,
            apiKey: key
              ? { id: key.id, name: key.name, prefix: keyPrefix(key.lookupId) }
              : null,
          }
        : null
    },
  }
}
export type ServiceAccountsRepository = ReturnType<
  typeof createServiceAccountsRepository
>
