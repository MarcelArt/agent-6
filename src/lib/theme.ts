import { useSyncExternalStore } from "react"

export type ThemeMode = "light" | "dark" | "system"

const STORAGE_KEY = "agent6-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

/**
 * Runs in <head> before the first paint, so a reload never flashes the other
 * theme. Keep it in step with `readMode` and `apply` below.
 */
export const themeScript = `(function(){try{var m=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})}catch(e){}var d=m==="dark"||(m!=="light"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})()`

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : "system"
  } catch {
    return "system"
  }
}

function apply(mode: ThemeMode) {
  const dark =
    mode === "dark" || (mode === "system" && matchMedia(DARK_QUERY).matches)
  const root = document.documentElement
  root.classList.toggle("dark", dark)
  root.style.colorScheme = dark ? "dark" : "light"
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  // Follow the operating system, and a choice made in another tab.
  const sync = () => {
    apply(readMode())
    listener()
  }
  const media = matchMedia(DARK_QUERY)
  media.addEventListener("change", sync)
  window.addEventListener("storage", sync)
  listeners.add(listener)
  return () => {
    media.removeEventListener("change", sync)
    window.removeEventListener("storage", sync)
    listeners.delete(listener)
  }
}

function setMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage is blocked: the choice still applies until the next reload.
  }
  apply(mode)
  listeners.forEach((listener) => listener())
}

/** The chosen theme mode, remembered in this browser, and a setter. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(
    subscribe,
    readMode,
    () => "system" as const
  )
  return [mode, setMode]
}
