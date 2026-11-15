export const MAX_MESSAGE_LENGTH = 8000
export const REPLY_TIME_LIMIT_MS = 90_000
export const REPLY_MAX_TURNS = 12
export const REPLY_FAILED =
  "I couldn’t finish answering just now. Please try again."
export const REPLY_LIMIT =
  "I couldn’t finish checking in time. Please try again, or ask a smaller question."
export type ChatApplication = {
  id: string
  name: string
  description: string
  ready: boolean
}
export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  status: "queued" | "pending" | "complete" | "error"
  createdAt: number
}
export type Conversation = {
  id: string
  title: string
  application: { id: string; name: string }
  messages: Array<ChatMessage>
}
export type ChatEvent =
  | { type: "snapshot"; conversation: Conversation }
  | { type: "progress" }
  | { type: "delta"; text: string }
  | { type: "done"; conversation: Conversation }

export type ReplyInput = { message: string } | { retry: true } | { start: true }
