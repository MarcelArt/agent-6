import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
  useMatch,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router"
import {
  BoxesIcon,
  CircleCheckIcon,
  DownloadIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { z } from "zod"
import { ExportDialog } from "@/components/applications/export-dialog"
import { ImportDialog } from "@/components/applications/import-dialog"
import {
  RecordList,
  RecordListAction,
  RecordListEmpty,
  RecordListHeader,
  RecordListToolbar,
  RecordPagination,
  RecordRow,
  RecordSearch,
} from "@/components/records/record-list"
import { DetailPane, ListPane } from "@/components/shell/panes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { describeCounts } from "@/lib/setup-file"
import type { SetupFileImportSummary } from "@/lib/setup-file"
import { listApplications } from "@/server/applications.functions"
import { getSetupFileExportOptions } from "@/server/setup-file.functions"

export const Route = createFileRoute("/admin/applications")({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
    /** The Export or Import dialog, open over the list. */
    dialog: z.enum(["export", "import"]).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({
    search: search.q,
    page: search.page,
    dialog: search.dialog,
  }),
  loader: async ({ deps: { dialog, ...deps } }) => {
    const [page, exportOptions] = await Promise.all([
      listApplications({ data: deps }),
      dialog === "export" ? getSetupFileExportOptions() : null,
    ])
    return { ...page, exportOptions }
  },
  head: () => ({ meta: [{ title: "Applications · Agent 6" }] }),
  component: Layout,
})
function Layout() {
  const { applications, total, page, pageSize, exportOptions } =
    Route.useLoaderData()
  const { dialog, ...search } = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const imported = useLocation({
    select: (location) => location.state.setupImport,
  })
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
          actions={
            <>
              <RecordListAction
                label="Import Setup File"
                link={
                  <Link
                    to="/admin/applications"
                    search={{ ...search, dialog: "import" }}
                  />
                }
              >
                <UploadIcon />
              </RecordListAction>
              <RecordListAction
                label="Export Setup File"
                link={
                  <Link
                    to="/admin/applications"
                    search={{ ...search, dialog: "export" }}
                  />
                }
              >
                <DownloadIcon />
              </RecordListAction>
            </>
          }
        />
        {imported && (
          <ImportSummary
            summary={imported}
            onDismiss={() =>
              void navigate({ to: ".", search, replace: true, state: {} })
            }
          />
        )}
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
      {dialog === "export" && exportOptions && (
        <ExportDialog
          options={exportOptions}
          onClose={() => void navigate({ to: ".", search })}
        />
      )}
      {dialog === "import" && (
        <ImportDialog
          onClose={() => void navigate({ to: ".", search })}
          onImported={async (summary) => {
            await navigate({
              to: "/admin/applications",
              search,
              state: { setupImport: summary },
            })
            await router.invalidate()
          }}
        />
      )}
    </>
  )
}

/** What the last import did, until the Admin dismisses it or moves on. */
function ImportSummary({
  summary,
  onDismiss,
}: {
  summary: SetupFileImportSummary
  onDismiss: () => void
}) {
  const created = describeCounts(summary.created)
  const reused = describeCounts(summary.reused)
  const applications = (count: number) =>
    count ? `${count} ${count === 1 ? "Application" : "Applications"}` : ""
  const list = (...parts: Array<string>) =>
    parts.filter(Boolean).join(", ") || "nothing"
  return (
    <div className="px-2 pt-2">
      <Alert aria-live="polite">
        <CircleCheckIcon />
        <AlertTitle className="pr-6">Setup File imported</AlertTitle>
        <AlertDescription>
          <ul className="flex flex-col gap-0.5">
            <li>
              Created{" "}
              {list(applications(summary.created.applications), created)}.
            </li>
            <li>
              Reused unchanged:{" "}
              {list(applications(summary.reused.applications), reused)}.
            </li>
            <li>
              Added {summary.attachments}{" "}
              {summary.attachments === 1 ? "Attachment" : "Attachments"}.
            </li>
            {summary.needsSecret > 0 && (
              <li>
                {summary.needsSecret}{" "}
                {summary.needsSecret === 1
                  ? "connection needs its secret"
                  : "connections need their secrets"}{" "}
                before the agent can use{" "}
                {summary.needsSecret === 1 ? "it" : "them"}.
              </li>
            )}
          </ul>
        </AlertDescription>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss import summary"
          className="absolute top-1 right-1"
          onClick={onDismiss}
        >
          <XIcon />
        </Button>
      </Alert>
    </div>
  )
}
export function NewApplicationLink() {
  const { dialog: _dialog, ...search } = Route.useSearch()
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
