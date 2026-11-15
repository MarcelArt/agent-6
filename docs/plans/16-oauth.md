# 16 OAuth

Read [00-README.md](00-README.md) first.

## Goal

An organization can optionally let its people sign in through its own OAuth 2.0 / OpenID Connect provider (Keycloak, Authentik, Google, Microsoft and similar). Only users an Admin has already created can get in.

## Depends on

04, 15 (settings page).

## Scope

### First task: confirm the approach

Before writing code, check the Better Auth docs for whether an OAuth provider can be configured at runtime from stored settings, without a restart. Then choose:

- **A, runtime**: provider settings saved from the admin screen take effect immediately.
- **B, applied on restart**: settings are saved from the admin screen and the screen says a restart is needed.
- **C, env only**: provider configured through environment variables; the admin screen only shows the status.

Prefer A, then B, then C. State the choice and the reason in the PR description before continuing.

### Configuration

- One provider. Fields: display name (text on the login button), issuer or discovery URL, client ID, client secret, scopes. Client secret encrypted and never returned to the browser.
- The screen shows the redirect URL the Admin must register with the provider.
- "Test" checks that the discovery document loads.
- Enable and disable toggle. Password login always stays available, so a broken provider cannot lock everyone out.

### Sign-in rules

- The login page shows a "Sign in with <display name>" button when the provider is enabled.
- A sign-in succeeds only when the provider returns a verified email that matches an existing, active user. The role comes from that user record. No user is ever created by signing in.
- An unknown or disabled user sees: "Your account has not been set up. Ask your administrator."
- In user management (step 04), the password becomes optional when creating a user if a provider is enabled, for people who will only use OAuth.

## Out of scope

Several providers at once. Mapping provider groups to roles. SAML. Automatic user creation.

## Domain terms

Admin, Client.

## Acceptance checks

- Against a local Keycloak or Authentik: a pre-created user signs in through the provider and has the role set in Agent 6.
- A provider account with no matching Agent 6 user is refused with the message above and no user row is created.
- A disabled user is refused.
- With the provider misconfigured, password login still works.
- The client secret cannot be found in any response to the browser.
- Tests cover the matching rule: existing active user, unknown email, disabled user, unverified email.

## Notes for the agent

- Check Better Auth docs for the generic OAuth plugin, account linking by email, and how to block implicit sign-up.
- The settings section and the login button have no prototype: build them from the form pattern in `docs/design/DESIGN.md`.
