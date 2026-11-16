import { useEffect, useState } from "react"
import {
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleIcon,
  SquareIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { ChatMessage } from "@/lib/chat"

export function ReplyActivityPanel({
  message,
  onStop,
  stopping = false,
}: {
  message: ChatMessage
  onStop?: () => void
  stopping?: boolean
}) {
  const running = message.status === "pending" || message.status === "queued"
  const items = message.activity ?? []
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  if (!running && !items.length) return null
  const seconds = Math.max(0, Math.floor((now - message.createdAt) / 1000))
  const elapsed =
    seconds < 60
      ? `${seconds}s`
      : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const latest = [...items].reverse().find((item) => item.status === "started")
  const label = running
    ? (latest?.label ?? "Working on your request")
    : "Activity"
  return (
    <div className="w-full min-w-0 text-xs text-muted-foreground">
      <div className="flex items-start gap-2">
        <details className="group min-w-0 flex-1">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-md py-1.5 pr-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 group-open:rotate-90"
            />
            {running && (
              <Spinner
                aria-hidden="true"
                className="size-3.5 shrink-0 motion-reduce:animate-none"
              />
            )}
            <span className="min-w-0 flex-1">{label}</span>
            <span suppressHydrationWarning className="shrink-0 tabular-nums">
              {running ? elapsed : `${items.length} steps`}
            </span>
          </summary>
          <ol
            aria-label="Agent activity"
            className="ml-1.5 flex max-h-64 flex-col gap-3 overflow-y-auto border-l py-3 pr-2 pl-4"
          >
            {items.length === 0 && (
              <li>Waiting for the investigation to start…</li>
            )}
            {items.map((item) => {
              const active = running && item.status === "started"
              const status = active
                ? "Running"
                : item.status === "complete"
                  ? "Completed"
                  : item.status === "error"
                    ? "Failed"
                    : "Interrupted"
              const Icon = active
                ? Spinner
                : item.status === "complete"
                  ? CheckIcon
                  : item.status === "error"
                    ? CircleAlertIcon
                    : CircleIcon
              return (
                <li key={item.id} className="flex items-start gap-2">
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 motion-reduce:animate-none"
                  />
                  <span className="min-w-0 flex-1 text-foreground">
                    {item.label}
                  </span>
                  <span className="shrink-0">{status}</span>
                </li>
              )
            })}
          </ol>
        </details>
        {running && onStop && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onStop}
            disabled={stopping}
            className="shrink-0"
            aria-label="Stop investigation"
          >
            <SquareIcon aria-hidden="true" className="size-3" />
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        )}
      </div>
    </div>
  )
}
