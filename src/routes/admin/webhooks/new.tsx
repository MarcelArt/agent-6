import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { ShieldAlertIcon } from "lucide-react"
import { DetailHeader } from "@/components/records/record-detail"
import { OneTimeSecret } from "@/components/integrations/one-time-secret"
import {
  SubscriptionForm,
  WebhookPaneBody,
} from "@/components/webhooks/subscription-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { listApplicationChoices } from "@/server/service-accounts.functions"
import { createWebhook } from "@/server/webhooks.functions"

export const Route = createFileRoute("/admin/webhooks/new")({
  head: () => ({ meta: [{ title: "New Webhook Subscription · Agent 6" }] }),
  loader: () => listApplicationChoices(),
  component: Page,
})

const link = "underline underline-offset-4 hover:text-foreground"

function Page() {
  const search = Route.useSearch()
  const choices = Route.useLoaderData()
  const router = useRouter()
  // The secret is shown once, from this state only; a reload forgets it.
  const [created, setCreated] = useState<{ id: string; secret: string }>()
  const listSearch = { q: search.q, page: search.page }

  return (
    <>
      <DetailHeader
        title={
          created ? "Webhook Subscription created" : "New Webhook Subscription"
        }
        backLabel="Back to Webhooks"
        backLink={<Link to="/admin/webhooks" search={listSearch} />}
      />
      <WebhookPaneBody>
        {created ? (
          <>
            <p className="text-xs text-muted-foreground">
              Give this secret to the receiver. It verifies the
              webhook-signature header of every request with it, as described in
              the{" "}
              <a href="/docs/webhooks" className={link}>
                webhook reference
              </a>
              .
            </p>
            <OneTimeSecret
              id="webhook-secret"
              label="Signing secret"
              value={created.secret}
              description="Unique to this subscription. Rotate it from the subscription when it needs to change."
            />
            <div>
              <Link
                to="/admin/webhooks/$webhookSubscriptionId"
                params={{ webhookSubscriptionId: created.id }}
                search={listSearch}
                className={buttonVariants()}
              >
                Done
              </Link>
            </div>
          </>
        ) : (
          <>
            <Alert>
              <ShieldAlertIcon />
              <AlertTitle>Events carry Ticket content</AlertTitle>
              <AlertDescription>
                Production events include each Ticket’s developer title,
                description and the agent’s evidence, redacted for emails, phone
                numbers and credentials. Send them only to a system allowed to
                hold that. The events and Applications chosen here are separate
                from any API Key’s grants. See the{" "}
                <a href="/docs/webhooks" className={link}>
                  webhook reference
                </a>{" "}
                for payloads and signature checks.
              </AlertDescription>
            </Alert>
            <SubscriptionForm
              choices={choices}
              save={(input) => createWebhook({ data: input })}
              onSaved={async (result) => {
                setCreated({ id: result.id, secret: result.secret })
                await router.invalidate()
              }}
              cancel={
                <Link
                  to="/admin/webhooks"
                  search={listSearch}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Cancel
                </Link>
              }
            />
          </>
        )}
      </WebhookPaneBody>
    </>
  )
}
