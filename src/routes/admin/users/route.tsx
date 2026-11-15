import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { BanIcon, CircleCheckIcon, PlusIcon, UsersIcon } from "lucide-react"
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
import { roleLabels } from "@/lib/roles"
import { listUsers } from "@/server/users.functions"

export const Route = createFileRoute("/admin/users")({
  // The list's search and page. They stay in the address while a user is open.
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listUsers({ data: deps }),
  head: () => ({ meta: [{ title: "Users · Agent 6" }] }),
  component: Layout,
})

function Layout() {
  const { users, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const { user: me } = Route.useRouteContext()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.userId,
  })
  // At phone width the list shows only at /admin/users itself.
  const onList =
    useMatch({ from: "/admin/users/", shouldThrow: false }) !== undefined

  return (
    <>
      <ListPane aria-label="Users" phone={onList ? "shown" : "hidden"}>
        <RecordListHeader
          title="Users"
          count={total}
          addLabel="New user"
          addLink={<Link to="/admin/users/new" search={search} />}
        />
        <RecordListToolbar>
          <RecordSearch
            label="Search users"
            value={search.q ?? ""}
            onSearch={(q) =>
              // "." keeps the open user or form; only the list changes.
              void navigate({
                to: ".",
                search: { q: q || undefined },
                replace: true,
              })
            }
          />
        </RecordListToolbar>
        {users.length > 0 ? (
          <RecordList label="Users">
            {users.map((user) => (
              <RecordRow
                key={user.id}
                link={
                  <Link
                    to="/admin/users/$userId"
                    params={{ userId: user.id }}
                    search={search}
                  />
                }
                selected={user.id === selectedId}
                icon={
                  user.disabled ? (
                    <BanIcon className="text-muted-foreground" />
                  ) : (
                    <CircleCheckIcon className="text-muted-foreground" />
                  )
                }
                name={user.id === me.id ? `${user.name} (you)` : user.name}
                property={roleLabels[user.role]}
                detail={user.email}
                secondary={user.disabled ? "Disabled" : undefined}
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<UsersIcon />}
            title="No users match"
            description={`Nobody's name or email contains "${search.q ?? ""}". Try fewer letters.`}
          />
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
export function NewUserLink() {
  const search = Route.useSearch()
  return (
    <Link to="/admin/users/new" search={search} className={buttonVariants()}>
      <PlusIcon />
      New user
    </Link>
  )
}
