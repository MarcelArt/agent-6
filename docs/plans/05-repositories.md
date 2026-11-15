# 05 Repositories

Read [00-README.md](00-README.md) first.

## Goal

An Admin can connect GitHub repositories. Agent 6 keeps a local clone of each one so the agent can read the code later.

## Depends on

04.

## Scope

- New env: `GITHUB_TOKEN` (one token for everything). Server start warns clearly if it is missing; repository screens show the same problem instead of failing silently.
- `/admin/repositories` list, `/admin/repositories/new`, `/admin/repositories/$repositoryId`.
- **Connect**: Admin enters `owner/name` or a GitHub URL. Agent 6 checks the token can read it, fetches the branch list, and prefills the Tracked Branch with the repository's default branch. Fields: Tracked Branch, Tags, optional description (what this code is, in one or two sentences; the agent reads it later).
- **Clone**: into `DATA_DIR/repos/<id>`, only the Tracked Branch, shallow. Runs in the background; the screen shows status: pending, syncing, ready, failed with the error text.
- **Sync**: "Sync now" button; record last synced time and commit. Export a server function `ensureFresh(repositoryId, maxAge)` that fetches only when the last sync is older than `maxAge`. Step 07 calls it.
- Changing the Tracked Branch re-syncs to the new branch.
- Removing a Repository deletes its clone. If it is attached to an Application, ask for confirmation naming those Applications (the Attachment table arrives in step 06; write the removal so 06 can add that check).
- Two syncs of the same Repository never run at the same time.

## Out of scope

Applications and Attachments (06). Agent tools that read the clone (07). Webhooks. GitHub App authentication.

## Domain terms

Repository, Tracked Branch, Tag.

## Acceptance checks

- Connecting a private repository the token can read ends in status "ready" and the files exist under `DATA_DIR/repos/`.
- Connecting a repository the token cannot read shows a plain error and saves nothing.
- "Sync now" after a new commit upstream updates the stored commit.
- The token never appears in the browser, in logs, or in the clone's git config on disk.
- Reloading the detail page during a sync shows the current status.
- Tests cover `ensureFresh` (fresh: no fetch; stale: fetch) and the concurrent-sync guard.

## Notes for the agent

- Pass the token to git through an auth header or credential helper for the single command, not inside the remote URL.
- Decide between shelling out to `git` and a library after checking what the deployment image can provide; if `git` is used, step 17 must install it in the image. Record the choice in this step's PR description.
- Match the Repositories screens of the prototype in `docs/design/`, reusing the list and form pattern from step 04.
