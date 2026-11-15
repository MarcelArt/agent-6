import "@tanstack/react-start/server-only"

import { z } from "zod"
import { ConfigError } from "./config"
import type { Auth } from "./auth"
import type { UsersRepository } from "./repositories/users"

/** Better Auth's default minimum. */
const MIN_PASSWORD_LENGTH = 8

/**
 * Creates the first Admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when no
 * user exists. Once any user exists it does nothing, whatever the variables
 * say. Returns whether it created the Admin.
 */
export async function ensureFirstAdmin(deps: {
  auth: Auth
  users: UsersRepository
  adminEmail?: string
  adminPassword?: string
}): Promise<boolean> {
  if (deps.users.count() > 0) return false

  const { adminEmail: email, adminPassword: password } = deps
  const problems: Array<string> = []
  if (!email) {
    problems.push(
      "ADMIN_EMAIL is required while no user exists. It becomes the first Admin's login."
    )
  } else if (!z.email().safeParse(email).success) {
    problems.push("ADMIN_EMAIL must be an email address.")
  }
  if (!password) {
    problems.push(
      "ADMIN_PASSWORD is required while no user exists. It becomes the first Admin's password."
    )
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`
    )
  }
  if (!email || !password || problems.length > 0) {
    throw new ConfigError(problems)
  }

  // Called without request headers, so Better Auth treats it as a trusted
  // server call and asks for no Admin session.
  await deps.auth.api.createUser({
    body: { email, password, name: "Admin", role: "admin" },
  })
  return true
}
