import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { TicketsIcon } from "lucide-react"
import {
  RecordList,
  RecordListEmpty,
  RecordListToolbar,
  RecordPagination,
  RecordRow,
  RecordSearch,
} from "@/components/records/record-list"
import {
  DetailPane,
  ListPane,
  PaneHeader,
  PaneTitle,
} from "@/components/shell/panes"
import { ConversationFilter } from "@/components/chat/conversation-filter"
import { TicketStatusIcon } from "@/components/tickets/ticket-status"
import { activityTime } from "@/lib/conversation-history"
import { issueKindLabels } from "@/lib/chat"
import {
  TICKET_STATUSES,
  ticketSearch,
  ticketStatusLabels,
} from "@/lib/tickets"
import type { TicketStatus } from "@/lib/tickets"
import { listTickets } from "@/server/tickets.functions"

export const Route = createFileRoute("/admin/tickets")({
  // No status means pending: the Tickets still waiting for a decision.
  validateSearch: ticketSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listTickets({ data: deps }),
  head: () => ({ meta: [{ title: "All Tickets · Agent 6" }] }),
  component: Layout,
})

function Layout() {
  const { tickets, total, page, pageSize, applications } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.ticketId,
  })
  const onList = !!useMatch({ from: "/admin/tickets/", shouldThrow: false })
  const filter = (next: Partial<typeof search>) =>
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, ...next, page: undefined }),
      replace: true,
    })
  const status = search.status ?? "pending"
  return (
    <>
      <ListPane aria-label="All Tickets" phone={onList ? "shown" : "hidden"}>
        <PaneHeader>
          <PaneTitle>All Tickets</PaneTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total}
          </span>
        </PaneHeader>
        <RecordListToolbar>
          <RecordSearch
            label="Search by title or Repository"
            value={search.q ?? ""}
            onSearch={(q) => filter({ q: q || undefined })}
          />
        </RecordListToolbar>
        <RecordListToolbar>
          <ConversationFilter
            label="Filter by status"
            all="All statuses"
            value={status === "all" ? undefined : status}
            options={TICKET_STATUSES.map((id) => ({
              id,
              name: ticketStatusLabels[id],
            }))}
            onChange={(next) =>
              filter({
                // Pending is the default, so it stays out of the address.
                status:
                  next === undefined
                    ? "all"
                    : next === "pending"
                      ? undefined
                      : (next as TicketStatus),
              })
            }
          />
          <ConversationFilter
            label="Filter by Application"
            all="All Applications"
            value={search.applicationId}
            options={applications}
            onChange={(applicationId) => filter({ applicationId })}
          />
        </RecordListToolbar>
        {tickets.length ? (
          <RecordList label="All Tickets">
            {tickets.map((row) => (
              <RecordRow
                key={row.id}
                link={
                  <Link
                    to="/admin/tickets/$ticketId"
                    params={{ ticketId: row.id }}
                    search={search}
                  />
                }
                selected={selectedId === row.id}
                icon={<TicketStatusIcon status={row.status} />}
                name={row.title}
                property={issueKindLabels[row.kind]}
                detail={
                  <>
                    <span className="block truncate">
                      {ticketStatusLabels[row.status]} · {row.user.name} ·{" "}
                      {row.application.name}
                    </span>
                    <span className="block truncate">
                      {row.repository} ·{" "}
                      <time
                        suppressHydrationWarning
                        dateTime={new Date(row.createdAt).toISOString()}
                      >
                        {activityTime(row.createdAt)}
                      </time>
                    </span>
                  </>
                }
                detailLines={2}
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<TicketsIcon />}
            title={
              status === "pending" && !search.q && !search.applicationId
                ? "No Tickets waiting for review"
                : "No Tickets match"
            }
            description={
              status === "pending" && !search.q && !search.applicationId
                ? "The agent creates a Ticket when it finds a fault that needs a developer."
                : "Try different filters or a shorter search."
            }
          />
        )}
        <RecordPagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageLink={(next) => (
            <Link to="." search={{ ...search, page: next }} />
          )}
        />
      </ListPane>
      <DetailPane phone={onList ? "hidden" : "shown"}>
        <Outlet />
      </DetailPane>
    </>
  )
}
