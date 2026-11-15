import { useId } from "react"
import { LockIcon } from "lucide-react"
import type { InteractiveQuestion } from "@/lib/chat"
import { SOMETHING_ELSE } from "@/lib/chat"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

/** What is ticked on the open Interactive Question, before it is sent. */
export type Picks = { choices: Array<number>; other: boolean }
export const NO_PICKS: Picks = { choices: [], other: false }

const OTHER = "other"

/**
 * The Interactive Question card. Open: single choice sends on click (or Enter
 * or Space on the focused option; arrow keys only move), multiple choice has
 * a "Send answer" button. "Something else" hands over to the composer.
 * Answered: a read-only list of what was chosen.
 */
export function InteractiveQuestionCard({
  text,
  question,
  picks,
  disabled,
  onPick,
  onSend,
  onOther,
}: {
  text: string
  question: InteractiveQuestion
  picks: Picks
  disabled?: boolean
  onPick: (picks: Picks) => void
  onSend: (choices: Array<number>) => void
  /** "Something else" was chosen: the answer is typed in the composer. */
  onOther: () => void
}) {
  const id = useId()
  const { options, multiple, answer } = question
  const labels = [...options, question.otherOption ?? SOMETHING_ELSE]
  const title = (
    <CardHeader>
      <CardTitle id={`${id}-title`}>{text}</CardTitle>
      {multiple && !answer && (
        <CardDescription>Choose all that apply.</CardDescription>
      )}
    </CardHeader>
  )
  if (answer) {
    const rows = labels.map((label, index) => {
      const chosen =
        index < options.length ? answer.choices.includes(index) : answer.other
      return (
        <div
          key={index}
          className={cn(
            "flex items-center gap-2.5",
            chosen ? "font-medium" : "text-muted-foreground"
          )}
        >
          {multiple ? (
            <Checkbox checked={chosen} disabled aria-label={label} />
          ) : (
            <RadioGroupItem value={String(index)} aria-label={label} />
          )}
          <span aria-hidden="true">{label}</span>
        </div>
      )
    })
    return (
      <Card size="sm" className="w-full max-w-md">
        {title}
        <CardContent>
          {multiple ? (
            <div
              role="group"
              aria-labelledby={`${id}-title`}
              className="flex flex-col gap-2 text-sm"
            >
              {rows}
            </div>
          ) : (
            <RadioGroup
              disabled
              value={String(
                answer.other ? options.length : (answer.choices.at(0) ?? "")
              )}
              aria-labelledby={`${id}-title`}
              className="flex flex-col gap-2 text-sm"
            >
              {rows}
            </RadioGroup>
          )}
        </CardContent>
        <CardFooter className="gap-1.5 border-t text-muted-foreground">
          <LockIcon className="size-3" aria-hidden="true" />
          Answered
        </CardFooter>
      </Card>
    )
  }
  const choice = (index: number, control: React.ReactNode, single = false) => {
    const other = index === options.length
    const activate = () => {
      if (disabled) return
      if (other) onOther()
      else onSend([index])
    }
    return (
      <FieldLabel
        key={index}
        // Single choice: a click or Space sends. Arrow keys select without
        // a click, so moving through the options never sends by accident.
        onClick={single ? activate : undefined}
        onKeyDown={
          single
            ? (event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  activate()
                }
              }
            : undefined
        }
      >
        <Field orientation="horizontal" className="min-h-10 py-2.5">
          {control}
          <FieldTitle className="text-sm">{labels[index]}</FieldTitle>
        </Field>
      </FieldLabel>
    )
  }
  if (!multiple)
    return (
      <Card size="sm" className="w-full max-w-md">
        {title}
        <CardContent>
          <RadioGroup
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-hint`}
            className="gap-1.5"
            disabled={disabled}
            value={picks.other ? OTHER : String(picks.choices.at(0) ?? "")}
            onValueChange={(value) =>
              onPick(
                value === OTHER
                  ? { choices: [], other: true }
                  : { choices: [Number(value)], other: false }
              )
            }
          >
            {labels.map((_, index) =>
              choice(
                index,
                <RadioGroupItem
                  value={index === options.length ? OTHER : String(index)}
                />,
                true
              )
            )}
          </RadioGroup>
          <p id={`${id}-hint`} className="sr-only">
            Press Enter or Space on an option to send it as your answer.
          </p>
        </CardContent>
      </Card>
    )
  return (
    <form
      className="w-full max-w-md"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && picks.choices.length && !picks.other)
          onSend(picks.choices)
      }}
    >
      <Card size="sm">
        {title}
        <CardContent className="flex flex-col gap-1.5">
          {labels.map((_, index) => {
            const other = index === options.length
            return choice(
              index,
              <Checkbox
                disabled={disabled}
                checked={other ? picks.other : picks.choices.includes(index)}
                onCheckedChange={(checked) => {
                  if (other) {
                    onPick({ ...picks, other: checked })
                    if (checked) onOther()
                  } else
                    onPick({
                      ...picks,
                      choices: checked
                        ? [...picks.choices, index]
                        : picks.choices.filter((item) => item !== index),
                    })
                }}
              />
            )
          })}
        </CardContent>
        <CardFooter className="flex-wrap gap-x-3 gap-y-2">
          {picks.other ? (
            <span className="text-xs text-muted-foreground" role="status">
              Type your answer below and send it.
            </span>
          ) : (
            <>
              <Button
                type="submit"
                size="lg"
                disabled={disabled || !picks.choices.length}
              >
                Send answer
              </Button>
              <span className="text-xs text-muted-foreground">
                Or type your own answer below.
              </span>
            </>
          )}
        </CardFooter>
      </Card>
    </form>
  )
}
