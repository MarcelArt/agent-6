import { useState } from "react"
import { GitPullRequestArrowIcon, TriangleAlertIcon } from "lucide-react"
import {
  ApplicationAccessField,
  type ApplicationAccess,
} from "@/components/integrations/application-access-field"
import {
  FormActions,
  FormError,
  RecordForm,
} from "@/components/records/record-detail"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  ApiKeyField,
  ApiKeySummary,
  ApiPermission,
  KeyExpiryChoice,
  ServiceAccountProblem,
} from "@/lib/service-accounts"
import {
  KEY_EXPIRY_CHOICES,
  MAX_API_KEY_NAME,
  PERMISSION_GROUPS,
} from "@/lib/service-accounts"

export type KeyFormValues = {
  name: string
  permissions: Array<string>
  allApplications: boolean
  applicationIds: Array<string>
  /** Only when issuing a key. */
  expiry: KeyExpiryChoice
}

/** Configuration writes need All Applications; Ticket decisions do not. */
const needsAllApplications = (permission: ApiPermission) =>
  /:(create|update|delete)$/.test(permission)

const operations = PERMISSION_GROUPS.flatMap((group) =>
  group.operations.map((item) => ({ ...item, group: group.label }))
)

const acceptDescription = operations.find(
  (item) => item.permission === "tickets:accept"
)!.description

const expiryItems = KEY_EXPIRY_CHOICES.map((item) => ({
  value: item.value,
  label: item.label,
}))

type Problem = { message: string; field?: string }

/**
 * Issues an API Key or edits its grants: name, Application access and
 * permissions. With `readOnly` (a revoked key) it only shows them.
 */
