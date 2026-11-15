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

The server validates its configuration at start and stops with a message naming any variable that is missing or wrong. It then creates `DATA_DIR/agent6.db` and applies pending migrations.

**First Admin.** If no user exists when the server starts, it creates an Admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Log in with them at `/login`. Once any user exists the two variables are ignored, even if you change them. Nobody can register themselves; Admins create the other users.

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
