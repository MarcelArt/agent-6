import { createFileRoute } from "@tanstack/react-router"
import { KeyRoundIcon } from "lucide-react"
import { NewServiceAccountLink } from "./route"
import { DetailHint } from "@/components/records/record-detail"

export const Route = createFileRoute("/admin/service-accounts/")({
  component: Page,
})

function Page() {
  return (
    <DetailHint
      icon={<KeyRoundIcon />}
      title="Give an integration access to the Agent 6 API"
      description="A Service Account is the identity an integration uses. Issue it API Keys, each with its own permissions and Application access. New keys start with no access."
    >
      <NewServiceAccountLink />
      <a
        href="/docs/api"
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Read the API reference
      </a>
    </DetailHint>
  )
}
