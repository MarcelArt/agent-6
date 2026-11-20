import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * A labelled block of code with a copy button. Long lines scroll inside the
 * block, which is focusable so the keyboard can scroll it too.
 */
export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The text stays selectable for copying by hand.
    }
  }
  return (
    <figure className="min-w-0 overflow-hidden rounded-md border">
      <figcaption className="flex h-8 items-center gap-2 border-b bg-muted/40 pr-1 pl-3 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={copied ? "Copied" : `Copy ${label}`}
          title={copied ? "Copied" : "Copy"}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </figcaption>
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto p-3 font-mono text-xs/relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
      >
        <code>{code}</code>
      </pre>
      <span role="status" className="sr-only">
        {copied ? "Copied to the clipboard." : ""}
      </span>
    </figure>
  )
}

/** JSON as it is sent, indented for reading. */
export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return <CodeBlock label={label} code={JSON.stringify(value, null, 2)} />
}
