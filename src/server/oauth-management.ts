import "@tanstack/react-start/server-only"

import { getConfig } from "./config"
import { createSettingsRepository } from "./repositories/settings"
import { requireAdmin } from "./session"
import {
  discoveryUrl,
  oauthInputSchema,
  OAUTH_SETTINGS_KEY,
  publicOAuthSettings,
  readOAuthSettings,
  storeOAuthSettings,
  testDiscovery,
} from "./oauth-settings"
import type { Auth } from "./auth"
import type { SettingsRepository } from "./repositories/settings"
import type { OAuthInput, OAuthResult } from "@/lib/oauth"

export function createOAuthManagement(
  deps: {
    auth?: Auth
    settings?: SettingsRepository
    config?: { baseUrl: string; encryptionKey: string }
    test?: (url: string) => Promise<void>
  } = {}
) {
  const settings = deps.settings ?? createSettingsRepository()
  const config = () => deps.config ?? getConfig()
  return {
    async get(headers: Headers) {
      await requireAdmin({ auth: deps.auth, headers })
      return publicOAuthSettings(readOAuthSettings(settings), config().baseUrl)
    },
    async save(headers: Headers, input: OAuthInput): Promise<OAuthResult> {
      await requireAdmin({ auth: deps.auth, headers })
      const parsed = oauthInputSchema.safeParse(input)
      if (!parsed.success)
        return {
          ok: false,
          message: "Check the provider fields and try again.",
        }
      const values = parsed.data
      const previous = readOAuthSettings(settings)
      if (values.enabled) {
        for (const field of [
          "displayName",
          "discoveryUrl",
          "clientId",
        ] as const) {
          if (!values[field])
            return {
              ok: false,
              field,
              message: "Fill in this field before enabling provider sign-in.",
            }
        }
        if (!values.clientSecret && !previous.encryptedClientSecret)
          return {
            ok: false,
            field: "clientSecret",
            message: "Enter the provider's client secret.",
          }
        if (!values.scopes.split(/\s+/).includes("email"))
          return {
            ok: false,
            field: "scopes",
            message: "Include the email scope so Agent 6 can match users.",
          }
      }
      try {
        if (values.discoveryUrl) discoveryUrl(values.discoveryUrl)
      } catch {
        return {
          ok: false,
          field: "discoveryUrl",
          message:
            "Enter an http or https issuer or discovery URL without credentials, query parameters or a fragment.",
        }
      }
      settings.set(
        OAUTH_SETTINGS_KEY,
        JSON.stringify(
          storeOAuthSettings(values, previous, config().encryptionKey)
        )
      )
      return { ok: true }
    },
    async test(headers: Headers, url: string): Promise<OAuthResult> {
      await requireAdmin({ auth: deps.auth, headers })
      try {
        await (deps.test ?? testDiscovery)(discoveryUrl(url.trim()))
        return { ok: true }
      } catch {
        return {
          ok: false,
          field: "discoveryUrl",
          message:
            "Agent 6 could not load a valid discovery document. Check the URL and the provider's availability, then try again.",
        }
      }
    },
  }
}
