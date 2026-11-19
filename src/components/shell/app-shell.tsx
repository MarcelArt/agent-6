import { Link, useLocation, useRouteContext } from "@tanstack/react-router"
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { cn } from "cn"
import { adminNav, chatNav, countMeaning } from "./nav"
import { UserMenuContent, initials } from "./user-menu"
import type { NavItem } from "./nav"
import type { SessionUser } from "@/lib/roles"
import { useRailExpanded } from "@/lib/rail"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * The frame of every logged-in screen: rail (bottom tab bar on phone) plus
 * the panes of the current route. See docs/design/DESIGN.md, sections 1 and 7.
 */
export function AppShell({
  user,
  children,
}: {
  user: SessionUser
  children: React.ReactNode
}) {
  const pathname = useLocation({ select: (location) => location.pathname })
  // Loaded with the user on every navigation; null for anyone but an Admin.
  const navCounts = useRouteContext({
    from: "__root__",
    select: (context) => context.navCounts,
  })
  const counts: Counts = navCounts ?? {
    pendingTickets: 0,
    databaseConnectionsNeedingSecret: 0,
    logConnectionsNeedingSecret: 0,
  }
  return (
    <div className="flex h-svh flex-col overflow-hidden md:flex-row">
      <Rail user={user} pathname={pathname} counts={counts} />
      {children}
      <TabBar user={user} pathname={pathname} counts={counts} />
    </div>
  )
}

type Counts = Record<NonNullable<NavItem["badge"]>, number>

const countText = (count: number) => (count > 99 ? "99+" : String(count))

/** "All Tickets, 3 waiting for review" for screen readers and tooltips. */
function itemLabel(item: NavItem, counts: Counts) {
  const count = item.badge ? counts[item.badge] : 0
  return item.badge && count
    ? `${item.label}, ${countMeaning[item.badge](count)}`
    : item.label
}

