import "@tanstack/react-start/server-only"

import { randomUUID } from "node:crypto"
import { decrypt, encrypt } from "./secrets"
import { requireAdmin } from "./session"
import {
  DestinationError,
  describeResult,
  postWebhook,
  resolvePublic,
  validWebhookUrl,
} from "./webhook-destination"
import { getWebhookDispatcher } from "./webhook-dispatcher"
import { newSigningSecret, signedHeaders } from "./webhook-signature"
import { createApplicationsRepository } from "./repositories/applications"
import { createAuditRepository } from "./repositories/audit"
import { createWebhooksRepository } from "./repositories/webhooks"
import type { Auth } from "./auth"
import type { Resolver } from "./webhook-destination"
import type { Transport } from "./webhook-dispatcher"
import type { ApplicationsRepository } from "./repositories/applications"
import type { AuditRepository } from "./repositories/audit"
import type {
  SubscriptionValues,
  WebhooksRepository,
} from "./repositories/webhooks"
import type {
  DeliveryFilters,
  WebhookField,
  WebhookInput,
  WebhookSubscriptionDetail,
} from "@/lib/webhooks"
import {
  MAX_WEBHOOK_NAME,
  SECRET_OVERLAP_HOURS,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_VERSION,
  WEBHOOK_TEST_EVENT_TYPE,
  webhookTestEventSchema,
} from "@/lib/webhooks"

export class WebhookError extends Error {
  constructor(
    message: string,
    public readonly field?: WebhookField,
    public readonly status = 400
  ) {
    super(message)
    this.name = "WebhookError"
  }
}

/**
 * Admins manage Webhook Subscriptions: destinations, selections, signing
 * secrets, test events and retries. Every method checks the Admin session
 * itself, and every change is audited.
 */
