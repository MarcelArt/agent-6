import { createFileRoute } from "@tanstack/react-router"
import { WebhookIcon } from "lucide-react"
import { NewWebhookLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/webhooks/")({
  component: Page,
})

function Page() {
  return (
    <DetailHint
      icon={<WebhookIcon />}
      title="Select a Webhook Subscription"
      description="Webhook Subscriptions send Ticket events to other systems as signed HTTPS requests. Open one to edit it, send a test or see its deliveries."
    >
      <NewWebhookLink />
    </DetailHint>
  )
}
