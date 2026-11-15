import { Outlet, createFileRoute } from "@tanstack/react-router"
import { AppShell } from "@/components/shell/app-shell"
import { requireUser } from "@/lib/login-redirect"

export const Route = createFileRoute("/chat")({
  // Any logged-in user.
  beforeLoad: ({ context, location }) => ({
    user: requireUser(context.user, location.href),
  }),
  component: Layout,
})

function Layout() {
  const { user } = Route.useRouteContext()
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  )
}
