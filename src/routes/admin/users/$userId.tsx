import { useState } from "react"
import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  BanIcon,
  CircleCheckIcon,
  EllipsisIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
} from "lucide-react"
import { NewUserLink } from "./route"
import {
  ConfirmDialog,
  DetailActions,
  DetailHeader,
  DetailHint,
} from "@/components/records/record-detail"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserForm } from "@/components/users/user-form"
import { getUser, setUserDisabled, updateUser } from "@/server/users.functions"

export const Route = createFileRoute("/admin/users/$userId")({
  loader: ({ params }) => getUser({ data: { userId: params.userId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? "User"} · Agent 6` }],
  }),
  component: Page,
  notFoundComponent: NotFound,
})

function Page() {
  const user = Route.useLoaderData()
  const search = Route.useSearch()
  const { user: me } = Route.useRouteContext()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<{ message: string }>()

  async function setDisabled(disabled: boolean) {
    setProblem(undefined)
    setPending(true)
    try {
      const result = await setUserDisabled({
        data: { userId: user.id, disabled },
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

  return (
    <>
      <DetailHeader
        title={user.name}
        backLabel="Back to Users"
        backLink={<Link to="/admin/users" search={search} />}
      >
        <Badge variant="outline" className="text-xs">
          {user.disabled ? <BanIcon /> : <CircleCheckIcon />}
          {user.disabled ? "Disabled" : "Active"}
        </Badge>
        <DetailActions>
          {user.disabled && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void setDisabled(false)}
            >
              <UserRoundCheckIcon />
              <span className="max-sm:sr-only">Enable user</span>
            </Button>
          )}
          {/* Nobody can disable their own account, so it is not offered. */}
          {!user.disabled && user.id !== me.id && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="More actions"
                    title="More actions"
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
                  <UserRoundXIcon />
                  Disable user
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </DetailActions>
      </DetailHeader>
      <UserForm
        // A fresh form for each user, and after each change from the header.
        key={`${user.id}:${user.disabled}`}
        user={user}
        problem={problem}
        save={(values) => updateUser({ data: { userId: user.id, ...values } })}
        onSaved={async () => {
          await router.invalidate()
          await router.navigate({ to: "/admin/users", search })
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
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disable ${user.name}?`}
        description={`${user.name} (${user.email}) is logged out everywhere and can no longer log in. Their Conversations are kept, and you can enable the user again at any time.`}
        confirmLabel="Disable user"
        pending={pending}
        onConfirm={() => void setDisabled(true)}
      />
    </>
  )
}

function NotFound() {
  return (
    <DetailHint
      icon={<UserRoundXIcon />}
      title="User not found"
      description="No user has this address. Pick one from the list, or create a new user."
    >
      <NewUserLink />
    </DetailHint>
  )
}
