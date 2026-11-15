import { useState } from "react"
import type {
  Application,
  ApplicationField,
  ApplicationInput,
  ApplicationProblem,
  ApplicationResult,
} from "@/lib/applications"
import {
  FormActions,
  FormError,
  Optional,
  RecordForm,
} from "@/components/records/record-detail"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  MAX_APPLICATION_DESCRIPTION,
  MAX_APPLICATION_NAME,
  MAX_APPLICATION_NOTES,
} from "@/lib/applications"

export function ApplicationForm({
  application,
  problem: outsideProblem,
  save,
  onSaved,
  cancel,
  children,
}: {
  application?: Application
  problem?: { message: string }
  save: (values: ApplicationInput) => Promise<ApplicationResult>
  onSaved: (application: Application) => Promise<void>
  cancel: React.ReactNode
  children?: React.ReactNode
}) {
  const [problem, setProblem] = useState<ApplicationProblem>()
  const [pending, setPending] = useState(false)
  const shown = problem ?? outsideProblem
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setProblem(undefined)
    setPending(true)
    try {
      const result = await save({
        name: String(form.get("name")),
        description: String(form.get("description")),
        notes: String(form.get("notes")),
      })
      if (result.ok) await onSaved(result.application)
      else setProblem(result)
    } catch {
      setProblem({
        ok: false,
        message:
          "Agent 6 could not save this Application. Check your connection, then try again.",
      })
    } finally {
      setPending(false)
    }
  }
  const invalid = (field: ApplicationField) =>
    problem?.field === field || undefined
  const error = (field: ApplicationField) =>
    invalid(field) && (
      <FieldError id={`application-${field}-error`}>
        {problem?.message}
      </FieldError>
    )
  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {shown && (!("field" in shown) || !shown.field) && (
        <FormError title="Nothing was changed">{shown.message}</FormError>
      )}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="application-name">Name</FieldLabel>
          <Input
            id="application-name"
            name="name"
            defaultValue={application?.name}
            required
            maxLength={MAX_APPLICATION_NAME}
            autoFocus={!application}
            aria-invalid={invalid("name")}
            aria-describedby={
              invalid("name") ? "application-name-error" : undefined
            }
          />
          {error("name")}
        </Field>
        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="application-description">
            Description for Clients <Optional />
          </FieldLabel>
          <Textarea
            id="application-description"
            name="description"
            defaultValue={application?.description}
            maxLength={MAX_APPLICATION_DESCRIPTION}
            aria-invalid={invalid("description")}
            aria-describedby={`application-description-hint${invalid("description") ? " application-description-error" : ""}`}
          />
          <FieldDescription id="application-description-hint">
            Shown to Clients when choosing an Application in chat.
          </FieldDescription>
          {error("description")}
        </Field>
        <Field data-invalid={invalid("notes")}>
          <FieldLabel htmlFor="application-notes">
            Notes for the agent <Optional />
          </FieldLabel>
          <Textarea
            id="application-notes"
            name="notes"
            defaultValue={application?.notes}
            maxLength={MAX_APPLICATION_NOTES}
            rows={5}
            aria-invalid={invalid("notes")}
            aria-describedby={`application-notes-hint${invalid("notes") ? " application-notes-error" : ""}`}
          />
          <FieldDescription id="application-notes-hint">
            Explain what this Application does and who uses it. Plain text.
          </FieldDescription>
          {error("notes")}
        </Field>
      </FieldGroup>
      {children}
      <FormActions>
        <Button type="submit" disabled={pending}>
          {application ? "Save changes" : "Create Application"}
        </Button>
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
