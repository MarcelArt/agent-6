import {
  BanIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ApiKeyState } from "@/lib/service-accounts"
import { apiKeyStateLabels } from "@/lib/service-accounts"

/** Muted, like the Users list: Active or Disabled. */
export function AccountStatusIcon({
  disabled,
  className,
}: {
  disabled: boolean
  className?: string
}) {
  const Icon = disabled ? BanIcon : CircleCheckIcon
  return (
    <Icon
      aria-hidden="true"
      className={cn("text-muted-foreground", className)}
    />
  )
}

export function AccountStatusBadge({ disabled }: { disabled: boolean }) {
  return (
    <Badge variant="outline" className="text-xs">
      <AccountStatusIcon disabled={disabled} />
      {disabled ? "Disabled" : "Active"}
    </Badge>
  )
}

export function KeyStateIcon({
  state,
  className,
}: {
  state: ApiKeyState
  className?: string
}) {
  const Icon =
    state === "active"
      ? CircleCheckIcon
      : state === "expired"
        ? CircleDashedIcon
        : CircleXIcon
  return (
    <Icon
      aria-hidden="true"
      className={cn("text-muted-foreground", className)}
    />
  )
}

export function KeyStateBadge({ state }: { state: ApiKeyState }) {
  return (
    <Badge variant="outline" className="text-xs">
      <KeyStateIcon state={state} />
      {apiKeyStateLabels[state]}
    </Badge>
  )
}

/** A time with its machine-readable value; empty values read "Never". */
export function Moment({
  value,
  never = "Never",
}: {
  value: number | null
  never?: string
}) {
  if (value === null) return <>{never}</>
  return (
    <time suppressHydrationWarning dateTime={new Date(value).toISOString()}>
      {new Date(value).toLocaleString("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  )
}
