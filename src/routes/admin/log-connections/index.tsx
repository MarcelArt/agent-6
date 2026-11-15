import { createFileRoute } from "@tanstack/react-router"
import { ScrollTextIcon } from "lucide-react"
import { NewLogConnectionLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/log-connections/")({
  component: Page,
})
function Page() {
  return (
    <DetailHint
      icon={<ScrollTextIcon />}
      title="Select a Log Connection to edit it"
      description="Loki endpoints the agent can query for logs. Attach them to Applications to put them in scope."
    >
      <NewLogConnectionLink />
    </DetailHint>
  )
}
