import "@tanstack/react-start/server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { getConfig } from "./config"
import { getDb } from "./repositories/db"
import { account, session, user, verification } from "./repositories/schema"
import type { Db } from "./repositories/db"

const ac = createAccessControl(defaultStatements)

/** What each role may do through Better Auth's user management endpoints. */
const roles = {
  admin: ac.newRole(adminAc.statements),
  client: ac.newRole({ user: [], session: [] }),
}

/**
 * Builds the Better Auth instance: email and password sign-in on Agent 6's
 * own database, with the roles `admin` and `client`.
 *
 * Nobody can register themselves. Users are created with
 * `auth.api.createUser`, by an Admin (step 04) or by `first-admin.ts`.
 */
export function createAuth(
  db: Db,
  options: { secret: string; baseUrl: string }
) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    plugins: [
      admin({
        ac,
        roles,
        adminRoles: ["admin"],
        defaultRole: "client",
      }),
      // Must stay the last plugin.
      tanstackStartCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let cached: Auth | undefined

/** The Better Auth instance of this process. */
export function getAuth(): Auth {
  if (!cached) {
    const { authSecret, baseUrl } = getConfig()
    cached = createAuth(getDb(), { secret: authSecret, baseUrl })
  }
  return cached
}
