import { z } from "zod"

/*
 * Webhook Subscriptions and their events. The event schema here is the
 * contract: the server builds every payload through it, and the public
 * reference page renders it.
 */

export const WEBHOOK_EVENT_TYPES = [
  "ticket.created",
  "ticket.accepted",
  "ticket.declined",
  "github.issue.created",
] as const
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export const webhookEventDescriptions: Record<WebhookEventType, string> = {
  "ticket.created": "The agent created a new pending Ticket.",
  "ticket.accepted":
    "A Ticket was accepted and its Filed Issue recorded: a new GitHub issue or an occurrence comment on an existing one.",
  "ticket.declined": "A pending Ticket was declined with a reason.",
  "github.issue.created":
    "Accepting a Ticket opened a new GitHub issue. Sent alongside ticket.accepted.",
}

/** The synthetic event an Admin sends to check a destination. */
export const WEBHOOK_TEST_EVENT_TYPE = "webhook.test"

/** Bumped only for changes a receiver could break on. */
export const WEBHOOK_EVENT_VERSION = 1

const iso = z.iso.datetime({ offset: true })

export const webhookTicketSchema = z
  .object({
    id: z.string().describe("The Ticket's ID, also used by the API."),
    kind: z
      .enum(["code-fix", "data-fix", "feature-request"])
      .describe("Code Fix, Data Fix or Feature Request."),
    status: z
      .enum(["pending", "accepted", "declined"])
      .describe("The status after the change this event describes."),
    title: z.string().describe("Developer title, as filed on GitHub."),
    description: z
      .string()
      .describe(
        "Developer description in Markdown: the agent's evidence and proposed fix. Redacted for emails, phone numbers and credentials."
      ),
    summary: z
      .string()
      .describe(
        "Short non-technical summary for the Conversation's owner, in the Preferred Language."
      ),
    declineReason: z
      .string()
      .nullable()
      .describe(
        "The reason given when the Ticket was declined; otherwise null."
      ),
    createdAt: iso.describe("When the agent created the Ticket."),
    decidedAt: iso
      .nullable()
      .describe("When the Ticket was accepted or declined; otherwise null."),
    application: z
      .object({ id: z.string(), name: z.string() })
      .describe("The Application of the Conversation the Ticket came from."),
    repository: z
      .object({
        id: z
          .string()
          .nullable()
          .describe("Null once the Repository was removed from Agent 6."),
        fullName: z.string().describe('"owner/name" on GitHub.'),
      })
      .describe("Where the issue is, or would be, filed."),
    targetIssue: z
      .object({ number: z.number().int() })
      .nullable()
      .describe(
        "The open Agent 6 issue an accepted Ticket adds an occurrence to; null for a new issue."
      ),
    filedIssue: z
      .object({
        outcome: z
          .enum(["new", "comment"])
          .describe(
            '"new": acceptance opened the issue. "comment": it added an occurrence comment to an existing issue.'
          ),
        repository: z.string().describe('"owner/name" on GitHub.'),
        number: z.number().int(),
        url: z.url().describe("The issue on GitHub."),
      })
      .nullable()
      .describe("The Filed Issue of an accepted Ticket; otherwise null."),
  })
  .strict()
export type WebhookTicket = z.infer<typeof webhookTicketSchema>

export const webhookEventSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Stable event ID, also sent as the webhook-id header. The same on every retry: use it to deduplicate."
      ),
    type: z.enum(WEBHOOK_EVENT_TYPES).describe("What happened."),
    version: z
      .literal(WEBHOOK_EVENT_VERSION)
      .describe("The payload schema version."),
    occurredAt: iso.describe(
      "When the change was committed in Agent 6. Not the attempt time."
    ),
    data: z
      .object({ ticket: webhookTicketSchema })
      .strict()
      .describe("A snapshot of the Ticket at the time of the event."),
  })
  .strict()
export type WebhookEvent = z.infer<typeof webhookEventSchema>

