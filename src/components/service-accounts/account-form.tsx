import { useState } from "react"
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
import type {
  ServiceAccountField,
  ServiceAccountInput,
  ServiceAccountResult,
  ServiceAccountSummary,
} from "@/lib/service-accounts"
import {
  MAX_SERVICE_ACCOUNT_DESCRIPTION,
  MAX_SERVICE_ACCOUNT_NAME,
} from "@/lib/service-accounts"

type Problem = { message: string; field?: string }

/**
 * The create and edit form of a Service Account. `children` (its keys and
 * activity) sit between the fields and Save, like an Application's
 * Attachments.
 */
export function ServiceAccountForm({
  serviceAccount,
  problem: outsideProblem,
  save,
  onSaved,
  cancel,
  children,
}: {
  serviceAccount?: ServiceAccountSummary
  /** A problem from an action outside the form, such as Disable. */
  problem?: Problem
  save: (values: ServiceAccountInput) => Promise<ServiceAccountResult>
  onSaved: (serviceAccount: ServiceAccountSummary) => void | Promise<void>
  cancel: React.ReactNode
  children?: React.ReactNode
}) {
  const [ownProblem, setOwnProblem] = useState<Problem>()
  const [pending, setPending] = useState(false)
  const problem = ownProblem ?? outsideProblem

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setOwnProblem(undefined)
    setPending(true)
    try {
      const result = await save({
        name: String(form.get("name")),
        description: String(form.get("description")),
      })
      if (result.ok) {
        await onSaved(result.serviceAccount)
        return
      }
      setOwnProblem(result)
    } catch {
      setOwnProblem({
        message:
          "Agent 6 could not be reached, so nothing was saved. Check your connection, then try again.",
      })
    }
    setPending(false)
  }

  const invalid = (field: ServiceAccountField) =>
    problem?.field === field ? true : undefined
  const errorOf = (field: ServiceAccountField) =>
    invalid(field) && (
      <FieldError id={`service-account-${field}-error`}>
        {problem?.message}
      </FieldError>
    )
  const describedBy = (field: ServiceAccountField, hint: string) =>
    [hint, invalid(field) ? `service-account-${field}-error` : undefined]
      .filter(Boolean)
      .join(" ")

  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {problem &&
        (!problem.field ||
          !["name", "description"].includes(problem.field)) && (
          <FormError title="Nothing was changed">{problem.message}</FormError>
        )}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="service-account-name">Name</FieldLabel>
          <Input
            id="service-account-name"
            name="name"
            defaultValue={serviceAccount?.name}
            required
            autoComplete="off"
            maxLength={MAX_SERVICE_ACCOUNT_NAME}
            autoFocus={!serviceAccount}
            aria-invalid={invalid("name")}
            aria-describedby={describedBy("name", "service-account-name-hint")}
          />
          <FieldDescription id="service-account-name-hint">
            The integration that uses it, for example “Release review bot”.
            Ticket decisions show this name.
          </FieldDescription>
          {errorOf("name")}
        </Field>
        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="service-account-description">
            Description <Optional />
          </FieldLabel>
          <Textarea
            id="service-account-description"
            name="description"
            defaultValue={serviceAccount?.description}
            maxLength={MAX_SERVICE_ACCOUNT_DESCRIPTION}
            aria-invalid={invalid("description")}
            aria-describedby={describedBy(
              "description",
              "service-account-description-hint"
            )}
          />
          <FieldDescription id="service-account-description-hint">
            Who runs the integration and what it does, for other Admins.
          </FieldDescription>
          {errorOf("description")}
        </Field>
      </FieldGroup>
      {children}
      <FormActions>
        <Button type="submit" disabled={pending}>
          {serviceAccount ? "Save changes" : "Create Service Account"}
        </Button>
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
