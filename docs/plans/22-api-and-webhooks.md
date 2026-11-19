# 22 API and webhooks

Design confirmed on 2026-11-20. Read [00-README.md](00-README.md), [ADR 0006](../adr/0006-durable-ticket-webhook-events.md) and [ADR 0007](../adr/0007-delegate-ticket-decisions.md) before implementation.

## Goal and scope

Give external integrations a versioned API for Agent 6 configuration and Ticket review, signed webhook notifications for the Ticket lifecycle, and public reference pages. Admins manage integration access and Webhook Subscriptions in Agent 6.

Conversations, uploads, Users, OAuth, Decision AI, Setup File import and export, and integration management are outside the v1 API. Repository files, Application database queries and Loki queries stay inside the existing investigation flow.

## 1. Service Accounts and API boundary

- Add Service Accounts, API Keys, and persisted permission and Application grants in Agent 6's own database. An Admin can name and disable a Service Account, issue multiple independently scoped keys, edit grants and revoke keys. Offer optional expiry and show creation and last-used metadata.
- Authenticate using `Authorization: Bearer <API Key>` exclusively on `/api/v1` routes. Generate high-entropy keys, display the full value once, and persist a lookup identifier and one-way digest. Browser sessions and machine credentials use separate authentication paths. Preserve the existing session and Admin checks at browser entry points.
- Start keys with zero access. Grant named permissions by resource and operation, including distinct create, update and delete permissions. Grant either selected Applications or explicit all-Applications access. Revocation, account disablement and grant changes apply to subsequent requests. Audit protected mutations with the operation, target and actor IDs, while keeping key material and request bodies out of logs.
- Put API authorization before domain actions. Reuse existing business validation and repository methods behind the browser and API boundaries. Apply Application scope in list rows, counts, filters, detail lookups and actions. A shared resource is visible to a scoped key through an Attachment to an allowed Application, with only authorized Attachments shown. Unattached records require the all-Applications grant. Tags confer no access.
- Configuration writes require the relevant operation permission and an all-Applications grant. Preferred Language has separate instance-wide read and update permissions. Ticket decisions can be restricted to selected Applications.
- Add Admin list and detail routes for Service Accounts and keys. Show the action and Application grants explicitly, including that `tickets:accept` delegates permission to file on GitHub. Allow overlapping keys for rotation. Use the existing Admin shell and URL-based screen patterns.

## 2. Resource API and Ticket review

Use the `/api/v1` prefix for the paths below. For general CRUD, use `GET` and `POST` on collections and `GET`, `PATCH` and `DELETE` on records. Creation returns `201` with the new record's location. Successful updates, deletes and Ticket decisions return `204`. Lists have bounded pagination, stable ordering and documented filters, with all Ticket statuses included by default. Define validated requests, explicit response schemas, and a consistent JSON error shape. Return `401` for invalid credentials, `403` for missing operation permissions, and `404` for records outside a key's Application scope. Report state conflicts with `409`. Bound request sizes and rate-limit authentication and API traffic.

| Resource path | Operations and rules |
| --- | --- |
| `/repositories` | List, create, retrieve, update and delete. Reuse GitHub access and Tracked Branch checks, background sync for new or changed branches and clone cleanup on removal. |
| `/applications` | List, create, retrieve, update and delete. Reject removal when saved Conversations protect the Application. |
| `/applications/{id}/attachments` | List Attachments. Use `PUT` and `DELETE` on `/{kind}/{resourceId}` under the collection to manage them. Validate linked records and require a Base Selector for a Log Attachment. Allow updates to that selector through the same `PUT`. |
| `/database-connections` | List, create, retrieve, update and delete. Reuse connection validation and the existing save test. Return safe status and preserve read-only investigation enforcement. |
| `/log-connections` | List, create, retrieve, update and delete. Reuse connection validation and the existing save test. Preserve Base Selector enforcement when the agent reads logs. |
| `/preferred-language` | Read and update the singleton with `GET` and `PUT`, using the existing language validation. |
| `/tickets` | List and retrieve agent-created Tickets. Use `POST /tickets/{id}/accept` and `POST /tickets/{id}/decline` with separate permissions. Acceptance uses the stored Ticket, and decline requires a reason. |

- Use explicit list and detail projections. Separate normal Ticket reads from developer text, decline reasons and Filed Issue details, and require extra read permissions for sensitive connection configuration. Exclude submitter identities, Conversation content and raw diagnostic errors. Accept connection secrets only as write inputs and encrypt them using the existing secret store. A destination or account change requires fresh credentials before reusing the connection. Credentials never appear in responses, errors or audit records. Write permissions alone do not expose a read projection.
- Keep agent Ticket creation, its existing deduplication and Conversation limits. Ticket review shares validation, Attachment checks, GitHub filing and status transitions across the Admin UI and API. Keep the human Admin identity path for old and new decisions, and add Service Account and key references for machine decisions. Preserve old Tickets through an additive migration.
- Require claim ownership when completing or releasing an acceptance, and guard terminal transitions against concurrent Admin and API requests. A successful acceptance either opens a GitHub issue or adds an occurrence comment. A filing failure leaves the Ticket pending. Decided Tickets are final, and clients can reread state before retrying a request with an ambiguous result.

