import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
} from "lucide-react"
import type { Repository, RepositoryStatus } from "@/lib/repositories"
import { timeAgo } from "@/lib/repositories"

export const statusLabels: Record<RepositoryStatus, string> = {
  pending: "Pending",
  syncing: "Syncing",
  ready: "Ready",
  failed: "Failed",
}

/** Whether a sync is waiting or running, so the screen should keep refreshing. */
export function isBusy(status: RepositoryStatus): boolean {
  return status === "pending" || status === "syncing"
}

export function StatusIcon({ status }: { status: RepositoryStatus }) {
  switch (status) {
    case "ready":
      return <CircleCheckIcon className="text-muted-foreground" />
    case "syncing":
      return <LoaderCircleIcon className="animate-spin text-foreground" />
    case "failed":
      return <CircleAlertIcon className="text-destructive" />
    case "pending":
      return <CircleDashedIcon className="text-muted-foreground" />
  }
}

/** Line 2 of a list row: "Ready · 4 min ago". */
export function StatusLine({
  repository,
  now,
}: {
  repository: Repository
  now: number
}) {
  switch (repository.status) {
    case "ready":
      return repository.lastSyncedAt === null
        ? "Ready"
        : `Ready · ${timeAgo(repository.lastSyncedAt, now)}`
    case "syncing":
      return repository.syncStartedAt === null
        ? "Syncing"
        : `Syncing · started ${timeAgo(repository.syncStartedAt, now)}`
    case "pending":
      return "Pending · Waiting for first sync"
    case "failed":
      return (
        <>
          <span className="text-destructive">Failed</span> ·{" "}
          {repository.error ?? "The sync failed."}
        </>
      )
  }
}

/** "Last synced 4 min ago · 7d03b18", for the detail pane. */
export function lastSynced(repository: Repository, now: number): string {
  if (repository.lastSyncedAt === null) return "Not synced yet"
  const commit = repository.lastSyncedCommit?.slice(0, 7)
  return `Last synced ${timeAgo(repository.lastSyncedAt, now)}${commit ? ` · ${commit}` : ""}`
}
