import { useState } from "react"
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  KeyRoundIcon,
  SendIcon,
  WebhookIcon,
} from "lucide-react"
import { z } from "zod"
import { NewWebhookLink } from "./route"
import {
  DetailActions,
  DetailHeader,
  DetailHint,
} from "@/components/records/record-detail"
import { DeliveryHistory } from "@/components/webhooks/delivery-history"
import { RotateSecretDialog } from "@/components/webhooks/rotate-secret-dialog"
import {
  SubscriptionForm,
  WebhookPaneBody,
} from "@/components/webhooks/subscription-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { activityTime } from "@/lib/conversation-history"
import { deliverySearch } from "@/lib/webhooks"
import type { WebhookTestResult } from "@/lib/webhooks"
import { listApplicationChoices } from "@/server/service-accounts.functions"
import {
  getWebhook,
  sendWebhookTest,
  updateWebhook,
} from "@/server/webhooks.functions"

export const Route = createFileRoute("/admin/webhooks/$webhookSubscriptionId")({
  // Delivery history filters, and the rotate dialog, are in the address.
  validateSearch: z.object({
    delivery: deliverySearch.shape.delivery.catch(undefined),
    deliveryPage: deliverySearch.shape.deliveryPage.catch(undefined),
    dialog: z.enum(["rotate"]).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({
    delivery: search.delivery,
    deliveryPage: search.deliveryPage,
  }),
  loader: async ({ params, deps }) => {
    const [subscription, choices] = await Promise.all([
      getWebhook({
        data: {
          webhookSubscriptionId: params.webhookSubscriptionId,
          ...deps,
        },
      }),
      listApplicationChoices(),
    ])
    return { subscription, choices }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.subscription.name ?? "Webhook Subscription"} · Agent 6`,
      },
    ],
  }),
  component: Page,
  notFoundComponent: NotFound,
})

const link = "underline underline-offset-4 hover:text-foreground"

function Page() {
  const { subscription, choices } = Route.useLoaderData()
  const { delivery, deliveryPage, dialog, ...listSearch } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<WebhookTestResult>()
  const [saved, setSaved] = useState(false)

  async function sendTest() {
    setTesting(true)
    setTest(undefined)
    try {
      setTest(
        await sendWebhookTest({
          data: { webhookSubscriptionId: subscription.id },
        })
      )
    } catch {
      setTest({
        ok: false,
        message:
          "Agent 6 could not be reached, so no test was sent. Check your connection, then try again.",
      })
    }
    setTesting(false)
  }

  return (
    <>
      <DetailHeader
        title={subscription.name}
        backLabel="Back to Webhooks"
        backLink={<Link to="/admin/webhooks" search={listSearch} />}
      >
        <Badge variant="outline" className="text-xs">
          {subscription.enabled ? <CircleCheckIcon /> : <CirclePauseIcon />}
          {subscription.enabled ? "Enabled" : "Disabled"}
        </Badge>
        <DetailActions>
          <Button
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={() => void sendTest()}
          >
            <SendIcon />
            <span className="max-sm:sr-only">
              {testing ? "Sending…" : "Send test"}
            </span>
          </Button>
          <Link
            to="."
            search={(previous) => ({ ...previous, dialog: "rotate" as const })}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <KeyRoundIcon />
            <span className="max-sm:sr-only">Rotate secret</span>
          </Link>
        </DetailActions>
      </DetailHeader>
      <WebhookPaneBody>
        {test && <TestResult result={test} />}
        {saved && (
          <Alert role="status">
            <CircleCheckIcon />
            <AlertTitle>Changes saved</AlertTitle>
            <AlertDescription>
              They apply to the next event, and to deliveries still waiting.
            </AlertDescription>
          </Alert>
        )}
        {subscription.previousSecretExpiresAt !== null && (
          <Alert>
            <KeyRoundIcon />
            <AlertTitle>Two secrets sign right now</AlertTitle>
            <AlertDescription>
              <span>
                The replaced secret keeps signing until{" "}
                <time
                  suppressHydrationWarning
                  dateTime={new Date(
                    subscription.previousSecretExpiresAt
                  ).toISOString()}
                >
                  {activityTime(subscription.previousSecretExpiresAt)}
                </time>
                . Each request carries a signature from both until then.
              </span>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Payloads, signature checks and retries are described in the{" "}
          <a href="/docs/webhooks" className={link}>
            webhook reference
          </a>
          .
        </p>
        <SubscriptionForm
          // A fresh form after each saved change.
          key={`${subscription.id}:${subscription.url}:${subscription.enabled}`}
          subscription={subscription}
          choices={choices}
          save={(input) =>
            updateWebhook({
              data: { webhookSubscriptionId: subscription.id, ...input },
            })
          }
          onSaved={async () => {
            setSaved(true)
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
        <Separator />
        <DeliveryHistory
          subscription={subscription}
          status={delivery}
          onStatus={(next) =>
            void navigate({
              to: ".",
              search: (previous) => ({
                ...previous,
                delivery: next,
                deliveryPage: undefined,
              }),
              replace: true,
            })
          }
          pageLink={(target) => (
            <Link
              to="."
              search={(previous) => ({ ...previous, deliveryPage: target })}
            />
          )}
        />
      </WebhookPaneBody>
      {dialog === "rotate" && (
        <RotateSecretDialog
          webhookSubscriptionId={subscription.id}
          name={subscription.name}
          onClose={() =>
            void navigate({
              to: ".",
              search: (previous) => ({ ...previous, dialog: undefined }),
              replace: true,
            })
          }
        />
      )}
    </>
  )
}

function TestResult({ result }: { result: WebhookTestResult }) {
  if (!result.ok)
    return (
      <Alert variant="destructive" role="alert">
        <CircleAlertIcon />
        <AlertTitle>No test was sent</AlertTitle>
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    )
  return result.delivered ? (
    <Alert role="status">
      <CircleCheckIcon />
      <AlertTitle>Test delivered</AlertTitle>
      <AlertDescription>
        The receiver answered {result.result} to a signed webhook.test event.
      </AlertDescription>
    </Alert>
  ) : (
    <Alert variant="destructive" role="alert">
      <CircleAlertIcon />
      <AlertTitle>The test was not delivered</AlertTitle>
      <AlertDescription>
        {result.result} The test is not retried and does not appear under
        Deliveries.
      </AlertDescription>
    </Alert>
  )
}

function NotFound() {
  return (
    <DetailHint
      icon={<WebhookIcon />}
      title="Webhook Subscription not found"
      description="No Webhook Subscription has this address. Pick one from the list, or create a new one."
    >
      <NewWebhookLink />
    </DetailHint>
  )
}
