import { generateKeyPairSync, sign } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAuth, createAuthHandler } from "./auth"
import { createOAuthManagement } from "./oauth-management"
import {
  OAUTH_SETTINGS_KEY,
  readOAuthSettings,
  testDiscovery,
} from "./oauth-settings"
import { openDb } from "./repositories/db"
import { createSettingsRepository } from "./repositories/settings"
import { createUsersRepository } from "./repositories/users"
import { decrypt } from "./secrets"
import { getSessionUser } from "./session"
import { createUserManagement } from "./user-management"
import type { OAuthInput } from "@/lib/oauth"
import {
  OAUTH_ACCOUNT_MESSAGE,
  oauthLoginError,
  TOKEN_ENDPOINT_AUTH_METHODS,
} from "@/lib/oauth"

const BASE = "http://localhost:3000"
const ISSUER = "https://identity.example.com"
const KEY = Buffer.alloc(32, 7).toString("base64")
const INPUT: OAuthInput = {
  enabled: true,
  displayName: "Company",
  mode: "discovery",
  discoveryUrl: ISSUER,
  authorizationUrl: "",
  tokenUrl: "",
  resourceUrl: "",
  redirectUrl: "",
  logoutUrl: "",
  userIdentifier: "",
  tokenEndpointAuthMethod: "client_secret_basic",
  clientId: "agent6",
  clientSecret: "very-private-provider-secret",
  scopes: "openid email profile",
}
const MANUAL: OAuthInput = {
  ...INPUT,
  mode: "manual",
  discoveryUrl: "",
  authorizationUrl: `${ISSUER}/authorize`,
  tokenUrl: `${ISSUER}/token`,
  resourceUrl: `${ISSUER}/userinfo`,
  redirectUrl: `${BASE}/api/auth/callback/company`,
  userIdentifier: "data.employee_id",
  scopes: "read_profile",
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
}
const metadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  userinfo_endpoint: `${ISSUER}/userinfo`,
  jwks_uri: `${ISSUER}/jwks`,
  id_token_signing_alg_values_supported: ["RS256"],
}

function cookie(headers: Headers) {
  return headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")
}

function fixture() {
  const db = openDb(":memory:")
  const settings = createSettingsRepository(db)
  const users = createUsersRepository(db)
  const auth = createAuth(db, { secret: "s".repeat(32), baseUrl: BASE })
  const handle = createAuthHandler(db, {
    secret: "s".repeat(32),
    baseUrl: BASE,
    encryptionKey: KEY,
  })
  const management = createOAuthManagement({
    auth,
    settings,
    config: { baseUrl: BASE, encryptionKey: KEY },
  })
  return { db, settings, users, auth, handle, management }
}
let f: ReturnType<typeof fixture>
let admin: Headers
let client: Headers
let nonce = ""
let claims: Record<string, unknown>

