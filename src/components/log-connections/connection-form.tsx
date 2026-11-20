import { useState } from "react"
import { ConnectionNotice } from "./connection-status"
import type {
  LogAuthType,
  LogConnection,
  LogConnectionInput,
  LogConnectionProblem,
  LogConnectionResult,
} from "@/lib/log-connections"
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

const authItems: Array<{ value: LogAuthType; label: string }> = [
  { value: "none", label: "No auth header" },
  { value: "basic", label: "Basic (username and password)" },
  { value: "bearer", label: "Bearer token" },
]
export function ConnectionForm({
  connection,
  problem: outsideProblem,
  save,
  onSaved,
  cancel,
}: {
  connection?: LogConnection
  problem?: { message: string }
  save: (input: LogConnectionInput) => Promise<LogConnectionResult>
  onSaved: (connection: LogConnection) => Promise<void>
  cancel: React.ReactNode
}) {
  const [problem, setProblem] = useState<LogConnectionProblem>()
  const [pending, setPending] = useState(false)
  const [tags, setTags] = useState(connection?.tags ?? [])
  const [authType, setAuthType] = useState<LogAuthType>(
    connection?.authType ?? "none"
  )
  const shown = problem ?? outsideProblem
  const sameType = !!connection && connection.authType === authType
  const secretSaved = sameType && !connection.needsSecret
  /** Imported without its secret; blank keeps it that way. */
  const secretMissing = sameType && connection.needsSecret
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setPending(true)
    setProblem(undefined)
    try {
      const result = await save({
        name: String(form.get("name")),
        baseUrl: String(form.get("baseUrl")),
        authType,
        authUsername: String(form.get("authUsername") ?? ""),
        authSecret: String(form.get("authSecret") ?? ""),
        tenantId: String(form.get("tenantId")),
        tags,
        description: String(form.get("description")),
      })
      if (result.ok) {
        const secret = formElement.elements.namedItem("authSecret")
        if (secret instanceof HTMLInputElement) secret.value = ""
        await onSaved(result.connection)
      } else setProblem(result)
    } catch {
      setProblem({
        ok: false,
        message:
          "Agent 6 could not save this Log Connection. Check your connection, then try again.",
      })
    } finally {
      setPending(false)
    }
  }
  const invalid = (field: keyof LogConnectionInput) =>
    problem?.field === field || undefined
  const error = (field: keyof LogConnectionInput) =>
    invalid(field) && (
      <FieldError id={`log-connection-${field}-error`}>
        {problem?.message}
      </FieldError>
    )
  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {shown && (!("field" in shown) || !shown.field) && (
        <FormError title="Nothing was changed">{shown.message}</FormError>
      )}
      {connection && <ConnectionNotice connection={connection} />}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="log-connection-name">Name</FieldLabel>
          <Input
            id="log-connection-name"
            name="name"
            defaultValue={connection?.name}
            required
            maxLength={255}
            autoFocus={!connection}
            autoComplete="off"
            aria-invalid={invalid("name")}
          />
          {error("name")}
        </Field>
        <Field data-invalid={invalid("baseUrl")}>
          <FieldLabel htmlFor="log-connection-baseUrl">Base URL</FieldLabel>
          <Input
            id="log-connection-baseUrl"
            name="baseUrl"
            type="url"
            defaultValue={connection?.baseUrl}
            required
            maxLength={2000}
            autoComplete="off"
            placeholder="http://loki:3100"
            aria-invalid={invalid("baseUrl")}
            aria-describedby="log-connection-baseUrl-hint"
          />
          <FieldDescription id="log-connection-baseUrl-hint">
            Either a Loki server, for example{" "}
            <code className="break-all">http://loki:3100</code>, or a Grafana
            datasource proxy URL that exposes the Loki API, for example{" "}
            <code className="break-all">
              https://grafana.example.com/api/datasources/proxy/uid/abc123
            </code>
            . For Grafana, use a service account token as a Bearer token. Agent
            6 adds <code>/loki/api/v1/…</code> itself.
          </FieldDescription>
          {error("baseUrl")}
        </Field>
        <Field data-invalid={invalid("authType")}>
          <FieldLabel htmlFor="log-connection-authType">Auth header</FieldLabel>
          <Select
            items={authItems}
            value={authType}
            onValueChange={(value) => {
              if (value) setAuthType(value)
            }}
          >
            <SelectTrigger
              id="log-connection-authType"
              className="w-full"
              aria-invalid={invalid("authType")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {authItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {error("authType")}
        </Field>
        {authType === "basic" && (
          <Field data-invalid={invalid("authUsername")}>
            <FieldLabel htmlFor="log-connection-authUsername">
              Username
            </FieldLabel>
            <Input
              id="log-connection-authUsername"
              name="authUsername"
              defaultValue={connection?.authUsername}
              required
              maxLength={255}
              autoComplete="off"
              aria-invalid={invalid("authUsername")}
            />
            {error("authUsername")}
          </Field>
        )}
        {authType !== "none" && (
          <Field data-invalid={invalid("authSecret")}>
            <FieldLabel htmlFor="log-connection-authSecret">
              {authType === "basic" ? "Password" : "Token"}
            </FieldLabel>
            <Input
              // A new input per type, so a typed password is not kept as a token.
              key={authType}
              id="log-connection-authSecret"
              name="authSecret"
              type="password"
              required={!secretSaved && !secretMissing}
              maxLength={4096}
              autoComplete="new-password"
              placeholder={
                secretSaved
                  ? "Unchanged"
                  : secretMissing
                    ? "Not entered"
                    : undefined
              }
              aria-invalid={invalid("authSecret")}
              aria-describedby="log-connection-authSecret-hint"
            />
            <FieldDescription id="log-connection-authSecret-hint">
              {secretSaved
                ? "Saved value unchanged. Type a new one to replace it. Changing the base URL, tenant ID or username needs it again."
                : secretMissing
                  ? "Not entered yet. Type it so the agent can use this connection; left blank, the connection keeps needing it."
                  : "Encrypted when saved and never shown again."}
            </FieldDescription>
            {error("authSecret")}
          </Field>
        )}
        <Field data-invalid={invalid("tenantId")}>
          <FieldLabel htmlFor="log-connection-tenantId">
            Tenant ID <Optional />
          </FieldLabel>
          <Input
            id="log-connection-tenantId"
            name="tenantId"
            defaultValue={connection?.tenantId}
            maxLength={255}
            autoComplete="off"
            aria-invalid={invalid("tenantId")}
            aria-describedby="log-connection-tenantId-hint"
          />
          <FieldDescription id="log-connection-tenantId-hint">
            Sent as the X-Scope-OrgID header. Only needed for a multi-tenant
            Loki.
          </FieldDescription>
          {error("tenantId")}
        </Field>
        <Field data-invalid={invalid("tags")}>
          <FieldLabel htmlFor="log-connection-tags">
            Tags <Optional />
          </FieldLabel>
          <TagsInput
            id="log-connection-tags"
            value={tags}
            onChange={setTags}
            aria-invalid={invalid("tags")}
          />
          {error("tags")}
        </Field>
        <Field data-invalid={invalid("description")}>
          <FieldLabel htmlFor="log-connection-description">
            Description for the agent <Optional />
          </FieldLabel>
          <Textarea
            id="log-connection-description"
            name="description"
            defaultValue={connection?.description}
            maxLength={4000}
            aria-invalid={invalid("description")}
          />
          <FieldDescription>
            Explain which logs live here so the agent knows when to read them.
          </FieldDescription>
          {error("description")}
        </Field>
      </FieldGroup>
      <FieldDescription>
        Saving tests the connection. The connection is saved even if the test
        fails.
      </FieldDescription>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Testing and saving…"
            : connection
              ? "Save changes"
              : "Add Log Connection"}
        </Button>
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
