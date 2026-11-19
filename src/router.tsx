import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import type { SetupFileImportSummary } from "@/lib/setup-file"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface HistoryState {
    /** What a Setup File import did, shown once on the Applications list. */
    setupImport?: SetupFileImportSummary
  }
}
