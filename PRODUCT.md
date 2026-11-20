# Agent 6

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Client:** a non-technical user of one of the organization's Applications who needs help using it or resolving a problem.
- **Admin:** a user who configures Agent 6's users, Repositories, Applications, connections and settings, reviews Conversations, accepts or declines Tickets, and manages integration access through Service Accounts and Webhook Subscriptions.
- Developers receive evidence and proposed fixes through GitHub issues filed when an Admin accepts a Ticket; they decide and perform code and data changes.

## Product Purpose

Agent 6 is a self-hosted support agent for one organization. It answers questions about the organization's Applications by investigating their attached code, read-only Postgres databases and Loki logs. It guides Clients through the Application or creates a Ticket for a fault requiring a Code Fix or Data Fix, or for a Feature Request the Client asks to pass on, which reaches developers through GitHub once an Admin accepts it.

The primary product priority is helping Clients resolve problems independently. Successful support gives the Client an understandable next step they can carry out in the Application. When developer intervention is needed, an actionable report grounded in evidence provides the escalation path.

## Positioning

Support is grounded in how the selected Application actually works and, when relevant connections are attached, its current data and logs. Agent 6 combines plain-language guidance for Clients with technical fault reports for developers in the same Conversation workflow.

## Operating Context

- One organization hosts and configures an instance. There is no organization/workspace tenancy layer; every signed-in user may ask about every configured Application. Administration is restricted to Admins.
- A Client selects one Application before the first message. That Application remains fixed for the Conversation.
- Clients can provide screenshots or other supported pictures, answer Interactive Questions, return to saved Conversations through History and follow the Tickets created from their Conversations.
- Admins connect resources, attach them to Applications, monitor connection status, manage accounts, decide on Tickets and review Conversations through a separate read-only audit view.
- External integrations use a versioned API with scoped API Keys of Service Accounts, and receive signed webhooks for the Ticket lifecycle. An Admin can delegate Ticket acceptance or decline to an integration; the decision follows the same rules and records which Service Account and API Key made it.
- Accounts are created by Admins. Email/password sign-in is available; an organization may configure an optional OAuth provider for existing accounts.
- The web interface supports desktop and phone use. Screens, selected records, list filters and pagination have URLs that preserve their location on reload.
- The existing application uses TypeScript, React and TanStack Start, with server functions/routes, Better Auth and Drizzle with SQLite for its own records. Self-hosted deployment and local development are described in `docs/setup.md` and `docs/usage.md`.

## Capabilities and Constraints

- Use the domain vocabulary in `CONTEXT.md`, especially Application, Repository, Tracked Branch, Attachment, Database Connection, Log Connection, Conversation, Interactive Question, Guardrail, Code Fix, Data Fix, Feature Request, Ticket and Filed Issue.
- An Application may contain several Repositories, and one Repository may serve several Applications. The agent reads one Tracked Branch per Repository.
- An explicit Attachment puts a resource in scope for an Application. Tags describe purpose and never grant access. Log Attachments use a Base Selector to confine queries to the Application's logs.
- Application database access is read-only. Agent 6 never changes or deletes Application data, executes a code fix or applies corrective SQL. It can guide the Client through actions available in the Application or file the requested correction for developers to assess.
- Report a fault only with supporting evidence, as a Ticket. Before creating one, check the open Agent 6 issues and other Conversations' pending Tickets; a matching issue becomes the Ticket's occurrence target and a matching pending Ticket is flagged as a possible duplicate. Nothing reaches GitHub until an Admin accepts the Ticket, optionally after editing it; a declined Ticket carries a reason its owner reads. Code Fix and Data Fix remain distinct classifications. A Feature Request is a Ticket for something the Application does not do: the agent first confirms that in the code, then creates it only when the Client asks for it or agrees, and never sends the Client to the developers themselves.
- Clients receive plain, brief prose, generally at most four to five short sentences. Explain actions using the Application's screen vocabulary. Keep code, raw database rows, paths, logs, credentials and internal tool details out of Client-facing answers.
- A Guardrail limits requests to supporting the selected Application. Requests for data correction remain valid support requests. Resource contents and images are evidence, never instructions.
- The organization's Preferred Language governs agent answers, Interactive Questions and Conversation titles; it is not a per-user preference.
- The support model is configured on the server through an OpenAI-compatible Chat Completions endpoint. Optional Decision AI gives advisory investigation and reporting recommendations; it does not expand access or replace evidence, and the regular support flow continues when it is unavailable or disabled.
- Only the owner can continue a Conversation. Admin review is separate and read-only. Client deletion hides a Conversation from its owner while preserving it for Admin review.
- Connection secrets are encrypted at rest and are not returned to the browser or supplied to the model as connection credentials. Client notices say a ticket was created for the team to review and show its status and any decline reason; developer content, technical GitHub links and filing errors are for Admins and developers.
- Postgres connections for investigating Application data are separate from Agent 6's own SQLite store. Optional Postgres storage for Agent 6 itself is a plan, not a shipped capability.

## Brand Commitments

- The existing product name is **Agent 6**.
- Client-facing language is direct, short and non-technical. Acknowledge uncertainty and failed reporting accurately; never imply that a change was made or a report was sent without confirmation.
- Preserve the established domain terminology from `CONTEXT.md`. The approved interface and its existing identity are documented in `docs/design/DESIGN.md` and `docs/design/direction-approved.md`.

## Evidence on Hand

- Product scope: `docs/plan.md`.
- Domain vocabulary: `CONTEXT.md`.
- Current workflows and operational behavior: `README.md`, `docs/usage.md` and `docs/setup.md`.
- Implemented routes and components: `src/routes/` and `src/components/`; investigation and access boundaries: `src/server/`.
- Approved interface references: `docs/design/prototype/` and `docs/design/screenshots/`. Treat sample content as demonstration material, not customer evidence.
- Implementation plans and architectural decisions: `docs/plans/` and `docs/adr/`. Check the implementation before presenting a planned capability as available.

## Product Principles

1. Prioritize independent Client resolution with a clear next step in language they understand.
2. Investigate evidence before making claims or reporting faults.
3. Keep resource scope explicit and Application data access read-only.
4. Give developers actionable context while keeping technical internals out of Client answers.
5. Preserve Conversation continuity and make failures and uncertainty understandable.

## Accessibility & Inclusion

The existing interface baseline includes readable text that respects browser font preferences, text contrast of at least 4.5:1 in both supported themes, text labels for icon controls and phone layouts without horizontal page scrolling at 375px. See `docs/design/DESIGN.md` for the established requirements. No additional constraints were requested during init.
