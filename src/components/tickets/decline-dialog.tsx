import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { MAX_DECLINE_REASON } from "@/lib/tickets"
import { declineTicket } from "@/server/tickets.functions"

/** Opened by `?decline=true` on an Admin Ticket. */
export function DeclineDialog({
  ticketId,
  ownerName,
  onClose,
}: {
  ticketId: string
  /** The Conversation's owner, who reads the reason. */
  ownerName: string
  onClose: () => void
}) {
  const [reason, setReason] = useState("")
  const [problem, setProblem] = useState<{
    message: string
    field?: string
  }>()
  const [pending, setPending] = useState(false)
  const router = useRouter()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setPending(true)
            setProblem(undefined)
            try {
              const result = await declineTicket({
                data: { ticketId, reason },
              })
              if (!result.ok) {
                setProblem(result)
                return
              }
              onClose()
              await router.invalidate()
            } catch {
              setProblem({
                message:
                  "Agent 6 could not be reached, so the Ticket was not declined. Please try again.",
              })
            } finally {
              setPending(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Decline this Ticket?</DialogTitle>
            <DialogDescription>
              Nothing is sent to GitHub. {ownerName} sees your reason on their
              ticket exactly as written, and the agent may share it in the
              Conversation. A declined Ticket cannot be accepted later.
            </DialogDescription>
          </DialogHeader>
          {problem && problem.field !== "reason" && (
            <Alert variant="destructive">
              <AlertDescription>{problem.message}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={problem?.field === "reason" || undefined}>
              <FieldLabel htmlFor="decline-reason">Reason</FieldLabel>
              <Textarea
                id="decline-reason"
                autoFocus
                required
                maxLength={MAX_DECLINE_REASON}
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={problem?.field === "reason" || undefined}
                aria-describedby="decline-reason-hint"
                disabled={pending}
              />
              <FieldDescription id="decline-reason-hint">
                Write it for {ownerName} in plain words, in the language they
                use.
              </FieldDescription>
              {problem?.field === "reason" && (
                <FieldError>{problem.message}</FieldError>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={pending || !reason.trim()}
            >
              {pending ? "Declining…" : "Decline ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
