import { useState } from "react"
import { ConnectionNotice } from "./connection-status"
import type {
  DatabaseConnection,
  DatabaseConnectionInput,
  DatabaseConnectionProblem,
  DatabaseConnectionResult,
  SslMode,
} from "@/lib/database-connections"
import {
  FormActions,
  FormError,
  Optional,
  RecordForm,
} from "@/components/records/record-detail"
import { TagsInput } from "@/components/records/tags-input"
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const sslItems = [
  { value: "disable", label: "Disable SSL" },
  { value: "require", label: "Require SSL" },
  { value: "verify-full", label: "Verify certificate and hostname" },
]
export function ConnectionForm({
  connection,
  problem: outsideProblem,
  save,
  onSaved,
  cancel,
}: {
  connection?: DatabaseConnection
  problem?: { message: string }
  save: (input: DatabaseConnectionInput) => Promise<DatabaseConnectionResult>
  onSaved: (connection: DatabaseConnection) => Promise<void>
  cancel: React.ReactNode
}) {
  const [problem, setProblem] = useState<DatabaseConnectionProblem>()
  const [pending, setPending] = useState(false)
  const [tags, setTags] = useState(connection?.tags ?? [])
  const [sslMode, setSslMode] = useState<SslMode>(
    connection?.sslMode ?? "verify-full"
  )
  const shown = problem ?? outsideProblem
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setPending(true)
    setProblem(undefined)
    try {
      const result = await save({
        name: String(form.get("name")),
        host: String(form.get("host")),
        port: Number(form.get("port")),
        database: String(form.get("database")),
        user: String(form.get("user")),
        password: String(form.get("password")),
        sslMode,
        tags,
        description: String(form.get("description")),
      })
      if (result.ok) {
        const password = formElement.elements.namedItem(
          "password"
        ) as HTMLInputElement
        password.value = ""
        await onSaved(result.connection)
      } else setProblem(result)
    } catch {
      setProblem({
        ok: false,
        message:
          "Agent 6 could not save this Database Connection. Check your connection, then try again.",
      })
    } finally {
      setPending(false)
    }
  }
  const invalid = (field: keyof DatabaseConnectionInput) =>
    problem?.field === field || undefined
  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {shown && (!("field" in shown) || !shown.field) && (
        <FormError title="Nothing was changed">{shown.message}</FormError>
      )}
      {connection && <ConnectionNotice connection={connection} />}
      <FieldGroup>
        {(
          [
            ["name", "Name"],
            ["host", "Host"],
            ["port", "Port"],
            ["database", "Database"],
            ["user", "User"],
            ["password", "Password"],
          ] as const
        ).map(([field, label]) => (
          <Field key={field} data-invalid={invalid(field)}>
            <FieldLabel htmlFor={`connection-${field}`}>{label}</FieldLabel>
            <Input
              id={`connection-${field}`}
              name={field}
              type={
                field === "password"
                  ? "password"
                  : field === "port"
                    ? "number"
                    : "text"
              }
              defaultValue={
                field === "password"
                  ? undefined
                  : field === "port"
                    ? (connection?.port ?? 5432)
                    : connection?.[field]
              }
              required={field !== "password"}
              maxLength={field === "password" ? 4096 : 255}
              min={field === "port" ? 1 : undefined}
              max={field === "port" ? 65535 : undefined}
              autoFocus={!connection && field === "name"}
              autoComplete={field === "password" ? "new-password" : "off"}
              placeholder={
                field === "password" && connection
                  ? connection.needsSecret
                    ? "Not entered"
                    : "Unchanged"
                  : undefined
              }
              aria-invalid={invalid(field)}
              aria-describedby={
                `${invalid(field) ? `connection-${field}-error ` : ""}${field === "password" ? "connection-password-hint" : ""}`.trim() ||
                undefined
              }
            />
            {field === "password" && (
              <FieldDescription id="connection-password-hint">
                {connection?.needsSecret
                  ? "Not entered yet. Type it so the agent can use this connection; left blank, the connection keeps needing it."
                  : connection
                    ? "Saved password unchanged. Type a new password to replace it. Changing the host, port, database, user or SSL mode needs the password again."
                    : "Encrypted when saved. Use a dedicated read-only Postgres role."}
              </FieldDescription>
            )}
            {invalid(field) && (
              <FieldError id={`connection-${field}-error`}>
                {problem?.message}
              </FieldError>
            )}
          </Field>
        ))}
        <Field data-invalid={invalid("sslMode")}>
          <FieldLabel htmlFor="connection-sslMode">SSL mode</FieldLabel>
          <Select
            items={sslItems}
            value={sslMode}
            onValueChange={(value) => {
              if (value) setSslMode(value)
            }}
          >
            <SelectTrigger
              id="connection-sslMode"
              className="w-full"
              aria-invalid={invalid("sslMode")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sslItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Verify certificate and hostname is recommended. Require SSL encrypts
            traffic without verifying the server certificate.
          </FieldDescription>
        </Field>
        <Field data-invalid={invalid("tags")}>
          <FieldLabel htmlFor="connection-tags">
            Tags <Optional />
          </FieldLabel>
          <TagsInput
            id="connection-tags"
            value={tags}
            onChange={setTags}
            aria-invalid={invalid("tags")}
          />
          {invalid("tags") && <FieldError>{problem?.message}</FieldError>}
        </Field>
        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="connection-description">
            Description for the agent <Optional />
          </FieldLabel>
          <Textarea
            id="connection-description"
            name="description"
            defaultValue={connection?.description}
            maxLength={4000}
            aria-invalid={invalid("description")}
          />
          <FieldDescription>
            Explain what data lives here so the agent knows when to query it.
          </FieldDescription>
          {invalid("description") && (
            <FieldError>{problem?.message}</FieldError>
          )}
        </Field>
      </FieldGroup>
      <FieldDescription>
        Saving tests the connection and checks the role’s privileges. The
        connection is saved even if the test fails.
      </FieldDescription>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Testing and saving…"
            : connection
              ? "Save changes"
              : "Add Database Connection"}
        </Button>
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
