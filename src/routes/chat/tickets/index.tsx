import { createFileRoute } from "@tanstack/react-router"
import { TicketIcon } from "lucide-react"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/chat/tickets/")({
  component: Page,
})
function Page() {
  return (
    <DetailHint
      icon={<TicketIcon />}
      title="Select a ticket to see where it stands"
      description="The team reviews each ticket before passing it on to the developers."
    />
  )
}
