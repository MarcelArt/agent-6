import { Outlet, createFileRoute } from "@tanstack/react-router"
import { AppShell } from "@/components/shell/app-shell"

export const Route = createFileRoute("/admin")({ component: Layout })

function Layout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
