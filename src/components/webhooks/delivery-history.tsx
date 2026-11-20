import { useState } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { RotateCwIcon, SendIcon } from "lucide-react"
import { DeliveryStatus } from "./delivery-status"
import { RecordPagination } from "@/components/records/record-list"
import { ConversationFilter } from "@/components/chat/conversation-filter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { activityTime } from "@/lib/conversation-history"
import {
  WEBHOOK_DELIVERY_STATUSES,
  webhookDeliveryStatusLabels,
} from "@/lib/webhooks"
import type {
  WebhookDeliveryStatus,
  WebhookDeliverySummary,
  WebhookSubscriptionDetail,
} from "@/lib/webhooks"
import { retryWebhookDelivery } from "@/server/webhooks.functions"

const link = "underline underline-offset-4 hover:text-foreground"

function When({ label, at }: { label: string; at: number | null }) {
  if (at === null) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <time suppressHydrationWarning dateTime={new Date(at).toISOString()}>
          {activityTime(at)}
        </time>
      </dd>
    </>
  )
}

/**
 * The deliveries of one subscription, newest first. The status filter and
 * page are in the address (`delivery`, `deliveryPage`).
 */
export function DeliveryHistory({
  subscription,
  status,
  onStatus,
  pageLink,
}: {
  subscription: WebhookSubscriptionDetail
  status?: WebhookDeliveryStatus
  onStatus: (status: WebhookDeliveryStatus | undefined) => void
  pageLink: (page: number) => React.ReactElement<Record<string, unknown>>
}) {
  const { items, total, page, pageSize } = subscription.deliveries
  const router = useRouter()
  const [retrying, setRetrying] = useState<string>()
  const [problem, setProblem] = useState<string>()

  async function retry(item: WebhookDeliverySummary) {
    setRetrying(item.id)
    setProblem(undefined)
    try {
      const result = await retryWebhookDelivery({
        data: { webhookSubscriptionId: subscription.id, deliveryId: item.id },
      })
      if (!result.ok) setProblem(result.message)
      await router.invalidate()
    } catch {
      setProblem(
        "Agent 6 could not be reached, so nothing was retried. Check your connection, then try again."
      )
    }
    setRetrying(undefined)
  }

  return (
    <section
      aria-labelledby="deliveries-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="deliveries-heading" className="text-sm font-medium">
          Deliveries
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total}
        </span>
        <div className="ml-auto flex min-w-40 flex-1 justify-end">
          <ConversationFilter
            label="Filter deliveries by status"
            all="All statuses"
            value={status}
            options={WEBHOOK_DELIVERY_STATUSES.map((id) => ({
              id,
              name: webhookDeliveryStatusLabels[id],
            }))}
            onChange={(next) =>
              onStatus(next as WebhookDeliveryStatus | undefined)
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Every attempt of an event uses the same event ID and body. Completed
        deliveries are kept for 30 days.
      </p>
      {problem && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Not retried</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      {items.length ? (
        <ul aria-label="Deliveries" className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-md border px-3 py-2.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono font-medium break-all">
                  {item.eventType}
                </span>
                <DeliveryStatus status={item.status} className="ml-auto" />
              </div>
              {item.lastResult && (
                <p
                  className={
                    item.status === "failed"
                      ? "break-words text-destructive"
                      : "break-words text-muted-foreground"
                  }
                >
                  {item.lastResult}
                </p>
              )}
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Event ID</dt>
                <dd className="font-mono break-all">{item.eventId}</dd>
                {item.ticketId && (
                  <>
                    <dt className="text-muted-foreground">Ticket</dt>
                    <dd>
                      <Link
                        to="/admin/tickets/$ticketId"
                        params={{ ticketId: item.ticketId }}
                        search={{ status: "all" }}
                        className={link}
                      >
                        Open the Ticket
                      </Link>
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Attempts</dt>
                <dd className="tabular-nums">
                  {item.attempts}
                  {item.lastStatus !== null &&
                    ` · last answer HTTP ${item.lastStatus}`}
                </dd>
                <When label="Queued" at={item.createdAt} />
                <When label="Last attempt" at={item.lastAttemptAt} />
                {item.status === "pending" && (
                  <When label="Next attempt" at={item.nextAttemptAt} />
                )}
                {item.url !== subscription.url && (
                  <>
                    <dt className="text-muted-foreground">Destination</dt>
                    <dd className="break-all">{item.url}</dd>
                  </>
                )}
              </dl>
              {item.retryable && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={retrying !== undefined}
                    onClick={() => void retry(item)}
                  >
                    <RotateCwIcon />
                    {retrying === item.id ? "Retrying…" : "Retry"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SendIcon />
            </EmptyMedia>
            <EmptyTitle>
              {status ? "No deliveries match" : "No deliveries yet"}
            </EmptyTitle>
            <EmptyDescription>
              {status
                ? "Try another status."
                : "Deliveries appear when a chosen event happens for a chosen Application."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className="-mx-4 md:mx-0">
        <RecordPagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageLink={pageLink}
        />
      </div>
    </section>
  )
}
