import {
  GUARDRAIL_FAILED,
  GUARDRAIL_REFUSED,
  REPLY_FAILED,
  REPLY_LIMIT,
  SOMETHING_ELSE,
} from "./chat"

export const COMMON_LANGUAGES = [
  "English",
  "Indonesian",
  "Arabic",
  "Chinese (Simplified)",
  "French",
  "German",
  "Hindi",
  "Japanese",
  "Korean",
  "Portuguese",
  "Spanish",
] as const
export const MAX_LANGUAGE_LENGTH = 80

/** Only fixed messages from the agent; interface labels remain in English. */
export const ENGLISH_AGENT_MESSAGES = {
  replyFailed: REPLY_FAILED,
  replyLimit: REPLY_LIMIT,
  guardrailRefused: GUARDRAIL_REFUSED,
  guardrailFailed: GUARDRAIL_FAILED,
  somethingElse: SOMETHING_ELSE,
  progress: "Looking at how the app works…",
  pictureTitle: "Picture",
  conversationTitle: "Application support",
}
export type AgentMessages = typeof ENGLISH_AGENT_MESSAGES
export type LanguageSettings = {
  preferredLanguage: string
  messages: AgentMessages
}
export type LanguageResult =
  | { ok: true; preferredLanguage: string }
  | { ok: false; message: string; field?: "preferredLanguage" }

export const INDONESIAN_AGENT_MESSAGES: AgentMessages = {
  replyFailed: "Saya belum bisa menyelesaikan jawaban ini. Silakan coba lagi.",
  replyLimit:
    "Saya belum selesai memeriksa dalam waktu yang tersedia. Silakan coba lagi atau ajukan pertanyaan yang lebih singkat.",
  guardrailRefused:
    "Saya bisa membantu Anda menggunakan Aplikasi ini, mengatasi masalah, dan memahami data Anda di dalamnya. Silakan tanyakan hal-hal tersebut.",
  guardrailFailed:
    "Saya belum bisa memeriksa pesan Anda saat ini. Silakan coba lagi.",
  somethingElse: "Yang lain",
  progress: "Sedang memeriksa cara kerja aplikasi…",
  pictureTitle: "Gambar",
  conversationTitle: "Bantuan aplikasi",
}
