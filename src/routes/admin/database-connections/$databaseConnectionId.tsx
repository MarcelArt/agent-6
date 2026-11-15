import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  DatabaseIcon,
  EllipsisIcon,
  PlugZapIcon,
  Trash2Icon,
} from "lucide-react"
import { NewDatabaseConnectionLink } from "./route"
import { ConnectionForm } from "@/components/database-connections/connection-form"
import { ConnectionStatus } from "@/components/database-connections/connection-status"
import {
  ConfirmDialog,
  DetailActions,
  DetailHeader,
  DetailHint,
} from "@/components/records/record-detail"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  deleteDatabaseConnection,
  getDatabaseConnection,
  saveDatabaseConnection,
  testDatabaseConnection,
} from "@/server/database-connections.functions"

export const Route = createFileRoute(
  "/admin/database-connections/$databaseConnectionId"
)({
  loader: ({ params }) => getDatabaseConnection({ data: params }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.connection.name ?? "Database Connection"} · Agent 6`,
      },
    ],
  }),
  component: Page,
  notFoundComponent: () => (
    <DetailHint
      icon={<DatabaseIcon />}
      title="Database Connection not found"
      description="Pick a Database Connection from the list, or add a new one."
    >
      <NewDatabaseConnectionLink />
    </DetailHint>
  ),
})
function Page() {
  const { connection, applications } = Route.useLoaderData()
  const search = Route.useSearch(),
    router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<{ message: string }>()
  async function action(remove: boolean) {
    setPending(true)
    setProblem(undefined)
    try {
      const result = await (
        remove ? deleteDatabaseConnection : testDatabaseConnection
      )({ data: { databaseConnectionId: connection.id } })
      if (result.ok) {
        if (remove)
          await router.navigate({ to: "/admin/database-connections", search })
        await router.invalidate()
      } else setProblem(result)
    } catch {
      setProblem({
        message:
          "This action could not be completed. Check your connection and try again.",
      })
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }
  return (
    <>
      <DetailHeader
        title={connection.name}
        backLabel="Back to Database Connections"
        backLink={<Link to="/admin/database-connections" search={search} />}
      >
        <span className="max-sm:hidden">
          <ConnectionStatus test={connection.test} />
        </span>
        <DetailActions>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void action(false)}
            aria-label="Test connection"
          >
            <PlugZapIcon data-icon="inline-start" />
            <span className="max-sm:sr-only">
              {pending ? "Testing…" : "Test connection"}
            </span>
          </Button>
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
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2Icon />
                  Remove Database Connection
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </DetailActions>
      </DetailHeader>
      <ConnectionForm
        key={connection.id}
        connection={connection}
        problem={problem}
        save={(input) =>
          saveDatabaseConnection({
            data: { ...input, databaseConnectionId: connection.id },
          })
        }
        onSaved={async () => {
          await router.invalidate()
        }}
        cancel={
          <Link
            to="/admin/database-connections"
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
        title={`Remove ${connection.name}?`}
        description={`This removes the Database Connection and its Attachments${applications.length ? ` to ${applications.join(", ")}` : ""}. The Postgres database is kept.`}
        confirmLabel="Remove Database Connection"
        pending={pending}
        onConfirm={() => void action(true)}
      />
    </>
  )
}
