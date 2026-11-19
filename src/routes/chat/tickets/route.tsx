import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { TicketIcon } from "lucide-react"
import {
  RecordList,
  RecordListEmpty,
  RecordListToolbar,
  RecordPagination,
  RecordRow,
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
import {
  TICKET_STATUSES,
  ownTicketSearch,
  ticketStatusLabels,
} from "@/lib/tickets"
import type { TicketStatus } from "@/lib/tickets"
import { listOwnTickets } from "@/server/tickets.functions"

export const Route = createFileRoute("/chat/tickets")({
  // `status` and `ticketPage` stay apart from the history's `q` and `page`,
  // which the `/chat` layout loads Conversations with.
  validateSearch: ownTicketSearch,
  loaderDeps: ({ search: { status, ticketPage } }) => ({ status, ticketPage }),
  loader: ({ deps }) => listOwnTickets({ data: deps }),
  head: () => ({ meta: [{ title: "Tickets · Agent 6" }] }),
  component: Layout,
})

function Layout() {
  const { tickets, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.ticketId,
  })
  const onList = !!useMatch({ from: "/chat/tickets/", shouldThrow: false })
  return (
    <>
      <ListPane aria-label="Tickets" phone={onList ? "shown" : "hidden"}>
        <PaneHeader>
          <PaneTitle>Tickets</PaneTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total}
          </span>
        </PaneHeader>
        <RecordListToolbar>
          <ConversationFilter
            label="Filter by status"
            all="All statuses"
            value={search.status}
            options={TICKET_STATUSES.map((id) => ({
              id,
              name: ticketStatusLabels[id],
            }))}
            onChange={(status) =>
              void navigate({
                to: ".",
                search: (previous) => ({
                  ...previous,
                  status: status as TicketStatus | undefined,
                  ticketPage: undefined,
                }),
                replace: true,
              })
            }
          />
        </RecordListToolbar>
        {tickets.length ? (
          <RecordList label="Tickets">
            {tickets.map((row) => (
              <RecordRow
                key={row.id}
                link={
                  <Link
                    to="/chat/tickets/$ticketId"
                    params={{ ticketId: row.id }}
                    search={search}
                  />
                }
                selected={selectedId === row.id}
                icon={<TicketStatusIcon status={row.status} />}
                name={row.summary}
                detail={
                  <>
                    {ticketStatusLabels[row.status]} · {row.application.name} ·{" "}
                    <time
                      suppressHydrationWarning
                      dateTime={new Date(row.createdAt).toISOString()}
                    >
                      {activityTime(row.createdAt)}
                    </time>
                  </>
                }
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<TicketIcon />}
            title={search.status ? "No tickets match" : "No tickets yet"}
            description={
              search.status
                ? "Try another status."
                : "When the agent finds a problem the developers need to fix, it creates a ticket for the team to review. You can follow it here."
            }
          />
        )}
        <RecordPagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageLink={(next) => (
            <Link to="." search={{ ...search, ticketPage: next }} />
          )}
        />
      </ListPane>
      <DetailPane phone={onList ? "hidden" : "shown"}>
        <Outlet />
      </DetailPane>
    </>
  )
}
