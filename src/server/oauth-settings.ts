import "@tanstack/react-start/server-only"

import { z } from "zod"
import { createSettingsRepository } from "./repositories/settings"
import { decrypt, encrypt } from "./secrets"
import type { SettingsRepository } from "./repositories/settings"
import type { OAuthInput, OAuthSettings } from "@/lib/oauth"
import { OAUTH_PROVIDER_ID } from "@/lib/oauth"

export const OAUTH_SETTINGS_KEY = "oauthProvider"

const httpUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value)
  return !url.username && !url.password && !url.hash && !url.search
})

export const oauthInputSchema = z.object({
  enabled: z.boolean(),
  displayName: z.string().trim().max(80),
  discoveryUrl: z.string().trim().max(2048),
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
    discoveryUrl: "",
    clientId: "",
    encryptedClientSecret: "",
    scopes: "openid email profile",
  }
}

export function publicOAuthSettings(
  saved: StoredOAuthSettings,
  baseUrl: string
): OAuthSettings {
  return {
    enabled: saved.enabled,
    displayName: saved.displayName,
    discoveryUrl: saved.discoveryUrl,
    clientId: saved.clientId,
    scopes: saved.scopes,
    hasClientSecret: !!saved.encryptedClientSecret,
    redirectUrl: `${baseUrl.replace(/\/$/, "")}/api/auth/callback/${OAUTH_PROVIDER_ID}`,
  }
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
  encryptionKey: string
): StoredOAuthSettings {
  return {
    enabled: input.enabled,
    displayName: input.displayName,
    discoveryUrl: input.discoveryUrl ? discoveryUrl(input.discoveryUrl) : "",
    clientId: input.clientId,
    scopes: [...new Set(input.scopes.split(/\s+/).filter(Boolean))].join(" "),
    encryptedClientSecret: input.clientSecret
      ? encrypt(input.clientSecret, encryptionKey)
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

/** OAuth 2.0 providers without JWKS must supply identity through authenticated UserInfo. */
export async function fetchOAuthUserInfo(url: string, accessToken?: string) {
  if (!accessToken) return null
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return null
  const result = z
    .object({
      sub: z.string().min(1).optional(),
      id: z.union([z.string().min(1), z.number()]).optional(),
      email: z.email(),
      email_verified: z.boolean().optional().default(false),
      name: z.string().optional(),
    })
    .refine((profile) => !!profile.sub || profile.id !== undefined)
    .safeParse(await response.json())
  if (!result.success) return null
  return { ...result.data, emailVerified: result.data.email_verified }
}
