# 02 Foundation

Read [00-README.md](00-README.md) first.

## Goal

Turn the bare TanStack Start scaffold into a base the later steps build on: validated configuration, Agent 6's own database, and an app shell with real routes.

## Depends on

01.

## Scope

- **Config**: one module that reads and validates environment variables at server start and fails with a clear message when one is missing. Variables for this step: `DATA_DIR`, `ENCRYPTION_KEY`. Add `.env.example`. Later steps add their own variables to the same module.
- **Own database**: Drizzle with SQLite, file at `DATA_DIR/agent6.db`. Migration generation and an `npm run db:migrate` script; migrations also run at server start. Follow the column rules in [ADR 0001](../adr/0001-sqlite-first-portable-schema.md).
- **Repository layer**: `src/server/repositories/` as the only place that imports Drizzle. Prove the pattern with one real table, `settings` (key, value), and its repository. Later steps use it.
- **Secret helper**: `encrypt` / `decrypt` functions using `ENCRYPTION_KEY` with authenticated encryption, for later steps that store connection passwords.
- **App shell**: layout routes for `/chat` and `/admin` with navigation between sections, placeholder pages for each future admin section (users, repositories, applications, database connections, log connections, settings), a 404 page, and an error boundary. `/` redirects to `/chat`.
- **Theme**: light and dark, using the `:root` and `.dark` tokens already in `src/styles.css`. Follow the operating system by default. A toggle in the shell lets the user choose light, dark or system; the choice is remembered in that browser. The first paint after a reload already has the right theme (no flash of the other one).
- **Tests**: Vitest set up, `npm test` script, tests for config validation, the settings repository and the secret helper.
- Replace the starter title and content with Agent 6 naming.

## Out of scope

Login and route protection (step 03). Any real admin or chat feature.

## Domain terms

Admin, Client.

## Acceptance checks

- Starting the server without `ENCRYPTION_KEY` stops with a message naming the variable.
- First start creates `DATA_DIR/agent6.db` with the `settings` table.
- Opening `/admin/repositories` directly, then reloading, shows the same placeholder page with the admin navigation.
- An unknown URL shows the 404 page.
- With the operating system set to dark, the first visit is dark. Choosing light in the toggle and reloading stays light, with no dark flash.
- The shell matches the prototype in `docs/design/` in both themes.
- `npm run typecheck`, `npm run lint`, `npm test` pass.

## Notes for the agent

- Check TanStack Start docs for the current way to write server functions, server-only modules and layout routes.
- Check Drizzle docs for the current SQLite driver recommendation on Node.
- Build the shell to match the prototype in `docs/design/` and the shell rules in `docs/design/DESIGN.md`. Do not choose a new visual direction.
