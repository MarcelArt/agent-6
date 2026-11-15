export const OAUTH_PROVIDER_ID = "organization"
export const OAUTH_ACCOUNT_MESSAGE =
  "Your account has not been set up. Ask your administrator."

export type OAuthInput = {
  enabled: boolean
  displayName: string
  discoveryUrl: string
  clientId: string
  /** Empty keeps the saved secret. */
  clientSecret: string
  scopes: string
}

/** Safe for the Admin browser. The saved secret is never included. */
export type OAuthSettings = Omit<OAuthInput, "clientSecret"> & {
  hasClientSecret: boolean
  redirectUrl: string
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
