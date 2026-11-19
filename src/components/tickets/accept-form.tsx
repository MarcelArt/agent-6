import { useState } from "react"
import { CheckIcon } from "lucide-react"
import {
  FormActions,
  FormError,
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
import { Textarea } from "@/components/ui/textarea"
import { ISSUE_KINDS, issueKindLabels } from "@/lib/chat"
import type { IssueKind } from "@/lib/chat"
import type {
  AdminTicket,
  TicketEdits,
  TicketField,
  TicketResult,
} from "@/lib/tickets"
import { MAX_TICKET_BODY, MAX_TICKET_TITLE } from "@/lib/tickets"

type Problem = { message: string; field?: TicketField }

const kindItems = ISSUE_KINDS.map((value) => ({
  value,
  label: issueKindLabels[value],
}))
const targetItems = [
  { value: "new", label: "Open a new issue" },
  { value: "existing", label: "Add an occurrence to an open issue" },
]

/** Where the issue goes: a new one, or an occurrence on the typed number. */
export type TargetChoice = { existing: boolean; number: string }
export const targetChoice = (number: number | null): TargetChoice => ({
  existing: number !== null,
  number: number === null ? "" : String(number),
})

/**
 * A pending Ticket as the Admin will file it. `children` (the Ticket's
 * facts) come first.
 */
export function AcceptForm({
  ticket,
  accept,
  onAccepted,
  decline,
  target,
  onTargetChange,
  children,
}: {
  ticket: AdminTicket
  children: React.ReactNode
  accept: (edits: TicketEdits) => Promise<TicketResult>
  onAccepted: () => Promise<void>
  /** The link that opens the decline dialog. */
  decline: React.ReactElement
  /** Kept by the page, so the possible duplicate can set it. */
  target: TargetChoice
  onTargetChange: (target: TargetChoice) => void
}) {
  const [kind, setKind] = useState<IssueKind>(ticket.kind)
  const attached = ticket.attachedRepositories.some(
    (repo) => repo.id === ticket.repositoryId
  )
  const [repositoryId, setRepositoryId] = useState(
    attached ? (ticket.repositoryId ?? "") : ""
  )
  const [problem, setProblem] = useState<Problem>()
  const [pending, setPending] = useState(false)
  const blocked = pending || ticket.filing || !ticket.githubConfigured
  const repositoryItems = ticket.attachedRepositories.map((repo) => ({
    value: repo.id,
    label: repo.fullName,
  }))

  async function submit(form: HTMLFormElement) {
    const values = new FormData(form)
    setProblem(undefined)
    if (!repositoryId) {
      setProblem({
        message: "Choose the Repository to file the issue in.",
        field: "repositoryId",
      })
      return
    }
    const number = Number(target.number)
    if (target.existing && !(Number.isInteger(number) && number > 0)) {
      setProblem({
        message:
          "Enter the number of an open Agent 6 issue in this Repository, or open a new issue.",
        field: "targetIssueNumber",
      })
      return
    }
    setPending(true)
    try {
      const result = await accept({
        title: String(values.get("title")),
        body: String(values.get("body")),
        kind,
        repositoryId,
        targetIssueNumber: target.existing ? number : null,
      })
      if (result.ok) {
        await onAccepted()
        return
      }
      setProblem(result)
    } catch {
      setProblem({
        message:
          "Agent 6 could not be reached, so nothing was filed. Check your connection, then try again.",
      })
    }
    setPending(false)
  }

  const invalid = (field: TicketField) =>
    problem?.field === field ? true : undefined
  const errorOf = (field: TicketField) =>
    problem?.field === field && (
      <FieldError id={`ticket-${field}-error`}>{problem.message}</FieldError>
    )
  const describedBy = (field: TicketField, hint?: string) =>
    [hint, problem?.field === field ? `ticket-${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <RecordForm
      method="post"
      aria-label="Accept the Ticket"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(event.currentTarget)
      }}
    >
      {problem && !problem.field && (
        <FormError title="Nothing was filed">{problem.message}</FormError>
      )}
      {children}
      <FieldGroup>
        <Field data-invalid={invalid("title")}>
          <FieldLabel htmlFor="ticket-title">Title</FieldLabel>
          <Input
            id="ticket-title"
            name="title"
            defaultValue={ticket.title}
            required
            maxLength={MAX_TICKET_TITLE}
            disabled={blocked}
            aria-invalid={invalid("title")}
            aria-describedby={describedBy("title")}
          />
          {errorOf("title")}
        </Field>
        <Field data-invalid={invalid("kind")}>
          <FieldLabel htmlFor="ticket-kind">Kind</FieldLabel>
          <Select
            items={kindItems}
            value={kind}
            onValueChange={(value) => setKind(value as IssueKind)}
            disabled={blocked}
          >
            <SelectTrigger
              id="ticket-kind"
              className="w-full"
              aria-invalid={invalid("kind")}
              aria-describedby={describedBy("kind", "ticket-kind-hint")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kindItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id="ticket-kind-hint">
            Sets the issue's label: code-fix, data-fix or feature-request.
          </FieldDescription>
          {errorOf("kind")}
        </Field>
        <Field data-invalid={invalid("repositoryId")}>
          <FieldLabel htmlFor="ticket-repository">Repository</FieldLabel>
          <Select
            items={repositoryItems}
            value={repositoryId || null}
            onValueChange={(value) => {
              setRepositoryId(String(value ?? ""))
              // Issue numbers belong to one Repository.
              onTargetChange(targetChoice(null))
            }}
            disabled={blocked}
          >
            <SelectTrigger
              id="ticket-repository"
              className="w-full"
              aria-invalid={invalid("repositoryId")}
              aria-describedby={describedBy(
                "repositoryId",
                "ticket-repository-hint"
              )}
            >
              <SelectValue placeholder="Choose a Repository" />
            </SelectTrigger>
            <SelectContent>
              {repositoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id="ticket-repository-hint">
            {attached
              ? "Repositories attached to this Ticket's Application."
              : `${ticket.repository} is no longer attached to this Application. Choose one that is.`}
          </FieldDescription>
          {errorOf("repositoryId")}
        </Field>
        <Field data-invalid={invalid("targetIssueNumber")}>
          <FieldLabel htmlFor="ticket-target">Issue</FieldLabel>
          <Select
            items={targetItems}
            value={target.existing ? "existing" : "new"}
            onValueChange={(value) =>
              onTargetChange({ ...target, existing: value === "existing" })
            }
            disabled={blocked}
          >
            <SelectTrigger
              id="ticket-target"
              className="w-full"
              aria-describedby={describedBy(
                "targetIssueNumber",
                "ticket-target-hint"
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targetItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {target.existing && (
            <Input
              aria-label="Issue number"
              placeholder="Issue number, for example 482"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={target.number}
              onChange={(event) =>
                onTargetChange({ ...target, number: event.target.value })
              }
              disabled={blocked}
              aria-invalid={invalid("targetIssueNumber")}
              aria-describedby={describedBy("targetIssueNumber")}
            />
          )}
          <FieldDescription id="ticket-target-hint">
            An occurrence is added as a comment to an open issue Agent 6 filed
            in this Repository.
          </FieldDescription>
          {errorOf("targetIssueNumber")}
        </Field>
        <Field data-invalid={invalid("body")}>
          <FieldLabel htmlFor="ticket-body">Description</FieldLabel>
          <Textarea
            id="ticket-body"
            name="body"
            defaultValue={ticket.body}
            required
            maxLength={MAX_TICKET_BODY}
            disabled={blocked}
            className="max-h-[60svh] min-h-48 resize-y font-mono"
            aria-invalid={invalid("body")}
            aria-describedby={describedBy("body", "ticket-body-hint")}
          />
          <FieldDescription id="ticket-body-hint">
            Markdown for developers. Secrets and personal data are blanked again
            on filing; the Kind line and links back to Agent 6 are added then.
          </FieldDescription>
          {errorOf("body")}
        </Field>
      </FieldGroup>
      <FormActions>
        <Button type="submit" disabled={blocked}>
          <CheckIcon />
          {pending
            ? "Filing…"
            : target.existing
              ? "Accept and add occurrence"
              : "Accept and file issue"}
        </Button>
        {decline}
      </FormActions>
    </RecordForm>
  )
}
