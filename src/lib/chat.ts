import type { AgentMessages } from "./preferred-language"
import type { TicketStatus } from "./tickets"

export const MAX_MESSAGE_LENGTH = 8000
/** Renewed while the worker is alive; this is not a reply duration limit. */
export const REPLY_LEASE_MS = 30_000
export const REPLY_FAILED =
  "I couldn’t finish answering just now. Please try again."
export const REPLY_LIMIT =
  "I couldn’t finish checking in time. Please try again, or ask a smaller question."
/** Guardrail wording stays here so Preferred Language can translate it. */
export const GUARDRAIL_REFUSED =
  "I can help you use this Application, troubleshoot problems, and understand your data in it. Please ask me about that."
export const GUARDRAIL_FAILED =
  "I couldn’t check your message just now. Please try again."
export type ChatApplication = {
  id: string
  name: string
  description: string
  ready: boolean
}
export type IssueKind = "code-fix" | "data-fix" | "feature-request"
export const ISSUE_KINDS: Array<IssueKind> = [
  "code-fix",
  "data-fix",
  "feature-request",
]
export const issueKindLabels: Record<IssueKind, string> = {
  "code-fix": "Code Fix",
  "data-fix": "Data Fix",
  "feature-request": "Feature Request",
}
/** A Filed Issue as stored. `number` and `url` are null when reporting failed. */
export type FiledIssueRecord = {
  repository: string
  kind: IssueKind
  title: string
  outcome: "new" | "comment" | "failed"
  number: number | null
  url: string | null
  error: string | null
}
/**
 * What an agent answer shows about reporting to the team. Clients get only
 * the bare notice; `issue` and failures are sent to Admins alone. Answers
 * from before Tickets show the Filed Issue directly.
 */
export type Report =
  | {
      id: string
      outcome: "new" | "comment"
      issue?: { repository: string; number: number; url: string }
    }
  | { id: string; outcome: "failed"; repository: string; reason: string }
  | {
      /** The Ticket's id. */
      id: string
      outcome: "ticket"
      status: TicketStatus
      /** Admins only, once the Ticket was accepted. */
      issue?: { repository: string; number: number; url: string }
    }
export const MAX_IMAGES_PER_MESSAGE = 4
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export type ImageType = (typeof IMAGE_TYPES)[number]
export const IMAGE_TOO_LARGE = `This picture is too large. Pictures can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
export const IMAGE_NOT_SUPPORTED =
  "This file is not a picture Agent 6 can read. Use a PNG, JPEG or WebP image."
/** A picture on a message. Its owner and Admins may read its bytes. */
export type ChatImage = {
  id: string
  name: string
  width: number
  height: number
}
export const imageUrl = (id: string) => `/api/uploads/${encodeURIComponent(id)}`
/** An Interactive Question offers this many options, besides "Something else". */
export const MIN_QUESTION_OPTIONS = 2
export const MAX_QUESTION_OPTIONS = 6
/** After this many Interactive Questions in a row the agent works with what it knows. */
export const MAX_QUESTIONS_IN_A_ROW = 3
export const SOMETHING_ELSE = "Something else"
/** What the agent asks: the question text is the message's content. */
export type AskedQuestion = {
  options: Array<string>
  multiple: boolean
  otherOption?: string
}
/**
 * An Interactive Question on an agent message. `answer` is null while it is
 * open; `other` means the user typed their own answer ("Something else").
 */
export type InteractiveQuestion = AskedQuestion & {
  answer: { choices: Array<number>; other: boolean } | null
}
export type ReplyActivity = {
  id: string
  label: string
  status: "started" | "complete" | "error"
  createdAt?: number
}
export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  status: "queued" | "pending" | "complete" | "error"
  createdAt: number
  activity?: Array<ReplyActivity>
  reports: Array<Report>
  /** Pictures the user sent with this message. */
  images: Array<ChatImage>
  /** On an agent answer: the model could not take pictures, so only the text was answered. */
  imagesUnread: boolean
  /** The Guardrail refused this request or this is its refusal reply. */
  refused: boolean
  /** On an agent message that is an Interactive Question. */
  question?: InteractiveQuestion
}
export type Conversation = {
  id: string
  title: string
  application: { id: string; name: string }
  messages: Array<ChatMessage>
  agentMessages?: AgentMessages
}
export type ChatEvent =
  | { type: "snapshot"; conversation: Conversation }
  | { type: "progress" }
  | { type: "activity"; messageId: string; activity: ReplyActivity }
  | { type: "delta"; text: string }
  | { type: "done"; conversation: Conversation }

export type ReplyInput =
  | {
      message: string
      images?: Array<string>
      /** Options picked on the open Interactive Question, by position. */
      choices?: Array<number>
    }
  | { retry: true }
  | { start: true }
