# Agent 6 step plans

`docs/plan.md` is the product description. The files in this folder split it into steps small enough to give to a coding agent one at a time, in order. Each step leaves the app working.

## How to use

Give the agent one step file and say "implement this step". Do not start a step until every step under its "Depends on" is merged. Step 01 is a design step: it stops after showing three directions and continues only once you have picked one. Step 18 is optional.

## Order

| # | Step | Result |
|---|---|---|
| 01 | [Design](01-design.md) | Chosen visual direction saved as a design reference |
| 02 | [Foundation](02-foundation.md) | Config, own database, app shell with real routes, light and dark theme |
| 03 | [Auth](03-auth.md) | Login, first Admin from env, role-guarded routes |
| 04 | [User management](04-user-management.md) | Admin creates and manages users |
| 05 | [Repositories](05-repositories.md) | Connect, clone and sync GitHub repositories |
| 06 | [Applications](06-applications.md) | Group Repositories into Applications |
| 07 | [Chat, code only](07-chat-code-only.md) | First working chat: agent answers from code |
| 08 | [Database Connections](08-database-connections.md) | Agent can query Postgres, read-only |
| 09 | [Log Connections](09-log-connections.md) | Agent can query Loki logs |
| 10 | [Issue filing](10-issue-filing.md) | Agent files GitHub issues |
| 11 | [Image upload](11-image-upload.md) | Pictures as context in chat |
| 12 | [Interactive Questions](12-interactive-questions.md) | Clickable clarifying questions |
| 13 | [Guardrail](13-guardrail.md) | Off-topic messages refused |
| 14 | [Conversation history](14-conversation-history.md) | Past Conversations, Admin audit view |
| 15 | [Preferred Language](15-preferred-language.md) | Agent answers in the configured language |
| 16 | [OAuth](16-oauth.md) | Optional sign-in through an OAuth 2.0 provider |
| 17 | [Deployment](17-deployment.md) | Docker image, compose file, setup guide |
| 18 | [Postgres for own data](18-postgres-for-own-data.md) | Optional alternative to SQLite |
| 19 | [Decision AI](19-decision-ai.md) | Optional provider-backed investigation and fault advice |

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
| Design | Visual direction is chosen once, in step 01, and recorded in `docs/design/`. Colour, font and radius tokens stay as the shadcn preset in `src/styles.css` defines them. Light and dark themes both ship; dark is designed first. |
| Secrets | Passwords and auth headers of connections are encrypted at rest with `ENCRYPTION_KEY`. They are never sent to the browser or to the model. |

## Conventions for the implementing agent

- Use the terms in [`CONTEXT.md`](../../CONTEXT.md) for names in code, routes and UI. If a step needs a new domain term, add it there.
- Look up current library documentation through Context7 before using a library API. Do not rely on memory for TanStack Start, Better Auth, Drizzle or the OpenAI Agents SDK.
- Routing: every screen, tab, dialog-with-content and selected record is a URL. Reloading the browser shows the same thing. List filters and pagination go in search params. No screen is reachable only through component state.
- Route layout: `/login`, `/chat/*` for all users, `/admin/*` for Admins.
- Server code lives in `src/server/`. Only `src/server/repositories/` imports Drizzle.
- For any step after 01 that adds or changes a screen, follow `docs/design/DESIGN.md` and match the prototype for that screen where one exists. Do not run a design skill and do not change the tokens in `src/styles.css`. Reuse components in `src/components/ui/` and add new shadcn components with the shadcn CLI.
- Every screen must be checked in both dark and light theme before the step is done.
- Each step ends with `npm run typecheck`, `npm run lint` and `npm test` passing, and its acceptance checks done by hand in the running app.
- Do only what the step's Scope lists. "Out of scope" items belong to later steps.
