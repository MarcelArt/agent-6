# 16 Deployment

Read [00-README.md](00-README.md) first.

## Goal

An organization can run Agent 6 on its own server with one command and a short guide.

## Depends on

All of 01 to 09 at least. Best done after 15 so the guide is complete.

## Scope

- **Dockerfile**: multi-stage build, production server only in the final image, runs as a non-root user, includes whatever step 04 needs for cloning (`git` if it shells out). Migrations run at start.
- **Compose file**: the Agent 6 service, one named volume mounted at `DATA_DIR`, env from a `.env` file, restart policy, health check.
- **Health endpoint**: reports that the server is up and the database is reachable. No authentication, no details.
- **`.env.example`** complete and commented: every variable, which are required, example values, how to generate `ENCRYPTION_KEY`.
- **Graceful shutdown**: in-flight replies finish or end cleanly; running syncs do not leave a broken clone.
- **Setup guide** at `docs/setup.md`, written for the organization's administrator:
  1. Requirements and start-up.
  2. First login and changing the first Admin's password.
  3. Creating the GitHub token: which permissions (read code, write issues) and for which repositories.
  4. Creating a **read-only Postgres role** for a Database Connection, with the exact SQL, and why the warning from step 07 matters.
  5. Finding the Loki URL, direct or through Grafana, and choosing a Base Selector.
  6. Setting up an Application end to end.
  7. Running behind a reverse proxy with HTTPS, including settings needed for streamed replies and for the OAuth redirect URL.
  8. Backup: what is in the data volume, how to copy it safely. Losing `ENCRYPTION_KEY` means re-entering every connection password.
  9. Upgrading.
- Replace the scaffold `README.md` with a short description of Agent 6 and links to the setup guide and `CONTEXT.md`.

## Out of scope

Kubernetes manifests. CI pipelines. Running more than one instance (SQLite and the local clones assume one).

## Domain terms

Application, Repository, Database Connection, Log Connection, Base Selector, Admin.

## Acceptance checks

- On a clean machine: copy `.env.example`, fill it in, `docker compose up`, log in as the first Admin.
- Recreating the container keeps users, connections, Conversations and clones.
- The container process is not root; the health check turns healthy.
- Following the guide's read-only role SQL produces a role for which step 07 shows no warning.
- Stopping the container during a sync and starting it again leaves the Repository syncable.

## Notes for the agent

- Check TanStack Start docs for the current production build output and how to run it under Node.
- Write the guide for someone who administers servers but has not seen this codebase. Test every command in it.
