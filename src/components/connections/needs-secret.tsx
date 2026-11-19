import { KeyRoundIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

/*
 * Needs Secret: a Database Connection or Log Connection imported from a
 * Setup File without its password or token. The agent cannot use it for any
 * Application until an Admin enters the secret.
 */

export function NeedsSecretBadge() {
  return (
    <Badge variant="outline" className="text-xs">
      <KeyRoundIcon />
      Needs secret
    </Badge>
  )
}

/** At the top of the connection's form, where the secret is entered. */
export function NeedsSecretNotice({ secret }: { secret: string }) {
  return (
    <Alert>
      <KeyRoundIcon />
      <AlertTitle>Needs secret</AlertTitle>
      <AlertDescription>
        This connection was imported from a Setup File without its {secret}.
        Enter the {secret} and save. Until then the agent cannot use it for any
        Application.
      </AlertDescription>
    </Alert>
  )
}
