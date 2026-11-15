import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { ConversationView } from "@/components/chat/conversation"
import { getConversation } from "@/server/chat.functions"

export const Route = createFileRoute("/chat/$conversationId")({
  // `image` is the picture opened larger, so a reload shows it again.
  validateSearch: z.object({ image: z.string().optional() }),
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
  const { image } = Route.useSearch()
  return (
    <ConversationView
      key={conversation.id}
      initial={conversation}
      userName={user.name}
      openImage={image}
    />
  )
}
