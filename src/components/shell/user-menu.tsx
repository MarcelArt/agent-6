import { Link, useRouter } from "@tanstack/react-router"
import {
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react"
import type { SessionUser } from "@/lib/roles"
import type { ThemeMode } from "@/lib/theme"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth-client"
import { roleLabels } from "@/lib/roles"
import { useTheme } from "@/lib/theme"

/** Up to two letters for the Avatar: first and last word of the name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1
      ? [words[0], words[words.length - 1]].map((word) => [...word][0])
      : [...(words[0] ?? "")].slice(0, 2)
  return letters.join("").toUpperCase() || "?"
}

/**
 * Content of the user menu: who is logged in, the only theme control in the
 * app, the account page and Log out.
 */
export function UserMenuContent({
  user,
  ...props
}: { user: SessionUser } & Pick<
  React.ComponentProps<typeof DropdownMenuContent>,
  "side" | "align" | "sideOffset"
>) {
  const [mode, setMode] = useTheme()
  const router = useRouter()

  async function logOut() {
    await authClient.signOut()
    // Loads the login page with the session gone.
    await router.navigate({ to: "/login" })
  }

  return (
    <DropdownMenuContent className="w-60" {...props}>
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Avatar>
          <AvatarFallback className="text-xs font-medium text-foreground">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium">{user.name}</span>
            <Badge variant="outline" className="shrink-0">
              {roleLabels[user.role]}
            </Badge>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as ThemeMode)}
        >
          <DropdownMenuRadioItem value="light" closeOnClick={false}>
            <SunIcon />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" closeOnClick={false}>
            <MoonIcon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" closeOnClick={false}>
            <MonitorIcon />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link to="/chat/account" />}>
        <UserRoundIcon />
        Account
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void logOut()}>
        <LogOutIcon />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
