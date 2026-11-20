import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { createOAuthManagement } from "./oauth-management"
import { readOAuthSettings } from "./oauth-settings"
import { TOKEN_ENDPOINT_AUTH_METHODS } from "@/lib/oauth"

/** The only provider information exposed before sign-in. */
export const getLoginProvider = createServerFn({ method: "GET" }).handler(
  () => {
    const saved = readOAuthSettings()
    return saved.enabled ? { displayName: saved.displayName } : null
  }
)

export const getOAuthSettings = createServerFn({ method: "GET" }).handler(() =>
  createOAuthManagement().get(getRequestHeaders())
)

export const saveOAuthSettings = createServerFn({ method: "POST" })
  .validator(
    z.object({
      enabled: z.boolean(),
      displayName: z.string(),
      mode: z.enum(["discovery", "manual"]).default("discovery"),
      discoveryUrl: z.string(),
      authorizationUrl: z.string().default(""),
      tokenUrl: z.string().default(""),
      resourceUrl: z.string().default(""),
      redirectUrl: z.string().default(""),
      logoutUrl: z.string().default(""),
      userIdentifier: z.string().default(""),
      tokenEndpointAuthMethod: z
        .enum(TOKEN_ENDPOINT_AUTH_METHODS)
        .default("client_secret_basic"),
      clientId: z.string(),
      clientSecret: z.string(),
      scopes: z.string(),
    })
  )
  .handler(({ data }) =>
    createOAuthManagement().save(getRequestHeaders(), data)
  )

export const testOAuthDiscovery = createServerFn({ method: "POST" })
  .validator(z.object({ discoveryUrl: z.string().max(2048) }))
  .handler(({ data }) =>
    createOAuthManagement().test(getRequestHeaders(), data.discoveryUrl)
  )
