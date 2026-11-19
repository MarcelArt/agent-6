import { createFileRoute } from "@tanstack/react-router"
import { TicketsIcon } from "lucide-react"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/tickets/")({
  component: Page,
})
function Page() {
  return (
    <DetailHint
      icon={<TicketsIcon />}
      title="Select a Ticket to review it"
      description="Accept a Ticket to file it on GitHub, after editing it if needed, or decline it with a reason its owner reads."
    />
  )
}
