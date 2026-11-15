import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

/*
 * Column rules (ADR 0001): only text, integer, real, boolean stored as
 * integer and timestamps stored as integer. JSON is stored as text.
 */

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

/*
 * Better Auth's tables (core plus the admin plugin). Better Auth reads and
 * writes them through its Drizzle adapter; the property names are the field
 * names it expects. Do not rename them.
 */

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" })

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  /** "admin" or "client". */
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
})

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
)

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    /** Password hash of an email and password account. */
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
)

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
)

/** A GitHub repository connected to Agent 6. Its clone is `DATA_DIR/repos/<id>`. */
export const repository = sqliteTable("repository", {
  id: text("id").primaryKey(),
  /** "owner/name", spelled as GitHub spells it. */
  fullName: text("full_name").notNull().unique(),
  trackedBranch: text("tracked_branch").notNull(),
  /** JSON array of Tags. */
  tags: text("tags").notNull().default("[]"),
  description: text("description").notNull().default(""),
  /** "pending", "syncing", "ready" or "failed". */
  status: text("status").notNull().default("pending"),
  /** Why the last sync failed. Null unless the status is "failed". */
  error: text("error"),
  syncStartedAt: timestamp("sync_started_at"),
  /** The last sync that succeeded. */
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncedCommit: text("last_synced_commit"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

/** A product supported by the organization. */
export const application = sqliteTable("application", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

/**
 * Typed Attachment tables keep real foreign keys. Steps 08/09 add sibling
 * tables for Database/Log Connections (including the Log Base Selector).
 * The service exposes them together as a discriminated Attachment union.
 */
export const repositoryAttachment = sqliteTable(
  "repository_attachment",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.repositoryId] }),
    index("repository_attachment_repository_idx").on(table.repositoryId),
  ]
)
