import { createFileRoute } from "@tanstack/react-router"
import { ConversationView } from "@/components/chat/conversation"
import { getConversation } from "@/server/chat.functions"

export const Route = createFileRoute("/chat/$conversationId")({
  loader: ({ params }) =>
    getConversation({ data: { conversationId: params.conversationId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? "Conversation"} · Agent 6` }],
  }),
  component: Page,
})
function Page() {
  const conversation = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  return (
    <ConversationView
      key={conversation.id}
      initial={conversation}
      userName={user.name}
    />
  )
}
