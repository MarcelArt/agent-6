import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { DetailHeader } from "@/components/records/record-detail"
import { buttonVariants } from "@/components/ui/button"
import { UserForm } from "@/components/users/user-form"
import { createUser } from "@/server/users.functions"

export const Route = createFileRoute("/admin/users/new")({
  head: () => ({ meta: [{ title: "New user · Agent 6" }] }),
  component: Page,
})

function Page() {
  const search = Route.useSearch()
  const router = useRouter()
  return (
    <>
      <DetailHeader
        title="New user"
        backLabel="Back to Users"
        backLink={<Link to="/admin/users" search={search} />}
      />
      <UserForm
        save={(values) => createUser({ data: values })}
        onSaved={async (user) => {
          await router.invalidate()
          // Open the new user, so it is clear who was created.
          await router.navigate({
            to: "/admin/users/$userId",
            params: { userId: user.id },
          })
        }}
        cancel={
          <Link
            to="/admin/users"
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
