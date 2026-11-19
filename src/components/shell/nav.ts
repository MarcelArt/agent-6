import {
  BoxesIcon,
  DatabaseIcon,
  FolderGit2Icon,
  HistoryIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SettingsIcon,
  TicketIcon,
  TicketsIcon,
  UsersIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { LinkProps } from "@tanstack/react-router"
import type { NavCounts } from "@/lib/nav-counts"

export type NavItem = {
  label: string
  to: NonNullable<LinkProps["to"]>
  icon: LucideIcon
  isActive: (pathname: string) => boolean
  /** A count shown on the item, from the root route's context. */
  badge?: keyof NavCounts
}

const under = (base: string) => (pathname: string) =>
  pathname === base || pathname.startsWith(`${base}/`)

/** Sections every user sees. */
export const chatNav: Array<NavItem> = [
  {
    label: "Chat",
    to: "/chat",
    icon: MessageSquareIcon,
    isActive: (pathname) =>
      under("/chat")(pathname) &&
      !under("/chat/history")(pathname) &&
      !under("/chat/tickets")(pathname) &&
      !under("/chat/account")(pathname),
  },
  {
    label: "History",
    to: "/chat/history",
    icon: HistoryIcon,
    isActive: under("/chat/history"),
  },
  {
    label: "Tickets",
    to: "/chat/tickets",
    icon: TicketIcon,
    isActive: under("/chat/tickets"),
  },
]

/** Sections for Admins. */
export const adminNav: Array<NavItem> = [
  {
    label: "All Conversations",
    to: "/admin/conversations",
    icon: MessageSquareIcon,
    isActive: under("/admin/conversations"),
  },
  {
    label: "All Tickets",
    to: "/admin/tickets",
    icon: TicketsIcon,
    isActive: under("/admin/tickets"),
    badge: "pendingTickets",
  },
  {
    label: "Users",
    to: "/admin/users",
    icon: UsersIcon,
    isActive: under("/admin/users"),
  },
  {
    label: "Repositories",
    to: "/admin/repositories",
    icon: FolderGit2Icon,
    isActive: under("/admin/repositories"),
  },
  {
    label: "Applications",
    to: "/admin/applications",
    icon: BoxesIcon,
    isActive: under("/admin/applications"),
  },
  {
    label: "Database Connections",
    to: "/admin/database-connections",
    icon: DatabaseIcon,
    isActive: under("/admin/database-connections"),
    badge: "databaseConnectionsNeedingSecret",
  },
  {
    label: "Log Connections",
    to: "/admin/log-connections",
    icon: ScrollTextIcon,
    isActive: under("/admin/log-connections"),
    badge: "logConnectionsNeedingSecret",
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: SettingsIcon,
    isActive: under("/admin/settings"),
  },
]

/** What a nav count means, for screen readers and tooltips. */
export const countMeaning: Record<keyof NavCounts, (count: number) => string> =
  {
    pendingTickets: (count) => `${count} waiting for review`,
    databaseConnectionsNeedingSecret: (count) =>
      `${count} ${count === 1 ? "needs" : "need"} a secret`,
    logConnectionsNeedingSecret: (count) =>
      `${count} ${count === 1 ? "needs" : "need"} a secret`,
  }
