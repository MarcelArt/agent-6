import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { ConnectionForm } from "@/components/database-connections/connection-form"
import { DetailHeader } from "@/components/records/record-detail"
import { buttonVariants } from "@/components/ui/button"
import { saveDatabaseConnection } from "@/server/database-connections.functions"

export const Route = createFileRoute("/admin/database-connections/new")({
  head: () => ({ meta: [{ title: "Add Database Connection · Agent 6" }] }),
  component: Page,
})
function Page() {
  const search = Route.useSearch()
  const router = useRouter()
  return (
    <>
      <DetailHeader
        title="Add Database Connection"
        backLabel="Back to Database Connections"
        backLink={<Link to="/admin/database-connections" search={search} />}
      />
      <ConnectionForm
        save={(values) => saveDatabaseConnection({ data: values })}
        onSaved={async (connection) => {
          await router.invalidate()
          await router.navigate({
            to: "/admin/database-connections/$databaseConnectionId",
            params: { databaseConnectionId: connection.id },
            search,
          })
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
    </>
  )
}
