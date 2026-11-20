import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
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

export const databaseConnection = sqliteTable("database_connection", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  database: text("database").notNull(),
  user: text("user").notNull(),
  /**
   * Null means Needs Secret: imported from a Setup File without its password.
   * An empty password is stored encrypted like any other.
   */
  encryptedPassword: text("encrypted_password"),
  sslMode: text("ssl_mode").notNull(),
  tags: text("tags").notNull().default("[]"),
  description: text("description").notNull().default(""),
  testOk: integer("test_ok", { mode: "boolean" }).notNull(),
  testMessage: text("test_message").notNull(),
  writable: integer("writable", { mode: "boolean" }),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const databaseConnectionAttachment = sqliteTable(
  "database_connection_attachment",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    databaseConnectionId: text("database_connection_id")
      .notNull()
      .references(() => databaseConnection.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.databaseConnectionId] }),
    index("database_connection_attachment_connection_idx").on(
      table.databaseConnectionId
    ),
  ]
)

export const logConnection = sqliteTable("log_connection", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  /** "none", "basic" or "bearer". */
  authType: text("auth_type").notNull(),
  authUsername: text("auth_username").notNull().default(""),
  /**
   * The basic auth password or bearer token. Null when authType is "none";
   * null with another authType means Needs Secret.
   */
  encryptedAuthSecret: text("encrypted_auth_secret"),
  tenantId: text("tenant_id").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  description: text("description").notNull().default(""),
  testOk: integer("test_ok", { mode: "boolean" }).notNull(),
  testMessage: text("test_message").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const logConnectionAttachment = sqliteTable(
  "log_connection_attachment",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    logConnectionId: text("log_connection_id")
      .notNull()
      .references(() => logConnection.id, { onDelete: "cascade" }),
    /** Confines every log query for this Application. Stored in parsed-and-reformatted form. */
    baseSelector: text("base_selector").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.logConnectionId] }),
    index("log_connection_attachment_connection_idx").on(table.logConnectionId),
  ]
)

/**
 * Typed Attachment tables keep real foreign keys. The service exposes them
 * together as a discriminated Attachment union.
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

/** History contains SDK run items, including tool calls/results; never sent to the browser. */
export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    history: text("history").notNull().default("[]"),
    refreshedAt: timestamp("refreshed_at"),
    runningUntil: timestamp("running_until"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("conversation_user_idx").on(table.userId),
    index("conversation_application_idx").on(table.applicationId),
    index("conversation_activity_idx").on(table.updatedAt, table.id),
  ]
)

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull(),
    /** Agent answer given without the pictures because the model refused them. */
    imagesUnread: integer("images_unread", { mode: "boolean" })
      .notNull()
      .default(false),
    refused: integer("refused", { mode: "boolean" }).notNull().default(false),
    /** Interactive Question on an agent message: JSON `{ options, multiple }`. */
    question: text("question"),
    /** Its answer, null while open: JSON `{ choices, other }`. */
    answer: text("answer"),
    /** Redacted tool inputs and errors; never part of the Client projection. */
    activity: text("activity").notNull().default("[]"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("message_conversation_idx").on(table.conversationId, table.createdAt),
  ]
)

/**
 * An uploaded picture. The bytes live in `DATA_DIR/uploads/<id>`, with a
 * downscaled copy for the model in `<id>.model` when `modelType` is set.
 * `messageId` is null until the message it was picked for is sent.
 */
export const upload = sqliteTable(
  "upload",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => message.id, {
      onDelete: "cascade",
    }),
    /** Order within the message. */
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    /** Detected from the content: "image/png", "image/jpeg" or "image/webp". */
    type: text("type").notNull(),
    size: integer("size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Type of the copy sent to the model; null when the original is sent. */
    modelType: text("model_type"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("upload_message_idx").on(table.messageId),
    index("upload_user_idx").on(table.userId),
  ]
)

/**
 * A Filed Issue, or a report that failed, on the Conversation that led to it.
 * `messageId` is the agent answer it belongs to.
 */