beforeEach(async () => {
  f = fixture()
  const sessions: Headers[] = []
  for (const role of ["admin", "client"] as const) {
    await f.auth.api.createUser({
      body: {
        name: role,
        email: `${role}@example.com`,
        password: "test-password",
        role,
      },
    })
    const result = await f.auth.api.signInEmail({
      body: { email: `${role}@example.com`, password: "test-password" },
      returnHeaders: true,
    })
    sessions.push(new Headers({ cookie: cookie(result.headers) }))
  }
  ;[admin, client] = sessions
  claims = {
    sub: "provider-user",
    email: "client@example.com",
    email_verified: true,
    name: "Provider name",
    role: "admin",
  }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith("/.well-known/openid-configuration"))
      return Response.json(metadata)
    if (url.endsWith("/jwks")) return Response.json({ keys: [jwk] })
    if (url.endsWith("/userinfo")) return Response.json(claims)
    if (url.endsWith("/token")) {
      const now = Math.floor(Date.now() / 1000)
      const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url")
      const payload = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: ISSUER, aud: "agent6", iat: now, exp: now + 300, nonce, ...claims })}`
      return Response.json({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token: `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`,
      })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  f.db.$client.close()
})

async function oauth(extra: Record<string, unknown> = {}, expectsNonce = true) {
  const start = await f.handle(
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        provider: "organization",
        callbackURL: "/chat",
        errorCallbackURL: "/login",
        ...extra,
      }),
    })
  )
  expect(start.status).toBe(200)
  const authUrl = new URL((await start.json()).url)
  nonce = authUrl.searchParams.get("nonce")!
  if (expectsNonce) expect(nonce).toBeTruthy()
  expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256")
  const callback = new URL(authUrl.searchParams.get("redirect_uri")!)
  callback.searchParams.set("code", "valid-code")
  callback.searchParams.set("state", authUrl.searchParams.get("state")!)
  callback.searchParams.set("iss", ISSUER)
  return f.handle(
    new Request(callback, { headers: { cookie: cookie(start.headers) } })
  )
}

describe("OAuth settings", () => {
  it("encrypts the secret, never returns it, and preserves it when saving other fields", async () => {
    expect(await f.management.save(admin, INPUT)).toEqual({ ok: true })
    const stored = readOAuthSettings(f.settings)
    expect(JSON.stringify(f.settings.all())).not.toContain(INPUT.clientSecret)
    expect(decrypt(stored.encryptedClientSecret, KEY)).toBe(INPUT.clientSecret)
    expect(await f.management.get(admin)).toMatchObject({
      hasClientSecret: true,
      redirectUrl: `${BASE}/api/auth/callback/organization`,
    })
    expect(JSON.stringify(await f.management.get(admin))).not.toContain(
      INPUT.clientSecret
    )
    expect(
      await f.management.save(admin, {
        ...INPUT,
        clientSecret: "",
        displayName: "Updated",
      })
    ).toEqual({ ok: true })
    expect(readOAuthSettings(f.settings).encryptedClientSecret).toBe(
      stored.encryptedClientSecret
    )
  })
  it("rejects anonymous and Client reads, writes and discovery tests", async () => {
    for (const headers of [new Headers(), client]) {
      await expect(f.management.get(headers)).rejects.toMatchObject({
        name: "AuthorizationError",
      })
      await expect(f.management.save(headers, INPUT)).rejects.toMatchObject({
        name: "AuthorizationError",
      })
      await expect(f.management.test(headers, ISSUER)).rejects.toMatchObject({
        name: "AuthorizationError",
      })
    }
    expect(f.settings.all()).toEqual({})
    expect(fetch).not.toHaveBeenCalled()
  })
  it("validates enablement and discovery without exposing provider errors", async () => {
    expect(
      await f.management.save(admin, { ...INPUT, clientSecret: "" })
    ).toMatchObject({ ok: false, field: "clientSecret" })
    expect(
      await f.management.save(admin, {
        ...INPUT,
        discoveryUrl: "file:///etc/passwd",
      })
    ).toMatchObject({ ok: false, field: "discoveryUrl" })
    expect(await f.management.test(admin, ISSUER)).toEqual({ ok: true })
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: INPUT.clientSecret }, { status: 500 })
    )
    const failed = await f.management.test(admin, ISSUER)
    expect(failed.ok).toBe(false)
    expect(JSON.stringify(failed)).not.toContain(INPUT.clientSecret)
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ issuer: ISSUER }))
    await expect(testDiscovery(ISSUER)).rejects.toThrow()
    expect(f.settings.get(OAUTH_SETTINGS_KEY)).toBeUndefined()
  })

  it("loads older stored provider settings in discovery mode", async () => {
    f.settings.set(
      OAUTH_SETTINGS_KEY,
      JSON.stringify({
        enabled: true,
        displayName: INPUT.displayName,
        discoveryUrl: ISSUER,
        clientId: INPUT.clientId,
        scopes: INPUT.scopes,
        encryptedClientSecret: "encrypted",
      })
    )
    expect(await f.management.get(admin)).toMatchObject({
      mode: "discovery",
      discoveryUrl: ISSUER,
      redirectUrl: `${BASE}/api/auth/callback/organization`,
    })
  })

  it("validates manual endpoints and defaults the redirect URL", async () => {
    for (const field of [
      "authorizationUrl",
      "tokenUrl",
      "resourceUrl",
      "userIdentifier",
    ] as const) {
      expect(
        await f.management.save(admin, { ...MANUAL, [field]: "" })
      ).toMatchObject({ ok: false, field })
    }
    expect(
      await f.management.save(admin, {
        ...MANUAL,
        logoutUrl: "javascript:void(0)",
      })
    ).toMatchObject({ ok: false, field: "logoutUrl" })
    expect(
      await f.management.save(admin, {
        ...MANUAL,
        redirectUrl: `${ISSUER}/api/auth/callback/company`,
      })
    ).toMatchObject({ ok: false, field: "redirectUrl" })
    expect(
      await f.management.save(admin, { ...MANUAL, redirectUrl: "" })
    ).toEqual({ ok: true })
    expect(await f.management.get(admin)).toMatchObject({
      mode: "manual",
      redirectUrl: `${BASE}/api/auth/callback/organization`,
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("Manual OAuth", () => {
  it("uses the configured callback and a stable identity from the authenticated resource", async () => {
    expect(await f.management.save(admin, MANUAL)).toEqual({ ok: true })
    const profile = {
      email: claims.email,
      email_verified: true,
      data: { employee_id: 42 },
    }
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.url === MANUAL.tokenUrl) {
        const body = new URLSearchParams(await request.text())
        expect(body.get("redirect_uri")).toBe(MANUAL.redirectUrl)
        return Response.json({
          access_token: "test-access-token",
          token_type: "Bearer",
          id_token: "untrusted.garbage.token",
        })
      }
      expect(request.url).toBe(MANUAL.resourceUrl)
      expect(request.headers.get("Authorization")).toBe(
        "Bearer test-access-token"
      )
      return Response.json(profile)
    })
    expect((await oauth({}, false)).headers.get("location")).toBe("/chat")
    expect(fetch).toHaveBeenCalledTimes(2)
    profile.data.employee_id = 7
    expect((await oauth({}, false)).headers.get("location")).toBe("/chat")
    expect(
      (await f.db.query.account.findMany()).filter(
        (item) => item.providerId === "organization"
      )
    ).toHaveLength(2)
    profile.email_verified = false
    const denied = await oauth({}, false)
    expect(new URL(denied.headers.get("location")!, BASE).pathname).toBe(
      "/login"
    )
  })

  it("returns the provider logout URL only for a session started through manual OAuth", async () => {
    const logoutUrl = `${ISSUER}/logout?return_to=support`
    await f.management.save(admin, { ...MANUAL, logoutUrl })
    claims.data = { employee_id: "support-client" }
    const signedIn = await oauth({}, false)
    expect(signedIn.headers.get("location")).toBe("/chat")
    const sessionCookie = cookie(signedIn.headers)
    async function logOut(cookies: string) {
      return f.handle(
        new Request(`${BASE}/api/auth/sign-out`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: BASE,
            cookie: cookies,
          },
          body: JSON.stringify({ disableRedirect: true }),
        })
      )
    }
    const marker = sessionCookie
      .split("; ")
      .find((value) => value.startsWith("better-auth.organization_oauth="))
    expect(marker).toBeTruthy()
    const passwordLogout = await logOut(`${client.get("cookie")}; ${marker}`)
    expect(await passwordLogout.json()).toEqual({ success: true })
    const providerLogout = await logOut(sessionCookie)
    expect(await providerLogout.json()).toEqual({
      success: true,
      url: logoutUrl,
      redirect: false,
    })
    expect(
      await getSessionUser({
        auth: f.auth,
        headers: new Headers({ cookie: sessionCookie }),
      })
    ).toBeNull()
  })
})

describe("Token endpoint client authentication", () => {
  const SENT = {
    client_secret_basic: {
      authorization: `Basic ${Buffer.from(`${INPUT.clientId}:${INPUT.clientSecret}`).toString("base64")}`,
      clientId: null,
      clientSecret: null,
    },
    client_secret_post: {
      authorization: null,
      clientId: INPUT.clientId,
      clientSecret: INPUT.clientSecret,
    },
  }
  let tokenRequests: Array<Record<string, string | null>>

  /** Records where each token request put the client credentials. */
  function recordTokenRequests(document: Record<string, unknown> = metadata) {
    tokenRequests = []
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const request = new Request(input, init)
      if (request.url.endsWith("/.well-known/openid-configuration"))
        return Response.json(document)
      if (request.url.endsWith("/token")) {
        const body = new URLSearchParams(await request.text())
        tokenRequests.push({
          authorization: request.headers.get("authorization"),
          clientId: body.get("client_id"),
          clientSecret: body.get("client_secret"),
        })
      }
      return original(input, init)
    })
  }

  it.each([
    { methods: undefined, expected: "client_secret_basic" },
    { methods: ["client_secret_basic"], expected: "client_secret_basic" },
    {
      methods: ["client_secret_post", "client_secret_basic"],
      expected: "client_secret_basic",
    },
    { methods: ["client_secret_post"], expected: "client_secret_post" },
    { methods: ["private_key_jwt"], expected: "client_secret_post" },
  ] as const)(
    "discovery listing $methods sends $expected",
    async ({ methods, expected }) => {
      recordTokenRequests({
        ...metadata,
        token_endpoint_auth_methods_supported: methods,
      })
      await f.management.save(admin, INPUT)
      expect((await oauth()).headers.get("location")).toBe("/chat")
      expect(tokenRequests).toEqual([SENT[expected]])
    }
  )

  it("manual setup sends the method the Admin selected", async () => {
    claims.data = { employee_id: 42 }
    recordTokenRequests()
    for (const method of TOKEN_ENDPOINT_AUTH_METHODS) {
      expect(
        await f.management.save(admin, {
          ...MANUAL,
          tokenEndpointAuthMethod: method,
        })
      ).toEqual({ ok: true })
      expect((await oauth({}, false)).headers.get("location")).toBe("/chat")
    }
    expect(tokenRequests).toEqual([
      SENT.client_secret_basic,
      SENT.client_secret_post,
    ])
  })

  it("defaults new setups to HTTP Basic and keeps saved manual providers on the request body", async () => {
    expect(await f.management.get(admin)).toMatchObject({
      tokenEndpointAuthMethod: "client_secret_basic",
    })
    await f.management.save(admin, MANUAL)
    const { tokenEndpointAuthMethod: _method, ...saved } = readOAuthSettings(
      f.settings
    )
    f.settings.set(OAUTH_SETTINGS_KEY, JSON.stringify(saved))
    expect(await f.management.get(admin)).toMatchObject({
      tokenEndpointAuthMethod: "client_secret_post",
    })
    claims.data = { employee_id: 42 }
    recordTokenRequests()
    expect((await oauth({}, false)).headers.get("location")).toBe("/chat")
    expect(tokenRequests).toEqual([SENT.client_secret_post])
  })
})

describe("OAuth callback admission", () => {
  beforeEach(async () => {
    await f.management.save(admin, INPUT)
  })

  it("links an active pre-created user by verified email and preserves the local role and profile", async () => {
    claims.email = "CLIENT@example.com"
    const response = await oauth()
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/chat")
    expect(
      await getSessionUser({
        auth: f.auth,
        headers: new Headers({ cookie: cookie(response.headers) }),
      })
    ).toMatchObject({
      email: "client@example.com",
      role: "client",
      name: "client",
    })
    expect(f.users.count()).toBe(2)
    expect(JSON.stringify([...response.headers])).not.toContain(
      INPUT.clientSecret
    )
  })

  it("accepts an OAuth 2.0 provider through authenticated UserInfo without decoding an unverified ID token", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.endsWith("/.well-known/openid-configuration")) {
        const {
          jwks_uri: _jwks,
          id_token_signing_alg_values_supported: _algs,
          ...oauthDocument
        } = metadata
        return Promise.resolve(Response.json(oauthDocument))
      }
      if (url.endsWith("/token"))
        return Promise.resolve(
          Response.json({
            access_token: "test-access-token",
            token_type: "Bearer",
            id_token: "untrusted.garbage.token",
          })
        )
      if (url.endsWith("/userinfo"))
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer test-access-token"
        )
      return original(input, init)
    })
    expect((await oauth({}, false)).headers.get("location")).toBe("/chat")
  })

  it("accepts a JWKS-only OIDC provider after verifying its ID token", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.endsWith("/.well-known/openid-configuration")) {
        const { userinfo_endpoint: _userinfo, ...oidcDocument } = metadata
        return Promise.resolve(Response.json(oidcDocument))
      }
      return original(input, init)
    })
    expect((await oauth()).headers.get("location")).toBe("/chat")
  })

  it("rejects an ID token with the wrong nonce even when UserInfo is valid", async () => {
    claims.nonce = "incorrect-nonce"
    const response = await oauth()
    expect(new URL(response.headers.get("location")!, BASE).pathname).toBe(
      "/login"
    )
    expect(cookie(response.headers)).not.toContain("session_token")
  })

  it("rejects a missing email verification claim", async () => {
    delete claims.email_verified
    const response = await oauth()
    expect(
      oauthLoginError(
        new URL(response.headers.get("location")!, BASE).searchParams.get(
          "error"
        )!
      )
    ).toBe(OAUTH_ACCOUNT_MESSAGE)
  })

  it("refuses a previously linked user after an Admin disables them", async () => {
    expect((await oauth()).headers.get("location")).toBe("/chat")
    await f.auth.api.banUser({
      headers: admin,
      body: { userId: f.users.findByEmail("client@example.com")!.id },
    })
    const response = await oauth()
    expect(
      oauthLoginError(
        new URL(response.headers.get("location")!, BASE).searchParams.get(
          "error"
        )!
      )
    ).toBe(OAUTH_ACCOUNT_MESSAGE)
    expect(cookie(response.headers)).not.toContain("session_token")
  })

  it("rejects an unknown email even when explicit sign-up is requested; no user or account is created", async () => {
    claims.email = "unknown@example.com"
    const response = await oauth({ requestSignUp: true })
    expect(
      oauthLoginError(
        new URL(response.headers.get("location")!, BASE).searchParams.get(
          "error"
        )!
      )
    ).toBe(OAUTH_ACCOUNT_MESSAGE)
    expect(f.users.count()).toBe(2)
    expect(
      (await f.db.query.account.findMany()).filter(
        (item) => item.providerId === "organization"
      )
    ).toHaveLength(0)
  })

  it("rejects a disabled user", async () => {
    await f.auth.api.banUser({
      headers: admin,
      body: { userId: f.users.findByEmail("client@example.com")!.id },
    })
    const response = await oauth()
    expect(
      oauthLoginError(
        new URL(response.headers.get("location")!, BASE).searchParams.get(
          "error"
        )!
      )
    ).toBe(OAUTH_ACCOUNT_MESSAGE)
    expect(cookie(response.headers)).not.toContain("session_token")
  })

  it("rejects unverified email on first and returning sign-in, even if the local email is already verified", async () => {
    claims.email_verified = false
    let response = await oauth()
    expect(
      oauthLoginError(
        new URL(response.headers.get("location")!, BASE).searchParams.get(
          "error"
        )!
      )
    ).toBe(OAUTH_ACCOUNT_MESSAGE)
    claims.email_verified = true
    expect((await oauth()).headers.get("location")).toBe("/chat")
    claims.email_verified = false
    response = await oauth()
    expect(
      oauthLoginError(
        new URL(response.headers.get("location")!, BASE).searchParams.get(
          "error"
        )!
      )
    ).toBe(OAUTH_ACCOUNT_MESSAGE)
    expect(cookie(response.headers)).not.toContain("session_token")
  })

  it("refuses a linked identity whose email now belongs to a different local user", async () => {
    await oauth()
    claims.email = "admin@example.com"
    const response = await oauth()
    expect(
      new URL(response.headers.get("location")!, BASE).searchParams.get("error")
    ).toBe("account_not_set_up")
    expect(cookie(response.headers)).not.toContain("session_token")
  })

  it("applies changed settings and disablement without restarting the handler", async () => {
    await oauth()
    await f.management.save(admin, { ...INPUT, clientId: "changed-client" })
    const start = await f.handle(
      new Request(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({
          provider: "organization",
          callbackURL: "/chat",
        }),
      })
    )
    expect(
      new URL((await start.json()).url).searchParams.get("client_id")
    ).toBe("changed-client")
    await f.management.save(admin, { ...INPUT, enabled: false })
    const response = await f.handle(
      new Request(`${BASE}/api/auth/callback/organization?code=test&state=test`)
    )
    expect(response.headers.get("location")).toContain("provider_disabled")
  })

  it("keeps password login and existing sessions working when discovery is broken", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("provider offline"))
    const response = await f.handle(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "test-password",
        }),
      })
    )
    expect(response.status).toBe(200)
    expect(
      await getSessionUser({ auth: f.auth, headers: admin })
    ).toMatchObject({ role: "admin" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("allows OAuth-only user creation only while a provider is enabled", async () => {
    const users = createUserManagement({
      auth: f.auth,
      users: f.users,
      oauthEnabled: () => readOAuthSettings(f.settings).enabled,
    })
    const created = await users.create(admin, {
      name: "OAuth only",
      email: "oauth@example.com",
      role: "client",
    })
    expect(created.email).toBe("oauth@example.com")
    claims.email = created.email
    expect((await oauth()).headers.get("location")).toBe("/chat")
    await users.update(admin, created.id, {
      name: created.name,
      email: created.email,
      role: "client",
      password: "added-password",
    })
    expect(
      await f.auth.api.signInEmail({
        body: { email: created.email, password: "added-password" },
      })
    ).toBeTruthy()
    await f.management.save(admin, { ...INPUT, enabled: false })
    await expect(
      users.create(admin, {
        name: "Missing",
        email: "missing@example.com",
        role: "client",
      })
    ).rejects.toMatchObject({ field: "password" })
  })
})
