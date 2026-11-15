import "@tanstack/react-start/server-only"

import { requireAdmin, requireSession } from "./session"
import {
  ConversationError,
  createConversationsRepository,
} from "./repositories/conversations"
import type { Auth } from "./auth"
import type { ConversationsRepository } from "./repositories/conversations"
import type { ConversationFilters } from "@/lib/conversation-history"

export function createConversationHistory(
  deps: { auth?: Auth; conversations?: ConversationsRepository } = {}
) {
  const conversations = deps.conversations ?? createConversationsRepository()
  return {
    async list(headers: Headers, filters: ConversationFilters) {
      const owner = await requireSession({ auth: deps.auth, headers })
      const result = conversations.list(filters, owner.id)
      // Client list payloads contain no audit metadata or other users' identities.
      return {
        ...result,
        conversations: result.conversations.map(
          ({ id, title, application, updatedAt, issueCount }) => ({
            id,
            title,
            application,
            updatedAt,
            issueCount,
          })
        ),
      }
    },
    async rename(headers: Headers, id: string, title: string) {
      const owner = await requireSession({ auth: deps.auth, headers })
      title = title.replace(/\s+/g, " ").trim()
      if (!title || title.length > 120)
        throw new ConversationError("Use a title between 1 and 120 characters.")
      conversations.rename(id, owner.id, title)
    },
    async remove(headers: Headers, id: string) {
      const owner = await requireSession({ auth: deps.auth, headers })
      conversations.remove(id, owner.id)
    },
    async listAll(headers: Headers, filters: ConversationFilters) {
      await requireAdmin({ auth: deps.auth, headers })
      return conversations.list(filters)
    },
    async audit(headers: Headers, id: string) {
      await requireAdmin({ auth: deps.auth, headers })
      return conversations.audit(id)
    },
  }
}