function UserAvatar({ user, size }: { user: SessionUser; size?: "sm" }) {
  return (
    <Avatar size={size}>
      <AvatarFallback
        className={cn(
          "font-medium text-foreground",
          size === "sm" ? "text-[0.625rem]" : "text-xs"
        )}
      >
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

type ShellProps = { user: SessionUser; pathname: string; counts: Counts }

function Rail({ user, pathname, counts }: ShellProps) {
  const [expanded, setExpanded] = useRailExpanded()
  const toggleLabel = expanded ? "Collapse navigation" : "Expand navigation"
  return (
    <nav
      aria-label="Main"
      className="hidden w-14 shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto border-r bg-sidebar px-3 py-2 text-sidebar-foreground transition-[width] duration-240 ease-out-quint motion-reduce:transition-none md:flex rail-expanded:w-56"
    >
      <Link
        to="/chat"
        aria-label="Agent 6"
        className="mb-2 flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <ProductMark />
        <RailLabel className="text-sm font-semibold">Agent 6</RailLabel>
      </Link>
      {chatNav.map((item) => (
        <RailItem
          key={item.to}
          item={item}
          pathname={pathname}
          counts={counts}
          expanded={expanded}
        />
      ))}
      {user.role === "admin" && (
        <>
          <Separator className="mx-1 my-1.5 w-6! transition-[width] duration-240 ease-out-quint motion-reduce:transition-none rail-expanded:w-[calc(100%-0.5rem)]!" />
          <span className="-mt-1 max-h-0 overflow-hidden px-2 text-xs whitespace-nowrap text-muted-foreground opacity-0 transition-[max-height,margin,opacity] duration-240 ease-out-quint motion-reduce:transition-none rail-expanded:mt-0 rail-expanded:max-h-6 rail-expanded:opacity-100">
            Admin
          </span>
          {adminNav.map((item) => (
            <RailItem
              key={item.to}
              item={item}
              pathname={pathname}
              counts={counts}
              expanded={expanded}
            />
          ))}
        </>
      )}
      <Tooltip disabled={expanded}>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={toggleLabel}
              onClick={() => setExpanded(!expanded)}
              className={cn(
                railRowClass,
                "mt-auto text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            />
          }
        >
          <PanelLeftOpenIcon className="rail-expanded:hidden" />
          <PanelLeftCloseIcon className="hidden rail-expanded:block" />
          <RailLabel>Collapse</RailLabel>
        </TooltipTrigger>
        <TooltipContent side="right">{toggleLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account: ${user.name}`}
          className="-mx-1 flex h-10 w-[calc(100%+0.5rem)] shrink-0 items-center gap-2 rounded-lg px-1 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/30 aria-expanded:bg-sidebar-accent"
        >
          <UserAvatar user={user} />
          <RailLabel className="text-xs font-medium">{user.name}</RailLabel>
        </DropdownMenuTrigger>
        <UserMenuContent user={user} side="right" align="end" sideOffset={20} />
      </DropdownMenu>
    </nav>
  )
}

/** A row of the desktop rail: a 2rem icon cell that gains a label when open. */
const railRowClass =
  "relative inline-flex h-8 w-full shrink-0 items-center gap-2 rounded-md px-2 text-xs/relaxed font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

/** Text that fades in beside a rail icon while the rail is expanded. */
function RailLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "min-w-0 truncate opacity-0 transition-opacity duration-120 ease-out motion-reduce:transition-none rail-expanded:opacity-100 rail-expanded:delay-80",
        className
      )}
    >
      {children}
    </span>
  )
}

export function ProductMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm leading-none font-semibold text-primary-foreground",
        className
      )}
    >
      6
    </span>
  )
}

function CountBadge({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-medium text-primary-foreground tabular-nums",
        className
      )}
    >
      {countText(count)}
    </span>
  )
}

function RailItem({
  item,
  pathname,
  counts,
  expanded,
}: {
  item: NavItem
  pathname: string
  counts: Counts
  expanded: boolean
}) {
  const active = item.isActive(pathname)
  const count = item.badge ? counts[item.badge] : 0
  const label = itemLabel(item, counts)
  return (
    // Labels are visible while expanded, so the tooltip would only repeat them.
    <Tooltip disabled={expanded}>
      <TooltipTrigger
        render={
          <Link
            to={item.to}
            activeOptions={{ exact: true }}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              railRowClass,
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          />
        }
      >
        <item.icon />
        <RailLabel className={cn(count > 0 && "rail-expanded:pr-6")}>
          {item.label}
        </RailLabel>
        {count > 0 && (
          <CountBadge
            count={count}
            className="absolute -top-1 -right-1 transition-[top,right] duration-240 ease-out-quint motion-reduce:transition-none rail-expanded:top-2 rail-expanded:right-2"
          />
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

const tabClass =
  "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground outline-none focus-visible:bg-sidebar-accent aria-expanded:text-foreground data-active:font-medium data-active:text-foreground"

function TabBar({ user, pathname, counts }: ShellProps) {
  const inAdmin = adminNav.some((item) => item.isActive(pathname))
  const adminCount = adminNav.reduce(
    (sum, item) => sum + (item.badge ? counts[item.badge] : 0),
    0
  )
  return (
    <nav
      aria-label="Main"
      className="flex h-14 shrink-0 border-t bg-sidebar md:hidden"
    >
      {chatNav.map((item) => {
        const active = item.isActive(pathname)
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: true }}
            aria-current={active ? "page" : undefined}
            data-active={active ? "" : undefined}
            className={tabClass}
          >
            <span className="flex h-6 items-center">
              <item.icon className="size-5" />
            </span>
            {item.label}
          </Link>
        )
      })}
      {user.role === "admin" && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={tabClass}
            data-active={inAdmin ? "" : undefined}
          >
            <span className="relative flex h-6 items-center">
              <ShieldCheckIcon className="size-5" />
              {adminCount > 0 && (
                <CountBadge
                  count={adminCount}
                  className="absolute -top-1 -right-3"
                />
              )}
            </span>
            Admin
            {adminCount > 0 && (
              <span className="sr-only">
                {adminNav
                  .filter((item) => item.badge && counts[item.badge] > 0)
                  .map((item) => `, ${itemLabel(item, counts)}`)
                  .join("")}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-56">
            {adminNav.map((item) => {
              const active = item.isActive(pathname)
              return (
                <DropdownMenuItem
                  key={item.to}
                  className={cn(active && "font-medium")}
                  render={
                    <Link
                      to={item.to}
                      activeOptions={{ exact: true }}
                      aria-current={active ? "page" : undefined}
                    />
                  }
                >
                  <item.icon />
                  {item.label}
                  {item.badge && counts[item.badge] > 0 && (
                    <>
                      <CountBadge
                        count={counts[item.badge]}
                        className="ml-auto"
                      />
                      <span className="sr-only">
                        , {countMeaning[item.badge](counts[item.badge])}
                      </span>
                    </>
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className={tabClass}>
          <span className="flex h-6 items-center">
            <UserAvatar user={user} size="sm" />
          </span>
          Account
        </DropdownMenuTrigger>
        <UserMenuContent user={user} side="top" align="end" sideOffset={8} />
      </DropdownMenu>
    </nav>
  )
}
