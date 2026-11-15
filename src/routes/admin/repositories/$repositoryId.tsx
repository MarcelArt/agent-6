import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  EllipsisIcon,
  FolderGit2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { ConnectRepositoryLink } from "./route"
import {
  ConfirmDialog,
  DetailActions,
  DetailHeader,
  DetailHint,
  FormError,
} from "@/components/records/record-detail"
import { RepositoryForm } from "@/components/repositories/repository-form"
import {
  StatusIcon,
  isBusy,
  lastSynced,
  statusLabels,
} from "@/components/repositories/repository-status"
import { FieldSet, FieldLegend, FieldDescription } from "@/components/ui/field"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getRepository,
  removeRepository,
  syncRepository,
  updateRepository,
} from "@/server/repositories.functions"

export const Route = createFileRoute("/admin/repositories/$repositoryId")({
  loader: ({ params }) =>
    getRepository({ data: { repositoryId: params.repositoryId } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.repository.fullName ?? "Repository"} · Agent 6`,
      },
    ],
  }),
  component: Page,
  notFoundComponent: NotFound,
})

const UNREACHABLE =
  "Agent 6 could not be reached, so nothing was changed. Check your connection, then try again."

function Page() {
  const { repository, applications, now } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<{ message: string }>()
  const synced = lastSynced(repository, now)

  async function syncNow() {
    setProblem(undefined)
    setPending(true)
    try {
      const result = await syncRepository({
        data: { repositoryId: repository.id },
      })
      if (!result.ok) setProblem(result)
      await router.invalidate()
    } catch {
      setProblem({ message: UNREACHABLE })
    }
    setPending(false)
  }

  async function remove() {
    setProblem(undefined)
    setPending(true)
    try {
      const result = await removeRepository({
        data: { repositoryId: repository.id },
      })
      if (result.ok) {
        await router.navigate({ to: "/admin/repositories", search })
        await router.invalidate()
        return
      }
      setProblem(result)
    } catch {
      setProblem({ message: UNREACHABLE })
    }
    setPending(false)
    setConfirming(false)
  }

  return (
    <>
      <DetailHeader
        title={repository.fullName}
        backLabel="Back to Repositories"
        backLink={<Link to="/admin/repositories" search={search} />}
      >
        <Badge variant="outline" className="text-xs">
          <StatusIcon status={repository.status} />
          {statusLabels[repository.status]}
        </Badge>
        <span className="hidden truncate text-xs text-muted-foreground lg:inline">
          {synced}
        </span>
        <DetailActions>
          <Button
            variant="outline"
            size="sm"
            disabled={pending || isBusy(repository.status)}
            onClick={() => void syncNow()}
          >
            <RefreshCwIcon />
            <span className="max-sm:sr-only">Sync now</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                  title="More actions"
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2Icon />
                Remove repository
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DetailActions>
      </DetailHeader>
      <RepositoryForm
        // A fresh form for each Repository. Syncs refresh the page under it
        // without touching what the Admin has typed.
        key={repository.id}
        repository={repository}
        problem={problem}
        notice={
          <>
            <p className="text-xs text-muted-foreground lg:hidden">{synced}</p>
            <FieldSet>
              <FieldLegend>Applications</FieldLegend>
              {applications.length ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {applications.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
              ) : (
                <FieldDescription>
                  No Applications have this Repository attached.
                </FieldDescription>
              )}
            </FieldSet>
            {repository.status === "failed" && (
              <FormError title="The last sync failed">
                {repository.error ?? "Agent 6 could not sync this Repository."}
                {repository.lastSyncedAt !== null &&
                  " The agent keeps reading the code from the last sync that worked."}
              </FormError>
            )}
          </>
        }
        save={(values) =>
          updateRepository({ data: { repositoryId: repository.id, ...values } })
        }
        onSaved={async () => {
          await router.invalidate()
          await router.navigate({ to: "/admin/repositories", search })
        }}
        cancel={
          <Link
            to="/admin/repositories"
            search={search}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        }
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${repository.fullName}?`}
        description={
          <>
            {applications.length > 0 &&
              `It is attached to ${applications.join(", ")}. The agent can no longer read this code for ${applications.length === 1 ? "that Application" : "those Applications"}. `}
            Agent 6 deletes its copy of the code. Nothing changes on GitHub, and
            you can connect the repository again later.
          </>
        }
        confirmLabel="Remove repository"
        pending={pending}
        onConfirm={() => void remove()}
      />
    </>
  )
}

function NotFound() {
  return (
    <DetailHint
      icon={<FolderGit2Icon />}
      title="Repository not found"
      description="No Repository has this address. Pick one from the list, or connect a new one."
    >
      <ConnectRepositoryLink />
    </DetailHint>
  )
}
