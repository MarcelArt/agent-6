import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { BoxesIcon, PlusIcon } from "lucide-react"
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
import { listApplications } from "@/server/applications.functions"

export const Route = createFileRoute("/admin/applications")({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listApplications({ data: deps }),
  head: () => ({ meta: [{ title: "Applications · Agent 6" }] }),
  component: Layout,
})
function Layout() {
  const { applications, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.applicationId,
  })
  const onList =
    useMatch({ from: "/admin/applications/", shouldThrow: false }) !== undefined
  const none = total === 0 && !search.q
  return (
    <>
      <ListPane aria-label="Applications" phone={onList ? "shown" : "hidden"}>
        <RecordListHeader
          title="Applications"
          count={total}
          addLabel="New Application"
          addLink={<Link to="/admin/applications/new" search={search} />}
        />
        {!none && (
          <RecordListToolbar>
            <RecordSearch
              label="Search Applications"
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
        {applications.length ? (
          <RecordList label="Applications">
            {applications.map((application) => (
              <RecordRow
                key={application.id}
                link={
                  <Link
                    to="/admin/applications/$applicationId"
                    params={{ applicationId: application.id }}
                    search={search}
                  />
                }
                selected={selectedId === application.id}
                icon={<BoxesIcon className="text-muted-foreground" />}
                name={application.name}
                detail={application.description || "No description"}
                secondary={`${application.repositoryCount} ${application.repositoryCount === 1 ? "Repository" : "Repositories"}`}
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<BoxesIcon />}
            title={none ? "No Applications yet" : "No Applications match"}
            description={
              none
                ? "Create an Application so Clients can ask the agent about it."
                : "Try a different name or description."
            }
          >
            {none && <NewApplicationLink />}
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
export function NewApplicationLink() {
  const search = Route.useSearch()
  return (
    <Link
      to="/admin/applications/new"
      search={search}
      className={buttonVariants()}
    >
      <PlusIcon />
      New Application
    </Link>
  )
}
