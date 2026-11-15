import { createFileRoute } from "@tanstack/react-router"
import { FolderGit2Icon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/admin/repositories")({
  head: () => ({ meta: [{ title: "Repositories · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Repositories"
      icon={FolderGit2Icon}
      phone="list"
      list={{
        title: "No Repositories yet",
        description:
          "Connect a GitHub repository so the agent can read its code.",
      }}
      detail={{
        title: "Select a Repository to edit it",
        description:
          "GitHub repositories the agent can read. Attach them to Applications to put them in scope.",
      }}
    />
  )
}
