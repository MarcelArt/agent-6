import { createHash } from "node:crypto"
import type { ToolActivity } from "@/lib/conversation-history"
import type { ReplyActivity } from "@/lib/chat"

const labels: Record<string, string> = {
  guardrail_check: "Checking your request",
  refresh_repositories: "Refreshing application code",
  prepare_message: "Preparing your message",
  investigate: "Investigating your question",
  decision_resources: "Planning the investigation",
  decision_fault: "Reviewing the findings",
  review_investigation: "Reviewing the investigation",
  set_conversation_title: "Naming the conversation",
  ask_question: "Preparing a question for you",
  list_directory: "Exploring application files",
  search_text: "Searching application code",
  read_file: "Reading application code",
  list_database_tables: "Exploring application data",
  query_database: "Checking application data",
  list_log_labels: "Finding application logs",
  query_logs: "Checking application logs",
  find_existing_issues: "Checking existing reports",
  create_ticket: "Creating a ticket for the team",
  // Answers from before Tickets.
  file_issue: "Reporting to the developers",
  "Agent run": "Investigation",
  Guardrail: "Request check",
}

/** Deliberately exclude arguments, results, paths, SQL and model reasoning. */
export function publicActivity(item: ToolActivity): ReplyActivity {
  return {
    id: createHash("sha256").update(item.id).digest("hex").slice(0, 24),
    label: labels[item.name] ?? "Working on your request",
    status: item.status,
    createdAt: item.createdAt,
  }
}
