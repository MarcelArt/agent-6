import { CircleAlertIcon, TerminalIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ToolActivity } from "@/lib/conversation-history"

export function AuditActivity({
  activities,
}: {
  activities: Array<ToolActivity>
}) {
  if (!activities.length) return null
  return (
    <section
      aria-label="Tool activity"
      className="flex min-w-0 flex-col gap-2 rounded-md border p-3 text-xs"
    >
      <h3 className="flex items-center gap-1.5 font-medium">
        <TerminalIcon className="size-3.5" />
        Tool activity
      </h3>
      {activities.map((item) => (
        <div key={item.id} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono break-all">{item.name}</span>
            <Badge variant="outline" className="text-xs">
              {item.status === "error"
                ? "Failed"
                : item.status === "complete"
                  ? "Completed"
                  : "Outcome unavailable"}
            </Badge>
          </div>
          {item.input && (
            <pre className="max-h-56 overflow-auto rounded bg-muted p-2 text-xs break-all whitespace-pre-wrap">
              {item.input}
            </pre>
          )}
          {item.error && (
            <p className="flex items-start gap-1.5 break-all">
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              {item.error}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}
