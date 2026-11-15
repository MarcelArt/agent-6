import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { createChatManagement } from "./chat-management"
import { ConversationError } from "./repositories/conversations"

export const listChatApplications = createServerFn({ method: "GET" }).handler(
  () => createChatManagement().applications(getRequestHeaders())
)
export const createConversation = createServerFn({ method: "POST" })
  .validator(
    z.object({
      applicationId: z.string(),
      message: z.string(),
      images: z.array(z.string()).optional(),
    })
  )
  .handler(async ({ data }) => {
    try {
      return {
        ok: true as const,
        conversation: await createChatManagement().create(
          getRequestHeaders(),
          data.applicationId,
          data.message,
          data.images
        ),
      }
    } catch (error) {
      if (!(error instanceof ConversationError)) throw error
      return { ok: false as const, message: error.message }
    }
  })
export const getConversation = createServerFn({ method: "GET" })
  .validator(z.object({ conversationId: z.string() }))
  .handler(async ({ data }) => {
    try {
      return await createChatManagement().get(
        getRequestHeaders(),
        data.conversationId
      )
    } catch (error) {
      if (error instanceof ConversationError && error.status === 404)
        throw notFound()
      throw error
    }
  })
