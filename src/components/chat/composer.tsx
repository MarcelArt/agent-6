import { useId, useState } from "react"
import { ArrowUpIcon } from "lucide-react"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { MAX_MESSAGE_LENGTH } from "@/lib/chat"

export function Composer({
  disabled,
  onSend,
  hint,
}: {
  disabled?: boolean
  onSend: (message: string) => Promise<boolean>
  hint?: string
}) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const id = useId()
  async function send() {
    if (disabled || sending || !text.trim()) return
    setSending(true)
    try {
      if (await onSend(text.trim())) setText("")
    } finally {
      setSending(false)
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id} className="sr-only">
            Message the agent
          </FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              id={id}
              rows={2}
              className="max-h-48 text-sm md:text-sm"
              placeholder={hint ?? "Message the agent…"}
              value={text}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={disabled || sending}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="Send"
                disabled={disabled || sending || !text.trim()}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
    </form>
  )
}
