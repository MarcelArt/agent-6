import { Link, createFileRoute } from "@tanstack/react-router"
import { MessageSquareIcon } from "lucide-react"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { DetailPane } from "@/components/shell/panes"
import { DetailHint } from "@/components/records/record-detail"
import { buttonVariants } from "@/components/ui/button"

export const Route = createFileRoute("/chat/history")({
  head: () => ({ meta: [{ title: "History · Agent 6" }] }),
  component: Page,
})
function Page() {
  return (
    <>
      <ChatSidebar />
      <DetailPane phone="hidden">
        <DetailHint
          icon={<MessageSquareIcon />}
          title="Select a Conversation to reopen it"
          description="Past Conversations stay here so you can pick up where you left off."
        >
          <Link to="/chat" className={buttonVariants()}>
            New conversation
          </Link>
        </DetailHint>
      </DetailPane>
    </>
  )
}
