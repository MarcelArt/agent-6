# 18 Decision AI (optional)

Read [00-README.md](00-README.md) first.

## Goal

An organization can configure a separate model, the Decision AI, that picks which Repositories the agent should inspect for a question. When it is not configured or switched off, the agent decides by itself as it does today.

## Open question: answer before starting

`docs/plan.md` names three providers the Decision AI must support: "typesafe systemone jev api", "cloudflare worker ai clef" and "openai decision api". These names were not recognised during planning and were left open on purpose. Before implementing, the project owner must supply for each one:

- the exact product name and a link to its API documentation,
- how a request and a response look,
- how it authenticates.

Do not guess at these. Build the provider-independent parts below, and add each provider only once its details are supplied.

## Depends on

06, 14 (settings page).

## Scope

### Provider-independent part

- **Interface**: one function. Input: the user's message, recent Conversation context, and the Application's attached Repositories with name, description and Tags. Output: an ordered list of Repositories to inspect, each with a short reason, validated against a schema. Repositories not attached to the Application are dropped from the output.
- **Configuration** from env: `DECISION_AI_PROVIDER`, `DECISION_AI_API_KEY`, `DECISION_AI_MODEL`, `DECISION_AI_BASE_URL`. All optional as a group; partial configuration is reported at start.
- **Toggle** on `/admin/settings`: on or off, stored in settings. The section shows whether the env configuration is present and has a "Test" action. The toggle cannot be switched on without configuration.
- **Use in a run**: when on, call the Decision AI before the support agent and put its result in the agent's instructions as "start with these Repositories, because…". The agent may still read other attached Repositories if the suggestion proves wrong.
- **Fallback**: on error, timeout or invalid output, continue without it. The Conversation records that the fallback happened, visible to Admins.
- For an Application with one Repository, skip the call.
- The Admin view of a Conversation (step 13) shows the Decision AI's choice and reasons.

### Provider adapters

- One adapter per provider behind the interface, selected by `DECISION_AI_PROVIDER`.
- An OpenAI-compatible chat adapter with structured output can be built now, since its shape is known.
- The other adapters wait for the answers to the open question.

## Out of scope

Letting the Decision AI choose Database Connections or Log Connections. Letting it answer the user. Using it as the Guardrail.

## Domain terms

Decision AI, Repository, Application, Tag.

## Acceptance checks

- Not configured: behaviour is identical to before and no call is made.
- Configured and on, Application with a backend and a frontend Repository: a question about a button's label starts with the frontend; a question about a calculation starts with the backend. The Admin view shows the choice.
- Decision AI unreachable: the user still gets an answer and the fallback is recorded.
- Output naming an unattached Repository is ignored (test).
- Toggle off: no call is made even when configured.

## Notes for the agent

- Check each provider's docs through Context7 or the supplied links before writing its adapter.
- Run `/impeccable` for the settings section.
