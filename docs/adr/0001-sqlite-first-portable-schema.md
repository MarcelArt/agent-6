# SQLite first, with a schema that stays portable to Postgres

Agent 6 stores its own data in SQLite through Drizzle, on the same data volume as the repository clones, so a self-hosting organization needs one container and no database server. Supporting Postgres and SQLite together from day one was rejected because Drizzle table definitions are dialect-specific: every schema change would have to be made and migrated twice.

Postgres remains a planned option (`docs/plans/18-postgres-for-own-data.md`). To keep that cheap:

- Only column types that exist in both dialects: text, integer, real, boolean stored as integer, timestamps stored as integer. JSON is stored as text. No arrays, no enums, no dialect-specific SQL functions.
- All queries live behind the repository layer in `src/server/repositories/`. Nothing else imports Drizzle.
