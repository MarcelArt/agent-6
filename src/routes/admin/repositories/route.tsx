import { useEffect } from "react"
import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router"
import {
  CircleAlertIcon,
  FolderGit2Icon,
  GitBranchIcon,
  PlusIcon,
  TagIcon,
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
import {
  StatusIcon,
  StatusLine,
  isBusy,
} from "@/components/repositories/repository-status"
import { DetailPane, ListPane } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { syncState } from "@/lib/repositories"
import {
  getRepositorySyncStates,
  listRepositories,
} from "@/server/repositories.functions"

/** How often the screen asks for the sync states while a sync is waiting or running. */
const REFRESH_MS = 2000

export const Route = createFileRoute("/admin/repositories")({
  // The list's search and page. They stay in the address while a Repository is open.
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ search: search.q, page: search.page }),
  loader: ({ deps }) => listRepositories({ data: deps }),
  head: () => ({ meta: [{ title: "Repositories · Agent 6" }] }),
  component: Layout,
})

function Layout() {
  const { repositories, total, page, pageSize, now, tokenMissing } =
    Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const selectedId = useParams({
    strict: false,
    select: (params) => params.repositoryId,
  })
  // At phone width the list shows only at /admin/repositories itself.
  const onList =
    useMatch({ from: "/admin/repositories/", shouldThrow: false }) !== undefined
  const open = useMatch({
    from: "/admin/repositories/$repositoryId",
    shouldThrow: false,
    select: (match) => match.loaderData?.repository,
  })

  // Syncs run in the background, so follow them. While a shown Repository
  // is waiting or syncing, ask for the sync states now and then, and reload
  // the screen when they differ from what it shows.
  const shown = open ? [...repositories, open] : repositories
  const busy = shown.some((repository) => isBusy(repository.status))
  const states = JSON.stringify(
    shown.map((repository) => [repository.id, syncState(repository)])
  )
  useEffect(() => {
    if (!busy) return
    const onScreen = new Map<string, string>(JSON.parse(states))
    const timer = setInterval(() => {
      getRepositorySyncStates({ data: { repositoryIds: [...onScreen.keys()] } })
        .then((current) => {
          const moved = [...onScreen].some(
            ([id, state]) => current[id] !== state
          )
          if (moved) void router.invalidate()
        })
        // A request that fails is tried again at the next turn.
        .catch(() => undefined)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [busy, states, router])

  const none = total === 0 && !search.q

  return (
    <>
      <ListPane aria-label="Repositories" phone={onList ? "shown" : "hidden"}>
        <RecordListHeader
          title="Repositories"
          count={none ? undefined : total}
          addLabel="Connect repository"
          addLink={<Link to="/admin/repositories/new" search={search} />}
        />
        {!none && (
          <RecordListToolbar>
            <RecordSearch
              label="Search repositories"
              value={search.q ?? ""}
              onSearch={(q) =>
                // "." keeps the open Repository or form; only the list changes.
                void navigate({
                  to: ".",
                  search: { q: q || undefined },
                  replace: true,
                })
              }
            />
          </RecordListToolbar>
        )}
        {tokenMissing && (
          <div className={none ? "p-2 pb-0" : "px-2 pb-2"}>
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>The GitHub token is missing</AlertTitle>
              <AlertDescription>
                Nothing can be connected or synced. Set GITHUB_TOKEN in the
                server's environment, then restart Agent 6.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {repositories.length > 0 ? (
          <RecordList label="Repositories">
            {repositories.map((repository) => (
              <RecordRow
                key={repository.id}
                link={
                  <Link
                    to="/admin/repositories/$repositoryId"
                    params={{ repositoryId: repository.id }}
                    search={search}
                  />
                }
                selected={repository.id === selectedId}
                icon={<StatusIcon status={repository.status} />}
                name={repository.fullName}
                property={
                  <span
                    className="flex items-center gap-1"
                    title="Tracked Branch"
                  >
                    <GitBranchIcon />
                    <span className="max-w-28 truncate">
                      {repository.trackedBranch}
                    </span>
                  </span>
                }
                detail={<StatusLine repository={repository} now={now} />}
                detailLines={repository.status === "failed" ? 2 : 1}
                secondary={
                  repository.status !== "failed" &&
                  repository.tags.length > 0 && (
                    <span
                      className="flex min-w-0 items-center gap-1"
                      title={`Tags: ${repository.tags.join(", ")}`}
                    >
                      <TagIcon className="shrink-0" />
                      {/* All Tags on a phone, the first and a count on desktop. */}
                      <span className="max-w-40 truncate md:hidden">
                        {repository.tags.join(", ")}
                      </span>
                      <span className="hidden max-w-28 truncate md:inline">
                        {repository.tags[0]}
                        {repository.tags.length > 1 &&
                          ` +${repository.tags.length - 1}`}
                      </span>
                    </span>
                  )
                }
              />
            ))}
          </RecordList>
        ) : none ? (
          <RecordListEmpty
            icon={<FolderGit2Icon />}
            title="No Repositories yet"
            description="Connect a GitHub repository so the agent can read its code."
          >
            <ConnectRepositoryLink />
          </RecordListEmpty>
        ) : (
          <RecordListEmpty
            icon={<FolderGit2Icon />}
            title="No Repositories match"
            description={`No Repository's name or Tags contain "${search.q ?? ""}". Try fewer letters.`}
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

/** The primary button of the section, for empty states and hints. */
export function ConnectRepositoryLink() {
  const search = Route.useSearch()
  return (
    <Link
      to="/admin/repositories/new"
      search={search}
      className={buttonVariants()}
    >
      <PlusIcon />
      Connect repository
    </Link>
  )
}
