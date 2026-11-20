import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { KeyRoundIcon } from "lucide-react"
import { OneTimeSecret } from "@/components/integrations/one-time-secret"
import { DetailHeader, DetailHint } from "@/components/records/record-detail"
import { KeyForm } from "@/components/service-accounts/key-form"
import { buttonVariants } from "@/components/ui/button"
import type { ApiKeySummary } from "@/lib/service-accounts"
import {
  createApiKey,
  getServiceAccount,
  listApplicationChoices,
} from "@/server/service-accounts.functions"

export const Route = createFileRoute(
  "/admin/service-accounts/$serviceAccountId/keys/new"
)({
  loader: async ({ params }) => {
    const [account, choices] = await Promise.all([
      getServiceAccount({
        data: { serviceAccountId: params.serviceAccountId },
      }),
      listApplicationChoices(),
    ])
    return { account, choices }
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `Issue API Key${loaderData ? ` for ${loaderData.account.name}` : ""} · Agent 6`,
      },
    ],
  }),
  component: Page,
  notFoundComponent: () => (
    <DetailHint
      icon={<KeyRoundIcon />}
      title="Service Account not found"
      description="No Service Account has this address. Pick one from the list."
    />
  ),
})

function Page() {
  const { account, choices } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  // The key lives only here: never in the address or router state, and a
  // reload loses it on purpose.
  const [issued, setIssued] = useState<{ apiKey: ApiKeySummary; key: string }>()
  const accountLink = (
    <Link
      to="/admin/service-accounts/$serviceAccountId"
      params={{ serviceAccountId: account.id }}
      search={search}
    />
  )

  if (issued)
    return (
      <>
        <DetailHeader
          title={`API Key “${issued.apiKey.name}” issued`}
          backLabel={`Back to ${account.name}`}
          backLink={accountLink}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
            <OneTimeSecret
              id="issued-api-key"
              label="API Key"
              value={issued.key}
              description={
                <>
                  Send it on every request as{" "}
                  <code className="font-mono break-all">
                    Authorization: Bearer &lt;API Key&gt;
                  </code>
                  . Store it in the integration’s secret store, not in code.
                  Agent 6 shows only its start,{" "}
                  <code className="font-mono break-all">
                    {issued.apiKey.prefix}
                  </code>
                  , from now on. See the <a href="/docs/api">API reference</a>.
                </>
              }
            />
            <div className="flex items-center gap-2">
              <Link
                to="/admin/service-accounts/$serviceAccountId/keys/$apiKeyId"
                params={{
                  serviceAccountId: account.id,
                  apiKeyId: issued.apiKey.id,
                }}
                search={search}
                className={buttonVariants()}
              >
                Done
              </Link>
            </div>
          </div>
        </div>
      </>
    )

  return (
    <>
      <DetailHeader
        title={`Issue API Key for ${account.name}`}
        backLabel={`Back to ${account.name}`}
        backLink={accountLink}
      />
      <KeyForm
        choices={choices}
        submitLabel="Issue API Key"
        save={(values) =>
          createApiKey({ data: { serviceAccountId: account.id, ...values } })
        }
        onSaved={async (result) => {
          setIssued({ apiKey: result.apiKey, key: result.key })
          // The list's active key count changed.
          await router.invalidate()
        }}
        cancel={
          <Link
            to="/admin/service-accounts/$serviceAccountId"
            params={{ serviceAccountId: account.id }}
            search={search}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        }
      >
        {account.disabled && (
          <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            {account.name} is disabled, so the new key will not work until the
            Service Account is enabled.
          </p>
        )}
      </KeyForm>
    </>
  )
}
