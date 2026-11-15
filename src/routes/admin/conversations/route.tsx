import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { MessageSquareIcon } from "lucide-react"
import {
  RecordList,
  RecordListEmpty,
  RecordListToolbar,
  RecordPagination,
  RecordRow,
  RecordSearch,
} from "@/components/records/record-list"
import { ListPane, PaneHeader, PaneTitle } from "@/components/shell/panes"
import { Badge } from "@/components/ui/badge"
import { ConversationFilter } from "@/components/chat/conversation-filter"
import { activityTime, auditSearch } from "@/lib/conversation-history"
import { listAllConversations } from "@/server/conversation-history.functions"

export const Route = createFileRoute("/admin/conversations")({
  validateSearch: auditSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listAllConversations({ data: deps }),
  head: () => ({ meta: [{ title: "All Conversations · Agent 6" }] }),
  component: Layout,
})
function Layout() {
  const { conversations, total, page, pageSize, applications, users } =
    Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.conversationId,
  })
  const onList = !!useMatch({
    from: "/admin/conversations/",
    shouldThrow: false,
  })
  const filter = (next: Partial<typeof search>) =>
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, ...next, page: undefined }),
      replace: true,
    })
  return (
    <>
      <ListPane
        aria-label="All Conversations"
        phone={onList ? "shown" : "hidden"}
      >
        <PaneHeader>
          <PaneTitle>All Conversations</PaneTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total}
          </span>
        </PaneHeader>
        <RecordListToolbar>
          <RecordSearch
            label="Search by title"
            value={search.q ?? ""}
            onSearch={(q) => filter({ q: q || undefined })}
          />
        </RecordListToolbar>
        <RecordListToolbar>
          <ConversationFilter
            label="Filter by user"
            all="All users"
            value={search.userId}
            options={users.map((user) => ({
              ...user,
              name: `${user.name} (${user.email})`,
            }))}
            onChange={(userId) => filter({ userId })}
          />
          <ConversationFilter
            label="Filter by Application"
            all="All Applications"
            value={search.applicationId}
            options={applications}
            onChange={(applicationId) => filter({ applicationId })}
          />
        </RecordListToolbar>
        <RecordListToolbar>
          <ConversationFilter
            label="Filter by Filed Issue"
            all="Any Filed Issues"
            value={search.hasIssue}
            options={[
              { id: "yes", name: "Has Filed Issue" },
              { id: "no", name: "No Filed Issues" },
            ]}
            onChange={(hasIssue) =>
              filter({ hasIssue: hasIssue as "yes" | "no" | undefined })
            }
          />
        </RecordListToolbar>
        {conversations.length ? (
          <RecordList label="All Conversations">
            {conversations.map((row) => (
              <RecordRow
                key={row.id}
                link={
                  <Link
                    to="/admin/conversations/$conversationId"
                    params={{ conversationId: row.id }}
                    search={search}
                  />
                }
                selected={selectedId === row.id}
                icon={<MessageSquareIcon />}
                name={row.title}
                property={`${row.issueCount} ${row.issueCount === 1 ? "issue" : "issues"}`}
                detail={
                  <>
                    <span className="block truncate">
                      {row.user.name} · {row.application.name}
                    </span>
                    <time
                      className="block"
                      suppressHydrationWarning
                      dateTime={new Date(row.updatedAt).toISOString()}
                    >
                      {activityTime(row.updatedAt)}
                    </time>
                    {row.deletedAt && (
                      <Badge variant="outline" className="mr-1 text-xs">
                        Deleted by user
                      </Badge>
                    )}
                    {row.refused && (
                      <Badge variant="outline" className="text-xs">
                        Guardrail refusal
                      </Badge>
                    )}
                  </>
                }
                detailLines={4}
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<MessageSquareIcon />}
            title="No Conversations match"
            description="Try different filters, or wait for a user to start a Conversation."
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
      <Outlet />
    </>
  )
}
