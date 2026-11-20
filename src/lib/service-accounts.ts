import { z } from "zod"

/*
 * Service Accounts and API Keys: the permissions an Admin grants, and what the
 * Admin screens show. Shared by the browser, the API and its reference page.
 */

export type PermissionGroup = {
  /** The resource, as the API names it. */
  resource: string
  label: string
  operations: Array<{
    permission: ApiPermission
    label: string
    description: string
  }>
}

export const PERMISSION_GROUPS = [
  {
    resource: "repositories",
    label: "Repositories",
    operations: [
      {
        permission: "repositories:read",
        label: "Read",
        description: "List and view Repositories and their sync status.",
      },
      {
        permission: "repositories:create",
        label: "Create",
        description: "Connect Repositories. Needs All Applications.",
      },
      {
        permission: "repositories:update",
        label: "Update",
        description:
          "Change Tracked Branch, Tags and description. Needs All Applications.",
      },
      {
        permission: "repositories:delete",
        label: "Delete",
        description:
          "Remove Repositories and their clones. Needs All Applications.",
      },
    ],
  },
  {
    resource: "applications",
    label: "Applications",
    operations: [
      {
        permission: "applications:read",
        label: "Read",
        description: "List and view Applications.",
      },
      {
        permission: "applications:create",
        label: "Create",
        description: "Create Applications. Needs All Applications.",
      },
      {
        permission: "applications:update",
        label: "Update",
        description:
          "Rename Applications and edit notes. Needs All Applications.",
      },
      {
        permission: "applications:delete",
        label: "Delete",
        description:
          "Remove Applications without saved Conversations. Needs All Applications.",
      },
    ],
  },
  {
    resource: "attachments",
    label: "Attachments",
    operations: [
      {
        permission: "attachments:read",
        label: "Read",
        description:
          "List an Application's Attachments, including Base Selectors.",
      },
      {
        permission: "attachments:create",
        label: "Create",
        description:
          "Attach resources to Applications, widening what the agent reads. Needs All Applications.",
      },
      {
        permission: "attachments:update",
        label: "Update",
        description:
          "Change a Log Attachment's Base Selector. Needs All Applications.",
      },
      {
        permission: "attachments:delete",
        label: "Delete",
        description: "Detach resources. Needs All Applications.",
      },
    ],
  },
  {
    resource: "database-connections",
    label: "Database Connections",
    operations: [
      {
        permission: "database-connections:read",
        label: "Read",
        description: "List and view names, Tags and connection status.",
      },
      {
        permission: "database-connections:read-config",
        label: "Read settings",
        description:
          "Also see host, port, database, user and SSL mode. Passwords are never returned.",
      },
      {
        permission: "database-connections:create",
        label: "Create",
        description:
          "Create connections with their password. Needs All Applications.",
      },
      {
        permission: "database-connections:update",
        label: "Update",
        description:
          "Change connection settings and passwords. Needs All Applications.",
      },
      {
        permission: "database-connections:delete",
        label: "Delete",
        description: "Remove connections. Needs All Applications.",
      },
    ],
  },
  {
    resource: "log-connections",
    label: "Log Connections",
    operations: [
      {
        permission: "log-connections:read",
        label: "Read",
        description: "List and view names, Tags and connection status.",
      },
      {
        permission: "log-connections:read-config",
        label: "Read settings",
        description:
          "Also see base URL, auth type, username and tenant ID. Secrets are never returned.",
      },
      {
        permission: "log-connections:create",
        label: "Create",
        description:
          "Create connections with their auth secret. Needs All Applications.",
      },
      {
        permission: "log-connections:update",
        label: "Update",
        description:
          "Change connection settings and secrets. Needs All Applications.",
      },
      {
        permission: "log-connections:delete",
        label: "Delete",
        description: "Remove connections. Needs All Applications.",
      },
    ],
  },
  {
    resource: "preferred-language",
    label: "Preferred Language",
    operations: [
      {
        permission: "preferred-language:read",
        label: "Read",
        description: "Read the organization's Preferred Language.",
      },
      {
        permission: "preferred-language:update",
        label: "Update",
        description:
          "Change the language the agent answers everyone in. Needs All Applications.",
      },
    ],
  },
  {
    resource: "tickets",
    label: "Tickets",
    operations: [
      {
        permission: "tickets:read",
        label: "Read",
        description:
          "List and view Tickets: status, kind, owner summary, Application and Repository.",
      },
      {
        permission: "tickets:read-details",
        label: "Read details",
        description:
          "Also see developer title and description, decline reasons and Filed Issue links.",
      },
      {
        permission: "tickets:accept",
        label: "Accept",
        description:
          "Accept pending Tickets as stored. This delegates filing on GitHub: acceptance opens an issue or adds an occurrence comment with Agent 6's GitHub token.",
      },
      {
        permission: "tickets:decline",
        label: "Decline",
        description:
          "Decline pending Tickets with a reason the Conversation's owner reads exactly as written.",
      },
    ],
  },
] as const satisfies ReadonlyArray<
  Omit<PermissionGroup, "operations"> & {
    operations: ReadonlyArray<{
      permission: string
      label: string
      description: string
    }>
  }
