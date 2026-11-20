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
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm"
import { redact } from "../redaction"
import { getDb } from "./db"
import {
  application,
  conversation,
  filedIssue,
  ticket,
  webhookDelivery as delivery,
  webhookEvent as event,
  webhookSubscription as subscription,
  webhookSubscriptionApplication as subscriptionApplication,
} from "./schema"
import type { Db } from "./db"
import type {
  DeliveryFilters,
  WebhookDeliveryStatus,
  WebhookDeliverySummary,
  WebhookEvent,
  WebhookEventType,
  WebhookSubscriptionSummary,
  WebhookSubscriptionsPage,
} from "@/lib/webhooks"
import {
  DELIVERIES_PAGE_SIZE,
  RETRY_WINDOW_HOURS,
  WEBHOOKS_PAGE_SIZE,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_VERSION,
  webhookEventSchema,
} from "@/lib/webhooks"

const RETRY_WINDOW_MS = RETRY_WINDOW_HOURS * 3_600_000

function parseEventTypes(text: string): Array<WebhookEventType> {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? WEBHOOK_EVENT_TYPES.filter((type) => value.includes(type))
      : []
  } catch {
    return []
  }
}

/** What decides whether queued work may still go to a subscription. */
export type DeliveryTarget = {
  enabled: boolean
  url: string
  eventTypes: Array<WebhookEventType>
  allApplications: boolean
  applicationIds: Array<string>
}

/**
 * Whether a delivery queued for `url` may be sent now: the subscription is
 * enabled, still points there, and still selects the event and Application.
 */
export function stillEligible(
  target: DeliveryTarget,
  item: { url: string; eventType: string; applicationId: string | null }
): boolean {
  return (
    target.enabled &&
    target.url === item.url &&
    (target.eventTypes as Array<string>).includes(item.eventType) &&
    (target.allApplications ||
      (item.applicationId !== null &&
        target.applicationIds.includes(item.applicationId)))
  )
}

export type SubscriptionValues = {
  name: string
  url: string
  enabled: boolean
  eventTypes: Array<WebhookEventType>
  allApplications: boolean
  applicationIds: Array<string>
}

/** What one attempt ended with. */
export type AttemptOutcome =
  | { kind: "succeeded"; status: number; result: string }
  | { kind: "retry"; status: number | null; result: string; at: Date }
  | { kind: "failed"; status: number | null; result: string }

