import {
  CircleAlertIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import type { ConnectionTest } from "@/lib/database-connections"

export function ConnectionStatus({ test }: { test: ConnectionTest }) {
  return (
    <Badge variant="outline" className="text-xs">
      {!test.ok ? (
        <CircleAlertIcon className="text-destructive" />
      ) : test.writable ? (
        <TriangleAlertIcon />
      ) : (
        <CircleCheckIcon />
      )}
      {!test.ok ? "Failed" : test.writable ? "Writable role" : "Ready"}
    </Badge>
  )
}
export function ConnectionNotice({ test }: { test: ConnectionTest }) {
  return (
    <Alert>
      {!test.ok ? (
        <CircleAlertIcon className="text-destructive" />
      ) : test.writable ? (
        <TriangleAlertIcon />
      ) : (
        <CircleCheckIcon />
      )}
      <AlertTitle>
        {!test.ok
          ? "Connection test failed"
          : test.writable
            ? "Supply a read-only role"
            : "Connection successful"}
      </AlertTitle>
      <AlertDescription>
        {!test.ok
          ? test.message
          : test.writable
            ? "This role has write or create privileges. Supply a read-only Postgres role. Agent queries still run in read-only transactions."
            : "The role has no detected write or create privileges."}
      </AlertDescription>
    </Alert>
  )
}