export function createWebhookManagement(
  deps: {
    auth?: Auth
    webhooks?: WebhooksRepository
    applications?: ApplicationsRepository
    audit?: AuditRepository
    now?: () => Date
    /** Resolves a host name to addresses that must all be public. */
    resolve?: Resolver
    /** Sends a test event. */
    send?: Transport
    /** Asks the dispatcher to look for due work now. */
    kick?: () => void
  } = {}
) {
  const webhooks = deps.webhooks ?? createWebhooksRepository()
  const applications = deps.applications ?? createApplicationsRepository()
  const audit = deps.audit ?? createAuditRepository()
  const now = () => deps.now?.() ?? new Date()
  const resolve = deps.resolve ?? resolvePublic
  const send: Transport =
    deps.send ??
    ((url, body, headers) => postWebhook(url, body, headers, { resolve }))
  const kick = deps.kick ?? (() => getWebhookDispatcher().kick())

  async function admin(headers: Headers) {
    const user = await requireAdmin({ auth: deps.auth, headers })
    return { type: "admin" as const, userId: user.id }
  }

  function existing(id: string) {
    const found = webhooks.findById(id)
    if (!found)
      throw new WebhookError(
        "This Webhook Subscription no longer exists. Go back to the list.",
        undefined,
        404
      )
    return found
  }

  /** The address as stored, checked to lead only to public addresses. */
  async function destination(text: string) {
    try {
      const url = validWebhookUrl(text)
      await resolve(new URL(url).hostname.replace(/^\[|\]$/g, ""))
      return url
    } catch (error) {
      if (error instanceof DestinationError)
        throw new WebhookError(error.message, "url")
      throw error
    }
  }

  async function valid(
    input: WebhookInput,
    before?: { url: string }
  ): Promise<SubscriptionValues> {
    const name = input.name.trim()
    if (!name || name.length > MAX_WEBHOOK_NAME)
      throw new WebhookError(
        `Enter a name of up to ${MAX_WEBHOOK_NAME} characters, for example the system that receives the events.`,
        "name"
      )
    const typed = input.url.trim()
    const url =
      before && typed === before.url ? before.url : await destination(typed)
    const eventTypes = WEBHOOK_EVENT_TYPES.filter((type) =>
      input.eventTypes.includes(type)
    )
    if (
      !eventTypes.length ||
      input.eventTypes.some(
        (type) => !(WEBHOOK_EVENT_TYPES as ReadonlyArray<string>).includes(type)
      )
    )
      throw new WebhookError("Choose at least one event to send.", "eventTypes")
    const applicationIds = [...new Set(input.applicationIds)]
    if (!input.allApplications) {
      if (!applicationIds.length)
        throw new WebhookError(
          "Choose the Applications whose events to send, or All Applications.",
          "applicationIds"
        )
      if (applicationIds.some((id) => !applications.findById(id)))
        throw new WebhookError(
          "One of the chosen Applications no longer exists. Reload and choose again.",
          "applicationIds"
        )
    }
    return {
      name,
      url,
      enabled: input.enabled,
      eventTypes,
      allApplications: input.allApplications,
      applicationIds: input.allApplications ? [] : applicationIds,
    }
  }

  return {
    async list(
      headers: Headers,
      options: { search?: string; page?: number } = {}
    ) {
      await admin(headers)
      return webhooks.list(options)
    },

    async get(
      headers: Headers,
      id: string,
      filters: DeliveryFilters = {}
    ): Promise<WebhookSubscriptionDetail | null> {
      await admin(headers)
      const found = webhooks.findById(id)
      if (!found) return null
      return {
        ...found,
        previousSecretExpiresAt:
          found.previousSecretExpiresAt && found.previousSecretExpiresAt > now()
            ? found.previousSecretExpiresAt.getTime()
            : null,
        createdAt: found.createdAt.getTime(),
        deliveries: webhooks.deliveries(id, filters, now()),
      }
    },

    /** The signing secret is in the answer this once. */
    async create(headers: Headers, input: WebhookInput) {
      const actor = await admin(headers)
      const values = await valid(input)
      const secret = newSigningSecret()
      const id = webhooks.create(values, encrypt(secret), now())
      audit.record(
        actor,
        {
          operation: "webhooks.create",
          targetType: "webhook-subscription",
          targetId: id,
        },
        now()
      )
      return { id, secret }
    },

    /**
     * Disabling, or a new destination, cancels deliveries still waiting.
     * Narrower selections apply to queued work when it is sent.
     */
    async update(headers: Headers, id: string, input: WebhookInput) {
      const actor = await admin(headers)
      const before = existing(id)
      webhooks.update(id, await valid(input, before), now())
      audit.record(
        actor,
        {
          operation: "webhooks.update",
          targetType: "webhook-subscription",
          targetId: id,
        },
        now()
      )
    },

    /**
     * A new signing secret, shown this once. With overlap, the old one also
     * signs for a while, so receivers can switch without missing events.
     */
    async rotateSecret(
      headers: Headers,
      id: string,
      mode: "overlap" | "replace"
    ) {
      const actor = await admin(headers)
      existing(id)
      const secret = newSigningSecret()
      webhooks.rotateSecret(
        id,
        encrypt(secret),
        mode === "overlap"
          ? new Date(now().getTime() + SECRET_OVERLAP_HOURS * 3_600_000)
          : null,
        now()
      )
      audit.record(
        actor,
        {
          operation: `webhooks.rotate-secret.${mode}`,
          targetType: "webhook-subscription",
          targetId: id,
        },
        now()
      )
      return { secret }
    },

    /** Sends a synthetic signed event now and answers what happened. */
    async sendTest(headers: Headers, id: string) {
      await admin(headers)
      const found = existing(id)
      let secrets: Array<string>
      try {
        secrets = (webhooks.secrets(id, now()) ?? []).map((value) =>
          decrypt(value)
        )
      } catch {
        throw new WebhookError(
          "The signing secret could not be opened. Rotate it, then try again."
        )
      }
      const at = now()
      const eventId = `evt_test_${randomUUID().replaceAll("-", "")}`
      const body = JSON.stringify(
        webhookTestEventSchema.parse({
          id: eventId,
          type: WEBHOOK_TEST_EVENT_TYPE,
          version: WEBHOOK_EVENT_VERSION,
          occurredAt: at.toISOString(),
          data: {
            message:
              "A test event from Agent 6. Verify its signature, then answer with any 2xx status.",
            subscription: { id: found.id, name: found.name },
          },
        })
      )
      const result = describeResult(
        await send(found.url, body, signedHeaders(secrets, eventId, body, at))
      )
      return {
        delivered: result.outcome === "succeeded",
        status: result.status,
        result: result.text,
      }
    },

    /**
     * Sends a failed delivery again with the same event ID and body, while
     * the subscription still points at its destination and selects it.
     */
    async retryDelivery(headers: Headers, id: string, deliveryId: string) {
      const actor = await admin(headers)
      existing(id)
      const delivery = webhooks.findDelivery(id, deliveryId)
      if (!delivery)
        throw new WebhookError(
          "This delivery no longer exists.",
          undefined,
          404
        )
      const target = webhooks.target(id)!
      if (!webhooks.stillEligible(target, delivery))
        throw new WebhookError(
          target.url !== delivery.url
            ? "This delivery was for an earlier destination, so it cannot be sent again."
            : !target.enabled
              ? "Enable the subscription before retrying deliveries."
              : "The subscription no longer selects this event or its Application.",
          undefined,
          409
        )
      if (!webhooks.retry(deliveryId, now()))
        throw new WebhookError(
          "Only a failed delivery can be retried. Reload to see where it stands.",
          undefined,
          409
        )
      audit.record(
        actor,
        {
          operation: "webhooks.retry",
          targetType: "webhook-delivery",
          targetId: deliveryId,
        },
        now()
      )
      kick()
    },
  }
}
export type WebhookManagement = ReturnType<typeof createWebhookManagement>
