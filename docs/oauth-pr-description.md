# Runtime organization OAuth

Approach **A (runtime)**, chosen before implementation: Better Auth 1.7.25's
Generic OAuth plugin takes a configuration array at instance initialization; it
does not expose a documented settings-update API. Agent 6 can build an auth
instance from the encrypted stored settings and replace that instance when the
settings change. The SQLite adapter, auth secret and base URL remain the same,
so sessions survive replacement and no process restart is needed. Password and
session endpoints use an independent instance without provider discovery, so an
unavailable provider cannot prevent password sign-in.

Documentation checked through Context7 and against the installed package:

- [Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth): plugin
  configuration, discovery, standard social sign-in and callback, profile
  validation before account linking and returning sign-in.
- [User and accounts](https://better-auth.com/docs/concepts/users-accounts):
  verified-email linking and `user.validateUserInfo`.

Only an existing active user with the provider's freshly verified matching email
may sign in. OAuth cannot create users or change roles. Admin-created records
are eligible for verified-email linking without a separate local email
verification flow; self-registration stays disabled. The discovery URL and
client ID namespace each account subject to isolate replacement providers.

Provider settings live in the existing settings table, with the client secret
encrypted using `ENCRYPTION_KEY`. Admins can test discovery, copy the callback
URL, replace the secret, and enable or disable sign-in without restarting.
User creation accepts an empty password while the provider is enabled.

OAuth 2.0 identities are read through the authenticated UserInfo endpoint.
OIDC ID tokens use Better Auth's issuer, signature and nonce verification;
providers without UserInfo must expose usable JWKS metadata. The provider must
assert a verified email; no provider roles or profile fields replace local
access decisions.

Validation:

- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` pass
  (217 tests passed; 21 optional Postgres checks skipped).
- OAuth integration tests exercise signed ID tokens, PKCE, nonce verification,
  verified-email linking, unknown and disabled users, returning users, role
  preservation, runtime configuration, encrypted secrets, password fallback,
  and OAuth-only user creation.
- Local Keycloak 26.4.7: a pre-created Client signed in with the local role;
  unknown, disabled and unverified accounts were refused. No user was created.
  Password login succeeded after an actual invalid-client provider error.
- Settings changes and disablement took effect immediately. New-user password
  requirements followed the enabled setting. Browser responses and stored
  settings were checked for secret exposure.
- Login, Settings and new-user screens were inspected at desktop and 375px
  phone sizes in dark and light themes, with no horizontal overflow.
- Existing chat timeout tests now use their test settings repository and
  advance fake timers only after the intended stalled work starts. This avoids
  local language settings and machine load changing their expected result.
