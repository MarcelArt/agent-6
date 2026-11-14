# 17 Postgres for own data (optional)

Read [00-README.md](00-README.md) and [ADR 0001](../adr/0001-sqlite-first-portable-schema.md) first.

## Goal

An organization can choose, through an environment variable, to keep Agent 6's own data in Postgres instead of SQLite.

This is about Agent 6's own store. It has nothing to do with Database Connections, which are the Applications' databases the agent reads.

## Depends on

16.

## Scope

- **Selection**: `DATABASE_URL`. Unset or a `file:` URL means SQLite at `DATA_DIR/agent6.db` as today. A `postgres://` URL means Postgres. The choice is made once at start.
- **Schema**: a Postgres schema mirroring the SQLite one table for table, with its own migration folder. A check, run in tests, that both schemas have the same tables and columns, so they cannot drift unnoticed.
- **Repository layer**: the same repository functions work on both. Where the two Drizzle dialects differ, the difference stays inside `src/server/repositories/`.
- **Better Auth**: its adapter configured for the selected dialect.
- **Tests**: the repository and auth tests run against both stores.
- **Compose**: an optional Postgres service and the matching `DATABASE_URL` example. SQLite stays the default.
- **Docs**: `docs/setup.md` explains the choice, and that repository clones and uploads still live in `DATA_DIR` either way.
- Update ADR 0001's status to reflect that Postgres is now supported and that every schema change is made in both schemas.

## Out of scope

Migrating existing data from SQLite to Postgres. Running several Agent 6 instances against one Postgres (clones are still local). Other databases.

## Domain terms

None new. Do not call this store a Database Connection.

## Acceptance checks

- With `DATABASE_URL` unset, everything behaves as before.
- With a Postgres URL and an empty database, start-up migrates it and the first Admin is created; a full pass through chat, connections and issue filing works.
- The schema parity check fails when a column is added to only one schema.
- The test suite passes against both stores.

## Notes for the agent

- Before starting, search for Drizzle imports outside `src/server/repositories/` and for column types that break the ADR's rules; fix those first as a separate commit.
- Check Drizzle docs for the recommended way to share logic across SQLite and Postgres schemas.
