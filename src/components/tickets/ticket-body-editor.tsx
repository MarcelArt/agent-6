import { useState } from "react"
import { flushSync } from "react-dom"
import { EyeIcon, PencilIcon } from "lucide-react"
import { Markdown } from "@/components/chat/markdown"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type Mode = "write" | "preview"

/**
 * The Ticket body with Write and Preview tabs in one frame. The textarea
 * stays mounted while previewing, so the form always submits the edited body.
 */
export function TicketBodyEditor({
  defaultValue,
  maxLength,
  disabled,
  invalid,
  describedBy,
}: {
  defaultValue: string
  maxLength: number
  disabled: boolean
  invalid: true | undefined
  describedBy: string | undefined
}) {
  const [value, setValue] = useState(defaultValue)
  const [mode, setMode] = useState<Mode>("write")
  // An error always needs the text in view.
  const shown: Mode = invalid ? "write" : mode
  return (
    <Tabs
      value={shown}
      onValueChange={(next) => setMode(next as Mode)}
      className="gap-0 rounded-md border border-input bg-input/20 transition-colors has-[textarea:disabled]:opacity-50 has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/30 has-[textarea[aria-invalid=true]]:border-destructive has-[textarea[aria-invalid=true]]:ring-2 has-[textarea[aria-invalid=true]]:ring-destructive/20 dark:bg-input/30"
    >
      <div className="flex items-center justify-between gap-2 border-b p-1">
        <TabsList className="h-7">
          <TabsTrigger value="write">
            <PencilIcon aria-hidden="true" />
            Write
          </TabsTrigger>
          <TabsTrigger value="preview">
            <EyeIcon aria-hidden="true" />
            Preview
          </TabsTrigger>
        </TabsList>
        <span className="pr-1.5 text-xs text-muted-foreground">Markdown</span>
      </div>
      <TabsContent value="write" keepMounted>
        <Textarea
          id="ticket-body"
          name="body"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          // A hidden field cannot show the browser's message; reveal it first.
          onInvalid={() => flushSync(() => setMode("write"))}
          required
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="max-h-[60svh] min-h-48 resize-y rounded-none rounded-b-md border-0 bg-transparent px-3 font-mono focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent"
        />
      </TabsContent>
      <TabsContent
        value="preview"
        className="max-h-[60svh] min-h-48 overflow-y-auto px-3 py-2.5"
      >
        {value.trim() ? (
          <div className="min-w-0 text-sm/relaxed md:text-xs/relaxed">
            <Markdown>{value}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground md:text-xs">
            Nothing to preview yet.
          </p>
        )}
      </TabsContent>
    </Tabs>
  )
}
