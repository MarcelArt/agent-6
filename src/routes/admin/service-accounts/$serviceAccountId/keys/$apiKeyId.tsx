import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { BanIcon, EllipsisIcon, KeyRoundIcon } from "lucide-react"
import {
  ConfirmDialog,
  DetailActions,
  DetailHeader,
  DetailHint,
  FormError,
} from "@/components/records/record-detail"
import { KeyForm } from "@/components/service-accounts/key-form"
import { KeyStateBadge, Moment } from "@/components/service-accounts/status"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getApiKey,
  listApplicationChoices,
  revokeApiKey,
  updateApiKey,
} from "@/server/service-accounts.functions"

export const Route = createFileRoute(
  "/admin/service-accounts/$serviceAccountId/keys/$apiKeyId"
)({
  loader: async ({ params }) => {
    const [apiKey, choices] = await Promise.all([
      getApiKey({ data: params }),
      listApplicationChoices(),
    ])
    return { apiKey, choices }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.apiKey.name ?? "API Key"} · Agent 6` }],
  }),
  component: Page,
  notFoundComponent: () => (
    <DetailHint
      icon={<KeyRoundIcon />}
      title="API Key not found"
      description="No API Key of this Service Account has this address. Pick one from the Service Account's keys."
    />
  ),
})

function Page() {
  const { apiKey, choices } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string>()
  const account = apiKey.serviceAccount
  const revoked = apiKey.state === "revoked"

  async function revoke() {
    setProblem(undefined)
    setPending(true)
    try {
      const result = await revokeApiKey({
        data: { serviceAccountId: account.id, apiKeyId: apiKey.id },
      })
      if (!result.ok) setProblem(result.message)
      await router.invalidate()
    } catch {
      setProblem(
        "Agent 6 could not be reached, so the key was not revoked. Check your connection, then try again."
      )
    }
    setPending(false)
    setConfirming(false)
  }

  const backToAccount = (
    <Link
      to="/admin/service-accounts/$serviceAccountId"
      params={{ serviceAccountId: account.id }}
      search={search}
    />
  )
  return (
    <>
      <DetailHeader
        title={apiKey.name}
        backLabel={`Back to ${account.name}`}
        backLink={backToAccount}
      >
        <KeyStateBadge state={apiKey.state} />
        {!revoked && (
          <DetailActions>
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
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirming(true)}
                >
                  <BanIcon />
                  Revoke API Key
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </DetailActions>
        )}
      </DetailHeader>
      <KeyForm
        // A fresh form for each key, and after it is revoked.
        key={`${apiKey.id}:${apiKey.state}`}
        apiKey={apiKey}
        choices={choices}
        readOnly={revoked}
        submitLabel="Save changes"
        save={(values) =>
          updateApiKey({
            data: {
              serviceAccountId: account.id,
              apiKeyId: apiKey.id,
              name: values.name,
              permissions: values.permissions,
              allApplications: values.allApplications,
              applicationIds: values.applicationIds,
            },
          })
        }
        onSaved={async () => {
          await router.invalidate()
          await router.navigate({
            to: "/admin/service-accounts/$serviceAccountId",
            params: { serviceAccountId: account.id },
            search,
          })
        }}
        cancel={
          <Link
            to="/admin/service-accounts/$serviceAccountId"
            params={{ serviceAccountId: account.id }}
            search={search}
            className={buttonVariants({ variant: "outline" })}
          >
            {revoked ? `Back to ${account.name}` : "Cancel"}
          </Link>
        }
      >
        {problem && (
          <FormError title="Nothing was changed">{problem}</FormError>
        )}
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Service Account</dt>
          <dd className="break-words">
            <Link
              to="/admin/service-accounts/$serviceAccountId"
              params={{ serviceAccountId: account.id }}
              search={search}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {account.name}
            </Link>
            {account.disabled && " (disabled: its keys do not work)"}
          </dd>
          <dt className="text-muted-foreground">Key starts with</dt>
          <dd className="font-mono break-all">{apiKey.prefix}…</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>
            <Moment value={apiKey.createdAt} />
          </dd>
          <dt className="text-muted-foreground">Last used</dt>
          <dd>
            <Moment value={apiKey.lastUsedAt} />
          </dd>
          <dt className="text-muted-foreground">
            {apiKey.state === "expired" ? "Expired" : "Expires"}
          </dt>
          <dd>
            <Moment value={apiKey.expiresAt} />
          </dd>
          {revoked && (
            <>
              <dt className="text-muted-foreground">Revoked</dt>
              <dd>
                <Moment value={apiKey.revokedAt} />
              </dd>
            </>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          {revoked
            ? "This key was revoked and no longer works. Its grants are kept for the record."
            : "To rotate this key, issue a new one with the same grants, switch the integration to it, then revoke this one. Both work in between."}
        </p>
      </KeyForm>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Revoke ${apiKey.name}?`}
        description={`The integration using ${apiKey.prefix}… is refused from its next request. Revocation is final: to give access again, issue a new key.`}
        confirmLabel="Revoke API Key"
        pending={pending}
        onConfirm={() => void revoke()}
      />
    </>
  )
}
