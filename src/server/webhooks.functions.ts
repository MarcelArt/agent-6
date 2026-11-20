import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { WebhookError, createWebhookManagement } from "./webhook-management"
import type {
  WebhookProblem,
  WebhookResult,
  WebhookSecretResult,
  WebhookTestResult,
} from "@/lib/webhooks"
import { deliverySearch, webhookInput } from "@/lib/webhooks"

/*
 * Server functions behind the Webhook screens. Who may call them is checked
 * in `webhook-management.ts`.
 */

function refused(error: unknown): WebhookProblem {
  if (!(error instanceof WebhookError)) throw error
  return { ok: false, message: error.message, field: error.field }
}

const subscriptionId = z.object({ webhookSubscriptionId: z.string() })

export const listWebhooks = createServerFn({ method: "GET" })
  .validator(
    z.object({
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
    })
  )
  .handler(({ data }) =>
    createWebhookManagement().list(getRequestHeaders(), data)
  )

export const getWebhook = createServerFn({ method: "GET" })
  .validator(subscriptionId.extend(deliverySearch.shape))
  .handler(async ({ data: { webhookSubscriptionId, ...filters } }) => {
    const found = await createWebhookManagement().get(
      getRequestHeaders(),
      webhookSubscriptionId,
      filters
    )
    if (!found) throw notFound()
    return found
  })

/** The answer holds the signing secret this once. */
export const createWebhook = createServerFn({ method: "POST" })
  .validator(webhookInput)
  .handler(async ({ data }): Promise<WebhookSecretResult> => {
    try {
      return {
        ok: true,
        ...(await createWebhookManagement().create(getRequestHeaders(), data)),
      }
    } catch (error) {
      return refused(error)
    }
  })

export const updateWebhook = createServerFn({ method: "POST" })
  .validator(webhookInput.extend(subscriptionId.shape))
  .handler(
    async ({
      data: { webhookSubscriptionId, ...input },
    }): Promise<WebhookResult> => {
      try {
        await createWebhookManagement().update(
          getRequestHeaders(),
          webhookSubscriptionId,
          input
        )
        return { ok: true, id: webhookSubscriptionId }
      } catch (error) {
        return refused(error)
      }
    }
  )

/** The answer holds the new signing secret this once. */
export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .validator(subscriptionId.extend({ mode: z.enum(["overlap", "replace"]) }))
  .handler(async ({ data }): Promise<WebhookSecretResult> => {
    try {
      const { secret } = await createWebhookManagement().rotateSecret(
        getRequestHeaders(),
        data.webhookSubscriptionId,
        data.mode
      )
      return { ok: true, id: data.webhookSubscriptionId, secret }
    } catch (error) {
      return refused(error)
    }
  })

export const sendWebhookTest = createServerFn({ method: "POST" })
  .validator(subscriptionId)
  .handler(async ({ data }): Promise<WebhookTestResult> => {
    try {
      return {
        ok: true,
        ...(await createWebhookManagement().sendTest(
          getRequestHeaders(),
          data.webhookSubscriptionId
        )),
      }
    } catch (error) {
      return refused(error)
    }
  })

export const retryWebhookDelivery = createServerFn({ method: "POST" })
  .validator(subscriptionId.extend({ deliveryId: z.string() }))
  .handler(async ({ data }): Promise<WebhookResult> => {
    try {
      await createWebhookManagement().retryDelivery(
        getRequestHeaders(),
        data.webhookSubscriptionId,
        data.deliveryId
      )
      return { ok: true, id: data.deliveryId }
    } catch (error) {
      return refused(error)
    }
  })
