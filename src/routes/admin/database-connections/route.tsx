import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import {
  DatabaseIcon,
  KeyRoundIcon,
  PlusIcon,
  CircleCheckIcon,
  CircleAlertIcon,
  TriangleAlertIcon,
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
import { listDatabaseConnections } from "@/server/database-connections.functions"

export const Route = createFileRoute("/admin/database-connections")({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listDatabaseConnections({ data: deps }),
  head: () => ({ meta: [{ title: "Database Connections · Agent 6" }] }),
  component: Layout,
})
function Layout() {
  const { connections, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.databaseConnectionId,
  })
  const onList =
    useMatch({ from: "/admin/database-connections/", shouldThrow: false }) !==
    undefined
  const none = total === 0 && !search.q
  return (
    <>
      <ListPane
        aria-label="Database Connections"
        phone={onList ? "shown" : "hidden"}
      >
        <RecordListHeader
          title="Database Connections"
          count={total}
          addLabel="Add Database Connection"
          addLink={
            <Link to="/admin/database-connections/new" search={search} />
          }
        />
        {!none && (
          <RecordListToolbar>
            <RecordSearch
              label="Search Database Connections"
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
          <RecordList label="Database Connections">
            {connections.map((connection) => (
              <RecordRow
                key={connection.id}
                link={
                  <Link
                    to="/admin/database-connections/$databaseConnectionId"
                    params={{ databaseConnectionId: connection.id }}
                    search={search}
                  />
                }
                selected={selectedId === connection.id}
                icon={
                  connection.needsSecret ? (
                    <KeyRoundIcon className="text-muted-foreground" />
                  ) : connection.test.ok ? (
                    connection.test.writable ? (
                      <TriangleAlertIcon className="text-muted-foreground" />
                    ) : (
                      <CircleCheckIcon className="text-muted-foreground" />
                    )
                  ) : (
                    <CircleAlertIcon className="text-destructive" />
                  )
                }
                name={connection.name}
                property={connection.needsSecret && <NeedsSecretBadge />}
                detail={
                  connection.needsSecret
                    ? "Enter the password so the agent can use it"
                    : !connection.test.ok
                      ? connection.test.message
                      : connection.test.writable
                        ? "Writable role · Supply a read-only role"
                        : "Ready"
                }
                secondary={connection.tags.join(", ")}
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<DatabaseIcon />}
            title={
              none
                ? "No Database Connections yet"
                : "No Database Connections match"
            }
            description={
              none
                ? "Connect a Postgres database so the agent can query it, read-only."
                : "Try a different name or description."
            }
          >
            {none && <NewDatabaseConnectionLink />}
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
export function NewDatabaseConnectionLink() {
  const search = Route.useSearch()
  return (
    <Link
      to="/admin/database-connections/new"
      search={search}
      className={buttonVariants()}
    >
      <PlusIcon />
      Add Database Connection
    </Link>
  )
}
