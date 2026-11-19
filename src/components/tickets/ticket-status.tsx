import { CircleCheckIcon, CircleDashedIcon, CircleXIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TicketStatus } from "@/lib/tickets"
import { ticketStatusLabels } from "@/lib/tickets"

/** Muted like other statuses: a decline is a decision, not a failure. */
export function TicketStatusIcon({
  status,
  className,
}: {
  status: TicketStatus
  className?: string
}) {
  const Icon =
    status === "accepted"
      ? CircleCheckIcon
      : status === "declined"
        ? CircleXIcon
        : CircleDashedIcon
  return (
    <Icon
      aria-hidden="true"
      className={cn("text-muted-foreground", className)}
    />
  )
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="outline" className="text-xs">
      <TicketStatusIcon status={status} />
      {ticketStatusLabels[status]}
    </Badge>
  )
}
