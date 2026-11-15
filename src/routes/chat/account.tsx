import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { CircleCheckIcon } from "lucide-react"
import type { UserField } from "@/lib/users"
import {
  DetailHeader,
  FormActions,
  FormError,
  RecordForm,
} from "@/components/records/record-detail"
import { DetailPane } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { roleLabels } from "@/lib/roles"
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/users"
import { changeOwnPassword } from "@/server/users.functions"

export const Route = createFileRoute("/chat/account")({
  head: () => ({ meta: [{ title: "Account · Agent 6" }] }),
  component: Page,
})

type Problem = {
  message: string
  field?: UserField | "confirm"
}

function Page() {
  const { user } = Route.useRouteContext()
  const [problem, setProblem] = useState<Problem>()
  const [changed, setChanged] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const newPassword = String(form.get("newPassword"))
    setProblem(undefined)
    setChanged(false)
    if (newPassword !== String(form.get("confirm"))) {
      setProblem({
        field: "confirm",
        message:
          "This is not the same as the new password above. Type the new password again.",
      })
      return
    }
    setPending(true)
    try {
      const result = await changeOwnPassword({
        data: {
          currentPassword: String(form.get("currentPassword")),
          newPassword,
        },
      })
      if (result.ok) {
        formElement.reset()
        setChanged(true)
      } else {
        setProblem(result)
      }
    } catch {
      setProblem({
        message:
          "Agent 6 could not be reached, so your password is unchanged. Check your connection, then try again.",
      })
    }
    setPending(false)
  }

  const invalid = (field: UserField | "confirm") =>
    problem?.field === field ? true : undefined
  const errorOf = (field: UserField | "confirm") =>
    problem?.field === field && (
      <FieldError id={`account-${field}-error`}>{problem.message}</FieldError>
    )

  return (
    <DetailPane>
      <DetailHeader title="Account" />
      <RecordForm method="post" onSubmit={(event) => void submit(event)}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="truncate font-medium">{user.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate">{user.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{roleLabels[user.role]}</dd>
        </dl>
        {changed && (
          <Alert>
            <CircleCheckIcon />
            <AlertTitle>Password changed</AlertTitle>
            <AlertDescription>
              Use the new password the next time you log in. Your other devices
              were logged out.
            </AlertDescription>
          </Alert>
        )}
        {problem && !problem.field && (
          <FormError title="Password not changed">{problem.message}</FormError>
        )}
        <FieldSet>
          <FieldLegend>Change password</FieldLegend>
          <FieldGroup>
            <Field data-invalid={invalid("currentPassword")}>
              <FieldLabel htmlFor="account-current">
                Current password
              </FieldLabel>
              <Input
                id="account-current"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={invalid("currentPassword")}
                aria-describedby={
                  invalid("currentPassword") && "account-currentPassword-error"
                }
              />
              {errorOf("currentPassword")}
            </Field>
            <Field data-invalid={invalid("password")}>
              <FieldLabel htmlFor="account-new">New password</FieldLabel>
              <Input
                id="account-new"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
                aria-invalid={invalid("password")}
                aria-describedby={
                  invalid("password")
                    ? "account-new-hint account-password-error"
                    : "account-new-hint"
                }
              />
              <FieldDescription id="account-new-hint">
                At least {MIN_PASSWORD_LENGTH} characters.
              </FieldDescription>
              {errorOf("password")}
            </Field>
            <Field data-invalid={invalid("confirm")}>
              <FieldLabel htmlFor="account-confirm">
                New password, once more
              </FieldLabel>
              <Input
                id="account-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={invalid("confirm")}
                aria-describedby={invalid("confirm") && "account-confirm-error"}
              />
              {errorOf("confirm")}
            </Field>
          </FieldGroup>
        </FieldSet>
        <FormActions>
          <Button type="submit" disabled={pending}>
            Change password
          </Button>
        </FormActions>
      </RecordForm>
    </DetailPane>
  )
}
