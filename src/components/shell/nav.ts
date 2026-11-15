import {
  BoxesIcon,
  DatabaseIcon,
  FolderGit2Icon,
  HistoryIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { LinkProps } from "@tanstack/react-router"

export type NavItem = {
  label: string
  to: NonNullable<LinkProps["to"]>
  icon: LucideIcon
  isActive: (pathname: string) => boolean
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
      under("/chat")(pathname) && !under("/chat/history")(pathname),
  },
  {
    label: "History",
    to: "/chat/history",
    icon: HistoryIcon,
    isActive: under("/chat/history"),
  },
]

/** Sections for Admins. */
export const adminNav: Array<NavItem> = [
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
  },
  {
    label: "Log Connections",
    to: "/admin/log-connections",
    icon: ScrollTextIcon,
    isActive: under("/admin/log-connections"),
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: SettingsIcon,
    isActive: under("/admin/settings"),
  },
]
