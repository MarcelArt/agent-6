import "@tanstack/react-start/server-only"

import { decrypt } from "./secrets"
import { describeResult, postWebhook } from "./webhook-destination"
import { signedHeaders } from "./webhook-signature"
import { createWebhooksRepository } from "./repositories/webhooks"
import type { PostResult } from "./webhook-destination"
import type { WebhooksRepository } from "./repositories/webhooks"
import { DELIVERY_RETENTION_DAYS } from "@/lib/webhooks"

/** Delays after each failed attempt; the last repeats until the window ends. */
export const RETRY_DELAYS_MS = [
  5_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  5 * 3_600_000,
  10 * 3_600_000,
]

export type Transport = (
  url: string,
  body: string,
  headers: Record<string, string>
) => Promise<PostResult>

/**
 * Sends queued Webhook Deliveries in the background. Each run leases due
 * deliveries, checks that the subscription still selects them, signs the
 * stored body with the current attempt's timestamp and records the result.
 * A lease that outlives a stopped process makes the delivery due again, so
 * work survives restarts; receivers may therefore see an event twice.
 */
export function createWebhookDispatcher(
  deps: {
    webhooks?: WebhooksRepository
    send?: Transport
    now?: () => Date
    /** How often to look for due work. */
    intervalMs?: number
    /** Requests in flight at once. */
    concurrency?: number
    leaseMs?: number
  } = {}
) {
  const webhooks = deps.webhooks ?? createWebhooksRepository()
  const send: Transport =
    deps.send ?? ((url, body, headers) => postWebhook(url, body, headers))
  const now = () => deps.now?.() ?? new Date()
  const intervalMs = deps.intervalMs ?? 2_000
  const concurrency = deps.concurrency ?? 4
  const leaseMs = deps.leaseMs ?? 60_000

  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<unknown> | undefined
  /** Not sending in the background: before `start` and after `stop`. */
  let stopped = true
  let stopping = false
  let lastPrune = 0

  async function deliver(
    item: ReturnType<WebhooksRepository["claimDue"]>[number]
  ) {
    const target = webhooks.target(item.subscriptionId)
    if (!target || !webhooks.stillEligible(target, item)) {
      webhooks.cancelLeased(
        item.id,
        item.leaseToken,
        target && target.url !== item.url
          ? "Cancelled: the destination changed."
          : target?.enabled === false
            ? "Cancelled: the subscription was disabled."
            : "Cancelled: the subscription no longer selects this event or Application.",
        now()
      )
      return
    }
    let secrets: Array<string>
    try {
      secrets = (webhooks.secrets(item.subscriptionId, now()) ?? []).map(
        (value) => decrypt(value)
      )
    } catch {
      webhooks.recordAttempt(
        item.id,
        item.leaseToken,
        {
          kind: "failed",
          status: null,
          result:
            "The signing secret could not be opened. Rotate it, then retry.",
        },
        now()
      )
      return
    }
    const startedAt = now()
    const result = describeResult(
      await send(
        item.url,
        item.payload,
        signedHeaders(secrets, item.eventId, item.payload, startedAt)
      ).catch((): PostResult => ({ kind: "network" }))
    )
    const finished = now()
    if (result.outcome === "succeeded")
      webhooks.recordAttempt(
        item.id,
        item.leaseToken,
        {
          kind: "succeeded",
          status: result.status ?? 200,
          result: result.text,
        },
        finished
      )
    else if (
      result.outcome === "retry" &&
      finished.getTime() < item.retryUntil.getTime()
    ) {
      const delay =
        RETRY_DELAYS_MS[Math.min(item.attempts, RETRY_DELAYS_MS.length - 1)]
      webhooks.recordAttempt(
        item.id,
        item.leaseToken,
        {
          kind: "retry",
          status: result.status,
          result: result.text,
          at: new Date(
            Math.min(finished.getTime() + delay, item.retryUntil.getTime())
          ),
        },
        finished
      )
    } else
      webhooks.recordAttempt(
        item.id,
        item.leaseToken,
        {
          kind: "failed",
          status: result.status,
          result:
            result.outcome === "retry"
              ? `${result.text} Gave up after retrying for 24 hours.`
              : result.text,
        },
        finished
      )
  }

  /** Sends what is due now, in batches. Answers how many were handled. */
  async function runOnce(): Promise<number> {
    let handled = 0
    for (;;) {
      const batch = webhooks.claimDue(now(), concurrency, leaseMs)
      if (!batch.length) break
      await Promise.all(batch.map((item) => deliver(item)))
      handled += batch.length
      if (batch.length < concurrency || stopping) break
    }
    if (now().getTime() - lastPrune > 3_600_000) {
      lastPrune = now().getTime()
      webhooks.prune(
        new Date(now().getTime() - DELIVERY_RETENTION_DAYS * 86_400_000)
      )
    }
    return handled
  }

  function schedule(delay: number) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      running = runOnce()
        .catch((error: unknown) =>
          console.error(
            "Webhook delivery run failed:",
            error instanceof Error ? error.message : error
          )
        )
        .finally(() => {
          running = undefined
          schedule(intervalMs)
        })
    }, delay)
    timer.unref()
  }

  return {
    runOnce,
    /** Starts sending in the background. Call after migrations. */
    start() {
      if (!stopped) return
      stopped = false
      stopping = false
      schedule(0)
    },
    /** Looks for due work now instead of at the next interval. */
    kick() {
      if (!running) schedule(0)
    },
    /** Stops taking work and lets requests already sent finish. */
    async stop() {
      stopped = true
      stopping = true
      clearTimeout(timer)
      await running
    },
  }
}
export type WebhookDispatcher = ReturnType<typeof createWebhookDispatcher>

let dispatcher: WebhookDispatcher | undefined
export function getWebhookDispatcher(): WebhookDispatcher {
  dispatcher ??= createWebhookDispatcher()
  return dispatcher
}
