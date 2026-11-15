import { createFileRoute } from "@tanstack/react-router"
import { createChatManagement, replyInput } from "@/server/chat-management"
import { ConversationError } from "@/server/repositories/conversations"
import { AuthorizationError } from "@/server/session"

export const Route = createFileRoute("/api/chat/$conversationId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        // Cookie-authenticated mutation: accept only the same browser origin.
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response("This request is not allowed.", { status: 403 })
        try {
          if (Number(request.headers.get("content-length")) > 40_000)
            return new Response("Message is too long.", { status: 413 })
          const body = await request.text()
          if (body.length > 40_000)
            return new Response("Message is too long.", { status: 413 })
          const parsed = replyInput.safeParse(JSON.parse(body))
          if (!parsed.success)
            return new Response("Please check your message and try again.", {
              status: 400,
            })
          return await createChatManagement().reply(
            request.headers,
            params.conversationId,
            parsed.data
          )
        } catch (error) {
          if (error instanceof AuthorizationError)
            return new Response("Please sign in again.", { status: 401 })
          if (error instanceof ConversationError)
            return new Response(error.message, { status: error.status })
          return new Response("The answer could not start. Please try again.", {
            status: 400,
          })
        }
      },
    },
  },
})
