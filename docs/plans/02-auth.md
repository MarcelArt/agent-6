# 02 Auth

Read [00-README.md](00-README.md) first.

## Goal

People must log in to use Agent 6. The first Admin comes from environment variables.

## Depends on

01.

## Scope

- Better Auth with its Drizzle adapter on the existing SQLite database, email and password sign-in. Its tables are created through the normal migration flow.
- Roles `admin` and `client` on the user.
- **First Admin**: at server start, if no user exists, create an Admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. If users already exist, do nothing, even if the variables changed.
- Public self-registration is disabled. Only an Admin can create users (step 03).
- `/login` page. After login, go back to the URL the person originally asked for; otherwise `/chat`.
- Logout in the shell, showing the current user's name and role.
- **Route protection**, enforced on the server: `/chat/*` needs any logged-in user, `/admin/*` needs an Admin. A Client who opens an admin URL sees a "not allowed" page, not a redirect loop. Admin navigation is hidden from Clients.
- A server-side helper that every later server function uses to require a session or the Admin role.
- New env: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, plus whatever secret and base URL Better Auth requires. Update `.env.example`.

## Out of scope

User management screens (03). OAuth (15). Password reset by email.

## Domain terms

Admin, Client.

## Acceptance checks

- Fresh database and env values: logging in with them works and the user is an Admin.
- Opening `/admin/repositories` while logged out leads to `/login`; after login the browser lands on `/admin/repositories`.
- Reloading any page keeps the session.
- A server function guarded for Admins returns an authorization error when called with a Client session (covered by a test).
- Calling the sign-up endpoint directly does not create a user.

## Notes for the agent

- Check Better Auth docs for the TanStack Start integration, the admin plugin (roles, user creation, banning) and how to disable sign-up.
- Protection in the UI is not enough; each server function checks the session itself.
- Run `/impeccable` for the login page.
