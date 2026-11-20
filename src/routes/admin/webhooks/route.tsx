import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  CircleCheckIcon,
  CirclePauseIcon,
  PlusIcon,
  WebhookIcon,
} from "lucide-react"
import { z } from "zod"
import {
  RecordList,
  RecordListEmpty,
  RecordListHeader,
  RecordListToolbar,
  RecordPagination,
  RecordRow,
  RecordSearch,
} from "@/components/records/record-list"
import { DetailPane, ListPane } from "@/components/shell/panes"
import { buttonVariants } from "@/components/ui/button"
import { destinationHost } from "@/components/webhooks/delivery-status"
import { listWebhooks } from "@/server/webhooks.functions"

export const Route = createFileRoute("/admin/webhooks")({
  // The list's search and page. They stay in the address while one is open.
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listWebhooks({ data: deps }),
  head: () => ({ meta: [{ title: "Webhooks · Agent 6" }] }),
  component: Layout,
})

function Layout() {
  const { subscriptions, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.webhookSubscriptionId,
  })
  // At phone width the list shows only at /admin/webhooks itself.
  const onList =
    useMatch({ from: "/admin/webhooks/", shouldThrow: false }) !== undefined
  const none = total === 0 && !search.q
  const listSearch = { q: search.q, page: search.page }

  return (
    <>
      <ListPane aria-label="Webhooks" phone={onList ? "shown" : "hidden"}>
        <RecordListHeader
          title="Webhooks"
          count={total}
          addLabel="New Webhook Subscription"
          addLink={<Link to="/admin/webhooks/new" search={listSearch} />}
        />
        <RecordListToolbar>
          <RecordSearch
            label="Search by name or address"
            value={search.q ?? ""}
            onSearch={(q) =>
              // "." keeps the open subscription or form; only the list changes.
              void navigate({
                to: ".",
                search: { q: q || undefined },
                replace: true,
              })
            }
          />
        </RecordListToolbar>
        {subscriptions.length > 0 ? (
          <RecordList label="Webhook Subscriptions">
            {subscriptions.map((subscription) => (
              <RecordRow
                key={subscription.id}
                link={
                  <Link
                    to="/admin/webhooks/$webhookSubscriptionId"
                    params={{ webhookSubscriptionId: subscription.id }}
                    search={listSearch}
                  />
                }
                selected={subscription.id === selectedId}
                icon={
                  subscription.enabled ? (
                    <CircleCheckIcon className="text-muted-foreground" />
                  ) : (
                    <CirclePauseIcon className="text-muted-foreground" />
                  )
                }
                name={subscription.name}
                property={subscription.enabled ? "Enabled" : "Disabled"}
                detail={destinationHost(subscription.url)}
                secondary={
                  subscription.failedDeliveries > 0 ? (
                    <span className="text-destructive">
                      {subscription.failedDeliveries} failed
                    </span>
                  ) : undefined
                }
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<WebhookIcon />}
            title={none ? "No Webhook Subscriptions yet" : "No Webhooks match"}
            description={
              none
                ? "Send Ticket events to another system as signed HTTPS requests."
                : "Try a different name or address."
            }
          >
            {none && <NewWebhookLink />}
          </RecordListEmpty>
        )}
        <RecordPagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageLink={(target) => (
            <Link to="." search={{ q: search.q, page: target }} />
          )}
        />
      </ListPane>
      <DetailPane phone={onList ? "hidden" : "shown"}>
        <Outlet />
      </DetailPane>
    </>
  )
}

/** The primary button of the section, for the detail pane's hints. */
export function NewWebhookLink() {
  const search = Route.useSearch()
  return (
    <Link
      to="/admin/webhooks/new"
      search={{ q: search.q, page: search.page }}
      className={buttonVariants()}
    >
      <PlusIcon />
      New Webhook Subscription
    </Link>
  )
}
