# 07 Database Connections

Read [00-README.md](00-README.md) first.

## Goal

An Admin can add Postgres databases and attach them to Applications. The agent can query them and can never change them.

## Depends on

06.

## Scope

### Admin

- `/admin/database-connections` list, new, detail. Fields: name, host, port, database, user, password, SSL mode, Tags, description (what data lives here).
- Password is encrypted with the secret helper from step 01. After saving it is never sent back to the browser; the edit form shows "unchanged" and only replaces it when a new one is typed.
- **Test on save** and a "Test connection" button: connect, run a trivial query, report success or the error.
- **Write-privilege warning**: on test, inspect whether the role can insert, update, delete or create in the database. If it can, show a visible warning on the connection telling the Admin to supply a read-only role. The connection is still saved.
- Attach and detach Database Connections on the Application page, in the Attachments area from step 05.

### Agent tools

Available only for Database Connections attached to the Conversation's Application:

- List tables and views with their columns.
- Run a query.

### Read-only enforcement (all of these, every query)

- Runs inside a `READ ONLY` transaction that is always rolled back.
- One statement per call; multiple statements are refused.
- Statement timeout and a lock timeout.
- Row cap and a total result size cap; the tool tells the model when the result was cut.
- A fresh short-lived connection or a small pool per Database Connection; nothing left open after an error.
- Connection details and the password are never included in tool output or in errors returned to the model.

### Agent instructions

- The description and Tags of each attached Database Connection.
- Never show raw rows, ids, or column names to the user; describe what was found in plain words.
- Passwords, tokens and similar secrets found in data are never repeated.

## Out of scope

Databases other than Postgres. Writing a Data Fix (the agent only reports it; step 09).

## Domain terms

Database Connection, Attachment, Tag, Data Fix.

## Acceptance checks

- Tests against a real Postgres (container in the test setup): `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, a write hidden in a CTE, a function with side effects, and `SELECT 1; DELETE …` all fail and leave the data unchanged, even when the role is a superuser.
- A slow query is stopped by the timeout; a large table returns the capped number of rows with a "truncated" notice.
- A connection with a writable role shows the warning; one with a read-only role does not.
- A Database Connection not attached to the Conversation's Application cannot be queried.
- In chat, a question that needs data ("why is my order still pending?") is answered from the database in plain words.
- The saved password cannot be found in any response to the browser.

## Notes for the agent

- Check the Postgres driver's docs for running a single statement safely and setting per-transaction timeouts.
- The read-only transaction is the guarantee; do not try to detect writes by parsing SQL.
- Run `/impeccable` for the screens, reusing the pattern from steps 03 to 05.
