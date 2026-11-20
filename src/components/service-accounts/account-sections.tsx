import { Link } from "@tanstack/react-router"
import { HistoryIcon, KeyRoundIcon, PlusIcon } from "lucide-react"
import { KeyStateBadge, Moment } from "./status"
import { buttonVariants } from "@/components/ui/button"
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field"
import type { ApiKeySummary, AuditEntry } from "@/lib/service-accounts"

const link = "underline underline-offset-4 hover:text-foreground"

/** The account's API Keys, each linking to its grants. */
export function KeysSection({
  serviceAccountId,
  keys,
  search,
}: {
  serviceAccountId: string
  keys: Array<ApiKeySummary>
  search: { q?: string; page?: number }
}) {
  return (
    <FieldSet>
      <FieldLegend>API Keys</FieldLegend>
      <FieldDescription>
        Each key has its own permissions and Application access. To rotate a
        key, issue a new one, switch the integration to it, then revoke the old
        one. See the <a href="/docs/api">API reference</a>.
      </FieldDescription>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium">
          {keys.length} {keys.length === 1 ? "key" : "keys"}
        </h2>
        <Link
          to="/admin/service-accounts/$serviceAccountId/keys/new"
          params={{ serviceAccountId }}
          search={search}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <PlusIcon />
          Issue API Key
        </Link>
      </div>
      {keys.length ? (
        <ul className="divide-y rounded-md border">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex min-w-0 items-start gap-2 px-3 py-2"
            >
              <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to="/admin/service-accounts/$serviceAccountId/keys/$apiKeyId"
                    params={{ serviceAccountId, apiKeyId: key.id }}
                    search={search}
                    className="min-w-0 truncate text-xs font-medium underline-offset-4 hover:underline"
                  >
                    {key.name}
                  </Link>
                  <span className="ml-auto">
                    <KeyStateBadge state={key.state} />
                  </span>
                </div>
                <code className="font-mono text-xs break-all text-muted-foreground">
                  {key.prefix}…
                </code>
                <span className="text-xs text-muted-foreground">
                  Created <Moment value={key.createdAt} /> · Last used{" "}
                  <Moment value={key.lastUsedAt} />
                  {key.state === "revoked" ? (
                    <>
                      {" "}
                      · Revoked <Moment value={key.revokedAt} />
                    </>
                  ) : (
                    <>
                      {" "}
                      · {key.state === "expired" ? "Expired" : "Expires"}{" "}
                      <Moment value={key.expiresAt} never="never" />
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          No API Keys yet. Issue one for the integration; it starts with no
          access until you grant it.
        </p>
      )}
    </FieldSet>
  )
}

const RESOURCES: Record<string, string> = {
  repositories: "Repository",
  applications: "Application",
  attachments: "Attachment",
  "database-connections": "Database Connection",
  "log-connections": "Log Connection",
  "preferred-language": "Preferred Language",
  tickets: "Ticket",
}
const VERBS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Removed",
  accept: "Accepted",
  decline: "Declined",
}

/** "Accepted Ticket", or the raw operation when it is not a known one. */
export function operationLabel(operation: string) {
  const [resource, verb] = operation.split(".")
  const noun = RESOURCES[resource]
  const done = VERBS[verb]
  return noun && done ? `${done} ${noun}` : operation
}

/** The latest protected changes the account made through the API. */
export function ActivitySection({ activity }: { activity: Array<AuditEntry> }) {
  return (
    <FieldSet>
      <FieldLegend>Recent activity</FieldLegend>
      <FieldDescription>
        Changes and Ticket decisions this Service Account made through the API,
        newest first. Reads are not listed.
      </FieldDescription>
      {activity.length ? (
        <ul className="divide-y rounded-md border">
          {activity.map((entry) => (
            <li
              key={entry.id}
              className="flex min-w-0 items-start gap-2 px-3 py-2"
            >
              <HistoryIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                <span className="font-medium">
                  {operationLabel(entry.operation)}
                  {entry.targetType === "ticket" && entry.targetId && (
                    <>
                      {" "}
                      <Link
                        to="/admin/tickets/$ticketId"
                        params={{ ticketId: entry.targetId }}
                        search={{ status: "all" }}
                        className={`font-normal ${link}`}
                      >
                        Open Ticket
                      </Link>
                    </>
                  )}
                </span>
                {entry.targetType !== "ticket" && entry.targetId && (
                  <code className="font-mono break-all text-muted-foreground">
                    {entry.targetId}
                  </code>
                )}
                <span className="text-muted-foreground">
                  <Moment value={entry.createdAt} />
                  {entry.apiKey && ` · API Key ${entry.apiKey.name}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          Nothing yet. Changes and Ticket decisions made with this account’s
          keys appear here.
        </p>
      )}
    </FieldSet>
  )
}
