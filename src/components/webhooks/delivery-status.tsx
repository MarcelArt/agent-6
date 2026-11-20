import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
} from "lucide-react"
import { cn } from "cn"
import { webhookDeliveryStatusLabels } from "@/lib/webhooks"
import type { WebhookDeliveryStatus } from "@/lib/webhooks"

/** The host of a destination, for list rows; the whole text if it is not a URL. */
export function destinationHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const icons: Record<WebhookDeliveryStatus, typeof CircleCheckIcon> = {
  pending: CircleDashedIcon,
  succeeded: CircleCheckIcon,
  failed: CircleAlertIcon,
  cancelled: BanIcon,
}

/** A delivery's status as an icon and a word; failures in the destructive colour. */
export function DeliveryStatus({
  status,
  className,
}: {
  status: WebhookDeliveryStatus
  className?: string
}) {
  const Icon = icons[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium [&_svg]:size-3.5",
        status === "failed" ? "text-destructive" : "text-foreground",
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          status !== "failed" &&
            status !== "succeeded" &&
            "text-muted-foreground"
        )}
      />
      {webhookDeliveryStatusLabels[status]}
    </span>
  )
}
