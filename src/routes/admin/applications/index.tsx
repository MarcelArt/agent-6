import { createFileRoute } from "@tanstack/react-router"
import { BoxesIcon } from "lucide-react"
import { NewApplicationLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/applications/")({
  component: Page,
})
function Page() {
  return (
    <DetailHint
      icon={<BoxesIcon />}
      title="Select an Application to edit it"
      description="The products your organization supports. Attach Repositories to give the agent the code it needs."
    >
      <NewApplicationLink />
    </DetailHint>
  )
}
