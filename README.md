# Agent 6

A self-hosted support agent for one organization. It answers questions from the people who use the organization's applications by reading code, logs and databases, and reports faults to developers.

- Product description: [docs/plan.md](docs/plan.md)
- Step plans: [docs/plans/](docs/plans/00-README.md)
- Domain terms: [CONTEXT.md](CONTEXT.md)
- Design rules: [docs/design/DESIGN.md](docs/design/DESIGN.md)

## Run it locally

```bash
npm install
cp .env.example .env   # then fill it in, see below
npm run dev            # http://localhost:3000
```

In `.env`, set `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` (each with its own `openssl rand -base64 32`), and `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 8 characters) for the first Admin.

Set `GITHUB_TOKEN` to a GitHub token that can read the contents of the repositories you want to connect. Agent 6 starts without it, but then no Repository can be connected or synced. The server also needs the `git` program installed.

**Token permissions.** Create the token under GitHub → Settings → Developer settings → Personal access tokens.

- Fine-grained token (recommended):
  - Resource owner: the user or organization that owns the repositories. An organization may have to approve the token first.
  - Repository access: "Only select repositories" with the ones you will connect, or "All repositories".
  - Repository permissions:

    | Permission | Access | Used for |
    |---|---|---|
    | Contents | Read-only | Cloning and syncing, and listing branches |
    | Metadata | Read-only | Checking that the repository exists (GitHub selects this one itself) |
    | Issues | Read and write | Filing issues. Not used yet; only needed once issue filing is built (step 10) |

- Classic token: the `repo` scope. If the organization uses SAML single sign-on, also authorize the token for that organization.

The server validates its configuration at start and stops with a message naming any variable that is missing or wrong. It then creates `DATA_DIR/agent6.db` and applies pending migrations.

**First Admin.** If no user exists when the server starts, it creates an Admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Log in with them at `/login`. Once any user exists the two variables are ignored, even if you change them. Nobody can register themselves; Admins create the other users.

## Applications

Admins create Applications at `/admin/applications` with a name, a description for Clients and plain-text notes for the agent. Open an Application and use **Add Repository** under Attachments to put connected Repositories in scope. Attachment changes take effect immediately, and a Repository can be attached to several Applications.

Deleting an Application removes its Attachments and keeps its Repositories. An Application with saved Conversations cannot be removed. Removing a Repository lists its Applications in the confirmation and removes all its Attachments. Tags describe a resource; they never grant scope.

Agent tools must resolve resources through `getApplicationScope` in `src/server/applications.functions.ts`. It accepts an Application id, requires a logged-in user and returns only explicitly attached resources. Attachment tables have foreign keys for each resource kind; steps 08 and 09 can add sibling connection tables and extend the `Attachment` union in `src/lib/applications.ts`.

## Chat

Set `OPENAI_API_KEY` and `OPENAI_MODEL` to enable answers. Optionally set `OPENAI_BASE_URL` to an OpenAI-compatible API endpoint, including its prefix (for example `http://localhost:8000/v1`). Agent 6 uses the Chat Completions API and stores run history locally; it does not require the Responses API. SDK tracing is disabled.

At `/chat`, choose an Application with at least one ready Repository and ask a question. The Application stays fixed for that Conversation. Answers stream as plain prose; messages and the SDK's tool history are saved so a reload or follow-up keeps context. Only the owner can open or continue a Conversation, including when the other user is an Admin.

Before the first reply, Agent 6 refreshes attached clones older than three minutes. If syncing fails it can still read the existing clone. Its tools only list, search, and read attached code; symlinks, `.git`, and paths outside a clone are refused. Reads return at most 200 lines / 24 KB, searches return at most 50 results with a bounded scan, and oversized or binary files are skipped. Replies stop after 12 model turns or 90 seconds and offer **Try again** when they fail. Browsing past Conversations arrives in step 14; save a Conversation's URL to reopen it meanwhile.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm test` | Vitest |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:generate` | Write a migration to `drizzle/` after changing `src/server/repositories/schema.ts` |
| `npm run db:migrate` | Apply pending migrations (the server also does this at start) |

## Where things live

- `src/server/config.ts`: the only place environment variables are read.
- `src/server/repositories/`: the only place that imports Drizzle (schema, database, one repository per table).
- `src/server/secrets.ts`: `encrypt` / `decrypt` for secrets stored at rest.
- `src/server/auth.ts`: the Better Auth instance (email and password, roles `admin` and `client`). Its endpoints are served at `/api/auth/*`.
- `src/server/session.ts`: `requireSession()` and `requireAdmin()`. Every server function that reads or changes data calls one of them first.
- `src/components/shell/`: the app shell (rail, tab bar, panes, user menu).
- `src/routes/`: file-based routes; `/chat/*` for all users, `/admin/*` for Admins.
- `src/components/ui/`: shadcn components. Add more with `npx shadcn@latest add <name>`.
