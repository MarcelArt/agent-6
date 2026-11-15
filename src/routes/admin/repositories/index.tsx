import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { FolderGit2Icon } from "lucide-react"
import { ConnectRepositoryLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

const section = getRouteApi("/admin/repositories")

export const Route = createFileRoute("/admin/repositories/")({
  component: Page,
})

function Page() {
  const { total } = section.useLoaderData()
  const { q } = section.useSearch()
  // With no Repository yet there is nothing to select.
  const none = total === 0 && !q
  return (
    <DetailHint
      icon={none ? undefined : <FolderGit2Icon />}
      title={none ? undefined : "Select a Repository to edit it"}
      description="GitHub repositories the agent can read. Attach them to Applications to put them in scope."
    >
      <ConnectRepositoryLink />
    </DetailHint>
  )
}
