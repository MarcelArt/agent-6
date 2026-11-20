import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  BanIcon,
  CircleCheckIcon,
  EllipsisIcon,
  KeyRoundIcon,
} from "lucide-react"
import { NewServiceAccountLink } from "../route"
import {
  ConfirmDialog,
  DetailActions,
  DetailHeader,
  DetailHint,
} from "@/components/records/record-detail"
import { ServiceAccountForm } from "@/components/service-accounts/account-form"
import {
  ActivitySection,
  KeysSection,
} from "@/components/service-accounts/account-sections"
import { AccountStatusBadge } from "@/components/service-accounts/status"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getServiceAccount,
  setServiceAccountDisabled,
  updateServiceAccount,
} from "@/server/service-accounts.functions"

export const Route = createFileRoute(
  "/admin/service-accounts/$serviceAccountId/"
)({
  loader: ({ params }) =>
    getServiceAccount({ data: { serviceAccountId: params.serviceAccountId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "Service Account"} · Agent 6` }],
  }),
  component: Page,
  notFoundComponent: NotFound,
})

function Page() {
  const account = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<{ message: string }>()

  async function setDisabled(disabled: boolean) {
    setProblem(undefined)
    setPending(true)
    try {
      const result = await setServiceAccountDisabled({
        data: { serviceAccountId: account.id, disabled },
      })
      if (!result.ok) setProblem(result)
      await router.invalidate()
    } catch {
      setProblem({
        message:
          "Agent 6 could not be reached, so nothing was changed. Check your connection, then try again.",
      })
    }
    setPending(false)
    setConfirming(false)
  }

  const listLink = <Link to="/admin/service-accounts" search={search} />
  return (
    <>
      <DetailHeader
        title={account.name}
        backLabel="Back to Service Accounts"
        backLink={listLink}
      >
        <AccountStatusBadge disabled={account.disabled} />
        <DetailActions>
          {account.disabled ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void setDisabled(false)}
            >
              <CircleCheckIcon />
              <span className="max-sm:sr-only">Enable</span>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="More actions"
                    title="More actions"
                    disabled={pending}
                  />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirming(true)}
                >
                  <BanIcon />
                  Disable Service Account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </DetailActions>
      </DetailHeader>
      <ServiceAccountForm
        // A fresh form for each account, and after each change from the header.
        key={`${account.id}:${account.disabled}`}
        serviceAccount={account}
        problem={problem}
        save={(values) =>
          updateServiceAccount({
            data: { serviceAccountId: account.id, ...values },
          })
        }
        onSaved={async () => {
          await router.invalidate()
          await router.navigate({ to: "/admin/service-accounts", search })
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
      >
        {account.disabled && (
          <Alert>
            <BanIcon />
            <AlertTitle>Its API Keys do not work</AlertTitle>
            <AlertDescription>
              While the Service Account is disabled, every request with its keys
              is refused. Enable it to let them work again.
            </AlertDescription>
          </Alert>
        )}
        <KeysSection
          serviceAccountId={account.id}
          keys={account.keys}
          search={search}
        />
        <ActivitySection activity={account.activity} />
      </ServiceAccountForm>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disable ${account.name}?`}
        description={`Every API Key of ${account.name} is refused from its next request. Its keys and grants are kept, and you can enable it again at any time.`}
        confirmLabel="Disable Service Account"
        pending={pending}
        onConfirm={() => void setDisabled(true)}
      />
    </>
  )
}

function NotFound() {
  return (
    <DetailHint
      icon={<KeyRoundIcon />}
      title="Service Account not found"
      description="No Service Account has this address. Pick one from the list, or create a new one."
    >
      <NewServiceAccountLink />
    </DetailHint>
  )
}
