import { useEffect, useState } from "react"
import type { LogConnection, LogStreamCountResult } from "@/lib/log-connections"
import { STREAM_COUNT_HOURS } from "@/lib/log-connections"
import { FormError } from "@/components/records/record-detail"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { countLogStreams } from "@/server/log-connections.functions"

/**
 * The second step of attaching a Log Connection: the required Base Selector,
 * with a live count of the streams it matches so a typo shows as zero.
 */
export function BaseSelectorForm({
  connection,
  applicationName,
  attach,
  back,
}: {
  connection: LogConnection
  applicationName: string
  /** Resolves to the problem's message when the Attachment was refused. */
  attach: (baseSelector: string) => Promise<string | undefined>
  back: React.ReactNode
}) {
  const [selector, setSelector] = useState("")
  const [count, setCount] = useState<LogStreamCountResult & { for: string }>()
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string>()
  const typed = selector.trim()
  useEffect(() => {
    if (!typed) return
    let current = true
    const timer = setTimeout(() => {
      countLogStreams({
        data: { logConnectionId: connection.id, baseSelector: typed },
      })
        .catch((): LogStreamCountResult => ({
          ok: false,
          message:
            "The match count could not be loaded. Check your connection.",
        }))
        .then((result) => {
          if (current) setCount({ ...result, for: typed })
        })
    }, 400)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [typed, connection.id])
  const shown = count?.for === typed ? count : undefined
  const malformed =
    shown && !shown.ok && shown.field === "baseSelector" ? shown : undefined
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setPending(true)
        setProblem(undefined)
        void attach(typed)
          .then(setProblem)
          .finally(() => setPending(false))
      }}
    >
      {problem && <FormError title="Attachment unchanged">{problem}</FormError>}
      <Field data-invalid={!!malformed || undefined}>
        <FieldLabel htmlFor="base-selector">Base Selector</FieldLabel>
        <Input
          id="base-selector"
          value={selector}
          onChange={(event) => setSelector(event.target.value)}
          required
          maxLength={4000}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder='{app="billing"}'
          className="font-mono"
          aria-invalid={!!malformed || undefined}
          aria-describedby="base-selector-hint base-selector-count"
        />
        <FieldDescription id="base-selector-hint">
          Every log query the agent makes for {applicationName} through{" "}
          {connection.name} is confined to the streams this selector matches.
        </FieldDescription>
        <div id="base-selector-count" aria-live="polite" className="text-xs">
          {!typed ? null : !shown ? (
            <span className="text-muted-foreground">Counting streams…</span>
          ) : malformed ? (
            <FieldError>{malformed.message}</FieldError>
          ) : !shown.ok ? (
            <span className="text-destructive">
              The streams could not be counted. {shown.message}
            </span>
          ) : shown.streams === 0 ? (
            <span className="text-destructive">
              Matches 0 streams in the last {STREAM_COUNT_HOURS} hours. Check
              the selector for a typo.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Matches{" "}
              <span className="font-medium text-foreground tabular-nums">
                {shown.streams}
              </span>{" "}
              {shown.streams === 1 ? "stream" : "streams"} in the last{" "}
              {STREAM_COUNT_HOURS} hours.
            </span>
          )}
        </div>
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !typed || !!malformed}>
          {pending ? "Attaching…" : "Attach Log Connection"}
        </Button>
        {back}
      </div>
    </form>
  )
}