export const filedIssue = sqliteTable(
  "filed_issue",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    /** "owner/name" of the Repository, kept as text so the record outlives it. */
    repository: text("repository").notNull(),
    /** "code-fix" or "data-fix". */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** "new", "comment" (added to an existing issue) or "failed". */
    outcome: text("outcome").notNull(),
    /** Null when the outcome is "failed". */
    issueNumber: integer("issue_number"),
    url: text("url"),
    /** Why reporting failed, for Admins. Null otherwise. */
    error: text("error"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("filed_issue_conversation_idx").on(table.conversationId)]
)

/**
 * A Ticket: a Code Fix or Data Fix report the agent prepared from a
 * Conversation, waiting for an Admin to accept or decline it. Accepting files
 * the issue on GitHub and links the resulting Filed Issue.
 * `messageId` is the agent answer it belongs to; like a Filed Issue's it has no
 * foreign key because a retry gives the answer a new id.
 */
export const ticket = sqliteTable(
  "ticket",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    /** Null once the Repository is removed; `repository` keeps its name. */
    repositoryId: text("repository_id").references(() => repository.id, {
      onDelete: "set null",
    }),
    /** "owner/name" of the Repository when the Ticket was last changed. */
    repository: text("repository").notNull(),
    /** "code-fix" or "data-fix". */
    kind: text("kind").notNull(),
    /** For developers: the GitHub issue title. */
    title: text("title").notNull(),
    /** For developers: redacted Markdown sections, without heading or footer. */
    body: text("body").notNull(),
    /** For the owner: short, non-technical, in the Preferred Language. */
    summary: text("summary").notNull(),
    /** Open Agent 6 issue to add an occurrence to; null for a new issue. */
    targetIssueNumber: integer("target_issue_number"),
    /** Pending Ticket the agent thought described the same fault. */
    possibleDuplicateOf: text("possible_duplicate_of").references(
      (): AnySQLiteColumn => ticket.id,
      { onDelete: "set null" }
    ),
    /** "pending", "accepted" or "declined". */
    status: text("status").notNull().default("pending"),
    /** Written by the Admin for the owner, shown exactly as written. */
    declineReason: text("decline_reason"),
    /** The Admin who decided; null for a Service Account's decision. */
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Set when a Service Account decided through the API, with its API Key. */
    decidedByServiceAccountId: text("decided_by_service_account_id").references(
      (): AnySQLiteColumn => serviceAccount.id,
      {
        onDelete: "set null",
      }
    ),
    decidedByApiKeyId: text("decided_by_api_key_id").references(
      (): AnySQLiteColumn => apiKey.id,
      { onDelete: "set null" }
    ),
    decidedAt: timestamp("decided_at"),
    /** Why the last acceptance could not file the issue, for Admins. */
    lastError: text("last_error"),
    /** Set while an acceptance is filing the issue. */
    filingUntil: timestamp("filing_until"),
    /**
     * Identifies the acceptance holding `filingUntil`. Only that acceptance
     * may complete or release it.
     */
    filingClaim: text("filing_claim"),
    filedIssueId: text("filed_issue_id").references(() => filedIssue.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("ticket_status_idx").on(table.status, table.createdAt),
    index("ticket_conversation_idx").on(table.conversationId),
    index("ticket_repository_idx").on(table.repositoryId, table.status),
  ]
)

/** An identity an Admin creates so an external integration can use the API. */
export const serviceAccount = sqliteTable("service_account", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** A disabled Service Account's API Keys stop working until it is enabled. */
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

/**
 * A credential of a Service Account. The key itself is shown once and never
 * stored: `lookupId` finds the record, `digest` checks the secret part.
 * Keys are revoked, not deleted, so decisions and audit events keep them.
 */
export const apiKey = sqliteTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    serviceAccountId: text("service_account_id")
      .notNull()
      .references(() => serviceAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Public part of the key, also its visible prefix. */
    lookupId: text("lookup_id").notNull().unique(),
    /** SHA-256 of the secret part, as hex. */
    digest: text("digest").notNull(),
    /** JSON array of permission names. A new key has none. */
    permissions: text("permissions").notNull().default("[]"),
    /** Every Application, including future ones, instead of `api_key_application`. */
    allApplications: integer("all_applications", { mode: "boolean" })
      .notNull()
      .default(false),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("api_key_service_account_idx").on(table.serviceAccountId)]
)

