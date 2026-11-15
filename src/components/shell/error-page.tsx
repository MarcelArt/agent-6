import { useRouter } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { FullPageMessage } from "@/components/shell/full-page-message"
import { Button } from "@/components/ui/button"

/** The whole-page message for an error nobody handled. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : ""
  return (
    <FullPageMessage
      icon={<CircleAlertIcon className="text-destructive" />}
      title="Something went wrong"
      description={
        message
          ? `Agent 6 could not show this page: ${message}`
          : "Agent 6 could not show this page."
      }
    >
      <Button
        variant="outline"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </Button>
    </FullPageMessage>
  )
}
