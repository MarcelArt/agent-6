import "@tanstack/react-start/server-only"

import { parseApiKey, secretMatches } from "../api-keys"
import { createServiceAccountsRepository } from "../repositories/service-accounts"
import type { ServiceAccountsRepository } from "../repositories/service-accounts"
import type { Actor } from "../repositories/audit"
import type { Scope } from "../repositories/api-reads"
import type { ApiPermission } from "@/lib/service-accounts"

/** The Service Account and API Key behind an API request, with its grants. */
export type ApiCaller = {
  serviceAccountId: string
  apiKeyId: string
  permissions: ReadonlySet<ApiPermission>
  /** "all", or the Applications the key may reach. */
  scope: Scope
  actor: Actor
}

/**
 * Checks `Authorization: Bearer <API Key>`. Grants, revocation, expiry and
 * the account's state are read on every request, so changes apply at once.
 * Browser sessions never authenticate here.
 */
export function createApiAuthenticator(
  deps: {
    serviceAccounts?: ServiceAccountsRepository
    now?: () => Date
  } = {}
) {
  const serviceAccounts =
    deps.serviceAccounts ?? createServiceAccountsRepository()
  const now = () => deps.now?.() ?? new Date()
  return (authorization: string | null): ApiCaller | null => {
    const match = /^Bearer +(\S+) *$/i.exec(authorization ?? "")
    const parsed = match && parseApiKey(match[1])
    if (!parsed) return null
    const at = now()
    const credential = serviceAccounts.credential(parsed.lookupId, at)
    if (
      !credential ||
      !secretMatches(parsed.secret, credential.digest) ||
      credential.state !== "active" ||
      credential.serviceAccount.disabled
    )
      return null
    serviceAccounts.touchKey(credential.keyId, at)
    return {
      serviceAccountId: credential.serviceAccount.id,
      apiKeyId: credential.keyId,
      permissions: new Set(credential.permissions),
      scope: credential.allApplications ? "all" : credential.applicationIds,
      actor: {
        type: "service-account",
        serviceAccountId: credential.serviceAccount.id,
        apiKeyId: credential.keyId,
      },
    }
  }
}
