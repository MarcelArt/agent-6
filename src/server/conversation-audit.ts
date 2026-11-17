import "@tanstack/react-start/server-only"

import { redact } from "./redaction"
import type { ToolActivity } from "@/lib/conversation-history"

const secretKey =
  /password|passwd|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|credential/i

/** No tool outputs, reasoning, provider metadata or image bytes reach the audit UI. */
export function auditText(value: unknown): string {
  function clean(item: unknown, depth = 0): unknown {
    if (depth > 12) return "[truncated]"
    if (typeof item === "string")
      return redact(item)
        .replace(/data:image\/[^;]+;base64,[\w+/=]+/gi, "[image]")
        .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [redacted]")
    if (Array.isArray(item))
      return item.slice(0, 100).map((v) => clean(v, depth + 1))
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .slice(0, 100)
          .map(([key, v]) => [
            key,
            secretKey.test(key) ||
            (key === "value" &&
              "label" in item &&
              secretKey.test(String(item.label)))
              ? "[redacted]"
              : key === "sql" && typeof v === "string"
                ? clean(
                    v.replace(/'(?:''|[^'])*'/g, "'[redacted value]'"),
                    depth + 1
                  )
                : clean(v, depth + 1),
          ])
      )
    return item
  }
  let parsed = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      /* Plain SQL, paths and errors. */
    }
  }
  const result = clean(parsed)
  return (typeof result === "string" ? result : JSON.stringify(result)).slice(
    0,
    24_000
  )
}

/** Project only the supported SDK function calls and their error outcomes. */
export function historyActivities(items: Array<unknown>): Array<ToolActivity> {
  const calls = new Map<string, ToolActivity>()
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (typeof row.callId !== "string") continue
    if (row.type === "function_call" && typeof row.name === "string")
      calls.set(row.callId, {
        id: row.callId,
        name: auditText(row.name),
        input:
          row.name === "review_investigation"
            ? "[Evidence omitted]"
            : auditText(row.arguments),
        status: "started",
      })
    if (row.type === "function_call_result") {
      const call = calls.get(row.callId)
      if (!call) continue
      let output = row.output
      // SDK text outputs are { type: "text", text: "…" }.
      if (output && typeof output === "object" && "text" in output)
        output = output.text
      if (typeof output === "string") {
        try {
          output = JSON.parse(output)
        } catch {
          /* Successful plain text result. */
        }
      }
      const error =
        output && typeof output === "object" && "error" in output
          ? output.error
          : undefined
      call.status = error ? "error" : "complete"
      if (error) call.error = auditText(error)
    }
  }
  return [...calls.values()]
}