/** The Applications an API Key may reach when it lacks all-Applications access. */
export const apiKeyApplication = sqliteTable(
  "api_key_application",
  {
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => apiKey.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.apiKeyId, table.applicationId] }),
    index("api_key_application_application_idx").on(table.applicationId),
  ]
)

/**
 * A protected change and who made it. Holds ids only, never key material or
 * request bodies. Plain text ids so the record outlives what it names.
 */
export const auditEvent = sqliteTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    /** "admin" or "service-account". */
    actorType: text("actor_type").notNull(),
    userId: text("user_id"),
    serviceAccountId: text("service_account_id"),
    apiKeyId: text("api_key_id"),
    /** For example "tickets.accept". */
    operation: text("operation").notNull(),
    /** For example "ticket". */
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("audit_event_service_account_idx").on(
      table.serviceAccountId,
      table.createdAt
    ),
    index("audit_event_created_idx").on(table.createdAt),
  ]
)

/** Sends selected events to an external HTTPS destination, signed. */
export const webhookSubscription = sqliteTable("webhook_subscription", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** A public HTTPS address. */
  url: text("url").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** JSON array of event types. */
  eventTypes: text("event_types").notNull().default("[]"),
  allApplications: integer("all_applications", { mode: "boolean" })
    .notNull()
    .default(false),
  /** The signing secret, encrypted with `secrets.ts`. */
  encryptedSecret: text("encrypted_secret").notNull(),
  /** The secret a rotation with overlap replaced; it also signs until it expires. */
  encryptedPreviousSecret: text("encrypted_previous_secret"),
  previousSecretExpiresAt: timestamp("previous_secret_expires_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const webhookSubscriptionApplication = sqliteTable(
  "webhook_subscription_application",
  {
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => webhookSubscription.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId, table.applicationId] }),
    index("webhook_subscription_application_application_idx").on(
      table.applicationId
    ),
  ]
)

/**
 * An event, saved in the transaction of the change it describes. `payload` is
 * the exact body every attempt sends. Plain text references so the event
 * outlives what it names.
 */
export const webhookEvent = sqliteTable(
  "webhook_event",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    applicationId: text("application_id"),
    ticketId: text("ticket_id"),
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("webhook_event_created_idx").on(table.createdAt)]
)

/** The sending of one event to one Webhook Subscription. */
export const webhookDelivery = sqliteTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => webhookEvent.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => webhookSubscription.id, { onDelete: "cascade" }),
    /** The destination when the delivery was queued. */
    url: text("url").notNull(),
    /** "pending", "succeeded", "failed" or "cancelled". */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** When a pending delivery is due. */
    nextAttemptAt: timestamp("next_attempt_at"),
    /** Automatic retries stop after this. */
    retryUntil: timestamp("retry_until").notNull(),
    /** Held while a dispatcher sends it; recovered when it passes. */
    leaseUntil: timestamp("lease_until"),
    leaseToken: text("lease_token"),
    lastAttemptAt: timestamp("last_attempt_at"),
    /** HTTP status of the last answer, if there was one. */
    lastStatus: integer("last_status"),
    /** What happened on the last attempt, without response content. */
    lastResult: text("last_result"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("webhook_delivery_due_idx").on(table.status, table.nextAttemptAt),
    index("webhook_delivery_subscription_idx").on(
      table.subscriptionId,
      table.createdAt
    ),
    index("webhook_delivery_event_idx").on(table.eventId),
  ]
)
