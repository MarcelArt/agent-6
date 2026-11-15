import { useState } from "react"
import { XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { tidyTags } from "@/lib/repositories"

/**
 * Tags as removable Badges with an input to add one. Enter or a comma adds
 * the typed Tag; Backspace in the empty input removes the last one.
 */
export function TagsInput({
  id,
  value,
  onChange,
  ...aria
}: {
  id: string
  value: Array<string>
  onChange: (tags: Array<string>) => void
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const [text, setText] = useState("")

  function add(typed: string) {
    setText("")
    if (typed.trim()) onChange(tidyTags([...value, ...typed.split(",")]))
  }

  return (
    <InputGroup className="h-auto min-h-7 flex-wrap gap-1 p-1">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="pr-1 text-xs">
          {tag}
          <button
            type="button"
            className="flex size-3.5 items-center justify-center rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Remove Tag ${tag}`}
            onClick={() => onChange(value.filter((other) => other !== tag))}
          >
            <XIcon className="size-2.5" />
          </button>
        </Badge>
      ))}
      <InputGroupInput
        id={id}
        className="h-5 min-w-24 px-1 py-0"
        placeholder="Add a Tag"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          if (next.includes(",")) add(next)
          else setText(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Enter adds the Tag; it must not submit the form.
            event.preventDefault()
            add(text)
          } else if (event.key === "Backspace" && !text && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => add(text)}
        {...aria}
      />
    </InputGroup>
  )
}
