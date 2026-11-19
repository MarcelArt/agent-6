import "@tanstack/react-start/server-only"

import { betterAuth } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
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
  isOAuthRedirectUrl,
  loadDiscovery,
  OAUTH_SETTINGS_KEY,
  oauthRedirectUrl,
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

function providerNamespace(provider: OAuthProvider): Array<string> {
  return provider.mode === "manual"
    ? [
        "manual",
        provider.authorizationUrl,
        provider.tokenUrl,
        provider.resourceUrl,
        provider.userIdentifier,
        provider.clientId,
      ]
    : [provider.discoveryUrl, provider.clientId]
}

function manualOAuthLogout(provider: OAuthProvider) {
  const namespace = providerNamespace(provider)
  const sessionMarker = (token: string) =>
    createHash("sha256")
      .update(JSON.stringify([...namespace, token]))
      .digest("hex")

  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/callback/:id" && ctx.path !== "/sign-out") return
    const { context } = ctx
    const marker = context.createAuthCookie("organization_oauth", {
      maxAge: context.sessionConfig.expiresIn,
    })
    if (ctx.path === "/callback/:id") {
      const newSession = context.newSession?.session
      if (ctx.params?.id === OAUTH_PROVIDER_ID && newSession)
        await ctx.setSignedCookie(
          marker.name,
          sessionMarker(newSession.token),
          context.secret,
          marker.attributes
        )
      return
    }
    const signedMarker = await ctx.getSignedCookie(marker.name, context.secret)
    if (!signedMarker) return
    ctx.setCookie(marker.name, "", { ...marker.attributes, maxAge: 0 })
    const token = await ctx.getSignedCookie(
      context.authCookies.sessionToken.name,
      context.secret
    )
    const response = context.returned
    if (
      token &&
      signedMarker === sessionMarker(token) &&
      response &&
      typeof response === "object" &&
      "success" in response &&
      response.success === true
    )
      return ctx.json({
        success: true,
        url: provider.logoutUrl,
        redirect: !ctx.body?.disableRedirect,
      })
  })
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
  const manual = provider?.mode === "manual" ? provider : undefined
  const userInfoUrl = manual?.resourceUrl ?? provider?.userInfoUrl
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    onAPIError: { errorURL: `${options.baseUrl.replace(/\/$/, "")}/login` },
    hooks: manual?.logoutUrl ? { after: manualOAuthLogout(manual) } : undefined,
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
                discoveryUrl: manual ? undefined : provider.discoveryUrl,
                authorizationUrl: manual?.authorizationUrl,
                tokenUrl: manual?.tokenUrl,
                redirectURI: manual?.redirectUrl || undefined,
                clientId: provider.clientId,
                clientSecret: provider.clientSecret,
                scopes: provider.scopes.split(/\s+/).filter(Boolean),
                disableSignUp: true,
                disableImplicitSignUp: true,
                requireIdTokenVerification: !userInfoUrl,
                getUserInfo: userInfoUrl
                  ? (tokens) =>
                      fetchOAuthUserInfo(
                        userInfoUrl,
                        tokens.accessToken,
                        manual?.userIdentifier
                      )
                  : undefined,
                disableProviderLogout: true,
                overrideUserInfo: false,
                // A subject from a replacement provider must never reuse an old binding.
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
                      JSON.stringify([...providerNamespace(provider), subject])
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
    const callback = path.startsWith("/api/auth/callback/")
    const signOut = path === "/api/auth/sign-out"
    if (
      !callback &&
      !signOut &&
      path !== "/api/auth/sign-in/social" &&
      path !== "/api/auth/link-social"
    )
      return passwordAuth.handler(request)
    const saved = readOAuthSettings(settings)
    if (
      signOut &&
      (!saved.enabled || saved.mode !== "manual" || !saved.logoutUrl)
    )
      return passwordAuth.handler(request)
    if (!saved.enabled) {
      oauthCache = undefined
      if (callback)
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
          auth: (async () => {
            const oauth = decryptOAuthProvider(saved, options.encryptionKey)
            if (oauth.mode === "discovery")
              oauth.userInfoUrl = (
                await loadDiscovery(oauth.discoveryUrl)
              ).userinfo_endpoint
            else if (
              oauth.redirectUrl &&
              !isOAuthRedirectUrl(oauth.redirectUrl, options.baseUrl)
            )
              throw new Error("Invalid OAuth callback address")
            return createAuth(db, { ...options, oauth })
          })(),
        }
      if (
        callback &&
        saved.mode === "manual" &&
        saved.redirectUrl &&
        path === new URL(saved.redirectUrl).pathname
      ) {
        const callbackUrl = new URL(oauthRedirectUrl(options.baseUrl))
        callbackUrl.search = new URL(request.url).search
        request = new Request(callbackUrl, request)
      }
      return await (await oauthCache.auth).handler(request)
    } catch {
      if (oauthCache?.revision === revision) oauthCache = undefined
      // Never surface provider responses or configuration (including secrets).
      if (signOut) return passwordAuth.handler(request)
      if (callback)
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
