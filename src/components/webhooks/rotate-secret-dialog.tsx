import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { OneTimeSecret } from "@/components/integrations/one-time-secret"
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
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SECRET_OVERLAP_HOURS } from "@/lib/webhooks"
import { rotateWebhookSecret } from "@/server/webhooks.functions"

/**
 * Opened by `?dialog=rotate` on a Webhook Subscription. The new secret is
 * shown once, from this dialog's state only.
 */
export function RotateSecretDialog({
  webhookSubscriptionId,
  name,
  onClose,
}: {
  webhookSubscriptionId: string
  name: string
  onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<"overlap" | "replace">("overlap")
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [secret, setSecret] = useState<string>()

  function close() {
    if (pending) return
    onClose()
    if (secret) void router.invalidate()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem(undefined)
    try {
      const result = await rotateWebhookSecret({
        data: { webhookSubscriptionId, mode },
      })
      if (result.ok) setSecret(result.secret)
      else setProblem(result.message)
    } catch {
      setProblem(
        "Agent 6 could not be reached, so the secret was not changed. Check your connection, then try again."
      )
    }
    setPending(false)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        {secret ? (
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New signing secret</DialogTitle>
              <DialogDescription>
                {mode === "overlap"
                  ? `Events for ${name} are signed with both secrets for ${SECRET_OVERLAP_HOURS} hours. Give the receiver the new secret within that time.`
                  : `Events for ${name} are signed only with the new secret from now on. The receiver rejects them until it has it.`}
              </DialogDescription>
            </DialogHeader>
            <OneTimeSecret
              id="rotated-secret"
              label="Signing secret"
              value={secret}
              description="Store it with the receiver that verifies webhook-signature."
            />
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="flex min-h-0 flex-col gap-4 overflow-y-auto"
            onSubmit={(event) => void submit(event)}
          >
            <DialogHeader>
              <DialogTitle>Rotate signing secret</DialogTitle>
              <DialogDescription>
                Agent 6 makes a new secret for {name} and shows it once.
              </DialogDescription>
            </DialogHeader>
            {problem && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}
            <RadioGroup
              value={mode}
              onValueChange={(value) =>
                setMode(value === "replace" ? "replace" : "overlap")
              }
              disabled={pending}
              aria-label="When the old secret stops signing"
            >
              <Field orientation="horizontal">
                <RadioGroupItem value="overlap" id="rotate-overlap" />
                <FieldContent>
                  <FieldLabel htmlFor="rotate-overlap">
                    Keep the old secret for {SECRET_OVERLAP_HOURS} hours
                  </FieldLabel>
                  <FieldDescription>
                    For routine rotation. Each request carries a signature from
                    both secrets until the receiver has switched.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem value="replace" id="rotate-replace" />
                <FieldContent>
                  <FieldLabel htmlFor="rotate-replace">
                    Replace it now
                  </FieldLabel>
                  <FieldDescription>
                    When the old secret may be known to someone else. Requests
                    fail verification until the receiver has the new one.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </RadioGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Rotating…" : "Rotate secret"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
