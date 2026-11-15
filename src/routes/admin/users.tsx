import { createFileRoute } from "@tanstack/react-router"
import { UsersIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Users"
      icon={UsersIcon}
      phone="list"
      list={{
        title: "No users yet",
        description:
          "Create accounts for the Admins and Clients of your organization.",
      }}
      detail={{
        title: "Select a user to edit it",
        description:
          "The people who can sign in to Agent 6, as Admin or Client.",
      }}
    />
  )
}
