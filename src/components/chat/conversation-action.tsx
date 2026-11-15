import { useState } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  deleteConversation,
  renameConversation,
} from "@/server/conversation-history.functions"
import { cn } from "@/lib/utils"

export function ConversationAction({
  id,
  title,
  rename,
  onClose,
  selected,
}: {
  id: string
  title: string
  rename: boolean
  onClose: () => void
  selected: boolean
}) {
  const [value, setValue] = useState(title)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const navigate = useNavigate()
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
            setError(undefined)
            try {
              const result = rename
                ? await renameConversation({
                    data: { conversationId: id, title: value },
                  })
                : await deleteConversation({ data: { conversationId: id } })
              if (!result.ok) {
                setError(result.message)
                return
              }
              if (!rename && selected)
                await navigate({
                  to: "/chat/history",
                  search: (previous) => ({
                    q: previous.q,
                    applicationId: previous.applicationId,
                    page: previous.page,
                  }),
                  replace: true,
                })
              else
                await navigate({
                  to: ".",
                  search: (previous) => ({
                    ...previous,
                    rename: undefined,
                    remove: undefined,
                  }),
                  replace: true,
                })
              await router.invalidate()
            } catch {
              setError(
                "The Conversation could not be changed. Please try again."
              )
            } finally {
              setPending(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {rename ? "Rename Conversation" : "Delete Conversation?"}
            </DialogTitle>
            <DialogDescription>
              {rename
                ? "Choose a title you can find again."
                : `“${title}” will disappear from your history. Admins keep a record for review.`}
            </DialogDescription>
          </DialogHeader>
          {rename ? (
            <FieldGroup>
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="conversation-title">Title</FieldLabel>
                <Input
                  id="conversation-title"
                  autoFocus
                  maxLength={120}
                  required
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-invalid={!!error}
                  disabled={pending}
                />
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </FieldGroup>
          ) : (
            error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )
          )}
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
              variant={rename ? "default" : "outline"}
              className={cn(
                !rename && "text-destructive hover:text-destructive"
              )}
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : rename
                  ? "Save title"
                  : "Delete Conversation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
