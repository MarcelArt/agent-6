import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { ConnectionForm } from "@/components/log-connections/connection-form"
import { DetailHeader } from "@/components/records/record-detail"
import { buttonVariants } from "@/components/ui/button"
import { saveLogConnection } from "@/server/log-connections.functions"

export const Route = createFileRoute("/admin/log-connections/new")({
  head: () => ({ meta: [{ title: "Add Log Connection · Agent 6" }] }),
  component: Page,
})
function Page() {
  const search = Route.useSearch()
  const router = useRouter()
  return (
    <>
      <DetailHeader
        title="Add Log Connection"
        backLabel="Back to Log Connections"
        backLink={<Link to="/admin/log-connections" search={search} />}
      />
      <ConnectionForm
        save={(values) => saveLogConnection({ data: values })}
        onSaved={async (connection) => {
          await router.invalidate()
          await router.navigate({
            to: "/admin/log-connections/$logConnectionId",
            params: { logConnectionId: connection.id },
            search,
          })
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
    </>
  )
}