export function KeyForm<TResult extends { ok: true } | ServiceAccountProblem>({
  apiKey,
  choices,
  readOnly = false,
  submitLabel,
  save,
  onSaved,
  cancel,
  children,
}: {
  /** The key being edited; none when issuing one. */
  apiKey?: ApiKeySummary
  choices: Array<{ id: string; name: string }>
  readOnly?: boolean
  submitLabel: string
  save: (values: KeyFormValues) => Promise<TResult>
  onSaved: (result: Extract<TResult, { ok: true }>) => void | Promise<void>
  cancel: React.ReactNode
  /** Facts shown above the fields. */
  children?: React.ReactNode
}) {
  const [permissions, setPermissions] = useState<ReadonlySet<string>>(
    () => new Set(apiKey?.permissions ?? [])
  )
  const [access, setAccess] = useState<ApplicationAccess>(() => ({
    allApplications: apiKey?.allApplications ?? false,
    applicationIds: new Set(apiKey?.applications.map((item) => item.id) ?? []),
  }))
  const [expiry, setExpiry] = useState<KeyExpiryChoice>("never")
  const [problem, setProblem] = useState<Problem>()
  const [pending, setPending] = useState(false)
  const disabled = readOnly || pending

  const refusedWithoutAll = access.allApplications
    ? []
    : operations.filter(
        (item) =>
          permissions.has(item.permission) &&
          needsAllApplications(item.permission)
      )

  function toggle(permission: string, on: boolean) {
    const next = new Set(permissions)
    if (on) next.add(permission)
    else next.delete(permission)
    setPermissions(next)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly) return
    const form = new FormData(event.currentTarget)
    setProblem(undefined)
    setPending(true)
    try {
      const result = await save({
        name: String(form.get("name")),
        permissions: operations
          .map((item) => item.permission)
          .filter((permission) => permissions.has(permission)),
        allApplications: access.allApplications,
        applicationIds: access.allApplications
          ? []
          : [...access.applicationIds],
        expiry,
      })
      if (result.ok) {
        await onSaved(result as Extract<TResult, { ok: true }>)
        setPending(false)
        return
      }
      setProblem(result)
    } catch {
      setProblem({
        message:
          "Agent 6 could not be reached, so nothing was saved. Check your connection, then try again.",
      })
    }
    setPending(false)
  }

  const invalid = (field: ApiKeyField) =>
    problem?.field === field ? true : undefined
  const shownFields: Array<string> = ["name", "permissions", "applicationIds"]

  return (
    <RecordForm method="post" onSubmit={(event) => void submit(event)}>
      {problem && (!problem.field || !shownFields.includes(problem.field)) && (
        <FormError title="Nothing was changed">{problem.message}</FormError>
      )}
      {children}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="api-key-name">Key name</FieldLabel>
          <Input
            id="api-key-name"
            name="name"
            defaultValue={apiKey?.name}
            required
            autoComplete="off"
            maxLength={MAX_API_KEY_NAME}
            autoFocus={!apiKey}
            readOnly={readOnly}
            aria-invalid={invalid("name")}
            aria-describedby={[
              "api-key-name-hint",
              invalid("name") ? "api-key-name-error" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <FieldDescription id="api-key-name-hint">
            Where the key is used, for example “Production deploy”. Several keys
            can be active at once, so a key can be rotated without a gap.
          </FieldDescription>
          {invalid("name") && (
            <FieldError id="api-key-name-error">{problem?.message}</FieldError>
          )}
        </Field>
        {!apiKey && (
          <Field data-invalid={invalid("expiry")}>
            <FieldLabel htmlFor="api-key-expiry">Expires</FieldLabel>
            <Select
              items={expiryItems}
              value={expiry}
              disabled={disabled}
              onValueChange={(value) => {
                if (value) setExpiry(value)
              }}
            >
              <SelectTrigger
                id="api-key-expiry"
                className="w-full"
                aria-describedby="api-key-expiry-hint"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expiryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id="api-key-expiry-hint">
              An expired key stops working. Issue its replacement before then.
            </FieldDescription>
          </Field>
        )}
      </FieldGroup>
      <ApplicationAccessField
        idPrefix="api-key-access"
        legend="Application access"
        description="Reads and Ticket decisions stay within these Applications. Records outside them answer as if they did not exist."
        allDescription="Every Application, including ones created later, and resources attached to none. Configuration changes need it."
        choices={choices}
        value={access}
        onChange={setAccess}
        error={
          invalid("applicationIds") || invalid("allApplications")
            ? problem?.message
            : undefined
        }
        disabled={disabled}
      />
      <FieldSet data-invalid={invalid("permissions")}>
        <FieldLegend>Permissions</FieldLegend>
        <FieldDescription>
          {apiKey
            ? "Changes apply to the key's next request."
            : "A new key starts with no access. Grant only what the integration needs."}
        </FieldDescription>
        {PERMISSION_GROUPS.map((group) => (
          <FieldSet key={group.resource}>
            <FieldLegend variant="label">{group.label}</FieldLegend>
            <div data-slot="checkbox-group" className="flex flex-col gap-3">
              {group.operations.map((item) => {
                const id = `permission-${item.permission.replace(":", "-")}`
                return (
                  <Field key={item.permission} orientation="horizontal">
                    <Checkbox
                      id={id}
                      checked={permissions.has(item.permission)}
                      onCheckedChange={(checked) =>
                        toggle(item.permission, checked)
                      }
                      disabled={disabled}
                      aria-describedby={`${id}-hint`}
                    />
                    <FieldContent className="min-w-0">
                      <FieldLabel htmlFor={id}>{item.label}</FieldLabel>
                      <FieldDescription id={`${id}-hint`}>
                        <code className="font-mono break-all text-foreground/80">
                          {item.permission}
                        </code>
                        {" · "}
                        {item.description}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )
              })}
            </div>
          </FieldSet>
        ))}
        {permissions.has("tickets:accept") && (
          <Alert>
            <GitPullRequestArrowIcon />
            <AlertTitle>This key can file issues on GitHub</AlertTitle>
            <AlertDescription>{acceptDescription}</AlertDescription>
          </Alert>
        )}
        {refusedWithoutAll.length > 0 && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>These need All Applications</AlertTitle>
            <AlertDescription>
              With selected Applications the API refuses configuration changes:{" "}
              {refusedWithoutAll
                .map((item) => `${item.group} ${item.label.toLowerCase()}`)
                .join(", ")}
              .
            </AlertDescription>
          </Alert>
        )}
        {invalid("permissions") && <FieldError>{problem?.message}</FieldError>}
      </FieldSet>
      <FormActions>
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            {submitLabel}
          </Button>
        )}
        {cancel}
      </FormActions>
    </RecordForm>
  )
}
