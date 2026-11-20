import { z } from "zod"
import { MAX_DECLINE_REASON } from "@/lib/tickets"

/*
 * Request and response schemas of API v1. The router validates with them and
 * the OpenAPI document is generated from them, so the two cannot drift.
 * Requests are strict: unknown fields are refused.
 */

const iso = z.iso.datetime({ offset: true })
const ref = z
  .object({ id: z.string(), name: z.string() })
  .strict()
  .describe("A reference to an Application.")
const tags = z
  .array(z.string().max(50))
  .max(20)
  .describe("Free-form labels that describe purpose. Tags never grant access.")

export const errorSchema = z
  .object({
    error: z
      .object({
        code: z
          .string()
          .describe(
            "Stable, machine-readable: for example not_found or validation_failed."
          ),
        message: z
          .string()
          .describe("What happened and what to do, for people."),
        field: z
          .string()
          .optional()
          .describe(
            "The request field the problem concerns, when there is one."
          ),
      })
      .strict(),
  })
  .strict()

export const createdSchema = z
  .object({ id: z.string().describe("The new record's ID.") })
  .strict()

export const pagingQuery = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(1)
      .describe("Page number, starting at 1."),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Records per page, at most 100."),
  })
  .strict()

export function pageOf<T extends z.ZodType>(item: T) {
  return z
    .object({
      data: z.array(item),
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z
        .number()
        .int()
        .describe("Records matching the filters within the API Key's scope."),
    })
    .strict()
}

// Repositories

export const repositorySchema = z
  .object({
    id: z.string(),
    fullName: z.string().describe('"owner/name" as GitHub spells it.'),
    trackedBranch: z.string().describe("The branch the agent reads."),
    tags,
    description: z.string(),
    sync: z
      .object({
        status: z.enum(["pending", "syncing", "ready", "failed"]),
        lastSyncedAt: iso.nullable(),
        lastSyncedCommit: z.string().nullable(),
      })
      .strict(),
    applications: z
      .array(ref)
      .describe("Applications it is attached to, within the API Key's scope."),
    createdAt: iso,
    updatedAt: iso,
  })
  .strict()

export const repositoryCreate = z
  .object({
    fullName: z
      .string()
      .min(1)
      .max(300)
      .describe('"owner/name", or the repository\'s GitHub address.'),
    trackedBranch: z.string().min(1).max(255),
    tags: tags.optional(),
    description: z.string().max(1000).optional(),
  })
  .strict()

export const repositoryUpdate = z
  .object({
    trackedBranch: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe("A new branch starts a sync in the background."),
    tags: tags.optional(),
    description: z.string().max(1000).optional(),
  })
  .strict()

export const repositoryFilters = pagingQuery.extend({
  q: z.string().max(200).optional().describe("Part of the full name."),
  applicationId: z
    .string()
    .max(100)
    .optional()
    .describe("Only Repositories attached to this Application."),
})

// Applications

export const applicationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    notes: z.string().describe("Admin notes the agent reads."),
    createdAt: iso,
    updatedAt: iso,
  })
  .strict()

export const applicationCreate = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    notes: z.string().max(10_000).optional(),
  })
  .strict()

export const applicationUpdate = applicationCreate.partial().strict()

export const applicationFilters = pagingQuery.extend({
  q: z.string().max(200).optional().describe("Part of the name."),
})

export const ATTACHMENT_KINDS = [
  "repository",
  "database-connection",
  "log-connection",
] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

export const attachmentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("repository"),
      resourceId: z.string(),
      name: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("database-connection"),
      resourceId: z.string(),
      name: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("log-connection"),
      resourceId: z.string(),
      name: z.string(),
      baseSelector: z
        .string()
        .describe("Confines every log query for this Application."),
    })
    .strict(),
])

export const attachmentsSchema = z
  .object({ data: z.array(attachmentSchema) })
  .strict()

export const attachmentPut = z
  .object({
    baseSelector: z
      .string()
      .max(4000)
      .optional()
      .describe(
        'Required for a Log Attachment, for example {app="billing"}. Not allowed for the other kinds.'
      ),
  })
  .strict()

// Connections

const connectionStatus = z.enum(["connected", "failed", "needs-secret"])

export const databaseConnectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tags,
    description: z.string(),
    status: z
      .object({
        state: connectionStatus.describe(
          "needs-secret: no password yet, so the agent cannot use it."
        ),
        writable: z
          .boolean()
          .nullable()
          .describe(
            "Whether the user can change data. The agent reads read-only either way."
          ),
      })
      .strict(),
    applications: z.array(ref),
    settings: z
      .object({
        host: z.string(),
        port: z.number().int(),
        database: z.string(),
        user: z.string(),
        sslMode: z.enum(["disable", "require", "verify-full"]),
      })
      .strict()
      .optional()
      .describe(
        "Only with database-connections:read-config. Never includes the password."
      ),
    createdAt: iso,
    updatedAt: iso,
  })
  .strict()

