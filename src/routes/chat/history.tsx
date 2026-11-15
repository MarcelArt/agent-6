import { createFileRoute } from "@tanstack/react-router"
import { MessageSquareIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/chat/history")({
  head: () => ({ meta: [{ title: "History · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Conversations"
      icon={MessageSquareIcon}
      phone="list"
      list={{
        title: "No Conversations yet",
        description: "Your Conversations with the agent appear here.",
      }}
      detail={{
        title: "Select a Conversation to reopen it",
        description:
          "Past Conversations stay here so you can pick up where you left off.",
      }}
    />
  )
}
