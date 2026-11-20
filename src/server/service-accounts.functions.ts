import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import {
  ServiceAccountError,
  createServiceAccountManagement,
} from "./service-account-management"
import { createApplicationsRepository } from "./repositories/applications"
import { requireAdmin } from "./session"
import type {
  ApiKeyResult,
  NewApiKeyResult,
  ServiceAccountProblem,
  ServiceAccountResult,
} from "@/lib/service-accounts"
import {
  apiKeyGrants,
  newApiKeyInput,
  serviceAccountInput,
} from "@/lib/service-accounts"

/*
 * Server functions behind the Service Account screens. Who may call them is
 * checked in `service-account-management.ts`.
 */

function refused(error: unknown): ServiceAccountProblem {
  if (!(error instanceof ServiceAccountError)) throw error
  return { ok: false, message: error.message, field: error.field }
}

const accountId = z.object({ serviceAccountId: z.string() })
const keyId = accountId.extend({ apiKeyId: z.string() })

export const listServiceAccounts = createServerFn({ method: "GET" })
  .validator(
    z.object({
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
    })
  )
  .handler(({ data }) =>
    createServiceAccountManagement().list(getRequestHeaders(), data)
  )

export const getServiceAccount = createServerFn({ method: "GET" })
  .validator(accountId)
  .handler(async ({ data }) => {
    const found = await createServiceAccountManagement().get(
      getRequestHeaders(),
      data.serviceAccountId
    )
    if (!found) throw notFound()
    return found
  })

export const createServiceAccount = createServerFn({ method: "POST" })
  .validator(serviceAccountInput)
  .handler(async ({ data }): Promise<ServiceAccountResult> => {
    try {
      return {
        ok: true,
        serviceAccount: await createServiceAccountManagement().create(
          getRequestHeaders(),
          data
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })

export const updateServiceAccount = createServerFn({ method: "POST" })
  .validator(serviceAccountInput.extend(accountId.shape))
  .handler(
    async ({
      data: { serviceAccountId, ...input },
    }): Promise<ServiceAccountResult> => {
      try {
        return {
          ok: true,
          serviceAccount: await createServiceAccountManagement().update(
            getRequestHeaders(),
            serviceAccountId,
            input
          ),
        }
      } catch (error) {
        return refused(error)
      }
    }
  )

export const setServiceAccountDisabled = createServerFn({ method: "POST" })
  .validator(accountId.extend({ disabled: z.boolean() }))
  .handler(async ({ data }): Promise<ServiceAccountResult> => {
    try {
      return {
        ok: true,
        serviceAccount: await createServiceAccountManagement().setDisabled(
          getRequestHeaders(),
          data.serviceAccountId,
          data.disabled
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })

export const getApiKey = createServerFn({ method: "GET" })
  .validator(keyId)
  .handler(async ({ data }) => {
    const found = await createServiceAccountManagement().getKey(
      getRequestHeaders(),
      data.serviceAccountId,
      data.apiKeyId
    )
    if (!found) throw notFound()
    return found
  })

/** The answer holds the key this once; the browser shows it and forgets it. */
export const createApiKey = createServerFn({ method: "POST" })
  .validator(newApiKeyInput.extend(accountId.shape))
  .handler(
    async ({
      data: { serviceAccountId, ...input },
    }): Promise<NewApiKeyResult> => {
      try {
        const created = await createServiceAccountManagement().createKey(
          getRequestHeaders(),
          serviceAccountId,
          input
        )
        return { ok: true, ...created }
      } catch (error) {
        return refused(error)
      }
    }
  )

export const updateApiKey = createServerFn({ method: "POST" })
  .validator(apiKeyGrants.extend(keyId.shape))
  .handler(
    async ({
      data: { serviceAccountId, apiKeyId, ...input },
    }): Promise<ApiKeyResult> => {
      try {
        return {
          ok: true,
          apiKey: await createServiceAccountManagement().updateKey(
            getRequestHeaders(),
            serviceAccountId,
            apiKeyId,
            input
          ),
        }
      } catch (error) {
        return refused(error)
      }
    }
  )

export const revokeApiKey = createServerFn({ method: "POST" })
  .validator(keyId)
  .handler(async ({ data }): Promise<ApiKeyResult> => {
    try {
      return {
        ok: true,
        apiKey: await createServiceAccountManagement().revokeKey(
          getRequestHeaders(),
          data.serviceAccountId,
          data.apiKeyId
        ),
      }
    } catch (error) {
      return refused(error)
    }
  })

/** Every Application by name, for choosing grants and webhook selections. */
export const listApplicationChoices = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin({ headers: getRequestHeaders() })
    return createApplicationsRepository()
      .all()
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
)
