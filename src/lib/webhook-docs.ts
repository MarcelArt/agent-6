import type { WebhookEvent, WebhookEventType, WebhookTicket } from "./webhooks"
import {
  TIMESTAMP_TOLERANCE_SECONDS,
  WEBHOOK_EVENT_VERSION,
  WEBHOOK_TEST_EVENT_TYPE,
  webhookEventSchema,
  webhookTestEventSchema,
} from "./webhooks"

/*
 * Material for the public webhook reference: synthetic example events,
 * checked against the event schema, and the receiver's verification code.
 * src/server/webhook-docs.test.ts runs that code against real signatures.
 */

/** Delays after each failed attempt, as documented; the last repeats. */
export const DOCUMENTED_RETRY_DELAYS = [
  "5 seconds",
  "5 minutes",
  "30 minutes",
  "2 hours",
  "5 hours",
  "10 hours",
]
export const DOCUMENTED_RETRY_DELAYS_MS = [
  5_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  5 * 3_600_000,
  10 * 3_600_000,
]

const pending: WebhookTicket = {
  id: "7c1f2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b",
  kind: "code-fix",
  status: "pending",
  title: "Invoice total is empty when a delivery has no price",
  description:
    "### What the agent found\n\nInvoices for October stop at delivery 8812, which has no unit price.\n\n### Suggested fix\n\nSkip deliveries without a price and list them for review.",
  summary:
    "Your October invoice cannot be created yet. The team will review the problem.",
  declineReason: null,
  createdAt: "2026-11-20T09:12:04.512Z",
  decidedAt: null,
  application: {
    id: "3e8a1f20-5c6b-4d7e-9f80-a1b2c3d4e5f6",
    name: "Billing",
  },
  repository: {
    id: "b5c6d7e8-f9a0-4b1c-8d2e-3f4a5b6c7d8e",
    fullName: "example-org/billing-service",
  },
  targetIssue: null,
  filedIssue: null,
}

const decidedAt = "2026-11-20T10:03:41.207Z"

function event(
  id: string,
  type: WebhookEventType,
  occurredAt: string,
  ticket: WebhookTicket
): WebhookEvent {
  return webhookEventSchema.parse({
    id,
    type,
    version: WEBHOOK_EVENT_VERSION,
    occurredAt,
    data: { ticket },
  })
}

const acceptedNew: WebhookTicket = {
  ...pending,
  status: "accepted",
  decidedAt,
  filedIssue: {
    outcome: "new",
    repository: "example-org/billing-service",
    number: 142,
    url: "https://github.com/example-org/billing-service/issues/142",
  },
}

const acceptedOccurrence: WebhookTicket = {
  ...pending,
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  createdAt: "2026-11-20T11:40:19.033Z",
  summary:
    "Your invoice for the Harbor depot cannot be created yet. The team will review the problem.",
  status: "accepted",
  decidedAt: "2026-11-20T12:15:02.881Z",
  targetIssue: { number: 142 },
  filedIssue: {
    outcome: "comment",
    repository: "example-org/billing-service",
    number: 142,
    url: "https://github.com/example-org/billing-service/issues/142",
  },
}

/** One example of each event, about the same synthetic Ticket. */
export const WEBHOOK_EXAMPLES: Record<WebhookEventType, WebhookEvent> = {
  "ticket.created": event(
    "evt_2b1f0c9d8e7a4b6c9d0e1f2a3b4c5d6e",
    "ticket.created",
    pending.createdAt,
    pending
  ),
  "ticket.accepted": event(
    "evt_5e4d3c2b1a0f4e9d8c7b6a5f4e3d2c1b",
    "ticket.accepted",
    decidedAt,
    acceptedNew
  ),
  "ticket.declined": event(
    "evt_8a7b6c5d4e3f4a2b1c0d9e8f7a6b5c4d",
    "ticket.declined",
    decidedAt,
    {
      ...pending,
      status: "declined",
      decidedAt,
      declineReason:
        "Delivery 8812 was entered without a price on purpose; it is a free replacement.",
    }
  ),
  "github.issue.created": event(
    "evt_1c2d3e4f5a6b4c7d8e9f0a1b2c3d4e5f",
    "github.issue.created",
    decidedAt,
    acceptedNew
  ),
}

