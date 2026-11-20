import { useState } from "react"
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

/**
 * A credential shown exactly once, right after it was made. It lives only in
 * the component's state: reloading the page loses it on purpose, and it is
 * never put in the address.
 */
export function OneTimeSecret({
  id,
  label,
  value,
  description,
}: {
  id: string
  label: string
  value: string
  description: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The field stays selectable for copying by hand.
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>Copy it now</AlertTitle>
        <AlertDescription>
          Agent 6 does not store it in readable form and cannot show it again.
          If it is lost, issue a new one.
        </AlertDescription>
      </Alert>
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={id}
            readOnly
            value={value}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            aria-describedby={`${id}-hint`}
            onFocus={(event) => event.currentTarget.select()}
          />
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={copied ? "Copied" : `Copy ${label}`}
              title={copied ? "Copied" : "Copy"}
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription id={`${id}-hint`}>{description}</FieldDescription>
      </Field>
      <span role="status" className="sr-only">
        {copied ? "Copied to the clipboard." : ""}
      </span>
    </div>
  )
}