export const databaseConnectionCreate = z
  .object({
    name: z.string().min(1).max(255),
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1).max(255),
    user: z.string().min(1).max(255),
    password: z
      .string()
      .max(4096)
      .optional()
      .describe("Write-only. Encrypted at rest and never returned."),
    sslMode: z.enum(["disable", "require", "verify-full"]),
    tags: tags.optional(),
    description: z.string().max(4000).optional(),
  })
  .strict()

export const databaseConnectionUpdate = databaseConnectionCreate
  .partial()
  .strict()
  .describe(
    "Leave out password to keep the saved one. Changing host, port, database, user or SSL mode needs the password again."
  )

export const logConnectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tags,
    description: z.string(),
    status: z
      .object({
        state: connectionStatus.describe(
          "needs-secret: its auth type needs a secret that was not entered."
        ),
      })
      .strict(),
    applications: z.array(ref),
    settings: z
      .object({
        baseUrl: z.string(),
        authType: z.enum(["none", "basic", "bearer"]),
        authUsername: z.string(),
        tenantId: z.string(),
      })
      .strict()
      .optional()
      .describe(
        "Only with log-connections:read-config. Never includes the secret."
      ),
    createdAt: iso,
    updatedAt: iso,
  })
  .strict()

export const logConnectionCreate = z
  .object({
    name: z.string().min(1).max(255),
    baseUrl: z.string().min(1).max(2000),
    authType: z.enum(["none", "basic", "bearer"]),
    authUsername: z.string().max(255).optional().describe("Basic auth only."),
    authSecret: z
      .string()
      .max(4096)
      .optional()
      .describe(
        "Basic auth password or bearer token. Write-only. Encrypted at rest and never returned."
      ),
    tenantId: z.string().max(255).optional().describe("Sent as X-Scope-OrgID."),
    tags: tags.optional(),
    description: z.string().max(4000).optional(),
  })
  .strict()

export const logConnectionUpdate = logConnectionCreate
  .partial()
  .strict()
  .describe(
    "Leave out authSecret to keep the saved one. Changing base URL, tenant ID or username needs the secret again."
  )

export const connectionFilters = pagingQuery.extend({
  q: z.string().max(200).optional().describe("Part of the name."),
  applicationId: z
    .string()
    .max(100)
    .optional()
    .describe("Only connections attached to this Application."),
})

// Preferred Language

export const preferredLanguageSchema = z
  .object({
    preferredLanguage: z
      .string()
      .describe("The one language the agent answers everyone in."),
  })
  .strict()

export const preferredLanguagePut = z
  .object({ preferredLanguage: z.string().min(1).max(80) })
  .strict()

// Tickets

export const ticketSchema = z
  .object({
    id: z.string(),
    status: z.enum(["pending", "accepted", "declined"]),
    kind: z.enum(["code-fix", "data-fix", "feature-request"]),
    summary: z
      .string()
      .describe("Short non-technical summary for the Conversation's owner."),
    application: ref,
    repository: z
      .object({
        id: z
          .string()
          .nullable()
          .describe("Null once the Repository was removed."),
        fullName: z.string(),
      })
      .strict(),
    filing: z
      .boolean()
      .describe(
        "An acceptance is filing the issue on GitHub right now. Read again before retrying."
      ),
    createdAt: iso,
    decidedAt: iso.nullable(),
    decidedBy: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("admin") }).strict(),
        z
          .object({
            type: z.literal("service-account"),
            serviceAccount: ref,
            apiKey: z
              .object({ id: z.string(), name: z.string(), prefix: z.string() })
              .strict()
              .nullable(),
          })
          .strict(),
      ])
      .nullable()
      .describe(
        "Who decided: an Admin in Agent 6, or a Service Account's API Key."
      ),
    details: z
      .object({
        title: z.string().describe("Developer title."),
        description: z.string().describe("Developer description in Markdown."),
        declineReason: z.string().nullable(),
        targetIssue: z.object({ number: z.number().int() }).strict().nullable(),
        filedIssue: z
          .object({
            outcome: z.enum(["new", "comment"]),
            repository: z.string(),
            number: z.number().int(),
            url: z.string(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .optional()
      .describe("Only with tickets:read-details."),
  })
  .strict()

export const ticketFilters = pagingQuery.extend({
  status: z
    .enum(["pending", "accepted", "declined"])
    .optional()
    .describe("Every status when left out."),
  kind: z.enum(["code-fix", "data-fix", "feature-request"]).optional(),
  applicationId: z.string().max(100).optional(),
})

export const ticketAccept = z
  .object({})
  .strict()
  .describe("Empty. Acceptance files the Ticket exactly as stored.")

export const ticketDecline = z
  .object({
    reason: z
      .string()
      .min(1)
      .max(MAX_DECLINE_REASON)
      .describe("The Conversation's owner reads it exactly as written."),
  })
  .strict()
