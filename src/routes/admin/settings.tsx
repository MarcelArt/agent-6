import { createFileRoute } from "@tanstack/react-router"
import { SettingsIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Settings"
      icon={SettingsIcon}
      phone="detail"
      detail={{
        title: "No settings yet",
        description:
          "Organization-wide settings, such as the Preferred Language, appear here.",
      }}
    />
  )
}