export const webhookTestEventSchema = z
  .object({
    id: z.string(),
    type: z.literal(WEBHOOK_TEST_EVENT_TYPE),
    version: z.literal(WEBHOOK_EVENT_VERSION),
    occurredAt: iso,
    data: z
      .object({
        message: z.string(),
        subscription: z.object({ id: z.string(), name: z.string() }),
      })
      .strict(),
  })
  .strict()

export type WebhookDeliveryStatus =
  "pending" | "succeeded" | "failed" | "cancelled"
export const WEBHOOK_DELIVERY_STATUSES: Array<WebhookDeliveryStatus> = [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
]
export const webhookDeliveryStatusLabels: Record<
  WebhookDeliveryStatus,
  string
> = {
  pending: "Pending",
  succeeded: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
}

export const WEBHOOKS_PAGE_SIZE = 20
export const DELIVERIES_PAGE_SIZE = 20
export const MAX_WEBHOOK_NAME = 100
export const MAX_WEBHOOK_URL = 2000
/** How long the replaced secret keeps signing after a rotation with overlap. */
export const SECRET_OVERLAP_HOURS = 24
/** Automatic retries stop this long after the first attempt. */
export const RETRY_WINDOW_HOURS = 24
/** Receivers should refuse webhook-timestamp values further off than this. */
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60
/** Each attempt, including a test, gives up after this long. */
export const WEBHOOK_TIMEOUT_SECONDS = 10
/** Completed Webhook Deliveries are kept this long. */
export const DELIVERY_RETENTION_DAYS = 30

export const webhookInput = z.object({
  name: z.string(),
  url: z.string(),
  enabled: z.boolean(),
  eventTypes: z.array(z.string()).max(20),
  allApplications: z.boolean(),
  applicationIds: z.array(z.string()).max(1000),
})
export type WebhookInput = z.infer<typeof webhookInput>
export type WebhookField = keyof WebhookInput

/** Delivery history filters, kept apart from the list's `q` and `page`. */
export const deliverySearch = z.object({
  delivery: z.enum(["pending", "succeeded", "failed", "cancelled"]).optional(),
  deliveryPage: z.number().int().min(1).optional(),
})
export type DeliveryFilters = z.infer<typeof deliverySearch>

export type WebhookSubscriptionSummary = {
  id: string
  name: string
  url: string
  enabled: boolean
  eventTypes: Array<WebhookEventType>
  allApplications: boolean
  /** Deliveries that gave up, waiting for an Admin to look. */
  failedDeliveries: number
}

export type WebhookSubscriptionsPage = {
  subscriptions: Array<WebhookSubscriptionSummary>
  total: number
  page: number
  pageSize: number
}

export type WebhookDeliverySummary = {
  id: string
  eventId: string
  eventType: string
  ticketId: string | null
  status: WebhookDeliveryStatus
  attempts: number
  /** The destination it was queued for. */
  url: string
  lastStatus: number | null
  lastResult: string | null
  lastAttemptAt: number | null
  nextAttemptAt: number | null
  createdAt: number
  /** An Admin may send it again now. */
  retryable: boolean
}

export type WebhookSubscriptionDetail = WebhookSubscriptionSummary & {
  applications: Array<{ id: string; name: string }>
  /** A replaced secret that still signs, until this time. */
  previousSecretExpiresAt: number | null
  createdAt: number
  deliveries: {
    items: Array<WebhookDeliverySummary>
    total: number
    page: number
    pageSize: number
  }
}

export type WebhookProblem = {
  ok: false
  message: string
  field?: WebhookField
}

/** The signing secret is in the answer only on creation and rotation. */
export type WebhookSecretResult =
  { ok: true; id: string; secret: string } | WebhookProblem
export type WebhookResult = { ok: true; id: string } | WebhookProblem
export type WebhookTestResult =
  | { ok: true; delivered: boolean; status: number | null; result: string }
  | WebhookProblem
