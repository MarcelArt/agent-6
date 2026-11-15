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
/** At most this many new issues per Conversation. Comments on existing issues do not count. */
export const MAX_NEW_ISSUES = 2
export type IssueKind = "code-fix" | "data-fix"
export const issueKindLabels: Record<IssueKind, string> = {
  "code-fix": "Code Fix",
  "data-fix": "Data Fix",
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
 * the bare notice; `issue` and failures are sent to Admins alone.
 */
export type Report =
  | {
      id: string
      outcome: "new" | "comment"
      issue?: { repository: string; number: number; url: string }
    }
  | { id: string; outcome: "failed"; repository: string; reason: string }
export const MAX_IMAGES_PER_MESSAGE = 4
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export type ImageType = (typeof IMAGE_TYPES)[number]
export const IMAGE_TOO_LARGE = `This picture is too large. Pictures can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
export const IMAGE_NOT_SUPPORTED =
  "This file is not a picture Agent 6 can read. Use a PNG, JPEG or WebP image."
/** A picture on a message. Its bytes are served to the Conversation's owner only. */
export type ChatImage = {
  id: string
  name: string
  width: number
  height: number
}
export const imageUrl = (id: string) => `/api/uploads/${encodeURIComponent(id)}`
export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  status: "queued" | "pending" | "complete" | "error"
  createdAt: number
  reports: Array<Report>
  /** Pictures the user sent with this message. */
  images: Array<ChatImage>
  /** On an agent answer: the model could not take pictures, so only the text was answered. */
  imagesUnread: boolean
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

export type ReplyInput =
  | { message: string; images?: Array<string> }
  | { retry: true }
  | { start: true }
