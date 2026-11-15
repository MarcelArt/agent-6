import { createFileRoute } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
import { NewDatabaseConnectionLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/database-connections/")({
  component: Page,
})
function Page() {
  return (
    <DetailHint
      icon={<DatabaseIcon />}
      title="Select a Database Connection to edit it"
      description="Postgres databases the agent can query, read-only. Attach them to Applications to put them in scope."
    >
      <NewDatabaseConnectionLink />
    </DetailHint>
  )
}
