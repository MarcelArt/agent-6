import "@tanstack/react-start/server-only"

import { getRequestHeaders } from "@tanstack/react-start/server"
import { getAuth } from "./auth"
import type { Auth } from "./auth"
import type { SessionUser } from "@/lib/roles"

/*
 * Who is calling. Every server function that reads or changes data starts
 * with `requireSession()` or `requireAdmin()`; hiding a screen in the UI is
 * never the protection.
 */

export class AuthorizationError extends Error {
  constructor(
    /** `unauthenticated`: not logged in. `forbidden`: logged in, not an Admin. */
    public readonly reason: "unauthenticated" | "forbidden"
  ) {
    super(
      reason === "unauthenticated"
        ? "You are not logged in."
        : "Only an Admin can do this."
    )
    this.name = "AuthorizationError"
  }
}

type Source = {
  /** Defaults to the headers of the request being handled. */
  headers?: Headers
  auth?: Auth
}

/** The logged-in user of the request, or null. */
export async function getSessionUser(
  source: Source = {}
): Promise<SessionUser | null> {
  const auth = source.auth ?? getAuth()
  const headers = source.headers ?? getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  const { id, name, email, role } = session.user
  // Anything that is not exactly "admin" gets the lesser role.
  return { id, name, email, role: role === "admin" ? "admin" : "client" }
}

/** The logged-in user. Throws an `AuthorizationError` when nobody is logged in. */
export async function requireSession(source?: Source): Promise<SessionUser> {
  const user = await getSessionUser(source)
  if (!user) throw new AuthorizationError("unauthenticated")
  return user
}

/** The logged-in Admin. Throws an `AuthorizationError` for anyone else. */
export async function requireAdmin(source?: Source): Promise<SessionUser> {
  const user = await requireSession(source)
  if (user.role !== "admin") throw new AuthorizationError("forbidden")
  return user
}
