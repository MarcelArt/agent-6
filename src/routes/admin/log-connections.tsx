import { createFileRoute } from "@tanstack/react-router"
import { ScrollTextIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/admin/log-connections")({
  head: () => ({ meta: [{ title: "Log Connections · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Log Connections"
      icon={ScrollTextIcon}
      phone="list"
      list={{
        title: "No Log Connections yet",
        description: "Connect a Loki endpoint so the agent can read logs.",
      }}
      detail={{
        title: "Select a Log Connection to edit it",
        description:
          "Loki endpoints the agent can query for logs. Attach them to Applications to put them in scope.",
      }}
    />
  )
}
