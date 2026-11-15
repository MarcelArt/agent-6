import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { DetailHeader } from "@/components/records/record-detail"
import { RepositoryForm } from "@/components/repositories/repository-form"
import { buttonVariants } from "@/components/ui/button"
import { connectRepository } from "@/server/repositories.functions"

export const Route = createFileRoute("/admin/repositories/new")({
  head: () => ({ meta: [{ title: "Connect a Repository · Agent 6" }] }),
  component: Page,
})

function Page() {
  const search = Route.useSearch()
  const router = useRouter()
  return (
    <>
      <DetailHeader
        title="Connect a Repository"
        backLabel="Back to Repositories"
        backLink={<Link to="/admin/repositories" search={search} />}
      />
      <RepositoryForm
        save={(values) => connectRepository({ data: values })}
        onSaved={async (repository) => {
          await router.invalidate()
          // Open the new Repository, where its first sync shows.
          await router.navigate({
            to: "/admin/repositories/$repositoryId",
            params: { repositoryId: repository.id },
          })
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
    </>
  )
}
