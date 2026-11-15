import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { ConversationView } from "@/components/chat/conversation"
import { getConversationAudit } from "@/server/conversation-history.functions"

export const Route = createFileRoute("/admin/conversations/$conversationId")({
  validateSearch: z.object({ image: z.string().optional() }),
  loader: ({ params }) =>
    getConversationAudit({ data: { conversationId: params.conversationId } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Conversation"} · Audit · Agent 6` },
    ],
  }),
  component: Page,
})
function Page() {
  const conversation = Route.useLoaderData()
  const { image } = Route.useSearch()
  return (
    <ConversationView
      key={conversation.id}
      initial={conversation}
      audit={conversation}
      userName={conversation.user.name}
      openImage={image}
    />
  )
}
