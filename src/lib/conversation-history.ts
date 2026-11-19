import { z } from "zod"
import type { Conversation } from "./chat"

export const historySearch = z.object({
  q: z.string().optional().catch(undefined),
  applicationId: z.string().optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  rename: z.string().optional().catch(undefined),
  remove: z.string().optional().catch(undefined),
})
export const auditSearch = z.object({
  q: z.string().optional().catch(undefined),
  applicationId: z.string().optional().catch(undefined),
  userId: z.string().optional().catch(undefined),
  hasIssue: z.enum(["yes", "no"]).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
})
export type ConversationFilters = z.infer<typeof auditSearch>
export type ConversationSummary = {
  id: string
  title: string
  application: { id: string; name: string }
  user: { id: string; name: string; email: string }
  updatedAt: number
  deletedAt: number | null
  issueCount: number
  /** Tickets created from it, whatever their status. */
  ticketCount: number
  refused: boolean
}
export type ToolActivity = {
  id: string
  name: string
  input: string
  status: "started" | "complete" | "error"
  error?: string
  createdAt?: number
  messageId?: string
}
export type ConversationAudit = Conversation & {
  user: ConversationSummary["user"]
  deletedAt: number | null
  updatedAt: number
  activities: Array<ToolActivity>
}

export function activityTime(value: number) {
  return new Date(value).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
