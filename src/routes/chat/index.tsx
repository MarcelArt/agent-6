import { createFileRoute } from "@tanstack/react-router"
import { MessageSquareIcon } from "lucide-react"
import { SectionPlaceholder } from "@/components/shell/section-placeholder"

export const Route = createFileRoute("/chat/")({
  head: () => ({ meta: [{ title: "Chat · Agent 6" }] }),
  component: Page,
})

function Page() {
  return (
    <SectionPlaceholder
      title="Conversations"
      icon={MessageSquareIcon}
      phone="detail"
      list={{
        title: "No Conversations yet",
        description: "Your Conversations with the agent appear here.",
      }}
      detail={{
        title: "Start a Conversation",
        description:
          "Pick an Application and ask the agent for help. Chat arrives in a later step.",
      }}
    />
  )
}
