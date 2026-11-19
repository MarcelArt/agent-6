import "@tanstack/react-start/server-only"

import { z } from "zod"
import { createSettingsRepository } from "./repositories/settings"
import { decrypt, encrypt } from "./secrets"
import type { SettingsRepository } from "./repositories/settings"
import type { OAuthInput, OAuthSettings } from "@/lib/oauth"
import { DEFAULT_OIDC_SCOPES, OAUTH_PROVIDER_ID } from "@/lib/oauth"

export const OAUTH_SETTINGS_KEY = "oauthProvider"

export const oauthEndpointUrl = z
  .url({ protocol: /^https?$/ })
  .refine((value) => {
    const url = new URL(value)
    return !url.username && !url.password && !url.hash
  })

const httpUrl = oauthEndpointUrl.refine((value) => !new URL(value).search)
const optionalEndpoint = z.string().trim().max(2048).default("")
const manualDefaults = {
  authorizationUrl: "",
  tokenUrl: "",
  resourceUrl: "",
  redirectUrl: "",
  logoutUrl: "",
  userIdentifier: "",
}

export const oauthInputSchema = z.object({
  enabled: z.boolean(),
  displayName: z.string().trim().max(80),
  mode: z.enum(["discovery", "manual"]).default("discovery"),
  discoveryUrl: z.string().trim().max(2048),
  authorizationUrl: optionalEndpoint,
  tokenUrl: optionalEndpoint,
  resourceUrl: optionalEndpoint,
  redirectUrl: optionalEndpoint,
  logoutUrl: optionalEndpoint,
  userIdentifier: z.string().trim().max(256).default(""),
  clientId: z.string().trim().max(512),
  clientSecret: z.string().max(8192),
  scopes: z.string().trim().max(1024),
})

const storedSchema = oauthInputSchema.omit({ clientSecret: true }).extend({
  encryptedClientSecret: z.string(),
})
export type StoredOAuthSettings = z.infer<typeof storedSchema>
export type OAuthProvider = Omit<
  StoredOAuthSettings,
  "encryptedClientSecret"
> & {
  clientSecret: string
  userInfoUrl?: string
}

export function readOAuthSettings(
  settings: SettingsRepository = createSettingsRepository()
): StoredOAuthSettings {
  const value = settings.get(OAUTH_SETTINGS_KEY)
  if (value) return storedSchema.parse(JSON.parse(value))
  return {
    enabled: false,
    displayName: "",
    mode: "discovery",
    discoveryUrl: "",
    ...manualDefaults,
    clientId: "",
    encryptedClientSecret: "",
    scopes: DEFAULT_OIDC_SCOPES,
  }
}

export function publicOAuthSettings(
  saved: StoredOAuthSettings,
  baseUrl: string
): OAuthSettings {
  const { encryptedClientSecret, ...provider } = saved
  const defaultRedirectUrl = oauthRedirectUrl(baseUrl)
  return {
    ...provider,
    hasClientSecret: !!encryptedClientSecret,
    defaultRedirectUrl,
    redirectUrl: provider.redirectUrl || defaultRedirectUrl,
  }
}

export function oauthRedirectUrl(baseUrl: string): string {
  return new URL(`/api/auth/callback/${OAUTH_PROVIDER_ID}`, baseUrl).href
}

export function isOAuthRedirectUrl(value: string, baseUrl: string): boolean {
  if (!httpUrl.safeParse(value).success) return false
  const url = new URL(value)
  return (
    url.origin === new URL(baseUrl).origin &&
    /^\/api\/auth\/callback\/[\w-]+$/.test(url.pathname) &&
    url.href === value
  )
}

/** Accept an issuer, or the complete discovery document URL. */
export function discoveryUrl(value: string): string {
  const url = httpUrl.parse(value)
  return url.includes("/.well-known/")
    ? url
    : `${url.replace(/\/$/, "")}/.well-known/openid-configuration`
}

export function storeOAuthSettings(
  input: OAuthInput,
  previous: StoredOAuthSettings,
  { baseUrl, encryptionKey }: { baseUrl: string; encryptionKey: string }
): StoredOAuthSettings {
  const { clientSecret, ...provider } = input
  return {
    ...provider,
    ...(input.mode === "discovery"
      ? {
          ...manualDefaults,
          discoveryUrl: input.discoveryUrl
            ? discoveryUrl(input.discoveryUrl)
            : "",
        }
      : {
          discoveryUrl: "",
          redirectUrl:
            input.redirectUrl === oauthRedirectUrl(baseUrl)
              ? ""
              : input.redirectUrl,
        }),
    scopes: [...new Set(input.scopes.split(/\s+/).filter(Boolean))].join(" "),
    encryptedClientSecret: clientSecret
      ? encrypt(clientSecret, encryptionKey)
      : previous.encryptedClientSecret,
  }
}

export function decryptOAuthProvider(
  saved: StoredOAuthSettings,
  encryptionKey: string
): OAuthProvider {
  const { encryptedClientSecret, ...provider } = saved
  return {
    ...provider,
    clientSecret: decrypt(encryptedClientSecret, encryptionKey),
  }
}

/** No credentials are sent to discovery; failures never echo a provider response. */
export async function loadDiscovery(value: string) {
  const response = await fetch(discoveryUrl(value), {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  })
  if (!response.ok) throw new Error("Discovery unavailable")
  return z
    .object({
      issuer: httpUrl,
      authorization_endpoint: z.url({ protocol: /^https?$/ }),
      token_endpoint: z.url({ protocol: /^https?$/ }),
      jwks_uri: z.url({ protocol: /^https?$/ }).optional(),
      userinfo_endpoint: z.url({ protocol: /^https?$/ }).optional(),
    })
    .refine((document) => !!document.jwks_uri || !!document.userinfo_endpoint)
    .parse(await response.json())
}

export async function testDiscovery(value: string): Promise<void> {
  await loadDiscovery(value)
}

function readUserIdentifier(profile: unknown, path: string): unknown {
  let value = profile
  for (const key of path.split(".")) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.hasOwn(value, key)
    )
      return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

const oauthSubject = z.union([
  z.string().refine((value) => value.trim().length > 0),
  z.number(),
])
const oauthProfile = z.object({
  email: z.email(),
  email_verified: z.boolean().optional().default(false),
  name: z.string().optional(),
})
const discoveryProfile = oauthProfile.extend({
  sub: z.string().min(1).optional(),
  id: z.union([z.string().min(1), z.number()]).optional(),
})

/** OAuth-only providers supply identity through the bearer-authenticated resource. */
export async function fetchOAuthUserInfo(
  url: string,
  accessToken?: string,
  userIdentifier?: string
) {
  if (!accessToken) return null
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return null
  const raw: unknown = await response.json()
  if (userIdentifier) {
    const result = oauthProfile.safeParse(raw)
    const subject = oauthSubject.safeParse(
      readUserIdentifier(raw, userIdentifier)
    )
    if (!result.success || !subject.success) return null
    const { email, name, email_verified } = result.data
    return { id: subject.data, email, name, emailVerified: email_verified }
  }
  const result = discoveryProfile.safeParse(raw)
  if (!result.success || (!result.data.sub && result.data.id === undefined))
    return null
  return { ...result.data, emailVerified: result.data.email_verified }
}
