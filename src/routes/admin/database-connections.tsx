import { createFileRoute } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/admin/database-connections")({
  head: () => ({ meta: [{ title: "Database Connections · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Database Connections"
      icon={DatabaseIcon}
      phone="list"
      list={{
        title: "No Database Connections yet",
        description:
          "Connect a Postgres database so the agent can query it, read-only.",
      }}
      detail={{
        title: "Select a Database Connection to edit it",
        description:
          "Postgres databases the agent can query, read-only. Attach them to Applications to put them in scope.",
      }}
    />
  )
}
