import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { auditSearch } from "@/lib/conversation-history"
import { createConversationHistory } from "./conversation-history"
import { ConversationError } from "./repositories/conversations"

export const listConversations = createServerFn({ method: "GET" })
  .validator(auditSearch)
  .handler(({ data }) =>
    createConversationHistory().list(getRequestHeaders(), data)
  )
export const listAllConversations = createServerFn({ method: "GET" })
  .validator(auditSearch)
  .handler(({ data }) =>
    createConversationHistory().listAll(getRequestHeaders(), data)
  )
export const getConversationAudit = createServerFn({ method: "GET" })
  .validator(z.object({ conversationId: z.string() }))
  .handler(async ({ data }) => {
    try {
      return await createConversationHistory().audit(
        getRequestHeaders(),
        data.conversationId
      )
    } catch (error) {
      if (error instanceof ConversationError && error.status === 404)
        throw notFound()
      throw error
    }
  })
export const renameConversation = createServerFn({ method: "POST" })
  .validator(z.object({ conversationId: z.string(), title: z.string() }))
  .handler(async ({ data }) => {
    try {
      await createConversationHistory().rename(
        getRequestHeaders(),
        data.conversationId,
        data.title
      )
      return { ok: true as const }
    } catch (error) {
      if (!(error instanceof ConversationError)) throw error
      return { ok: false as const, message: error.message }
    }
  })
export const deleteConversation = createServerFn({ method: "POST" })
  .validator(z.object({ conversationId: z.string() }))
  .handler(async ({ data }) => {
    try {
      await createConversationHistory().remove(
        getRequestHeaders(),
        data.conversationId
      )
      return { ok: true as const }
    } catch (error) {
      if (!(error instanceof ConversationError)) throw error
      return { ok: false as const, message: error.message }
    }
  })