## 3. Webhook Subscriptions and delivery

Add an Admin area for creating and disabling Webhook Subscriptions, selecting event types and Applications, rotating a signing secret, sending a synthetic signed test, and viewing and retrying failed Webhook Deliveries. Explain at setup that production events contain Ticket descriptions and evidence. Subscription Application selections and event types govern delivery independently of API Key grants.

| Event | Emit when |
| --- | --- |
| `ticket.created` | The agent inserts a new pending Ticket. |
| `ticket.accepted` | Acceptance commits with a Filed Issue, whether the outcome is a new issue or an occurrence comment. |
| `ticket.declined` | The pending Ticket commits as declined with a reason. |
| `github.issue.created` | Acceptance commits with the outcome of creating a new GitHub issue. It accompanies `ticket.accepted`. |

- Persist each event and matching deliveries in the same transaction as the Ticket change. Build an immutable, versioned JSON snapshot with event ID, type and occurrence time plus the Ticket ID, kind, status, title, description, summary, decline reason, timestamps, Application and Repository references, target issue and Filed Issue outcome and reference where applicable. Apply existing redaction to outbound free text, including the decline reason. Keep related personal identities, Conversation content, credentials and internal diagnostics outside the event schema.
- Send an HTTPS POST signed with a unique HMAC-SHA256 secret per subscription. Follow [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) for `webhook-id`, `webhook-timestamp` and `webhook-signature`. Sign the stable event ID, current attempt timestamp and exact raw body. Encrypt signing secrets at rest and display values on creation or rotation. Support a bounded overlap for routine rotation and immediate replacement when necessary.
- Allow public HTTPS destinations. Recheck destinations at send time and connect only to a validated public address while keeping hostname verification. Reject redirects and private, loopback, link-local or otherwise non-public destinations. Use bounded concurrency, short timeouts and bounded responses for tests and real deliveries.
- Start the dispatcher after migrations and stop it before closing SQLite. Claim due deliveries with recoverable leases. Treat `2xx` as success. Retry transient network failures, timeouts, `408`, `429`, and `5xx` with backoff up to 24 hours. Store status, attempt count and a sanitized result, with bounded retention for completed history. Keep the event ID and body across automatic and manual retries. Receivers can see duplicates and out-of-order events.
- Enabling a subscription starts with new events. Disabling or replacing a destination cancels outstanding work for that destination. Apply narrowed Application and event selections before sending queued work. Manual retries require the original destination and event to remain eligible. Already-started requests can finish. The documented GitHub-to-local-commit crash window described in [ADR 0004](../adr/0004-admin-review-before-filing.md) still applies.

## 4. Public reference and operator guides

- Publish `/docs/api` with a downloadable OpenAPI document. Cover obtaining and rotating keys, permission and Application scope rules, endpoints and field schemas, pagination, common errors, and an example of each Ticket decision. Keep the OpenAPI document and endpoint validation aligned with a contract check.
- Publish `/docs/webhooks` with the four event schemas and examples, an occurrence-versus-new-issue example, raw-body HMAC verification with a five-minute timestamp tolerance, event ID deduplication, retry behavior, rotation, and troubleshooting. Examples use synthetic records and credentials.
- Link the public pages from the related Admin integration screens. Update the setup and usage guides for HTTPS, egress, credentials, backup and restore, and operator workflows. Use the established design system and verify keyboard access, light and dark themes, and desktop and phone layouts.

## Implementation order

1. Add the database migration, Service Account management and shared API authentication and authorization. Verify grant behavior before exposing resource routes.
2. Add the configuration endpoints and Ticket reads. Introduce shared Ticket decision logic and actor attribution. Ship the API decision routes alongside transactional event recording and the delivery worker so API and UI decisions emit the same events.
3. Add Webhook Subscription management, signed tests and delivery history. Publish both reference pages and the OpenAPI document before releasing v1.

## Acceptance checks

- A new key has no access. Expired, revoked and disabled credentials fail. A key scoped to one Application cannot discover another Application through IDs, pagination, filters or shared-resource Attachments. A scoped key cannot perform configuration writes.
- Authorized CRUD works through HTTP and preserves existing constraints. Exercise Repository sync and removal, deletion of an Application with saved Conversations, Attachment validation and log Base Selector enforcement. Verify connection retargeting, write-only secrets and scoped response fields.
- Accept and decline permissions work independently. API and Admin actions use the same transition checks and leave a legible audit trail. Concurrent and expired claims cannot commit two decisions. Failed GitHub filing leaves a pending Ticket and emits no acceptance event. New issues and occurrence comments emit the right event sets.
- A signed test verifies against the public documentation. Cover tampered bodies, stale timestamps, key rotation, transient failure and recovery across restart, disallowed destinations, filter changes, retries, duplicate IDs and full event snapshots. A receiver outage does not block Ticket actions.
- Test the migration on a copy of existing data with pending and decided Tickets. Generate Drizzle migration metadata and the route tree. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Run `npm run test:postgres` if implementation changes Postgres query or read-only enforcement. Check public docs anonymously and the integration UI as an Admin in the running app with isolated data.
