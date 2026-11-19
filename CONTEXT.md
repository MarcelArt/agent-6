# Agent 6

A self-hosted support agent for one organization. It answers questions from the people who use the organization's applications by reading code, logs and databases, and reports faults to developers.

## Language

### People

**Admin**:
A user who configures Agent 6: users, Repositories, Applications, connections and settings.
_Avoid_: Superuser, operator

**Client**:
A non-technical user of one of the organization's Applications who asks Agent 6 for help.
_Avoid_: Customer, end user, member

### Things the agent can read

**Application**:
A product the organization runs and supports, made of one or more Repositories plus the Database Connections and Log Connections attached to it.
_Avoid_: App group, project, workspace

**Repository**:
A GitHub repository connected to Agent 6. One Repository can belong to several Applications.
_Avoid_: Repo connection, codebase

**Tracked Branch**:
The single branch of a Repository whose code the agent reads.
_Avoid_: Default branch, target branch

**Database Connection**:
A Postgres database of an Application that the agent may query, read-only.
_Avoid_: Datasource, target database

**Log Connection**:
A Loki endpoint (direct or through Grafana) that the agent may query for logs.
_Avoid_: Grafana connection, log source

**Attachment**:
The explicit link that puts a Repository, Database Connection or Log Connection in scope for one Application. Without an Attachment the agent cannot use the resource for that Application.
_Avoid_: Link, binding, mapping

**Base Selector**:
The log label selector stored on a Log Connection's Attachment that confines every log query to that Application's logs.
_Avoid_: Filter, scope query

**Tag**:
A free-form label on a Repository, Database Connection or Log Connection that tells the agent what the resource is for. A Tag never grants access.
_Avoid_: Label, category

### Conversations

**Conversation**:
One chat between a user and the agent about exactly one Application, chosen before the first message.
_Avoid_: Chat, session, thread

**Interactive Question**:
A clarifying question from the agent shown as clickable single-choice or multiple-choice options.
_Avoid_: Quick reply, form, prompt

**Guardrail**:
The check that refuses messages unrelated to supporting the selected Application.
_Avoid_: Filter, moderation

**Code Fix**:
A fault that can only be resolved by changing a Repository's code.

**Data Fix**:
A fault, or a correction a user asks for, that can only be resolved by a developer correcting data in an Application's database.

**Feature Request**:
A change to what an Application can do that a person asks for and that only developers can make in a Repository's code. Unlike a Code Fix, nothing is broken.
_Avoid_: Enhancement, wish

**Ticket**:
A Code Fix, Data Fix or Feature Request report the agent prepares from a Conversation for review. Accepting a Ticket records a Filed Issue. Declining it gives the Conversation's owner a reason.
_Avoid_: Draft, request, bug report

**Filed Issue**:
The GitHub issue or occurrence comment that results from accepting a Ticket. It is recorded on the Conversation that led to the Ticket.
_Avoid_: Bug report

### Settings

**Preferred Language**:
The one organization-wide language the agent answers in.
_Avoid_: Locale, user language

**Decision AI**:
An optional separate model that recommends which Repositories, Database Connections and Log Connections to inspect, a fault's Code Fix or Data Fix classification, and the Repository for a Ticket. The agent remains responsible for investigating the evidence and deciding what to do.
_Avoid_: Router, planner

### Administration

**Setup File**:
A file of chosen Applications, the Repositories, Database Connections and Log Connections attached to them and their Attachments, which an Admin exports from one Agent 6 instance and imports into another. It never holds connection secrets, users, Conversations or Tickets.
_Avoid_: Backup, config export, configuration dump, bundle

**Needs Secret**:
The state of an imported Database Connection or Log Connection whose password or auth secret an Admin has not entered yet. The agent cannot use it for any Application until the secret is entered.
_Avoid_: Incomplete, unconfigured, missing credentials

### Integrations

**Service Account**:
An identity an Admin creates so an external integration can use the Agent 6 API.
_Avoid_: Bot user, Client

**API Key**:
A credential issued to a Service Account. An Admin grants and revokes access for each API Key independently.
_Avoid_: Session token, signing secret

**Webhook Subscription**:
An Admin's configuration for sending selected Agent 6 events to an external destination as signed HTTP requests.

**Webhook Delivery**:
The sending of one event to one Webhook Subscription, which can take several attempts.
