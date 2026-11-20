export const OAUTH_PROVIDER_ID = "organization"
export const OAUTH_ACCOUNT_MESSAGE =
  "Your account has not been set up. Ask your administrator."

export const DEFAULT_OIDC_SCOPES = "openid email profile"

/** How Agent 6 sends the client ID and secret to the token endpoint. */
export const TOKEN_ENDPOINT_AUTH_METHODS = [
  "client_secret_basic",
  "client_secret_post",
] as const
export type TokenEndpointAuthMethod =
  (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number]

export type OAuthInput = {
  enabled: boolean
  displayName: string
  mode: "discovery" | "manual"
  discoveryUrl: string
  authorizationUrl: string
  tokenUrl: string
  resourceUrl: string
  redirectUrl: string
  logoutUrl: string
  userIdentifier: string
  /** Manual mode only; discovery mode reads the provider's supported methods. */
  tokenEndpointAuthMethod: TokenEndpointAuthMethod
  clientId: string
  /** Empty keeps the saved secret. */
  clientSecret: string
  scopes: string
}

/** Safe for the Admin browser. The saved secret is never included. */
export type OAuthSettings = Omit<OAuthInput, "clientSecret"> & {
  hasClientSecret: boolean
  defaultRedirectUrl: string
}

export type OAuthResult =
  { ok: true } | { ok: false; message: string; field?: keyof OAuthInput }

export function oauthLoginError(error?: string): string | undefined {
  if (!error) return undefined
  if (
    [
      "account_not_set_up",
      "signup_disabled",
      "account_not_linked",
      "email_not_verified",
      "email_not_found",
      "banned_user",
    ].includes(error.toLowerCase())
  )
    return OAUTH_ACCOUNT_MESSAGE
  return "Agent 6 could not sign you in with your provider. Try again or use your email and password."
}
