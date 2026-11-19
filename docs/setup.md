# Set up Agent 6

Agent 6 runs as one container for one organization. Its own database is SQLite; the Postgres connections described below belong to the Applications it supports. Run one instance against each data volume.

## Requirements and startup

Use a Linux x86-64 server with Docker Engine and Docker Compose v2 installed, disk space for your Repository clones and pictures, and outbound HTTPS access to Docker Hub, GitHub and your model provider. The published image currently targets `linux/amd64`. Allow network access from the container to any Postgres and Loki servers you connect. You also need OpenSSL to generate secrets, and a reverse proxy with a domain and TLS certificate for production.

Copy `compose.yaml` and `.env.example` from the same Agent 6 release into a dedicated directory. All Compose commands in this guide run from that directory:

```bash
cp .env.example .env
chmod 600 .env
openssl rand -base64 32
openssl rand -base64 32
```

Put the first generated value in `ENCRYPTION_KEY` and the second in `BETTER_AUTH_SECRET`. Fill in `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 8 characters), and `BETTER_AUTH_URL`. For an initial local check use `http://localhost:3000`; for production use the final public HTTPS address, without a trailing slash. Keep secrets out of Git. In Compose `.env` files, put a value containing `$` or `#` in single quotes so it is treated literally.

Set `OPENAI_API_KEY` and `OPENAI_MODEL` for answers. `GUARDRAIL_MODEL` optionally chooses a cheaper classifier; otherwise it uses `OPENAI_MODEL`. Both use the same key and endpoint. `OPENAI_BASE_URL` is optional for a compatible Chat Completions server and must include its API prefix, such as `https://model.example.com/v1`. The model should support tools, and image input if Clients will send pictures. Without a model key and name, the server starts but chat is unavailable.

`DATA_DIR` is for local development. Compose overrides it to `/data` and mounts its named volume there. Do not change the mount without moving the existing data. `PORT` controls the published host port (default `3000`). `BIND_ADDRESS` defaults to `127.0.0.1`, suitable for a reverse proxy on the host. For a direct LAN test, set it to the server's LAN address. From another computer, use that server's address in `BETTER_AUTH_URL` and in the browser. Container port 3000 and its listening address are fixed by Compose.

```bash
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100 agent-6
curl --fail http://127.0.0.1:3000/api/health
```

Use your chosen port in the last command if you changed `PORT`. The health endpoint needs no login and returns an empty `200` when the server and its database work, or `503` if the database check fails. It exposes no connection details. On startup Agent 6 validates configuration, applies migrations and creates the first Admin before accepting traffic. If startup fails, inspect the logs for the variable to correct, edit `.env`, and run `docker compose up -d --force-recreate --wait`.

The service pulls `marcelaritonang/agent-6:latest`, restarts unless explicitly stopped, and runs as the image's `node` user (UID 1000). Docker initializes the named volume with writable ownership. A bind mount supplied by you must be writable by UID/GID 1000. Container recreation preserves the named volume. Do not use `docker compose down --volumes` on an installation you want to keep.

Inside a container, `localhost` means the container itself. Use a resolvable address reachable from the Docker network for your model server, GitHub proxy, Postgres and Loki. Install internal CA certificates in a derived image if your organization uses a private certificate authority.

## First login and users

Open `/login` at `BETTER_AUTH_URL` and sign in with the initial Admin credentials. Open the user menu, choose **Account** (`/chat/account`), and change the password using the initial password as the current one. Then clear `ADMIN_PASSWORD` in `.env` and recreate the container. The initial Admin variables are ignored as soon as any user exists; changing them never resets a password.

Under **Users**, create the other Admins and Clients. There is no public registration. An Admin configures resources and Applications; a Client can ask questions about any Application in this installation. Keep an Admin password login available when enabling OAuth.

## Optional Decision AI

Leave every `DECISION_AI_*` variable empty to use the regular agent flow. To enable advice from a separate decision model, configure exactly one provider in the server environment:

| Variable | TypeSafe | Cloudflare Workers AI | OpenAI Decisions |
| --- | --- | --- | --- |
| `DECISION_AI_PROVIDER` | `typesafe` | `cloudflare` | `openai` |
| `DECISION_AI_API_KEY` | TypeSafe key | Workers AI API token | OpenAI API key |
| `DECISION_AI_MODEL` | e.g. `jev-latest` | `@cf/cloudflare/clef` or `@cf/cloudflare/clef-flash` | e.g. `gpt-6-luna` |
| `DECISION_AI_ACCOUNT_ID` | empty | Your Cloudflare account ID | empty |

