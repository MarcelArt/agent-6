# 04 User management

Read [00-README.md](00-README.md) first.

## Goal

An Admin can create and manage the people who use Agent 6.

## Depends on

03.

## Scope

- `/admin/users`: list with name, email, role, status; search and pagination in search params.
- `/admin/users/new` and `/admin/users/$userId`: create and edit. Fields: name, email, role (Admin or Client), password. On edit the password is optional and only changed when filled in.
- Disable and re-enable a user. A disabled user cannot log in and their open sessions stop working.
- Safety rules: an Admin cannot disable or demote themselves, and the last active Admin cannot be disabled or demoted.
- Any logged-in user can change their own password from an account page.

## Out of scope

Deleting users (their Conversations must stay for audit; disabling is enough). Email invitations. OAuth-only users (16).

## Domain terms

Admin, Client.

## Acceptance checks

- Admin creates a Client; that Client logs in and reaches `/chat` but not `/admin`.
- A disabled user is rejected at login.
- Trying to demote the only Admin shows an error and changes nothing.
- Reloading `/admin/users/$userId` shows the same user's form.
- Tests cover the two safety rules.

## Notes for the agent

- Prefer Better Auth's admin plugin functions for creating users, setting roles and banning over writing to its tables directly. Check its docs.
- Build the list and form to the pattern the prototype shows for Repositories (see `docs/design/DESIGN.md`). The components made here are reused by steps 05, 06, 08 and 09.
