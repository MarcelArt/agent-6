import "@tanstack/react-start/server-only"

import { generateApiKey } from "./api-keys"
import { requireAdmin } from "./session"
import { createApplicationsRepository } from "./repositories/applications"
import { createAuditRepository } from "./repositories/audit"
import { createServiceAccountsRepository } from "./repositories/service-accounts"
import type { Auth } from "./auth"
import type { ApplicationsRepository } from "./repositories/applications"
import type { AuditRepository } from "./repositories/audit"
import type {
  KeyGrants,
  ServiceAccountsRepository,
} from "./repositories/service-accounts"
import type {
  ApiKeyDetail,
  ApiKeyField,
  ApiKeyGrants,
  ApiKeySummary,
  NewApiKeyInput,
  ServiceAccountDetail,
  ServiceAccountField,
  ServiceAccountInput,
  ServiceAccountSummary,
} from "@/lib/service-accounts"
import {
  KEY_EXPIRY_CHOICES,
  MAX_API_KEY_NAME,
  MAX_SERVICE_ACCOUNT_DESCRIPTION,
  MAX_SERVICE_ACCOUNT_NAME,
  isApiPermission,
  tidyPermissions,
} from "@/lib/service-accounts"

/** A refused change, in words for the Admin, with the field it concerns. */
export class ServiceAccountError extends Error {
  constructor(
    message: string,
    public readonly field?: ServiceAccountField | ApiKeyField,
    public readonly status = 400
  ) {
    super(message)
    this.name = "ServiceAccountError"
  }
}

function validAccount(input: ServiceAccountInput): ServiceAccountInput {
  const name = input.name.trim()
  const description = input.description.trim()
  if (!name || name.length > MAX_SERVICE_ACCOUNT_NAME)
    throw new ServiceAccountError(
      `Enter a name of up to ${MAX_SERVICE_ACCOUNT_NAME} characters, for example the integration it is for.`,
      "name"
    )
  if (description.length > MAX_SERVICE_ACCOUNT_DESCRIPTION)
    throw new ServiceAccountError(
      `Shorten the description to ${MAX_SERVICE_ACCOUNT_DESCRIPTION} characters.`,
      "description"
    )
  return { name, description }
}

/**
 * Admins manage Service Accounts and their API Keys. Every method checks the
 * Admin session itself, and every change is audited.
 */
