import { createFileRoute } from "@tanstack/react-router"
import { UsersIcon } from "lucide-react"
import { NewUserLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/users/")({
  component: Page,
})

function Page() {
  return (
    <DetailHint
      icon={<UsersIcon />}
      title="Select a user to edit it"
      description="The people who can sign in to Agent 6, as Admin or Client."
    >
      <NewUserLink />
    </DetailHint>
  )
}
