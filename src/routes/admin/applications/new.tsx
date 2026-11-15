import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { ApplicationForm } from "@/components/applications/application-form"
import { DetailHeader } from "@/components/records/record-detail"
import { buttonVariants } from "@/components/ui/button"
import { createApplication } from "@/server/applications.functions"

export const Route = createFileRoute("/admin/applications/new")({
  head: () => ({ meta: [{ title: "New Application · Agent 6" }] }),
  component: Page,
})
function Page() {
  const search = Route.useSearch()
  const router = useRouter()
  return (
    <>
      <DetailHeader
        title="New Application"
        backLabel="Back to Applications"
        backLink={<Link to="/admin/applications" search={search} />}
      />
      <ApplicationForm
        save={(values) => createApplication({ data: values })}
        onSaved={async (application) => {
          await router.invalidate()
          await router.navigate({
            to: "/admin/applications/$applicationId",
            params: { applicationId: application.id },
            search,
          })
        }}
        cancel={
          <Link
            to="/admin/applications"
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
