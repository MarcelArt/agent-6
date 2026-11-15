import {
  Link,
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { ShieldXIcon } from "lucide-react"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { AppShell } from "@/components/shell/app-shell"
import { ErrorPage } from "@/components/shell/error-page"
import { DetailPane } from "@/components/shell/panes"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { requireUser } from "@/lib/login-redirect"

/** When the page is rendered on the server, answer 403 Forbidden. */
const markForbidden = createIsomorphicFn().server(() => setResponseStatus(403))

export const Route = createFileRoute("/admin")({
  // Admins only. Throwing stops the loaders of every admin screen; a Client
  // then sees `NotAllowed` at the address they opened.
  beforeLoad: ({ context, location }) => {
    const user = requireUser(context.user, location.href)
    if (user.role !== "admin") {
      markForbidden()
      throw new Error("Only an Admin can open this.")
    }
    return { user }
  },
  component: Layout,
  errorComponent: AdminError,
})

function Layout() {
  const { user } = Route.useRouteContext()
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  )
}

function AdminError(props: ErrorComponentProps) {
  const { user } = useRouteContext({ from: "__root__" })
  if (!user || user.role === "admin") return <ErrorPage {...props} />
  return (
    <AppShell user={user}>
      <DetailPane>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldXIcon />
            </EmptyMedia>
            <EmptyTitle>
              <h1>Not allowed</h1>
            </EmptyTitle>
            <EmptyDescription>
              Only an Admin can open this page. If you need it, ask your Admin.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/chat" className={buttonVariants()}>
              Go to chat
            </Link>
          </EmptyContent>
        </Empty>
      </DetailPane>
    </AppShell>
  )
}
