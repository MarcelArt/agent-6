import "@tanstack/react-start/server-only"

import { betterAuth } from "better-auth"
import { createHash } from "node:crypto"
import { genericOAuth } from "better-auth/plugins/generic-oauth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { getConfig } from "./config"
import { getDb } from "./repositories/db"
import { account, session, user, verification } from "./repositories/schema"
import { createUsersRepository } from "./repositories/users"
import { createSettingsRepository } from "./repositories/settings"
import {
  decryptOAuthProvider,
  fetchOAuthUserInfo,
  loadDiscovery,
  OAUTH_SETTINGS_KEY,
  readOAuthSettings,
} from "./oauth-settings"
import type { OAuthProvider } from "./oauth-settings"
import { OAUTH_ACCOUNT_MESSAGE, OAUTH_PROVIDER_ID } from "@/lib/oauth"
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
 * `auth.api.createUser`, by an Admin (`user-management.ts`) or by
 * `first-admin.ts`.
 */
export function createAuth(
  db: Db,
  options: { secret: string; baseUrl: string; oauth?: OAuthProvider }
) {
  const users = createUsersRepository(db)
  const provider = options.oauth
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    onAPIError: { errorURL: `${options.baseUrl.replace(/\/$/, "")}/login` },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // All local users are provisioned by an Admin; no public sign-up exists.
        requireLocalEmailVerified: false,
        allowDifferentEmails: false,
        updateUserInfoOnLink: false,
      },
    },
    user: {
      validateUserInfo: ({ user: incoming, source }) => {
        if (source.method !== "oauth") return
        const existing = incoming.email
          ? users.findByEmail(incoming.email)
          : undefined
        if (
          source.oauth?.providerId !== OAUTH_PROVIDER_ID ||
          source.action === "create-user" ||
          incoming.emailVerified !== true ||
          !existing ||
          existing.disabled ||
          existing.id !== incoming.id
        )
          return {
            error: "account_not_set_up",
            errorDescription: OAUTH_ACCOUNT_MESSAGE,
          }
      },
    },
    plugins: [
      genericOAuth({
        config: provider
          ? [
              {
                providerId: OAUTH_PROVIDER_ID,
                name: provider.displayName,
                discoveryUrl: provider.discoveryUrl,
                clientId: provider.clientId,
                clientSecret: provider.clientSecret,
                scopes: provider.scopes.split(/\s+/).filter(Boolean),
                disableSignUp: true,
                disableImplicitSignUp: true,
                requireIdTokenVerification: !provider.userInfoUrl,
                getUserInfo: provider.userInfoUrl
                  ? (tokens) =>
                      fetchOAuthUserInfo(
                        provider.userInfoUrl!,
                        tokens.accessToken
                      )
                  : undefined,
                disableProviderLogout: true,
                overrideUserInfo: false,
                // A subject from a replacement issuer must never reuse an old binding.
                accountSubject: ({ profile }) => {
                  const subject = profile.sub ?? profile.id
                  if (
                    (typeof subject !== "string" &&
                      typeof subject !== "number") ||
                    !String(subject)
                  )
                    throw new Error("Missing provider subject")
                  return createHash("sha256")
                    .update(
                      JSON.stringify([
                        provider.discoveryUrl,
                        provider.clientId,
                        subject,
                      ])
                    )
                    .digest("hex")
                },
              },
            ]
          : [],
      }),
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

/** Keep discovery off password/session paths and pick up stored changes per request. */
export function createAuthHandler(
  db: Db,
  options: { secret: string; baseUrl: string; encryptionKey: string }
) {
  const passwordAuth = createAuth(db, options)
  const settings = createSettingsRepository(db)
  let oauthCache: { revision: string; auth: Promise<Auth> } | undefined
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname
    const oauthPath =
      /\/api\/auth\/(sign-in\/social|callback\/|link-social)/.test(path)
    if (!oauthPath) return passwordAuth.handler(request)
    const saved = readOAuthSettings(settings)
    if (!saved.enabled) {
      oauthCache = undefined
      if (path.includes("/callback/"))
        return Response.redirect(
          `${options.baseUrl}/login?error=provider_disabled`,
          302
        )
      return Response.json(
        { code: "PROVIDER_DISABLED", message: "Provider sign-in is disabled." },
        { status: 400 }
      )
    }
    const revision = settings.get(OAUTH_SETTINGS_KEY)!
    try {
      if (oauthCache?.revision !== revision)
        oauthCache = {
          revision,
          auth: loadDiscovery(saved.discoveryUrl).then((document) =>
            createAuth(db, {
              ...options,
              oauth: {
                ...decryptOAuthProvider(saved, options.encryptionKey),
                userInfoUrl: document.userinfo_endpoint,
              },
            })
          ),
        }
      return await (await oauthCache.auth).handler(request)
    } catch {
      if (oauthCache?.revision === revision) oauthCache = undefined
      // Never surface provider responses or configuration (including secrets).
      if (path.includes("/callback/"))
        return Response.redirect(
          `${options.baseUrl}/login?error=provider_unavailable`,
          302
        )
      return Response.json(
        {
          code: "PROVIDER_UNAVAILABLE",
          message:
            "Provider sign-in is unavailable. Use your email and password or try again.",
        },
        { status: 503 }
      )
    }
  }
}

let handler: ReturnType<typeof createAuthHandler> | undefined
export function handleAuthRequest(request: Request) {
  if (!handler) {
    const config = getConfig()
    handler = createAuthHandler(getDb(), {
      secret: config.authSecret,
      baseUrl: config.baseUrl,
      encryptionKey: config.encryptionKey,
    })
  }
  return handler(request)
}
