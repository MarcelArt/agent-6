import { createFileRoute } from "@tanstack/react-router"
import { BoxesIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/admin/applications")({
  head: () => ({ meta: [{ title: "Applications · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Applications"
      icon={BoxesIcon}
      phone="list"
      list={{
        title: "No Applications yet",
        description:
          "Create an Application so Clients can ask the agent about it.",
      }}
      detail={{
        title: "Select an Application to edit it",
        description:
          "The products your organization supports. Each one groups Repositories, Database Connections and Log Connections.",
      }}
    />
  )
}
