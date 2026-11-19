import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  ScrollTextIcon,
  EllipsisIcon,
  PlugZapIcon,
  Trash2Icon,
} from "lucide-react"
import { NewLogConnectionLink } from "./route"
import { ConnectionForm } from "@/components/log-connections/connection-form"
import { ConnectionStatus } from "@/components/log-connections/connection-status"
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
  deleteLogConnection,
  getLogConnection,
  saveLogConnection,
  testLogConnection,
} from "@/server/log-connections.functions"

export const Route = createFileRoute("/admin/log-connections/$logConnectionId")(
  {
    loader: ({ params }) => getLogConnection({ data: params }),
    head: ({ loaderData }) => ({
      meta: [
        {
          title: `${loaderData?.connection.name ?? "Log Connection"} · Agent 6`,
        },
      ],
    }),
    component: Page,
    notFoundComponent: () => (
      <DetailHint
        icon={<ScrollTextIcon />}
        title="Log Connection not found"
        description="Pick a Log Connection from the list, or add a new one."
      >
        <NewLogConnectionLink />
      </DetailHint>
    ),
  }
)
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
      const result = await (remove ? deleteLogConnection : testLogConnection)({
        data: { logConnectionId: connection.id },
      })
      if (result.ok) {
        if (remove)
          await router.navigate({ to: "/admin/log-connections", search })
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
        backLabel="Back to Log Connections"
        backLink={<Link to="/admin/log-connections" search={search} />}
      >
        <span className="max-sm:hidden">
          <ConnectionStatus connection={connection} />
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
                  Remove Log Connection
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
          saveLogConnection({
            data: { ...input, logConnectionId: connection.id },
          })
        }
        onSaved={async () => {
          // An earlier Test or Remove error no longer applies.
          setProblem(undefined)
          await router.invalidate()
        }}
        cancel={
          <Link
            to="/admin/log-connections"
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
        description={`This removes the Log Connection and its Attachments${applications.length ? ` to ${applications.join(", ")}` : ""}. The logs in Loki are kept.`}
        confirmLabel="Remove Log Connection"
        pending={pending}
        onConfirm={() => void action(true)}
      />
    </>
  )
}
