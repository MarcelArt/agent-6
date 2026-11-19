import { useSyncExternalStore } from "react"

const STORAGE_KEY = "agent6-rail"
const ATTRIBUTE = "data-rail"
const EXPANDED = "expanded"

/**
 * Runs in <head> before the first paint, so a reload never flashes the
 * collapsed rail. The `rail-expanded` style variant reads the attribute it
 * sets; keep it in step with `read` and `apply` below.
 */
export const railScript = `(function(){try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})===${JSON.stringify(EXPANDED)})document.documentElement.setAttribute(${JSON.stringify(ATTRIBUTE)},${JSON.stringify(EXPANDED)})}catch(e){}})()`

// Holds the choice for this page when storage is blocked.
let fallback = false

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === EXPANDED
  } catch {
    return fallback
  }
}

function apply(expanded: boolean) {
  const root = document.documentElement
  if (expanded) root.setAttribute(ATTRIBUTE, EXPANDED)
  else root.removeAttribute(ATTRIBUTE)
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  // Follow a choice made in another tab.
  const sync = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return
    apply(read())
    listener()
  }
  window.addEventListener("storage", sync)
  listeners.add(listener)
  return () => {
    window.removeEventListener("storage", sync)
    listeners.delete(listener)
  }
}

function setExpanded(expanded: boolean) {
  fallback = expanded
  try {
    if (expanded) localStorage.setItem(STORAGE_KEY, EXPANDED)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is blocked: the choice still applies until the next reload.
  }
  apply(expanded)
  listeners.forEach((listener) => listener())
}

/** Whether the desktop rail shows labels, remembered in this browser. */
export function useRailExpanded(): [boolean, (expanded: boolean) => void] {
  const expanded = useSyncExternalStore(subscribe, read, () => false)
  return [expanded, setExpanded]
}
