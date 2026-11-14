# 06 Chat, code only

Read [00-README.md](00-README.md) first.

## Goal

The first working product: a user picks an Application, asks a question, and the agent answers by reading the attached Repositories' code.

## Depends on

05.

## Scope

### Agent

- OpenAI Agents SDK for TypeScript. New env: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` (optional). Must work against an OpenAI-compatible server, not only OpenAI.
- One support agent per Conversation, built from `getApplicationScope`. Its instructions include the Application's notes and, for each attached Repository, its name, description and Tags.
- **Code tools**, limited to the Conversation's attached Repositories: list directory, search text (with path filter and result cap), read file (line range, size cap). Paths are resolved inside the clone; anything that escapes it, including through symlinks, is refused. Tools are read-only.
- Before the first agent run of a Conversation, call `ensureFresh` for each attached Repository (a few minutes' max age). A failed sync does not block the answer; the agent uses the existing clone.
- **Answer style** in the instructions: the reader is not a developer. No code, file names, table names or jargon. As short as possible, four to five sentences. Explain what to do in the Application, or say plainly that something is broken.
- Limits: maximum agent turns and a time limit per reply, with a friendly message when reached.

### Chat

- `/chat`: pick an Application (name and description). Applications with no ready Repository are shown as unavailable.
- `/chat/$conversationId`: the Conversation. The Application is fixed for its lifetime and shown in the header.
- Replies stream into the page. While tools run, show plain progress such as "Looking at how the app works…", never tool names or file paths.
- Conversations and messages are saved, including the agent run items needed to continue the Conversation later. A Conversation gets a short title from its first message.
- A Conversation can be opened only by its owner.
- Errors (model unreachable, limit hit) appear as a message in the Conversation with a retry action.

## Out of scope

Database and log tools (07, 08). Filing issues (09). Images (10). Interactive Questions (11). Guardrail (12). The list of past Conversations (13). Preferred Language (14).

## Domain terms

Conversation, Application, Repository, Client.

## Acceptance checks

- Ask a "how do I…" question about a feature that exists in an attached Repository: the answer is correct, short, and free of technical terms.
- Reload mid-conversation: all earlier messages are there and a follow-up question keeps context.
- Another user opening the same Conversation URL is refused.
- Tests: path escape attempts on each code tool are refused; a Repository not attached to the Application cannot be read; search and read caps hold.
- With a wrong `OPENAI_API_KEY` the user sees a friendly error, not a stack trace.

## Notes for the agent

- Check the OpenAI Agents SDK (TypeScript) docs for: defining tools, streaming events, custom base URL and model provider, choosing the Chat Completions API for compatible servers, turn limits, and how to persist and resume a run's history.
- Check TanStack Start docs for streaming a response from the server to the page.
- Tool output goes to the model, so apply caps there; a huge file must not blow the context.
- Run `/impeccable` for the chat interface. It is the main screen for Clients and must work well on a phone.
