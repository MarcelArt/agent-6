import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/lib/theme"
import type { ThemeMode } from "@/lib/theme"

/**
 * Content of the user menu: the only theme control in the app.
 * Step 03 adds the user's name and email above it and Log out below it.
 */
export function UserMenuContent(
  props: Pick<
    React.ComponentProps<typeof DropdownMenuContent>,
    "side" | "align" | "sideOffset"
  >
) {
  const [mode, setMode] = useTheme()
  return (
    <DropdownMenuContent className="w-60" {...props}>
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
    </DropdownMenuContent>
  )
}
