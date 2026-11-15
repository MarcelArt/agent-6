import {
  attachDatabaseConnection,
  detachDatabaseConnection,
  listAvailableDatabaseConnections,
} from "@/server/database-connections.functions"
import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  BoxesIcon,
  DatabaseIcon,
  EllipsisIcon,
  FolderGit2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { z } from "zod"
import { NewApplicationLink } from "./route"
import { ApplicationForm } from "@/components/applications/application-form"
import {
  ConfirmDialog,
  DetailActions,
  DetailHeader,
  DetailHint,
  FormError,
} from "@/components/records/record-detail"
import {
  RecordPagination,
  RecordSearch,
} from "@/components/records/record-list"
import {
  StatusIcon,
  statusLabels,
} from "@/components/repositories/repository-status"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field"
import {
  attachRepository,
  deleteApplication,
  detachRepository,
  getApplication,
  listAvailableRepositories,
  updateApplication,
} from "@/server/applications.functions"

export const Route = createFileRoute("/admin/applications/$applicationId")({
  validateSearch: z.object({
    attach: z
      .enum(["repository", "database-connection"])
      .optional()
      .catch(undefined),
    attachQ: z.string().optional().catch(undefined),
    attachPage: z.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({
    attach: search.attach,
    search: search.attachQ,
    page: search.attachPage,
  }),
  loader: async ({ params, deps }) => {
    const scope = await getApplication({ data: params })
    const available =
      deps.attach === "repository"
        ? await listAvailableRepositories({
            data: { ...params, search: deps.search, page: deps.page },
          })
        : null
    const availableConnections =
      deps.attach === "database-connection"
        ? await listAvailableDatabaseConnections({
            data: { ...params, search: deps.search, page: deps.page },
          })
        : null
    return { ...scope, available, availableConnections }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.application.name ?? "Application"} · Agent 6` },
    ],
  }),
  component: Page,
  notFoundComponent: () => (
    <DetailHint
      icon={<BoxesIcon />}
      title="Application not found"
      description="Pick an Application from the list, or create a new one."
    >
      <NewApplicationLink />
    </DetailHint>
  ),
})

const UNREACHABLE =
  "Agent 6 could not complete this change. Check your connection, then try again."
function Page() {
  const { application, attachments, available, availableConnections } =
    Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<{ message: string }>()
  const [attachmentProblem, setAttachmentProblem] = useState<string>()
  const repositories = attachments.filter((item) => item.kind === "repository")
  const connections = attachments.filter(
    (item) => item.kind === "database-connection"
  )
  const listSearch = { q: search.q, page: search.page }
  async function closePicker() {
    await router.navigate({
      to: "/admin/applications/$applicationId",
      params: { applicationId: application.id },
      search: listSearch,
    })
  }
  async function remove() {
    setPending(true)
    setProblem(undefined)
    try {
      const result = await deleteApplication({
        data: { applicationId: application.id },
      })
      if (result.ok) {
        await router.navigate({ to: "/admin/applications", search: listSearch })
        await router.invalidate()
      } else setProblem(result)
    } catch {
      setProblem({ message: UNREACHABLE })
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }
  async function changeAttachment(repositoryId: string, add: boolean) {
    setPending(true)
    setAttachmentProblem(undefined)
    try {
      const result = await (add ? attachRepository : detachRepository)({
        data: { applicationId: application.id, repositoryId },
      })
      if (result.ok) {
        if (add) await closePicker()
        await router.invalidate()
      } else setAttachmentProblem(result.message)
    } catch {
      setAttachmentProblem(UNREACHABLE)
    } finally {
      setPending(false)
    }
  }
  async function changeDatabaseAttachment(
    databaseConnectionId: string,
    add: boolean
  ) {
    setPending(true)
    setAttachmentProblem(undefined)
    try {
      const result = await (
        add ? attachDatabaseConnection : detachDatabaseConnection
      )({ data: { applicationId: application.id, databaseConnectionId } })
      if (result.ok) {
        if (add) await closePicker()
        await router.invalidate()
      } else setAttachmentProblem(result.message)
    } catch {
      setAttachmentProblem(UNREACHABLE)
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <DetailHeader
        title={application.name}
        backLabel="Back to Applications"
        backLink={<Link to="/admin/applications" search={listSearch} />}
      >
        <DetailActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                  disabled={pending}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2Icon />
                Delete Application
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DetailActions>
      </DetailHeader>
      <ApplicationForm
        key={application.id}
        application={application}
        problem={problem}
        save={(values) =>
          updateApplication({
            data: { applicationId: application.id, ...values },
          })
        }
        onSaved={async () => {
          await router.invalidate()
          await router.navigate({
            to: "/admin/applications",
            search: listSearch,
          })
        }}
        cancel={
          <Link
            to="/admin/applications"
            search={listSearch}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        }
      >
        <FieldSet>
          <FieldLegend>Attachments</FieldLegend>
          <FieldDescription>
            Attached resources are the code and connections the agent can use
            for this Application.
          </FieldDescription>
          {attachmentProblem && !search.attach && (
            <FormError title="Attachment unchanged">
              {attachmentProblem}
            </FormError>
          )}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium">Repositories</h2>
            <Link
              to="/admin/applications/$applicationId"
              params={{ applicationId: application.id }}
              search={{ ...listSearch, attach: "repository" }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={() => setAttachmentProblem(undefined)}
            >
              <PlusIcon />
              Add Repository
            </Link>
          </div>
          {repositories.length ? (
            <ul className="divide-y rounded-md border">
              {repositories.map(({ kind, resource }) => (
                <li
                  key={`${kind}:${resource.id}`}
                  className="flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <FolderGit2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      to="/admin/repositories/$repositoryId"
                      params={{ repositoryId: resource.id }}
                      className="truncate text-xs font-medium underline-offset-4 hover:underline"
                    >
                      {resource.fullName}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {resource.trackedBranch} · {statusLabels[resource.status]}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${resource.fullName}`}
                          disabled={pending}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          void changeAttachment(resource.id, false)
                        }
                      >
                        <Trash2Icon />
                        Remove Attachment
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              No Repositories attached. Add one so the agent can read its code
              for this Application.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium">Database Connections</h2>
            <Link
              to="/admin/applications/$applicationId"
              params={{ applicationId: application.id }}
              search={{ ...listSearch, attach: "database-connection" }}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={() => setAttachmentProblem(undefined)}
            >
              <PlusIcon />
              Add Database Connection
            </Link>
          </div>
          {connections.length ? (
            <ul className="divide-y rounded-md border">
              {connections.map(({ resource }) => (
                <li
                  key={resource.id}
                  className="flex min-w-0 items-center gap-2 px-3 py-2"
                >
                  <DatabaseIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      to="/admin/database-connections/$databaseConnectionId"
                      params={{ databaseConnectionId: resource.id }}
                      className="truncate text-xs font-medium underline-offset-4 hover:underline"
                    >
                      {resource.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {!resource.test.ok
                        ? "Connection test failed"
                        : resource.test.writable
                          ? "Writable role · Supply a read-only role"
                          : "Read-only role"}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${resource.name}`}
                          disabled={pending}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            void changeDatabaseAttachment(resource.id, false)
                          }
                        >
                          <Trash2Icon />
                          Remove Attachment
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              No Database Connections attached. Add one so the agent can read
              this Application’s data.
            </p>
          )}
          <FieldDescription>
            Attachment changes take effect immediately.
          </FieldDescription>
        </FieldSet>
      </ApplicationForm>
      <Dialog
        open={search.attach === "repository"}
        onOpenChange={(open) => {
          if (!open) void closePicker()
        }}
      >
        <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              Choose a connected Repository to attach to {application.name}.
            </DialogDescription>
          </DialogHeader>
          {attachmentProblem && (
            <FormError title="Attachment unchanged">
              {attachmentProblem}
            </FormError>
          )}
          <RecordSearch
            label="Search available Repositories"
            value={search.attachQ ?? ""}
            onSearch={(q) =>
              void router.navigate({
                to: ".",
                search: {
                  ...search,
                  attachQ: q || undefined,
                  attachPage: undefined,
                },
                replace: true,
              })
            }
          />
          {available && (
            <>
              {available.repositories.length ? (
                <ul className="min-h-0 divide-y overflow-y-auto">
                  {available.repositories.map((repository) => (
                    <li
                      key={repository.id}
                      className="flex items-center gap-2 py-2"
                    >
                      <span className="shrink-0 [&_svg]:size-3.5">
                        <StatusIcon status={repository.status} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium">
                          {repository.fullName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {repository.trackedBranch} ·{" "}
                          {statusLabels[repository.status]}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        aria-label={`Attach ${repository.fullName}`}
                        onClick={() =>
                          void changeAttachment(repository.id, true)
                        }
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">
                  {search.attachQ
                    ? "No available Repositories match this search."
                    : "All connected Repositories are already attached, or none are connected yet."}
                </p>
              )}
              <RecordPagination
                {...available}
                pageLink={(target) => (
                  <Link to="." search={{ ...search, attachPage: target }} />
                )}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={search.attach === "database-connection"}
        onOpenChange={(open) => {
          if (!open) void closePicker()
        }}
      >
        <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Database Connection</DialogTitle>
            <DialogDescription>
              Choose a Database Connection to attach to {application.name}.
            </DialogDescription>
          </DialogHeader>
          {attachmentProblem && (
            <FormError title="Attachment unchanged">
              {attachmentProblem}
            </FormError>
          )}
          <RecordSearch
            label="Search available Database Connections"
            value={search.attachQ ?? ""}
            onSearch={(q) =>
              void router.navigate({
                to: ".",
                search: {
                  ...search,
                  attachQ: q || undefined,
                  attachPage: undefined,
                },
                replace: true,
              })
            }
          />
          {availableConnections && (
            <>
              {availableConnections.connections.length ? (
                <ul className="min-h-0 divide-y overflow-y-auto">
                  {availableConnections.connections.map((connection) => (
                    <li
                      key={connection.id}
                      className="flex items-center gap-2 py-2"
                    >
                      <DatabaseIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium">
                          {connection.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {connection.description || "No description"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        aria-label={`Attach ${connection.name}`}
                        onClick={() =>
                          void changeDatabaseAttachment(connection.id, true)
                        }
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-xs text-muted-foreground">
                  {search.attachQ
                    ? "No available Database Connections match this search."
                    : "All Database Connections are already attached, or none have been added yet."}
                </p>
              )}
              <RecordPagination
                {...availableConnections}
                pageLink={(target) => (
                  <Link to="." search={{ ...search, attachPage: target }} />
                )}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${application.name}?`}
        description={`This removes the Application and its ${attachments.length} ${attachments.length === 1 ? "Attachment" : "Attachments"}. The resources and their Attachments to other Applications are kept.`}
        confirmLabel="Delete Application"
        pending={pending}
        onConfirm={() => void remove()}
      />
    </>
  )
}
