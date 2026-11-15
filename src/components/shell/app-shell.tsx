import { Link, useLocation } from "@tanstack/react-router"
import { ShieldCheckIcon, UserIcon } from "lucide-react"
import { cn } from "cn"
import { adminNav, chatNav } from "./nav"
import { UserMenuContent } from "./user-menu"
import type { NavItem } from "./nav"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
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
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <div className="flex h-svh flex-col overflow-hidden md:flex-row">
      <Rail pathname={pathname} />
      {children}
      <TabBar pathname={pathname} />
    </div>
  )
}

function UserAvatar({ size }: { size?: "sm" }) {
  return (
    <Avatar size={size}>
      <AvatarFallback className="text-foreground">
        <UserIcon className={size === "sm" ? "size-3.5" : "size-4"} />
      </AvatarFallback>
    </Avatar>
  )
}

function Rail({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2 text-sidebar-foreground md:flex"
    >
      <Link to="/chat" aria-label="Agent 6" className="mb-2 flex">
        <ProductMark />
      </Link>
      {chatNav.map((item) => (
        <RailItem key={item.to} item={item} pathname={pathname} />
      ))}
      <Separator className="my-1.5 w-6!" />
      {adminNav.map((item) => (
        <RailItem key={item.to} item={item} pathname={pathname} />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account: theme"
          className="mt-auto rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <UserAvatar />
        </DropdownMenuTrigger>
        <UserMenuContent side="right" align="end" sideOffset={20} />
      </DropdownMenu>
    </nav>
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

function RailItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.isActive(pathname)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={item.to}
            activeOptions={{ exact: true }}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-lg" }),
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent",
              active && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
          />
        }
      >
        <item.icon />
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

const tabClass =
  "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground outline-none focus-visible:bg-sidebar-accent aria-expanded:text-foreground data-active:font-medium data-active:text-foreground"

function TabBar({ pathname }: { pathname: string }) {
  const inAdmin = adminNav.some((item) => item.isActive(pathname))
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
      <DropdownMenu>
        <DropdownMenuTrigger
          className={tabClass}
          data-active={inAdmin ? "" : undefined}
        >
          <span className="flex h-6 items-center">
            <ShieldCheckIcon className="size-5" />
          </span>
          Admin
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
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger className={tabClass}>
          <span className="flex h-6 items-center">
            <UserAvatar size="sm" />
          </span>
          Account
        </DropdownMenuTrigger>
        <UserMenuContent side="top" align="end" sideOffset={8} />
      </DropdownMenu>
    </nav>
  )
}
