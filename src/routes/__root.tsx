import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { CircleAlertIcon, CompassIcon } from "lucide-react"
import type { ErrorComponentProps } from "@tanstack/react-router"

import appCss from "../styles.css?url"
import { FullPageMessage } from "@/components/shell/full-page-message"
import { Button, buttonVariants } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { themeScript } from "@/lib/theme"

export const Route = createRootRoute({
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
  errorComponent: RootError,
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

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : ""
  return (
    <FullPageMessage
      icon={<CircleAlertIcon className="text-destructive" />}
      title="Something went wrong"
      description={
        message
          ? `Agent 6 could not show this page: ${message}`
          : "Agent 6 could not show this page."
      }
    >
      <Button
        variant="outline"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </Button>
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