export function createWebhooksRepository(db: Db = getDb()) {
  function applicationIdsOf(subscriptionId: string) {
    return db
      .select({ id: subscriptionApplication.applicationId })
      .from(subscriptionApplication)
      .where(eq(subscriptionApplication.subscriptionId, subscriptionId))
      .all()
      .map((row) => row.id)
  }

  function setApplications(subscriptionId: string, ids: Array<string>) {
    db.delete(subscriptionApplication)
      .where(eq(subscriptionApplication.subscriptionId, subscriptionId))
      .run()
    const known = ids.length
      ? db
          .select({ id: application.id })
          .from(application)
          .where(inArray(application.id, ids))
          .all()
      : []
    for (const { id } of known)
      db.insert(subscriptionApplication)
        .values({ subscriptionId, applicationId: id })
        .onConflictDoNothing()
        .run()
  }

  function target(subscriptionId: string): DeliveryTarget | undefined {
    const row = db
      .select()
      .from(subscription)
      .where(eq(subscription.id, subscriptionId))
      .get()
    return (
      row && {
        enabled: row.enabled,
        url: row.url,
        eventTypes: parseEventTypes(row.eventTypes),
        allApplications: row.allApplications,
        applicationIds: applicationIdsOf(row.id),
      }
    )
  }

  /** Outstanding work for a subscription stops, for example when its destination changes. */
  function cancelPending(subscriptionId: string, reason: string, now: Date) {
    db.update(delivery)
      .set({
        status: "cancelled",
        nextAttemptAt: null,
        lastResult: reason,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(delivery.subscriptionId, subscriptionId),
          eq(delivery.status, "pending")
        )
      )
      .run()
  }

  /** The Ticket as an event's data, read inside the change's transaction. */
  function ticketSnapshot(ticketId: string) {
    const row = db
      .select({
        ticket,
        application: { id: application.id, name: application.name },
        issue: {
          outcome: filedIssue.outcome,
          repository: filedIssue.repository,
          number: filedIssue.issueNumber,
          url: filedIssue.url,
        },
      })
      .from(ticket)
      .innerJoin(conversation, eq(conversation.id, ticket.conversationId))
      .innerJoin(application, eq(application.id, conversation.applicationId))
      .leftJoin(filedIssue, eq(filedIssue.id, ticket.filedIssueId))
      .where(eq(ticket.id, ticketId))
      .get()
    if (!row) return undefined
    const { ticket: found, issue } = row
    const text = (value: string) => redact(value)
    return {
      applicationId: row.application.id,
      data: {
        id: found.id,
        kind: found.kind as WebhookEvent["data"]["ticket"]["kind"],
        status: found.status as WebhookEvent["data"]["ticket"]["status"],
        title: text(found.title),
        description: text(found.body),
        summary: text(found.summary),
        declineReason:
          found.declineReason === null ? null : text(found.declineReason),
        createdAt: found.createdAt.toISOString(),
        decidedAt: found.decidedAt?.toISOString() ?? null,
        application: row.application,
        repository: { id: found.repositoryId, fullName: found.repository },
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
  }

  return {
    stillEligible,

    /**
     * Saves an event about a Ticket and queues a delivery for each enabled
     * subscription that selects it. Call it inside the transaction that
     * changed the Ticket, so the event exists exactly when the change does.
     */
    recordTicketEvent(type: WebhookEventType, ticketId: string, at: Date) {
      const snapshot = ticketSnapshot(ticketId)
      if (!snapshot) return undefined
      const id = `evt_${randomUUID().replaceAll("-", "")}`
      const payload: WebhookEvent = webhookEventSchema.parse({
        id,
        type,
        version: WEBHOOK_EVENT_VERSION,
        occurredAt: at.toISOString(),
        data: { ticket: snapshot.data },
      })
      db.insert(event)
        .values({
          id,
          type,
          applicationId: snapshot.applicationId,
          ticketId,
          payload: JSON.stringify(payload),
          createdAt: at,
        })
        .run()
      const subscriptions = db
        .select()
        .from(subscription)
        .where(eq(subscription.enabled, true))
        .all()
      for (const row of subscriptions) {
        const selected = stillEligible(
          {
            enabled: row.enabled,
            url: row.url,
            eventTypes: parseEventTypes(row.eventTypes),
            allApplications: row.allApplications,
            applicationIds: row.allApplications ? [] : applicationIdsOf(row.id),
          },
          {
            url: row.url,
            eventType: type,
            applicationId: snapshot.applicationId,
          }
        )
        if (!selected) continue
        db.insert(delivery)
          .values({
            id: randomUUID(),
            eventId: id,
            subscriptionId: row.id,
            url: row.url,
            status: "pending",
            attempts: 0,
            nextAttemptAt: at,
            retryUntil: new Date(at.getTime() + RETRY_WINDOW_MS),
            createdAt: at,
            updatedAt: at,
          })
          .run()
      }
      return id
    },

    list(
      options: { search?: string; page?: number } = {}
    ): WebhookSubscriptionsPage {
      const text = options.search?.trim().toLowerCase()
      const pattern = `%${(text ?? "").replace(/[\\%_]/g, "\\$&")}%`
      const where = text
        ? sql`(lower(${subscription.name}) like ${pattern} escape '\\' or lower(${subscription.url}) like ${pattern} escape '\\')`
        : undefined
      const total =
        db.select({ value: count() }).from(subscription).where(where).get()
          ?.value ?? 0
      const pageSize = WEBHOOKS_PAGE_SIZE
      const page = Math.min(
        Math.max(1, options.page ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      return {
        subscriptions: db
          .select({
            id: subscription.id,
            name: subscription.name,
            url: subscription.url,
            enabled: subscription.enabled,
            eventTypes: subscription.eventTypes,
            allApplications: subscription.allApplications,
            // Qualified by hand: an unqualified "id" would mean the delivery's.
            failedDeliveries:
              sql<number>`(select count(*) from "webhook_delivery" as "d" where "d"."subscription_id" = "webhook_subscription"."id" and "d"."status" = 'failed')`.mapWith(
                Number
              ),
          })
          .from(subscription)
          .where(where)
          .orderBy(asc(sql`lower(${subscription.name})`), asc(subscription.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .all()
          .map((row) => ({
            ...row,
            eventTypes: parseEventTypes(row.eventTypes),
          })),
        total,
        page,
        pageSize,
      }
    },

    findById(id: string):
      | (WebhookSubscriptionSummary & {
          applications: Array<{ id: string; name: string }>
          previousSecretExpiresAt: Date | null
          createdAt: Date
        })
      | undefined {
      const row = db
        .select()
        .from(subscription)
        .where(eq(subscription.id, id))
        .get()
      if (!row) return undefined
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        enabled: row.enabled,
        eventTypes: parseEventTypes(row.eventTypes),
        allApplications: row.allApplications,
        failedDeliveries:
          db
            .select({ value: count() })
            .from(delivery)
            .where(
              and(
                eq(delivery.subscriptionId, id),
                eq(delivery.status, "failed")
              )
            )
            .get()?.value ?? 0,
        applications: row.allApplications
          ? []
          : db
              .select({ id: application.id, name: application.name })
              .from(subscriptionApplication)
              .innerJoin(
                application,
                eq(application.id, subscriptionApplication.applicationId)
              )
              .where(eq(subscriptionApplication.subscriptionId, id))
              .orderBy(
                asc(sql`lower(${application.name})`),
                asc(application.id)
              )
              .all(),
        previousSecretExpiresAt: row.previousSecretExpiresAt,
        createdAt: row.createdAt,
      }
    },

    create(
      values: SubscriptionValues,
      encryptedSecret: string,
      now = new Date()
    ) {
      const id = randomUUID()
      db.transaction(
        () => {
          db.insert(subscription)
            .values({
              id,
              name: values.name,
              url: values.url,
              enabled: values.enabled,
              eventTypes: JSON.stringify(values.eventTypes),
              allApplications: values.allApplications,
              encryptedSecret,
              createdAt: now,
              updatedAt: now,
            })
            .run()
          setApplications(
            id,
            values.allApplications ? [] : values.applicationIds
          )
        },
        { behavior: "immediate" }
      )
      return id
    },

    /**
     * Saves the subscription. Disabling it or changing its destination
     * cancels the deliveries still waiting; narrower selections are applied
     * when queued work is sent.
     */
    update(id: string, values: SubscriptionValues, now = new Date()) {
      db.transaction(
        () => {
          const before = db
            .select({ url: subscription.url, enabled: subscription.enabled })
            .from(subscription)
            .where(eq(subscription.id, id))
            .get()
          if (!before) return
          db.update(subscription)
            .set({
              name: values.name,
              url: values.url,
              enabled: values.enabled,
              eventTypes: JSON.stringify(values.eventTypes),
              allApplications: values.allApplications,
              updatedAt: now,
            })
            .where(eq(subscription.id, id))
            .run()
          setApplications(
            id,
            values.allApplications ? [] : values.applicationIds
          )
          if (before.url !== values.url)
            cancelPending(id, "Cancelled: the destination changed.", now)
          else if (before.enabled && !values.enabled)
            cancelPending(id, "Cancelled: the subscription was disabled.", now)
        },
        { behavior: "immediate" }
      )
    },

    /** The secrets that sign now: the current one, then a replaced one still in overlap. */
    secrets(id: string, now = new Date()) {
      const row = db
        .select({
          current: subscription.encryptedSecret,
          previous: subscription.encryptedPreviousSecret,
          previousExpiresAt: subscription.previousSecretExpiresAt,
        })
        .from(subscription)
        .where(eq(subscription.id, id))
        .get()
      if (!row) return undefined
      return [
        row.current,
        ...(row.previous && row.previousExpiresAt && row.previousExpiresAt > now
          ? [row.previous]
          : []),
      ]
    },

    /** `overlapUntil` keeps the replaced secret signing until then; null drops it now. */
    rotateSecret(
      id: string,
      encryptedSecret: string,
      overlapUntil: Date | null,
      now = new Date()
    ) {
      db.update(subscription)
        .set({
          encryptedPreviousSecret: overlapUntil
            ? sql`${subscription.encryptedSecret}`
            : null,
          previousSecretExpiresAt: overlapUntil,
          encryptedSecret,
          updatedAt: now,
        })
        .where(eq(subscription.id, id))
        .run()
    },

    target,

    deliveries(
      subscriptionId: string,
      filters: DeliveryFilters,
      now = new Date()
    ) {
      const where = and(
        eq(delivery.subscriptionId, subscriptionId),
        filters.delivery ? eq(delivery.status, filters.delivery) : undefined
      )
      const total =
        db.select({ value: count() }).from(delivery).where(where).get()
          ?.value ?? 0
      const pageSize = DELIVERIES_PAGE_SIZE
      const page = Math.min(
        Math.max(1, filters.deliveryPage ?? 1),
        Math.max(1, Math.ceil(total / pageSize))
      )
      const current = target(subscriptionId)
      const items: Array<WebhookDeliverySummary> = db
        .select({
          id: delivery.id,
          eventId: delivery.eventId,
          eventType: event.type,
          applicationId: event.applicationId,
          ticketId: event.ticketId,
          status: delivery.status,
          attempts: delivery.attempts,
          url: delivery.url,
          lastStatus: delivery.lastStatus,
          lastResult: delivery.lastResult,
          lastAttemptAt: delivery.lastAttemptAt,
          nextAttemptAt: delivery.nextAttemptAt,
          leaseUntil: delivery.leaseUntil,
          createdAt: delivery.createdAt,
        })
        .from(delivery)
        .innerJoin(event, eq(event.id, delivery.eventId))
        .where(where)
        .orderBy(desc(delivery.createdAt), desc(delivery.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all()
        .map((row) => ({
          id: row.id,
          eventId: row.eventId,
          eventType: row.eventType,
          ticketId: row.ticketId,
          status: row.status as WebhookDeliveryStatus,
          attempts: row.attempts,
          url: row.url,
          lastStatus: row.lastStatus,
          lastResult: row.lastResult,
          lastAttemptAt: row.lastAttemptAt?.getTime() ?? null,
          nextAttemptAt: row.nextAttemptAt?.getTime() ?? null,
          createdAt: row.createdAt.getTime(),
          retryable:
            row.status === "failed" &&
            !!current &&
            stillEligible(current, row) &&
            !(row.leaseUntil && row.leaseUntil > now),
        }))
      return { items, total, page, pageSize }
    },

    /** One delivery of a subscription, with what eligibility needs. */
    findDelivery(subscriptionId: string, deliveryId: string) {
      return db
        .select({
          id: delivery.id,
          status: delivery.status,
          url: delivery.url,
          eventType: event.type,
          applicationId: event.applicationId,
          leaseUntil: delivery.leaseUntil,
        })
        .from(delivery)
        .innerJoin(event, eq(event.id, delivery.eventId))
        .where(
          and(
            eq(delivery.id, deliveryId),
            eq(delivery.subscriptionId, subscriptionId)
          )
        )
        .get()
    },

    /**
     * An Admin's retry: the same event and body, sent now, with a new
     * automatic retry window. False when it is no longer failed.
     */
    retry(deliveryId: string, now = new Date()) {
      return (
        db
          .update(delivery)
          .set({
            status: "pending",
            nextAttemptAt: now,
            retryUntil: new Date(now.getTime() + RETRY_WINDOW_MS),
            completedAt: null,
            leaseUntil: null,
            leaseToken: null,
            updatedAt: now,
          })
          .where(
            and(eq(delivery.id, deliveryId), eq(delivery.status, "failed"))
          )
          .run().changes > 0
      )
    },

    /**
     * Leases due deliveries to one sender. A lease that passes, because the
     * process stopped mid-send, makes the delivery due again.
     */
    claimDue(now: Date, limit: number, leaseMs: number) {
      return db.transaction(
        () => {
          const due = db
            .select({ id: delivery.id })
            .from(delivery)
            .where(
              and(
                eq(delivery.status, "pending"),
                lte(delivery.nextAttemptAt, now),
                or(isNull(delivery.leaseUntil), lt(delivery.leaseUntil, now))
              )
            )
            .orderBy(asc(delivery.nextAttemptAt), asc(delivery.id))
            .limit(limit)
            .all()
          if (!due.length) return []
          const token = randomUUID()
          db.update(delivery)
            .set({
              leaseUntil: new Date(now.getTime() + leaseMs),
              leaseToken: token,
              updatedAt: now,
            })
            .where(
              inArray(
                delivery.id,
                due.map((row) => row.id)
              )
            )
            .run()
          return db
            .select({
              id: delivery.id,
              url: delivery.url,
              attempts: delivery.attempts,
              retryUntil: delivery.retryUntil,
              subscriptionId: delivery.subscriptionId,
              eventId: event.id,
              eventType: event.type,
              applicationId: event.applicationId,
              payload: event.payload,
            })
            .from(delivery)
            .innerJoin(event, eq(event.id, delivery.eventId))
            .where(
              inArray(
                delivery.id,
                due.map((row) => row.id)
              )
            )
            .all()
            .map((row) => ({ ...row, leaseToken: token }))
        },
        { behavior: "immediate" }
      )
    },

    /** Records an attempt. Ignored when the lease was lost meanwhile. */
    recordAttempt(
      deliveryId: string,
      leaseToken: string,
      outcome: AttemptOutcome,
      now = new Date()
    ) {
      db.update(delivery)
        .set({
          status:
            outcome.kind === "retry"
              ? "pending"
              : outcome.kind === "succeeded"
                ? "succeeded"
                : "failed",
          attempts: sql`${delivery.attempts} + 1`,
          nextAttemptAt: outcome.kind === "retry" ? outcome.at : null,
          lastAttemptAt: now,
          lastStatus: outcome.status,
          lastResult: outcome.result,
          completedAt: outcome.kind === "retry" ? null : now,
          leaseUntil: null,
          leaseToken: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(delivery.id, deliveryId),
            eq(delivery.leaseToken, leaseToken),
            eq(delivery.status, "pending")
          )
        )
        .run()
    },

    /** Stops a leased delivery the subscription no longer selects. */
    cancelLeased(
      deliveryId: string,
      leaseToken: string,
      reason: string,
      now = new Date()
    ) {
      db.update(delivery)
        .set({
          status: "cancelled",
          nextAttemptAt: null,
          lastResult: reason,
          completedAt: now,
          leaseUntil: null,
          leaseToken: null,
          updatedAt: now,
        })
        .where(
          and(eq(delivery.id, deliveryId), eq(delivery.leaseToken, leaseToken))
        )
        .run()
    },

    /** Drops completed history older than `before`, and events nothing refers to. */
    prune(before: Date) {
      db.transaction(
        () => {
          db.delete(delivery)
            .where(
              and(
                ne(delivery.status, "pending"),
                lt(delivery.completedAt, before)
              )
            )
            .run()
          db.delete(event)
            .where(
              and(
                lt(event.createdAt, before),
                notExists(
                  db
                    .select({ id: delivery.id })
                    .from(delivery)
                    .where(eq(delivery.eventId, event.id))
                )
              )
            )
            .run()
        },
        { behavior: "immediate" }
      )
    },
  }
}
export type WebhooksRepository = ReturnType<typeof createWebhooksRepository>