/**
 * Accepting a Ticket that targets an existing issue adds an occurrence
 * comment and sends ticket.accepted only.
 */
export const OCCURRENCE_EXAMPLE: WebhookEvent = event(
  "evt_4f3e2d1c0b9a4f8e7d6c5b4a3f2e1d0c",
  "ticket.accepted",
  acceptedOccurrence.decidedAt!,
  acceptedOccurrence
)

export const TEST_EVENT_EXAMPLE = webhookTestEventSchema.parse({
  id: "evt_test_0a1b2c3d4e5f4a6b7c8d9e0f1a2b3c4d",
  type: WEBHOOK_TEST_EVENT_TYPE,
  version: WEBHOOK_EVENT_VERSION,
  occurredAt: "2026-11-20T09:00:00.000Z",
  data: {
    message:
      "A test event from Agent 6. Verify its signature, then answer with any 2xx status.",
    subscription: {
      id: "c0ffee00-1234-4abc-8def-0123456789ab",
      name: "Example receiver",
    },
  },
})

/** What the headers of one attempt look like. The signature is illustrative. */
export const EXAMPLE_HEADERS = [
  "POST /agent6 HTTP/1.1",
  "Content-Type: application/json",
  "User-Agent: Agent6-Webhooks/1",
  `webhook-id: ${WEBHOOK_EXAMPLES["ticket.created"].id}`,
  "webhook-timestamp: 1795165924",
  "webhook-signature: v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
].join("\n")

/**
 * The receiver's check, in Node.js. Keep it self-contained: the test writes
 * it to a file and imports it.
 */
export const VERIFY_WEBHOOK_CODE = `import { createHmac, timingSafeEqual } from "node:crypto"

const TOLERANCE_SECONDS = ${TIMESTAMP_TOLERANCE_SECONDS}

/**
 * Checks an Agent 6 webhook and answers its event, or throws.
 * rawBody: the exact request body as received, before any JSON parsing.
 * headers: the request headers, with lowercase names.
 * secret: the subscription's signing secret, "whsec_…".
 */
export function verifyWebhook(rawBody, headers, secret, now = Date.now()) {
  const id = headers["webhook-id"]
  const timestamp = headers["webhook-timestamp"]
  const signatures = headers["webhook-signature"]
  if (!id || !timestamp || !signatures) throw new Error("Missing webhook headers")

  const seconds = Number(timestamp)
  if (!Number.isInteger(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS)
    throw new Error("Timestamp is too old or too far in the future")

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key)
    .update(\`\${id}.\${timestamp}.\${rawBody}\`)
    .digest()

  // During a secret rotation the header holds one signature per secret.
  const valid = signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",")
    if (version !== "v1" || !value) return false
    const actual = Buffer.from(value, "base64")
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
  if (!valid) throw new Error("Invalid signature")

  return JSON.parse(rawBody)
}
`

/** A receiver built on the check above. */
export const EXPRESS_RECEIVER_CODE = `import express from "express"
import { verifyWebhook } from "./verify-webhook.mjs"

const app = express()
const seen = new Set() // Use your database in production.

// express.raw keeps the exact bytes the signature covers.
app.post("/agent6", express.raw({ type: "application/json" }), (req, res) => {
  let event
  try {
    event = verifyWebhook(req.body.toString("utf8"), req.headers, process.env.AGENT6_WEBHOOK_SECRET)
  } catch {
    return res.sendStatus(400)
  }
  // Answer quickly; Agent 6 waits at most a few seconds.
  res.sendStatus(204)
  if (seen.has(event.id)) return // A repeat of an event already handled.
  seen.add(event.id)
  queueMicrotask(() => handle(event))
})

function handle(event) {
  if (event.type === "ticket.accepted") {
    const { filedIssue } = event.data.ticket
    console.log(\`Filed: \${filedIssue.url} (\${filedIssue.outcome})\`)
  }
}

app.listen(8080)
`
