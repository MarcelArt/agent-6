import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { KeyRoundIcon, PlusIcon } from "lucide-react"
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
import { AccountStatusIcon } from "@/components/service-accounts/status"
import { DetailPane, ListPane } from "@/components/shell/panes"
import { buttonVariants } from "@/components/ui/button"
import { listServiceAccounts } from "@/server/service-accounts.functions"

export const Route = createFileRoute("/admin/service-accounts")({
  // The list's search and page stay in the address while a record is open.
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listServiceAccounts({ data: deps }),
  head: () => ({ meta: [{ title: "Service Accounts · Agent 6" }] }),
  component: Layout,
})

function Layout() {
  const { serviceAccounts, total, page, pageSize } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.serviceAccountId,
  })
  // At phone width the list shows only at /admin/service-accounts itself.
  const onList =
    useMatch({ from: "/admin/service-accounts/", shouldThrow: false }) !==
    undefined

  return (
    <>
      <ListPane
        aria-label="Service Accounts"
        phone={onList ? "shown" : "hidden"}
      >
        <RecordListHeader
          title="Service Accounts"
          count={total}
          addLabel="New Service Account"
          addLink={<Link to="/admin/service-accounts/new" search={search} />}
        />
        <RecordListToolbar>
          <RecordSearch
            label="Search Service Accounts"
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
        {serviceAccounts.length > 0 ? (
          <RecordList label="Service Accounts">
            {serviceAccounts.map((account) => (
              <RecordRow
                key={account.id}
                link={
                  <Link
                    to="/admin/service-accounts/$serviceAccountId"
                    params={{ serviceAccountId: account.id }}
                    search={search}
                  />
                }
                selected={account.id === selectedId}
                icon={<AccountStatusIcon disabled={account.disabled} />}
                name={account.name}
                property={`${account.activeKeys} active ${account.activeKeys === 1 ? "key" : "keys"}`}
                detail={
                  account.disabled
                    ? "Disabled"
                    : account.description || "Active"
                }
              />
            ))}
          </RecordList>
        ) : (
          <RecordListEmpty
            icon={<KeyRoundIcon />}
            title={
              search.q ? "No Service Accounts match" : "No Service Accounts yet"
            }
            description={
              search.q
                ? `No name or description contains "${search.q}". Try fewer letters.`
                : "Create one for each integration that uses the Agent 6 API."
            }
          >
            {!search.q && <NewServiceAccountLink />}
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
export function NewServiceAccountLink() {
  const search = Route.useSearch()
  return (
    <Link
      to="/admin/service-accounts/new"
      search={search}
      className={buttonVariants()}
    >
      <PlusIcon />
      New Service Account
    </Link>
  )
}