>

export type ApiPermission =
  (typeof PERMISSION_GROUPS)[number]["operations"][number]["permission"]

export const API_PERMISSIONS: ReadonlyArray<ApiPermission> =
  PERMISSION_GROUPS.flatMap((group) =>
    group.operations.map((item) => item.permission)
  )

export function isApiPermission(value: string): value is ApiPermission {
  return (API_PERMISSIONS as ReadonlyArray<string>).includes(value)
}

/** Known permissions in catalog order, without repeats. */
export function tidyPermissions(
  values: ReadonlyArray<string>
): Array<ApiPermission> {
  return API_PERMISSIONS.filter((permission) => values.includes(permission))
}

export const MAX_SERVICE_ACCOUNT_NAME = 100
export const MAX_SERVICE_ACCOUNT_DESCRIPTION = 1000
export const MAX_API_KEY_NAME = 100
export const SERVICE_ACCOUNTS_PAGE_SIZE = 20

/** Expiry choices for a new API Key, in days; null never expires. */
export const KEY_EXPIRY_CHOICES = [
  { value: "30", label: "In 30 days", days: 30 },
  { value: "90", label: "In 90 days", days: 90 },
  { value: "365", label: "In 1 year", days: 365 },
  { value: "never", label: "Never", days: null },
] as const
export type KeyExpiryChoice = (typeof KEY_EXPIRY_CHOICES)[number]["value"]

export const serviceAccountInput = z.object({
  name: z.string(),
  description: z.string(),
})
export type ServiceAccountInput = z.infer<typeof serviceAccountInput>

export const apiKeyGrants = z.object({
  name: z.string(),
  permissions: z.array(z.string()).max(100),
  allApplications: z.boolean(),
  applicationIds: z.array(z.string()).max(1000),
})
export type ApiKeyGrants = z.infer<typeof apiKeyGrants>

export const newApiKeyInput = apiKeyGrants.extend({
  expiry: z.enum(["30", "90", "365", "never"]),
})
export type NewApiKeyInput = z.infer<typeof newApiKeyInput>

export type ServiceAccountField = keyof ServiceAccountInput
export type ApiKeyField = keyof NewApiKeyInput

/** Where an API Key stands. Only "active" keys authenticate. */
export type ApiKeyState = "active" | "expired" | "revoked"
export const apiKeyStateLabels: Record<ApiKeyState, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
}

export type ServiceAccountSummary = {
  id: string
  name: string
  description: string
  disabled: boolean
  activeKeys: number
  createdAt: number
}

export type ServiceAccountsPage = {
  serviceAccounts: Array<ServiceAccountSummary>
  total: number
  page: number
  pageSize: number
}

export type ApiKeySummary = {
  id: string
  name: string
  /** The visible start of the key, for example "agent6_3f9a0c1d2e4b5a69". */
  prefix: string
  state: ApiKeyState
  permissions: Array<ApiPermission>
  allApplications: boolean
  applications: Array<{ id: string; name: string }>
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  revokedAt: number | null
}

export type AuditEntry = {
  id: string
  operation: string
  targetType: string
  targetId: string | null
  apiKey: { id: string; name: string } | null
  createdAt: number
}

export type ServiceAccountDetail = ServiceAccountSummary & {
  keys: Array<ApiKeySummary>
  /** The latest protected changes it made through the API. */
  activity: Array<AuditEntry>
}

export type ApiKeyDetail = ApiKeySummary & {
  serviceAccount: { id: string; name: string; disabled: boolean }
}

export type ServiceAccountProblem = {
  ok: false
  message: string
  field?: ServiceAccountField | ApiKeyField
}

export type ServiceAccountResult =
  { ok: true; serviceAccount: ServiceAccountSummary } | ServiceAccountProblem

/** The key is in the answer exactly once: on creation. */
export type NewApiKeyResult =
  { ok: true; apiKey: ApiKeySummary; key: string } | ServiceAccountProblem

export type ApiKeyResult =
  { ok: true; apiKey: ApiKeySummary } | ServiceAccountProblem
