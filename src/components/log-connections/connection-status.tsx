import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  NeedsSecretBadge,
  NeedsSecretNotice,
} from "@/components/connections/needs-secret"
import type { LogConnection, LogConnectionTest } from "@/lib/log-connections"

function Icon({ test }: { test: LogConnectionTest }) {
  return test.ok ? (
    <CircleCheckIcon />
  ) : (
    <CircleAlertIcon className="text-destructive" />
  )
}
export function ConnectionStatus({
  connection: { test, needsSecret },
}: {
  connection: LogConnection
}) {
  if (needsSecret) return <NeedsSecretBadge />
  return (
    <Badge variant="outline" className="text-xs">
      <Icon test={test} />
      {test.ok ? "Ready" : "Failed"}
    </Badge>
  )
}
export function ConnectionNotice({
  connection: { test, needsSecret, authType },
}: {
  connection: LogConnection
}) {
  if (needsSecret)
    return (
      <NeedsSecretNotice secret={authType === "basic" ? "password" : "token"} />
    )
  return (
    <Alert>
      <Icon test={test} />
      <AlertTitle>
        {test.ok ? "Connection successful" : "Connection test failed"}
      </AlertTitle>
      <AlertDescription>
        {test.ok ? "The Loki API answered at this base URL." : test.message}
      </AlertDescription>
    </Alert>
  )
}