export function createServiceAccountManagement(
  deps: {
    auth?: Auth
    serviceAccounts?: ServiceAccountsRepository
    applications?: ApplicationsRepository
    audit?: AuditRepository
    now?: () => Date
  } = {}
) {
  const serviceAccounts =
    deps.serviceAccounts ?? createServiceAccountsRepository()
  const applications = deps.applications ?? createApplicationsRepository()
  const audit = deps.audit ?? createAuditRepository()
  const now = () => deps.now?.() ?? new Date()

  async function admin(headers: Headers) {
    const user = await requireAdmin({ auth: deps.auth, headers })
    return { type: "admin" as const, userId: user.id }
  }

  function existing(id: string): ServiceAccountSummary {
    const found = serviceAccounts.findById(id, now())
    if (!found)
      throw new ServiceAccountError(
        "This Service Account no longer exists. Go back to the list.",
        undefined,
        404
      )
    return found
  }

  function existingKey(accountId: string, keyId: string): ApiKeySummary {
    const found = serviceAccounts.findKey(accountId, keyId, now())
    if (!found)
      throw new ServiceAccountError(
        "This API Key does not belong to this Service Account.",
        undefined,
        404
      )
    return found
  }

  function validGrants(input: ApiKeyGrants): KeyGrants {
    const name = input.name.trim()
    if (!name || name.length > MAX_API_KEY_NAME)
      throw new ServiceAccountError(
        `Enter a key name of up to ${MAX_API_KEY_NAME} characters, for example where it is used.`,
        "name"
      )
    const unknown = input.permissions.find((item) => !isApiPermission(item))
    if (unknown)
      throw new ServiceAccountError(
        `"${unknown.slice(0, 60)}" is not a permission.`,
        "permissions"
      )
    const applicationIds = [...new Set(input.applicationIds)]
    if (!input.allApplications) {
      const missing = applicationIds.find((id) => !applications.findById(id))
      if (missing)
        throw new ServiceAccountError(
          "One of the chosen Applications no longer exists. Reload and choose again.",
          "applicationIds"
        )
    }
    return {
      name,
      permissions: tidyPermissions(input.permissions),
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
      return serviceAccounts.list(options, now())
    },

    async get(
      headers: Headers,
      id: string
    ): Promise<ServiceAccountDetail | null> {
      await admin(headers)
      const found = serviceAccounts.findById(id, now())
      if (!found) return null
      return {
        ...found,
        keys: serviceAccounts.keys(id, now()),
        activity: audit.forServiceAccount(id),
      }
    },

    async create(headers: Headers, input: ServiceAccountInput) {
      const actor = await admin(headers)
      const id = serviceAccounts.create(validAccount(input), now())
      audit.record(
        actor,
        {
          operation: "service-accounts.create",
          targetType: "service-account",
          targetId: id,
        },
        now()
      )
      return existing(id)
    },

    async update(headers: Headers, id: string, input: ServiceAccountInput) {
      const actor = await admin(headers)
      existing(id)
      serviceAccounts.update(id, validAccount(input))
      audit.record(
        actor,
        {
          operation: "service-accounts.update",
          targetType: "service-account",
          targetId: id,
        },
        now()
      )
      return existing(id)
    },

    /** A disabled account's keys stop working at once, and work again when enabled. */
    async setDisabled(headers: Headers, id: string, disabled: boolean) {
      const actor = await admin(headers)
      existing(id)
      serviceAccounts.setDisabled(id, disabled, now())
      audit.record(
        actor,
        {
          operation: disabled
            ? "service-accounts.disable"
            : "service-accounts.enable",
          targetType: "service-account",
          targetId: id,
        },
        now()
      )
      return existing(id)
    },

    async getKey(
      headers: Headers,
      accountId: string,
      keyId: string
    ): Promise<ApiKeyDetail | null> {
      await admin(headers)
      const account = serviceAccounts.findById(accountId, now())
      const key = account && serviceAccounts.findKey(accountId, keyId, now())
      if (!account || !key) return null
      return {
        ...key,
        serviceAccount: {
          id: account.id,
          name: account.name,
          disabled: account.disabled,
        },
      }
    },

    /**
     * Issues a key with exactly the given grants; with none it can do
     * nothing. The key is in the answer this once and never stored.
     */
    async createKey(
      headers: Headers,
      accountId: string,
      input: NewApiKeyInput
    ) {
      const actor = await admin(headers)
      existing(accountId)
      const grants = validGrants(input)
      const days = KEY_EXPIRY_CHOICES.find(
        (item) => item.value === input.expiry
      )?.days
      const at = now()
      const material = generateApiKey()
      const keyId = serviceAccounts.createKey(
        {
          ...grants,
          serviceAccountId: accountId,
          lookupId: material.lookupId,
          digest: material.digest,
          expiresAt: days ? new Date(at.getTime() + days * 86_400_000) : null,
        },
        at
      )
      audit.record(
        actor,
        {
          operation: "api-keys.create",
          targetType: "api-key",
          targetId: keyId,
        },
        at
      )
      return { apiKey: existingKey(accountId, keyId), key: material.key }
    },

    /** Grant changes apply to the key's next request. */
    async updateKey(
      headers: Headers,
      accountId: string,
      keyId: string,
      input: ApiKeyGrants
    ) {
      const actor = await admin(headers)
      const key = existingKey(accountId, keyId)
      if (key.state === "revoked")
        throw new ServiceAccountError(
          "A revoked API Key cannot be changed. Issue a new key instead.",
          undefined,
          409
        )
      serviceAccounts.updateKey(keyId, validGrants(input), now())
      audit.record(
        actor,
        {
          operation: "api-keys.update",
          targetType: "api-key",
          targetId: keyId,
        },
        now()
      )
      return existingKey(accountId, keyId)
    },

    /** Revocation is final and applies to the key's next request. */
    async revokeKey(headers: Headers, accountId: string, keyId: string) {
      const actor = await admin(headers)
      existingKey(accountId, keyId)
      serviceAccounts.revokeKey(keyId, now())
      audit.record(
        actor,
        {
          operation: "api-keys.revoke",
          targetType: "api-key",
          targetId: keyId,
        },
        now()
      )
      return existingKey(accountId, keyId)
    },
  }
}
export type ServiceAccountManagement = ReturnType<
  typeof createServiceAccountManagement
>
