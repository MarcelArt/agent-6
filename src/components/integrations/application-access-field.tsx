import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export type ApplicationAccess = {
  allApplications: boolean
  applicationIds: ReadonlySet<string>
}

/**
 * Chooses All Applications, or some of them. Used for API Key grants and
 * Webhook Subscription selections; `idPrefix` keeps control ids unique.
 */
export function ApplicationAccessField({
  idPrefix,
  legend,
  description,
  allDescription,
  choices,
  value,
  onChange,
  error,
  disabled,
}: {
  idPrefix: string
  legend: string
  description: React.ReactNode
  /** What All Applications means here. */
  allDescription: string
  choices: Array<{ id: string; name: string }>
  value: ApplicationAccess
  onChange: (value: ApplicationAccess) => void
  error?: string
  disabled?: boolean
}) {
  const invalid = error ? true : undefined
  function toggle(id: string, on: boolean) {
    const next = new Set(value.applicationIds)
    if (on) next.add(id)
    else next.delete(id)
    onChange({ ...value, applicationIds: next })
  }
  return (
    <FieldSet data-invalid={invalid} disabled={disabled}>
      <FieldLegend>{legend}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <RadioGroup
        value={value.allApplications ? "all" : "selected"}
        onValueChange={(next) =>
          onChange({ ...value, allApplications: next === "all" })
        }
        disabled={disabled}
      >
        <Field orientation="horizontal">
          <RadioGroupItem value="selected" id={`${idPrefix}-selected`} />
          <FieldContent>
            <FieldLabel htmlFor={`${idPrefix}-selected`}>
              Selected Applications
            </FieldLabel>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="all" id={`${idPrefix}-all`} />
          <FieldContent>
            <FieldLabel htmlFor={`${idPrefix}-all`}>
              All Applications
            </FieldLabel>
            <FieldDescription>{allDescription}</FieldDescription>
          </FieldContent>
        </Field>
      </RadioGroup>
      {!value.allApplications &&
        (choices.length ? (
          <ul
            aria-label="Applications"
            className="ml-6 flex max-h-64 flex-col gap-3 overflow-y-auto rounded-md border p-3"
          >
            {choices.map((choice) => {
              const id = `${idPrefix}-application-${choice.id}`
              return (
                <li key={choice.id}>
                  <Field orientation="horizontal">
                    <Checkbox
                      id={id}
                      checked={value.applicationIds.has(choice.id)}
                      onCheckedChange={(checked) => toggle(choice.id, checked)}
                      aria-invalid={invalid}
                      disabled={disabled}
                    />
                    <FieldLabel htmlFor={id} className="min-w-0 break-words">
                      {choice.name}
                    </FieldLabel>
                  </Field>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="ml-6 text-xs text-muted-foreground">
            No Applications exist yet.
          </p>
        ))}
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  )
}