`DECISION_AI_BASE_URL` is optional. The defaults are `https://api.typesafe.ai/v1`, `https://api.cloudflare.com/client/v4/accounts/<account-id>/ai/run`, and `https://api.openai.com/v1`. For a compatible gateway, supply the corresponding API prefix; Agent 6 appends `/systemone`, `/<Cloudflare model ID>`, or `/decisions`. This is independent of `OPENAI_BASE_URL`, and credentials never fall back to the support model's key.

Restart after changing environment variables (`docker compose up -d --force-recreate --wait` for Compose). Valid configuration defaults to enabled. Under **Settings → Decision AI**, an Admin can save an organization-wide on/off preference and run **Test connection**, including while disabled. Tests send synthetic input only and do not change the toggle. The preference survives restarts, provider changes, and configuration removal/restoration. An absent or invalid configuration disables the feature without preventing application startup; Settings explains what needs correcting.

Decision AI receives the current question, up to six recent text messages, attached-resource metadata and, for later decisions, up to 16 KB of redacted evidence excerpts. Screenshots and SDK reasoning are excluded. Requests are capped at 64 KB, four requests per reply, three seconds per request and six seconds total waiting. A provider failure stops further decision requests for that reply; support continues through the regular agent flow.

Optional `DECISION_AI_MIN_PROBABILITY` (0.5–1, default 0.7) and `DECISION_AI_MIN_MARGIN` (0–1, default 0.15) tune initial recommendation thresholds. Classification and issue destinations must meet both thresholds. These are advisory heuristics: the main agent still checks evidence and can investigate any attached resource. See [TypeSafe's protocol](https://docs.typesafe.ai/api/system-one), [Cloudflare Clef](https://developers.cloudflare.com/workers-ai/models/clef/) and [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions) for provider setup and model availability.

## GitHub token

Create a token under GitHub → Settings → Developer settings → Personal access tokens. Set it as `GITHUB_TOKEN` in `.env`, then recreate the container for the environment change to take effect.

For a fine-grained token, choose the user or organization that owns the Repositories as the resource owner, and select only the Repositories Agent 6 should read and report faults in. Request these repository permissions:

| Permission | Access | Purpose |
| --- | --- | --- |
| Contents | Read-only | Clone, sync, and list branches |
| Metadata | Read-only | Check Repository existence (GitHub includes this) |
| Issues | Read and write | File issues, add comments, and create labels |

The token's user also needs write access to each Repository: GitHub drops issue labels when its user cannot set them, and Agent 6 needs its `agent-6` label to find existing issues. Complete organization approval or SAML SSO authorization if required. A classic token needs the `repo` scope and access to each relevant Repository. Track expiry and rotate the token before it expires. See GitHub's [token instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

Agent 6 starts without a token, but cannot connect or sync a Repository. Without Issues access, answers and Tickets still work; accepting a Ticket fails and Admins see the reason on it.

## Read-only Postgres role


Use a separate login for Agent 6. In the examples below, replace `appdb` with your Application's database, `app_owner` with the role that creates its tables (often the migration role), and `public` with the schema the agent should read.

Connect to that database with `psql` as a database administrator who can create roles, grant access to the tables, and change `app_owner`'s default privileges:

```bash
psql --host db.example.com --port 5432 --dbname appdb --username db_admin --password
```

Create the login and set its password at the prompt. The `\password` command keeps the plaintext password out of SQL and shell history.

```sql
CREATE ROLE agent6_reader WITH LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\password agent6_reader

-- Access to the database, schema, and existing tables/views.
GRANT CONNECT ON DATABASE appdb TO agent6_reader;
GRANT USAGE ON SCHEMA public TO agent6_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent6_reader;

-- Access to future tables/views created by the Application's migration role.
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO agent6_reader;

-- An additional default for new connections; grants still control access.
ALTER ROLE agent6_reader SET default_transaction_read_only = on;
```

Repeat the schema grants for each schema the agent needs. Repeat `ALTER DEFAULT PRIVILEGES` for every role that creates tables; it applies only to future objects created by the named role in this database. To expose only selected tables, replace the broad existing-table grant with `GRANT SELECT ON TABLE public.orders TO agent6_reader;`, omit the default-privileges statement, and grant future tables individually. See PostgreSQL's [GRANT](https://www.postgresql.org/docs/current/sql-grant.html) and [default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html) documentation.

Keep this login separate from roles that own objects or have write privileges. Every login also receives privileges granted to `PUBLIC`. On older or customized databases, `PUBLIC` may have schema `CREATE` or table write privileges, so granting only `SELECT` to the new login does not remove those shared permissions. If Agent 6 shows a writable-role warning, ask the database administrator to review those grants. For example, `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` removes schema creation from **every** role relying on that shared grant; grant `CREATE` explicitly to the Application's migration role before making that change. If tables use row-level security, configure the required read policies for `agent6_reader`.

Verify the login with a new connection:

```bash
psql --host db.example.com --port 5432 --dbname appdb --username agent6_reader --password
```

For an existing table such as `public.orders`, check that reading is allowed and writing/creation are denied:

```sql
SELECT
  has_table_privilege(current_user, 'public.orders', 'SELECT') AS can_read,
  has_table_privilege(current_user, 'public.orders', 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write,
  has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_schema,
  has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema;
```

Expect `can_read` to be `true` and the other values to be `false`. Check each schema and table you intend to expose. In Agent 6, enter `agent6_reader` and its password in the Database Connection, select the appropriate SSL mode, and save. The test should succeed without a writable-role warning; then attach the connection to the Application.

The writable-role warning matters even though Agent 6 uses read-only transactions, timeouts and result limits. A dedicated role restricts what stolen credentials, a mistaken query or a future bug could do. Do not dismiss the warning for an owner or administrator login. Privileged functions callable by the login also deserve database administrator review. Never give Agent 6 a migration role's password.

## Loki and Base Selectors

A Log Connection needs the base address of a Loki HTTP API, without `/loki/api/v1` on the end:

- Direct Loki: for example `http://loki:3100` on a shared Docker network. Ask the logging administrator for the reachable service address, tenant ID and any required Basic or Bearer header.
- Through Grafana: open **Connections → Data sources**, find the Loki datasource and its UID. Use `https://grafana.example.com/api/datasources/proxy/uid/<uid>`, with `Bearer <service-account-token>` as the auth header. The Grafana service account must have permission to query that datasource. A Grafana dashboard's browser URL is not a Loki API endpoint.

Under **Log Connections**, add the URL and optional auth header and tenant ID, then **Test connection**. A successful test checks the labels API. When attaching the connection to an Application, choose a **Base Selector** that identifies only its streams, such as `{app="billing", environment="production"}`. Use Grafana Explore's Loki label browser to find the actual labels and values. The Attachment dialog shows how many streams matched during the last 24 hours: investigate zero matches before saving. A very broad selector gives the Application access to unrelated logs. To change it later, remove and recreate that Attachment.

## Configure an Application end to end

1. Under **Repositories**, add a GitHub Repository and pick its **Tracked Branch**. Wait for its status to become ready. Use **Sync** after correcting a failed token or branch.
2. Under **Database Connections**, add the Application's Postgres address, database, read-only role and password. Prefer **Verify certificate and hostname**. **Require** encrypts without validating the server certificate; **Disable** sends an unencrypted connection. Save and test, and resolve any writable-role warning.
3. Add and test any Log Connection as described above.
4. Under **Applications**, create an Application with a name and a description Clients recognize. Add notes to help the agent understand the product.
5. Open its Attachments and use **Add Repository**, **Add Database Connection** and **Add Log Connection** to attach the relevant resources. Each Log Connection Attachment needs a Base Selector. Connections alone grant no scope; Tags only describe them. An Application needs at least one ready Repository to become available for questions.
6. In **Settings**, choose the organization's **Preferred Language** if desired.
7. At `/chat`, select the Application and ask a question with a known answer. Check an answer that needs its code, then one that needs a database or its logs. Use a test fault to check that a Ticket is created, then accept it in **All Tickets** to check issue filing. Admins can review **All Conversations** and any filing errors on the Ticket.
8. Sign in as a Client and check the workflow they will use. Create additional Applications for other products and attach their resources explicitly.

## HTTPS reverse proxy and OAuth

For production, set `BETTER_AUTH_URL=https://support.example.com` and leave Compose bound to loopback if Nginx runs on the host. Terminate TLS at the proxy and forward the original host and scheme. The public address is also used for issue links, authentication and the OAuth callback.

Example Nginx configuration (replace the domain and certificate paths with your issued certificate). Agent 6 derives the request's public origin from `BETTER_AUTH_URL` and preserves the browser's `Origin` header for its same-origin checks. Serve Agent 6 at the root of its own domain.

```nginx
server {
    listen 80;
    server_name support.example.com;
    return 301 https://support.example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name support.example.com;
    ssl_certificate /etc/letsencrypt/live/support.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/support.example.com/privkey.pem;
    client_max_body_size 45m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        gzip off;
    }
}
```

Set `BETTER_AUTH_URL` to the public HTTPS origin; Agent 6 uses that fixed origin rather than trusting forwarded headers. Do not expose its backend port to untrusted traffic. Buffering, caching or compression at any other proxy or CDN must also be disabled for `/api/chat/`; keep its idle/read timeout at least 120 seconds. A reply can run for 90 seconds. Test that words appear progressively rather than arriving in one block. The image permits up to 110 seconds for shutdown, and Compose gives it two minutes; use `docker compose stop` to allow this grace period.

For OAuth, register a confidential OAuth/OIDC client with your provider. In Agent 6's **Settings → OAuth**, enter the discovery URL, client ID and client secret and use the displayed **Redirect URL** exactly, normally `https://support.example.com/api/auth/callback/organization`. Use the scopes required to return a verified email, usually `openid email profile`. Test discovery and enable the provider. The provider login's verified email must match an existing, enabled user created by an Admin; OAuth does not provision new users. Test both provider login and password login after deploying behind HTTPS. If you change the public address, update both `BETTER_AUTH_URL` and the provider's registered callback, and recreate the container.

## Backup and restore

The named volume contains `agent6.db` (users, sessions, settings, encrypted connections, Applications, Attachments, Conversations, Tickets and Filed Issues), SQLite WAL/SHM files while running, `repos/` clones, and `uploads/` pictures. Back up the whole directory, plus `.env` separately in secure storage. Losing `ENCRYPTION_KEY` means every encrypted connection password, log auth header and OAuth client secret must be re-entered. Keep `BETTER_AUTH_SECRET` with the backup too.

For a consistent backup, stop the service and copy the volume through a one-off container. This avoids copying a live SQLite database or a half-written clone. These commands use the service's mounted volume rather than assuming its Docker volume name:

```bash
mkdir -p backups
chmod 700 backups
docker compose stop agent-6
docker compose run --rm --no-deps -T --entrypoint tar agent-6 -C /data -czf - . > backups/agent6-data.tar.gz
docker compose start agent-6
```

Only continue if the archive command succeeds. Give each backup a distinct filename in regular use and store a copy off the server. Record the running image's release tag or digest with each backup. Encrypt the archive and `.env` backup according to your organization's policy. A stopped backup needs downtime; schedule it accordingly.

To restore, prepare the same `compose.yaml` and `.env` (including the original keys), and use an empty data volume. For an existing installation, preserve its current volume before replacing anything. Extract the archive into that empty volume as the image's non-root user:

```bash
docker compose run --rm --no-deps -T --entrypoint tar agent-6 -C /data -xzf - < backups/agent6-data.tar.gz
docker compose up -d --wait
```

Restore with the image version that created the backup, then upgrade separately. Log in, check connections, open a saved Conversation and picture, and sync a Repository. A new volume can use a distinct Compose project name, for example `docker compose -p agent-6-restore ...`; change the host port before starting it alongside another installation.

## Upgrades and releases

Read release notes and make a stopped backup with the current image **before** pulling an update:

```bash
docker compose pull agent-6
docker compose up -d --wait
docker compose logs --tail=100 agent-6
```

Migrations run automatically before traffic. Confirm login, a saved Conversation, and a Repository sync after upgrading. `docker compose down` preserves the data volume; adding `--volumes` deletes it. An older image may not understand newer migrations: roll back using the matching pre-upgrade data backup and original keys, rather than pointing it at the upgraded database.

Compose defaults to `marcelaritonang/agent-6:latest`. For a controlled rollout, change its `image` to a specific published tag, such as `marcelaritonang/agent-6:v0.1.0`, then pull and recreate it. Download `.env.example` changes from the matching release when new settings are introduced.

Repository maintainers must create a Docker Hub repository named `marcelaritonang/agent-6` and add a GitHub Actions repository secret named `DOCKERHUB_TOKEN`, containing a Docker Hub access token with permission to push to that repository. The workflow uses the Docker Hub user `marcelaritonang`. Creating and pushing a new tag matching `vX.Y.Z` (numeric components, for example `v0.1.0`) runs `.github/workflows/docker-publish.yml` and pushes the same image as both `latest` and the exact Git tag, including `v`. Branch pushes and prerelease tags do not publish. A tag must reach GitHub to trigger the workflow; creating one only on a workstation does not run Actions.

To build a local image from source without publishing:

```bash
docker build -t agent-6:local .
```

The image uses TanStack Start's [Nitro Node deployment output](https://tanstack.com/start/latest/docs/framework/react/guide/hosting). `scripts/start.mjs` initializes the built Start service before opening Nitro's HTTP listener; only the production output, migrations, launcher and system runtime dependencies enter the final stage.
