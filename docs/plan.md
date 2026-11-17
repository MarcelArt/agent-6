# plan

Agent that provide support for users of applications by reading code, logs, and databases, which can guide users using the app or if the issue is in need of a code fix or data fix, agent can create github issue.
This app targeted to be self-hosted by organization, so no need multi-tenancy like organization or workspace scope.
Make sure this project has proper routing, navigating through pages shouldn't changing state only and reloading the browser should reload to the page the user currently is.
## Main Features
### Admin Interface
- Repository Management
  User admin can connect github repository to "Agent 6" and give tags to it, so agent can read and help issues from that repository
- Application Management
  Some application have multiple repositories, like backend and frontend. Admin user need to be able to do group repositories into an application, a repo can belong to multiple application for example backend A can be used in App A and App B at the same time.
- Database Connection (Postgres for now)
  User admin can add postgres connection also with tags so agent can query the database. (IMPORTANT: Agent should do read-only, no write/delete)
- Grafana/Loki Connection
  User admin can add grafana/loki connection also with tags so agent can query the logs  
### Client Interface
- Chatbot
  A chat interface for client user for them to be asking help/direction of a problem of the app. Before starting the conversation user need to select the app first. The user can upload a picture as a context for the agent to pinpoint the problem. The agent need to answer in non-technical manner, since client user are not developer, and as short as possible, 4-5 sentences are good. If the problem need a code fix or data fix, agent create a github issue with bug description and a potential fix for that for the developer. This feature also need a guardrail, user can only ask question relevant to the agent responsibilities. If user messages are vague agent should ask more questions for more informations, in the chat ui can also display interactive question and multiple selection display, that user can click.
- Chat histories
  User can see past conversations.
## Secondary Features
### Admin Interface
- OAuth 2.0 Configuration
  Add capability for organization to optionally logs in using OAuth 2.0 provider, like keycloak, authentik, google, microsoft, etc.
- Preferred Language
  A setting for a preferred language to be used by the agent to answer questions.
## Agent Stack
- OpenAI Agents SDK
  Admin provide api key, model, and openai compatible base url to environment variables.
- Decision AI
  Optional separate model configured by the system administrator through environment variables, supporting TypeSafe System One (Jev), Cloudflare Workers AI (Clef), and the OpenAI Decisions API. It advises which Repositories, Database Connections and Log Connections to inspect, classifies faults and recommends the Repository for a Filed Issue. Admin Settings has an organization-wide toggle and a synthetic connection test. Missing, disabled, invalid or failed Decision AI configuration uses the regular agent flow. See [step 19](plans/19-decision-ai.md) and [ADR 0003](adr/0003-advisory-decision-ai.md).
## Authn
- Default user and password from environment variables are created for the first time
- Future user will be created from admin user
- If using oauth, admin user need to create the user first and give whether admin or client role
