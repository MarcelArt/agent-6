import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { DetailHeader } from "@/components/records/record-detail"
import { ServiceAccountForm } from "@/components/service-accounts/account-form"
import { buttonVariants } from "@/components/ui/button"
import { createServiceAccount } from "@/server/service-accounts.functions"

export const Route = createFileRoute("/admin/service-accounts/new")({
  head: () => ({ meta: [{ title: "New Service Account · Agent 6" }] }),
  component: Page,
})

function Page() {
  const search = Route.useSearch()
  const router = useRouter()
  return (
    <>
      <DetailHeader
        title="New Service Account"
        backLabel="Back to Service Accounts"
        backLink={<Link to="/admin/service-accounts" search={search} />}
      />
      <ServiceAccountForm
        save={(values) => createServiceAccount({ data: values })}
        onSaved={async (account) => {
          await router.invalidate()
          // Open it, so the next step, issuing a key, is at hand.
          await router.navigate({
            to: "/admin/service-accounts/$serviceAccountId",
            params: { serviceAccountId: account.id },
            search,
          })
        }}
        cancel={
          <Link
            to="/admin/service-accounts"
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
