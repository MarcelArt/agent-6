# Agent 6 step plans

`docs/plan.md` is the product description. The files in this folder split it into steps small enough to give to a coding agent one at a time, in order. Each step leaves the app working.

## How to use

Give the agent one step file and say "implement this step". Do not start a step until every step under its "Depends on" is merged. Steps 17 and 18 are optional.

## Order

| # | Step | Result |
|---|---|---|
| 01 | [Foundation](01-foundation.md) | Config, own database, app shell with real routes |
| 02 | [Auth](02-auth.md) | Login, first Admin from env, role-guarded routes |
| 03 | [User management](03-user-management.md) | Admin creates and manages users |
| 04 | [Repositories](04-repositories.md) | Connect, clone and sync GitHub repositories |
| 05 | [Applications](05-applications.md) | Group Repositories into Applications |
| 06 | [Chat, code only](06-chat-code-only.md) | First working chat: agent answers from code |
| 07 | [Database Connections](07-database-connections.md) | Agent can query Postgres, read-only |
| 08 | [Log Connections](08-log-connections.md) | Agent can query Loki logs |
| 09 | [Issue filing](09-issue-filing.md) | Agent files GitHub issues |
| 10 | [Image upload](10-image-upload.md) | Pictures as context in chat |
| 11 | [Interactive Questions](11-interactive-questions.md) | Clickable clarifying questions |
| 12 | [Guardrail](12-guardrail.md) | Off-topic messages refused |
| 13 | [Conversation history](13-conversation-history.md) | Past Conversations, Admin audit view |
| 14 | [Preferred Language](14-preferred-language.md) | Agent answers in the configured language |
| 15 | [OAuth](15-oauth.md) | Optional sign-in through an OAuth 2.0 provider |
| 16 | [Deployment](16-deployment.md) | Docker image, compose file, setup guide |
| 17 | [Postgres for own data](17-postgres-for-own-data.md) | Optional alternative to SQLite |
| 18 | [Decision AI](18-decision-ai.md) | Optional repository-selection model |

## Decisions that apply to every step

| Topic | Decision |
|---|---|
| Stack | TypeScript only, inside this TanStack Start app. Server functions and server routes are the backend. npm is the package manager. |
| Agent | OpenAI Agents SDK for TypeScript. `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` from env; the base URL may point at any OpenAI-compatible server. |
| Own data | Drizzle + SQLite. See [ADR 0001](../adr/0001-sqlite-first-portable-schema.md). |
| Auth | Better Auth. Roles: `admin`, `client`. |
| GitHub | One token in `GITHUB_TOKEN`, used for cloning and for creating issues. |
| Scope | Resources reach an Application only through an Attachment. See [ADR 0002](../adr/0002-explicit-attachment-not-tags.md). |
| Access | No multi-tenancy. Every logged-in user may chat about every Application. Admin screens are for Admins only. |
| Storage | One data directory (`DATA_DIR`) holds the SQLite file, repository clones and uploaded images. |
| Secrets | Passwords and auth headers of connections are encrypted at rest with `ENCRYPTION_KEY`. They are never sent to the browser or to the model. |

## Conventions for the implementing agent

- Use the terms in [`CONTEXT.md`](../../CONTEXT.md) for names in code, routes and UI. If a step needs a new domain term, add it there.
- Look up current library documentation through Context7 before using a library API. Do not rely on memory for TanStack Start, Better Auth, Drizzle or the OpenAI Agents SDK.
- Routing: every screen, tab, dialog-with-content and selected record is a URL. Reloading the browser shows the same thing. List filters and pagination go in search params. No screen is reachable only through component state.
- Route layout: `/login`, `/chat/*` for all users, `/admin/*` for Admins.
- Server code lives in `src/server/`. Only `src/server/repositories/` imports Drizzle.
- For any step that adds or changes a screen, run `/impeccable` for the interface work. Reuse components in `src/components/ui/` and add new shadcn components with the shadcn CLI.
- Each step ends with `npm run typecheck`, `npm run lint` and `npm test` passing, and its acceptance checks done by hand in the running app.
- Do only what the step's Scope lists. "Out of scope" items belong to later steps.
