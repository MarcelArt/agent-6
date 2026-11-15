import { useState } from "react"
import type { Role } from "@/lib/roles"
import type { ManagedUser, UserField, UserResult } from "@/lib/users"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { roleLabels } from "@/lib/roles"
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/users"

export type UserFormValues = {
  name: string
  email: string
  role: Role
  password: string
}

type Problem = { message: string; field?: UserField }

const roleItems = (["client", "admin"] as const).map((value) => ({
  value,
  label: roleLabels[value],
}))

const roleHelp: Record<Role, string> = {
  client: "A Client can chat with the agent and nothing else.",
  admin:
    "An Admin can also manage users, Repositories, Applications and connections.",
}

/**
 * The create and edit form of a user. With `user` it edits: the password is
 * optional and only changed when filled in.
 */
export function UserForm({
  user,
  problem: outsideProblem,
  save,
  onSaved,
  cancel,
}: {
  user?: ManagedUser
  /** A problem from an action outside the form, such as Disable. */
  problem?: Problem
  save: (values: UserFormValues) => Promise<UserResult>
  onSaved: (user: ManagedUser) => void | Promise<void>
  /** The Cancel link, back to the list. */
  cancel: React.ReactNode
}) {
  const [role, setRole] = useState<Role>(user?.role ?? "client")
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
        email: String(form.get("email")),
        role,
        password: String(form.get("password")),
      })
      if (result.ok) {
        await onSaved(result.user)
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

  /** Props that mark a control and its Field as the one with the error. */
  const invalid = (field: UserField) =>
    problem?.field === field ? true : undefined
  const errorOf = (field: UserField) =>
    problem?.field === field && (
      <FieldError id={`user-${field}-error`}>{problem.message}</FieldError>
    )
  const describedBy = (field: UserField, hint?: string) =>
    [hint, problem?.field === field ? `user-${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    // method="post" keeps the password out of the address bar if the form is
    // submitted before the page's script has loaded.
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {problem && !problem.field && (
        <FormError title="Nothing was changed">{problem.message}</FormError>
      )}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="user-name">Name</FieldLabel>
          <Input
            id="user-name"
            name="name"
            defaultValue={user?.name}
            autoComplete="off"
            required
            maxLength={100}
            autoFocus={!user}
            aria-invalid={invalid("name")}
            aria-describedby={describedBy("name")}
          />
          {errorOf("name")}
        </Field>
        <Field data-invalid={invalid("email")}>
          <FieldLabel htmlFor="user-email">Email</FieldLabel>
          <Input
            id="user-email"
            name="email"
            type="email"
            defaultValue={user?.email}
            autoComplete="off"
            required
            aria-invalid={invalid("email")}
            aria-describedby={describedBy("email", "user-email-hint")}
          />
          <FieldDescription id="user-email-hint">
            The person logs in with this email.
          </FieldDescription>
          {errorOf("email")}
        </Field>
        <Field data-invalid={invalid("role")}>
          <FieldLabel htmlFor="user-role">Role</FieldLabel>
          <Select
            items={roleItems}
            value={role}
            onValueChange={(value) => setRole(value as Role)}
          >
            <SelectTrigger
              id="user-role"
              className="w-full"
              aria-invalid={invalid("role")}
              aria-describedby={describedBy("role", "user-role-hint")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id="user-role-hint">
            {roleHelp[role]}
          </FieldDescription>
          {errorOf("role")}
        </Field>
        <Field data-invalid={invalid("password")}>
          <FieldLabel htmlFor="user-password">
            {user ? (
              <span>
                New password <Optional />
              </span>
            ) : (
              "Password"
            )}
          </FieldLabel>
          <Input
            id="user-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required={!user}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={invalid("password")}
            aria-describedby={describedBy("password", "user-password-hint")}
          />
          <FieldDescription id="user-password-hint">
            {user
              ? `Leave empty to keep the current password. A new one needs at least ${MIN_PASSWORD_LENGTH} characters.`
              : `At least ${MIN_PASSWORD_LENGTH} characters. Agent 6 sends no email, so give the password to the person yourself.`}
          </FieldDescription>
          {errorOf("password")}
        </Field>
      </FieldGroup>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {user ? "Save changes" : "Create user"}
        </Button>
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
