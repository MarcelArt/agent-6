import { Link, useLocation } from "@tanstack/react-router"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { cn } from "cn"
import type { ThemeMode } from "@/lib/theme"
import { ProductMark } from "@/components/shell/app-shell"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTheme } from "@/lib/theme"

/*
 * The frame of the public developer reference. It needs no sign-in, so it
 * stays outside the app shell and carries its own theme control.
 */

const pages = [
  { to: "/docs/api", label: "API" },
  { to: "/docs/webhooks", label: "Webhooks" },
] as const

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#content"
        className="sr-only z-20 rounded-md bg-background px-3 py-2 text-xs font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring/30"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4">
          <Link
            to="/docs/api"
            aria-label="Agent 6 developer reference"
            className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <ProductMark />
            {/* The link's label names it; at phone width the mark alone fits. */}
            <span className="flex min-w-0 flex-col leading-tight max-sm:hidden">
              <span className="text-sm font-medium whitespace-nowrap">
                Agent 6
              </span>
              <span className="truncate text-xs text-muted-foreground">
                Developer reference
              </span>
            </span>
          </Link>
          <nav
            aria-label="Reference"
            className="ml-auto flex items-center gap-1"
          >
            {pages.map((page) => {
              const active = pathname === page.to
              return (
                <Link
                  key={page.to}
                  to={page.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {page.label}
                </Link>
              )
            })}
          </nav>
          <ThemeSwitch />
        </div>
      </header>
      {children}
    </div>
  )
}

function ThemeSwitch() {
  const [mode, setMode] = useTheme()
  return (
    <ToggleGroup
      aria-label="Theme"
      variant="outline"
      size="sm"
      spacing={0}
      value={[mode]}
      onValueChange={(value) => {
        // Clicking the active item must not clear the choice.
        const next = value.at(0) as ThemeMode | undefined
        if (next) setMode(next)
      }}
    >
      <ToggleGroupItem value="light" aria-label="Light theme" title="Light">
        <SunIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark theme" title="Dark">
        <MoonIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System theme" title="System">
        <MonitorIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export type TocEntry = { id: string; label: string; children?: Array<TocEntry> }

/**
 * A reference page: its table of contents beside the content on wide
 * screens, above it on narrow ones.
 */
export function DocsPage({
  title,
  intro,
  toc,
  children,
}: {
  title: string
  intro: React.ReactNode
  toc: Array<TocEntry>
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 md:py-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav
        aria-label="On this page"
        className="min-w-0 rounded-md border p-3 text-xs lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:self-start lg:overflow-y-auto lg:border-0 lg:p-0"
      >
        <p className="mb-2 font-medium">On this page</p>
        <TocList entries={toc} />
      </nav>
      <main id="content" tabIndex={-1} className="min-w-0 outline-none">
        <article className="flex max-w-3xl flex-col gap-10">
          <header className="flex flex-col gap-2">
            <h1 className="text-lg font-medium tracking-tight">{title}</h1>
            <div className="text-sm/relaxed text-muted-foreground">{intro}</div>
          </header>
          {children}
        </article>
      </main>
    </div>
  )
}

function TocList({
  entries,
  nested,
}: {
  entries: Array<TocEntry>
  nested?: boolean
}) {
  return (
    <ul
      className={cn("flex flex-col gap-1", nested && "mt-1 ml-3 border-l pl-2")}
    >
      {entries.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            className="block rounded-sm py-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {entry.label}
          </a>
          {entry.children?.length ? (
            <TocList entries={entry.children} nested />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** A titled part of a reference page, with an anchor. */
export function DocSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="scroll-mt-20 text-base font-medium tracking-tight">
        <a
          href={`#${id}`}
          className="outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {title}
        </a>
      </h2>
      {children}
    </section>
  )
}

export function DocSubsection({
  id,
  title,
  children,
}: {
  id: string
  title: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="scroll-mt-20 text-sm font-medium">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Running text at the reading size. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 text-sm/relaxed [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1">
      {children}
    </div>
  )
}

/** Inline code, readable in both themes. */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em] break-words">
      {children}
    </code>
  )
}

/** Text in which `backticks` mark code, as the OpenAPI descriptions use. */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/g)
        .map((part, index) =>
          part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
            <Code key={index}>{part.slice(1, -1)}</Code>
          ) : (
            part
          )
        )}
    </>
  )
}

export const linkClass =
  "underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"

/** A table that scrolls on its own when it is wider than the page. */
export function DocTable({
  caption,
  head,
  children,
}: {
  caption: string
  head: Array<string>
  children: React.ReactNode
}) {
  return (
    <div
      className="overflow-x-auto rounded-md border"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/40">
          <tr>
            {head.map((item) => (
              <th
                key={item}
                scope="col"
                className="border-b px-3 py-2 font-medium"
              >
                {item}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tr:last-child_td]:border-b-0">
          {children}
        </tbody>
      </table>
    </div>
  )
}
