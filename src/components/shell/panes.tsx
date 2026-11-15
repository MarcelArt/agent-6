import { cn } from "cn"

/*
 * The panes inside the shell. Each pane scrolls on its own; the page never
 * does. At phone width only one pane shows: pass `phone="hidden"` to the
 * other one. See docs/design/DESIGN.md, sections 1, 2 and 7.
 */

type PaneProps = {
  /** Whether this pane is the one shown at phone width. */
  phone?: "shown" | "hidden"
  children: React.ReactNode
  "aria-label"?: string
}

export function ListPane({ phone = "shown", children, ...props }: PaneProps) {
  return (
    <aside
      className={cn(
        "min-h-0 flex-1 flex-col md:flex md:w-80 md:flex-none md:border-r",
        phone === "shown" ? "flex" : "hidden"
      )}
      {...props}
    >
      {children}
    </aside>
  )
}

export function DetailPane({ phone = "shown", children, ...props }: PaneProps) {
  return (
    <main
      className={cn(
        "min-h-0 min-w-0 flex-1 flex-col md:flex",
        phone === "shown" ? "flex" : "hidden"
      )}
      {...props}
    >
      {children}
    </main>
  )
}

export function PaneHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      {children}
    </div>
  )
}

export function PaneTitle({
  as: Heading = "h2",
  children,
}: {
  as?: "h1" | "h2"
  children: React.ReactNode
}) {
  return <Heading className="truncate text-sm font-medium">{children}</Heading>
}
