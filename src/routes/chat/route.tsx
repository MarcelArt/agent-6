import { Outlet, createFileRoute } from "@tanstack/react-router"
import { AppShell } from "@/components/shell/app-shell"
import { requireUser } from "@/lib/login-redirect"
import { historySearch } from "@/lib/conversation-history"
import { listConversations } from "@/server/conversation-history.functions"

export const Route = createFileRoute("/chat")({
  // Any logged-in user. Declare before loaders so their context is narrowed.
  beforeLoad: ({ context, location }) => ({
    user: requireUser(context.user, location.href),
  }),
  validateSearch: historySearch,
  loaderDeps: ({ search: { q, applicationId, page } }) => ({
    q,
    applicationId,
    page,
  }),
  loader: ({ deps }) => listConversations({ data: deps }),
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
