import { useState } from "react"
import { FormActions, FormError } from "@/components/records/record-detail"
import { ApplicationAccessField } from "@/components/integrations/application-access-field"
import type { ApplicationAccess } from "@/components/integrations/application-access-field"
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
  MAX_WEBHOOK_NAME,
  MAX_WEBHOOK_URL,
  WEBHOOK_EVENT_TYPES,
  webhookEventDescriptions,
} from "@/lib/webhooks"
import type {
  WebhookEventType,
  WebhookField,
  WebhookInput,
  WebhookProblem,
  WebhookSubscriptionDetail,
} from "@/lib/webhooks"

type Problem = { message: string; field?: WebhookField }

/**
 * The create and edit form of a Webhook Subscription. With `subscription`
 * it edits, and explains that a new address or disabling cancels queued
 * deliveries. `save` answers ok or what went wrong.
 */
export function SubscriptionForm<TResult extends { ok: true }>({
  subscription,
  choices,
  save,
  onSaved,
  cancel,
  disabled,
}: {
  subscription?: WebhookSubscriptionDetail
  /** Every Application, for the selection. */
  choices: Array<{ id: string; name: string }>
  save: (input: WebhookInput) => Promise<TResult | WebhookProblem>
  onSaved: (result: TResult) => void | Promise<void>
  /** The Cancel link, back to the list. */
  cancel: React.ReactNode
  disabled?: boolean
}) {
  const [enabled, setEnabled] = useState(subscription?.enabled ?? true)
  const [eventTypes, setEventTypes] = useState<ReadonlySet<WebhookEventType>>(
    () => new Set(subscription?.eventTypes ?? WEBHOOK_EVENT_TYPES)
  )
  const [access, setAccess] = useState<ApplicationAccess>(() => ({
    allApplications: subscription?.allApplications ?? false,
    applicationIds: new Set(
      subscription?.applications.map((item) => item.id) ?? []
    ),
  }))
  const [problem, setProblem] = useState<Problem>()
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setProblem(undefined)
    setPending(true)
    try {
      const result = await save({
        name: String(form.get("name")),
        url: String(form.get("url")),
        enabled,
        eventTypes: WEBHOOK_EVENT_TYPES.filter((type) => eventTypes.has(type)),
        allApplications: access.allApplications,
        applicationIds: [...access.applicationIds],
      })
      if (result.ok) {
        await onSaved(result)
      } else setProblem(result)
    } catch {
      setProblem({
        message:
          "Agent 6 could not be reached, so nothing was saved. Check your connection, then try again.",
      })
    }
    setPending(false)
  }

  function toggleEvent(type: WebhookEventType, on: boolean) {
    const next = new Set(eventTypes)
    if (on) next.add(type)
    else next.delete(type)
    setEventTypes(next)
  }

  const invalid = (field: WebhookField) =>
    problem?.field === field ? true : undefined
  const errorOf = (field: WebhookField) =>
    problem?.field === field && (
      <FieldError id={`webhook-${field}-error`}>{problem.message}</FieldError>
    )
  const describedBy = (field: WebhookField, hint?: string) =>
    [hint, problem?.field === field ? `webhook-${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined
  const locked = pending || disabled

  return (
    <form
      method="post"
      className="flex flex-col gap-6"
      onSubmit={(event) => void submit(event)}
    >
      {problem && !problem.field && (
        <FormError title="Nothing was saved">{problem.message}</FormError>
      )}
      <FieldGroup>
        <Field data-invalid={invalid("name")}>
          <FieldLabel htmlFor="webhook-name">Name</FieldLabel>
          <Input
            id="webhook-name"
            name="name"
            defaultValue={subscription?.name}
            autoComplete="off"
            required
            maxLength={MAX_WEBHOOK_NAME}
            autoFocus={!subscription}
            disabled={locked}
            aria-invalid={invalid("name")}
            aria-describedby={describedBy("name", "webhook-name-hint")}
          />
          <FieldDescription id="webhook-name-hint">
            The system that receives the events, for example Ops ticket sync.
          </FieldDescription>
          {errorOf("name")}
        </Field>
        <Field data-invalid={invalid("url")}>
          <FieldLabel htmlFor="webhook-url">Destination</FieldLabel>
          <Input
            id="webhook-url"
            name="url"
            type="url"
            inputMode="url"
            defaultValue={subscription?.url}
            placeholder="https://hooks.example.com/agent6"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={MAX_WEBHOOK_URL}
            disabled={locked}
            aria-invalid={invalid("url")}
            aria-describedby={describedBy("url", "webhook-url-hint")}
          />
          <FieldDescription id="webhook-url-hint">
            A public HTTPS address. Agent 6 does not follow redirects or send to
            private networks.
            {subscription &&
              " Changing it cancels deliveries still waiting for the old address."}
          </FieldDescription>
          {errorOf("url")}
        </Field>
        <Field orientation="horizontal" data-invalid={invalid("enabled")}>
          <Checkbox
            id="webhook-enabled"
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked)}
            disabled={locked}
            aria-invalid={invalid("enabled")}
            aria-describedby={describedBy("enabled", "webhook-enabled-hint")}
          />
          <FieldContent>
            <FieldLabel htmlFor="webhook-enabled">Send events</FieldLabel>
            <FieldDescription id="webhook-enabled-hint">
              {subscription
                ? "Turning it off cancels deliveries still waiting. Turning it on again sends only new events."
                : "Events that happen while it is off are never sent."}
            </FieldDescription>
            {errorOf("enabled")}
          </FieldContent>
        </Field>
      </FieldGroup>
      <FieldSet data-invalid={invalid("eventTypes")} disabled={locked}>
        <FieldLegend>Events</FieldLegend>
        <FieldDescription>
          Each chosen event is sent once per change, signed, with retries for up
          to 24 hours.
        </FieldDescription>
        <FieldGroup className="gap-3">
          {WEBHOOK_EVENT_TYPES.map((type) => {
            const id = `webhook-event-${type.replaceAll(".", "-")}`
            return (
              <Field key={type} orientation="horizontal">
                <Checkbox
                  id={id}
                  checked={eventTypes.has(type)}
                  onCheckedChange={(checked) => toggleEvent(type, checked)}
                  aria-invalid={invalid("eventTypes")}
                  aria-describedby={`${id}-hint`}
                  disabled={locked}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id} className="font-mono">
                    {type}
                  </FieldLabel>
                  <FieldDescription id={`${id}-hint`}>
                    {webhookEventDescriptions[type]}
                  </FieldDescription>
                </FieldContent>
              </Field>
            )
          })}
        </FieldGroup>
        {problem?.field === "eventTypes" && (
          <FieldError>{problem.message}</FieldError>
        )}
      </FieldSet>
      <ApplicationAccessField
        idPrefix="webhook"
        legend="Applications"
        description="Events are sent only for Tickets of these Applications. This choice is separate from what any API Key may read."
        allDescription="Every Application, including ones created later."
        choices={choices}
        value={access}
        onChange={setAccess}
        error={
          problem?.field === "applicationIds" ||
          problem?.field === "allApplications"
            ? problem.message
            : undefined
        }
        disabled={locked}
      />
      <FormActions>
        <Button type="submit" disabled={locked}>
          {pending
            ? "Saving…"
            : subscription
              ? "Save changes"
              : "Create subscription"}
        </Button>
        {cancel}
      </FormActions>
    </form>
  )
}

/** The scrolling column of a Webhook detail pane. */
export function WebhookPaneBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        {children}
      </div>
    </div>
  )
}
