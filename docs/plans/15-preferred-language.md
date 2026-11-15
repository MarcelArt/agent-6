# 15 Preferred Language

Read [00-README.md](00-README.md) first.

## Goal

An Admin sets the language the agent answers in.

## Depends on

07. Touches the refusal text from 13 and the Interactive Questions from 12 if they exist.

## Scope

- `/admin/settings`: a Preferred Language field, chosen from a list of common languages with a free-text option for others. Default English. Stored in the `settings` table from step 02.
- The support agent's instructions tell it to answer in the Preferred Language, including Interactive Question text and options, progress messages it writes, and Conversation titles.
- The Guardrail refusal and other fixed messages produced by the agent side (limit reached, try again) appear in the Preferred Language.
- If a user clearly writes in another language, the agent still answers in the Preferred Language. State this rule in the instructions so the behaviour is consistent.
- GitHub issues stay in the language defined in step 10; they are for developers.
- A change applies to the next message in any Conversation, without restart.

## Out of scope

Translating the Agent 6 interface itself (menus, buttons, admin screens). A language per user or per Application.

## Domain terms

Preferred Language.

## Acceptance checks

- Set Indonesian: the next reply, an Interactive Question and a Guardrail refusal are all in Indonesian.
- A filed issue is still written in English.
- Reloading `/admin/settings` shows the saved value.
- A Client cannot open `/admin/settings`.
- A test confirms the instructions built for a run contain the configured language.

## Notes for the agent

- Read the setting when building each run, not once at server start.
- This step creates the settings page; step 16 adds a section to it, and Decision AI may add one in the future. The page has no prototype: build it from the form pattern in `docs/design/DESIGN.md` with room for more sections.
