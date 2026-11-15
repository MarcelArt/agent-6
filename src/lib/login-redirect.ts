import { redirect } from "@tanstack/react-router"
import type { SessionUser } from "./roles"

/** Where a person lands after login when they asked for nothing else. */
export const DEFAULT_AFTER_LOGIN = "/chat"

/**
 * The address to go to after login. Only a path inside Agent 6 is accepted,
 * so a crafted login link cannot send someone to another site.
 */
export function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith("/")) return DEFAULT_AFTER_LOGIN
  // "//host" and "/\host" leave the site in browsers.
  if (target.startsWith("//") || target.includes("\\")) {
    return DEFAULT_AFTER_LOGIN
  }
  if (target === "/login" || /^\/login[/?#]/.test(target)) {
    return DEFAULT_AFTER_LOGIN
  }
  return target
}

/**
 * For `beforeLoad` of routes that need a login: returns the user, or sends
 * the person to `/login` and remembers the address they asked for.
 */
export function requireUser(
  user: SessionUser | null,
  href: string
): SessionUser {
  if (!user) {
    throw redirect({
      to: "/login",
      search: href === DEFAULT_AFTER_LOGIN ? {} : { redirect: href },
    })
  }
  return user
}
