import {
  Link,
  getRouteApi,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  CircleDotIcon,
  EllipsisIcon,
  MessageSquareIcon,
  PencilIcon,
  SquarePenIcon,
  TicketIcon,
  Trash2Icon,
} from "lucide-react"
import { ListPane, PaneHeader, PaneTitle } from "@/components/shell/panes"
import { Button } from "@/components/ui/button"
import {
  RecordList,
  RecordListEmpty,
  RecordListToolbar,
  RecordPagination,
  RecordSearch,
} from "@/components/records/record-list"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConversationFilter } from "./conversation-filter"
import { ConversationAction } from "./conversation-action"
import { activityTime } from "@/lib/conversation-history"
import { cn } from "@/lib/utils"

const chatRoute = getRouteApi("/chat")

export function ChatSidebar() {
  const { conversations, total, page, pageSize, applications } =
    chatRoute.useLoaderData()
  const search = chatRoute.useSearch()
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const selectedId = useParams({
    strict: false,
    select: (params) => params.conversationId,
  })
  const target = conversations.find(
    (row) => row.id === (search.rename ?? search.remove)
  )
  const close = () =>
    void navigate({
      to: ".",
      search: (previous) => ({
        ...previous,
        rename: undefined,
        remove: undefined,
      }),
      replace: true,
    })

  return (
    <>
      <ListPane
        phone={pathname === "/chat/history" ? "shown" : "hidden"}
        aria-label="Conversations"
      >
        <PaneHeader>
          <PaneTitle>Conversations</PaneTitle>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            render={<Link to="/chat" />}
          >
            <SquarePenIcon data-icon="inline-start" />
            New conversation
          </Button>
        </PaneHeader>
        <RecordListToolbar>
          <RecordSearch
            label="Search by title"
            value={search.q ?? ""}
            onSearch={(q) =>
              void navigate({
                to: ".",
                search: (previous) => ({
                  ...previous,
                  q: q || undefined,
                  page: undefined,
                }),
                replace: true,
              })
            }
          />
          <ConversationFilter
            label="Filter by Application"
            all="All Applications"
            value={search.applicationId}
            options={applications}
            onChange={(applicationId) =>
              void navigate({
                to: ".",
                search: (previous) => ({
                  ...previous,
                  applicationId,
                  page: undefined,
                }),
                replace: true,
              })
            }
          />
        </RecordListToolbar>
        {conversations.length ? (
          <RecordList label="Conversations">
            {conversations.map((row) => {
              const selected = row.id === selectedId
              return (
                <li key={row.id} className="group relative">
                  <Link
                    to="/chat/$conversationId"
                    params={{ conversationId: row.id }}
                    search={search}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "flex flex-col rounded-md px-2 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:py-1.5",
                      selected ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <span className="truncate pr-7 text-xs leading-5 font-medium">
                      {row.title}
                    </span>
                    <span
                      className={cn(
                        "truncate text-xs leading-4",
                        selected
                          ? "text-foreground/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {row.application.name} ·{" "}
                      <time
                        suppressHydrationWarning
                        dateTime={new Date(row.updatedAt).toISOString()}
                      >
                        {activityTime(row.updatedAt)}
                      </time>
                    </span>
                    {row.ticketCount > 0 ? (
                      <span className="flex items-center gap-1 text-xs leading-4">
                        <TicketIcon className="size-3" />
                        {row.ticketCount === 1
                          ? "Ticket created"
                          : `${row.ticketCount} tickets created`}
                      </span>
                    ) : (
                      // Conversations from before Tickets.
                      row.issueCount > 0 && (
                        <span className="flex items-center gap-1 text-xs leading-4">
                          <CircleDotIcon className="size-3" />
                          Reported to the team
                        </span>
                      )
                    )}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`More actions for ${row.title}`}
                          className="absolute top-2 right-1 md:top-1 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 md:aria-expanded:opacity-100"
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          render={
                            <Link
                              to="."
                              search={(previous) => ({
                                ...previous,
                                rename: row.id,
                                remove: undefined,
                              })}
                            />
                          }
                        >
                          <PencilIcon />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          render={
                            <Link
                              to="."
                              search={(previous) => ({
                                ...previous,
                                remove: row.id,
                                rename: undefined,
                              })}
                            />
                          }
                        >
                          <Trash2Icon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<MessageSquareIcon />}
            title={
              search.q || search.applicationId
                ? "No Conversations match"
                : "No Conversations yet"
            }
            description={
              search.q || search.applicationId
                ? "Try a different title or Application."
                : "Your Conversations with the agent appear here."
            }
          />
        )}
        <RecordPagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageLink={(targetPage) => (
            <Link
              to="."
              search={(previous) => ({ ...previous, page: targetPage })}
            />
          )}
        />
      </ListPane>
      {target && (
        <ConversationAction
          key={`${target.id}:${search.rename ? "rename" : "remove"}`}
          id={target.id}
          title={target.title}
          rename={!!search.rename}
          onClose={close}
          selected={selectedId === target.id}
        />
      )}
    </>
  )
}
