import { createFileRoute } from "@tanstack/react-router"
import { MessageSquareIcon } from "lucide-react"
import { DetailPane } from "@/components/shell/panes"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/conversations/")({
  component: Page,
})
function Page() {
  return (
    <DetailPane phone="hidden">
      <DetailHint
        icon={<MessageSquareIcon />}
        title="Select a Conversation to review it"
        description="Review messages, tool activity and Filed Issues. Conversations are read-only here."
      />
    </DetailPane>
  )
}
