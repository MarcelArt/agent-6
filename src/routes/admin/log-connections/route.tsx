import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  ScrollTextIcon,
  KeyRoundIcon,
  PlusIcon,
  CircleCheckIcon,
  CircleAlertIcon,
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
import { NeedsSecretBadge } from "@/components/connections/needs-secret"
import { DetailPane, ListPane } from "@/components/shell/panes"
import { buttonVariants } from "@/components/ui/button"
import { listLogConnections } from "@/server/log-connections.functions"

export const Route = createFileRoute("/admin/log-connections")({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listLogConnections({ data: deps }),
  head: () => ({ meta: [{ title: "Log Connections · Agent 6" }] }),
  component: Layout,
})
function Layout() {
  const { connections, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.logConnectionId,
  })
  const onList =
    useMatch({ from: "/admin/log-connections/", shouldThrow: false }) !==
    undefined
  const none = total === 0 && !search.q
  return (
    <>
      <ListPane
        aria-label="Log Connections"
        phone={onList ? "shown" : "hidden"}
      >
        <RecordListHeader
          title="Log Connections"
          count={total}
          addLabel="Add Log Connection"
          addLink={<Link to="/admin/log-connections/new" search={search} />}
        />
        {!none && (
          <RecordListToolbar>
            <RecordSearch
              label="Search Log Connections"
              value={search.q ?? ""}
              onSearch={(q) =>
                void navigate({
                  to: ".",
                  search: { q: q || undefined },
                  replace: true,
                })
              }
            />
          </RecordListToolbar>
        )}
        {connections.length ? (
          <RecordList label="Log Connections">
            {connections.map((connection) => (
              <RecordRow
                key={connection.id}
                link={
                  <Link
                    to="/admin/log-connections/$logConnectionId"
                    params={{ logConnectionId: connection.id }}
                    search={search}
                  />
                }
                selected={selectedId === connection.id}
                icon={
                  connection.needsSecret ? (
                    <KeyRoundIcon className="text-muted-foreground" />
                  ) : connection.test.ok ? (
                    <CircleCheckIcon className="text-muted-foreground" />
                  ) : (
                    <CircleAlertIcon className="text-destructive" />
                  )
                }
                name={connection.name}
                property={connection.needsSecret && <NeedsSecretBadge />}
                detail={
                  connection.needsSecret
                    ? `Enter the ${connection.authType === "basic" ? "password" : "token"} so the agent can use it`
                    : connection.test.ok
                      ? "Ready"
                      : connection.test.message
                }
                secondary={connection.tags.join(", ")}
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<ScrollTextIcon />}
            title={none ? "No Log Connections yet" : "No Log Connections match"}
            description={
              none
                ? "Connect a Loki endpoint so the agent can read logs."
                : "Try a different name or description."
            }
          >
            {none && <NewLogConnectionLink />}
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
export function NewLogConnectionLink() {
  const search = Route.useSearch()
  return (
    <Link
      to="/admin/log-connections/new"
      search={search}
      className={buttonVariants()}
    >
      <PlusIcon />
      Add Log Connection
    </Link>
  )
}
