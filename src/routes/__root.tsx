import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { CompassIcon } from "lucide-react"

import appCss from "../styles.css?url"
import { ErrorPage } from "@/components/shell/error-page"
import { FullPageMessage } from "@/components/shell/full-page-message"
import { buttonVariants } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { themeScript } from "@/lib/theme"
import { getCurrentUser } from "@/server/session.functions"
import { countPendingTickets } from "@/server/tickets.functions"

export const Route = createRootRoute({
  // Runs before every page, on the server for the first one. Routes read
  // `context.user` to decide who may see them; server functions check the
  // session again themselves. The pending Ticket count (null for anyone but
  // an Admin) feeds the nav badge and refreshes with every navigation.
  beforeLoad: async () => {
    const [user, pendingTickets] = await Promise.all([
      getCurrentUser(),
      countPendingTickets(),
    ])
    return { user, pendingTickets }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Agent 6",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorPage,
  shellComponent: RootDocument,
})

function RootComponent() {
  return (
    <TooltipProvider>
      <Outlet />
    </TooltipProvider>
  )
}

function NotFound() {
  return (
    <FullPageMessage
      icon={<CompassIcon />}
      title="Page not found"
      description="This address does not lead anywhere in Agent 6. Check the link, or go back to the chat."
    >
      <Link to="/chat" className={buttonVariants()}>
        Go to chat
      </Link>
    </FullPageMessage>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets the class and color-scheme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: "middle-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
