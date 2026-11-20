import { Outlet, createFileRoute } from "@tanstack/react-router"
import { DocsShell } from "@/components/docs/docs-shell"

/** The public developer reference. Anyone may read it, signed in or not. */
export const Route = createFileRoute("/docs")({
  component: Layout,
})

function Layout() {
  return (
    <DocsShell>
      <Outlet />
    </DocsShell>
  )
}
