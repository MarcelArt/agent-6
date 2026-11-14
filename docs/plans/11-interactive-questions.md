# 11 Interactive Questions

Read [00-README.md](00-README.md) first.

## Goal

When a message is too vague to act on, the agent asks for more information. Where the likely answers are known, it shows them as options the user can click.

## Depends on

06.

## Scope

### Agent

- A tool the agent calls to ask one Interactive Question: the question text, two to six options, and whether one or several may be chosen. Calling it ends the agent's turn and waits for the user.
- Instructions: ask when the message does not say which screen, what action, what was expected or when it happened, and that information changes where to look. Ask one thing at a time, at most a few times in a row, then work with what is known. Use options when the choices can be listed (screens found in the code, actions, time ranges); ask in plain text when they cannot. Do not ask what can be found in code, data or logs.

### Chat

- An Interactive Question appears in the Conversation as a card with clickable options. Single choice sends on click; multiple choice has checkboxes and a confirm button.
- Every card also offers "Something else", which lets the user type freely. Typing a normal message while a question is open also counts as the answer.
- The answer is saved and shown as the user's message; the card then shows the chosen options and can no longer be changed.
- The question and its answer are stored with the Conversation, so a reload shows an open question still waiting, or an answered one in its final state.
- Fully usable by keyboard and screen reader.

## Out of scope

Multi-step forms. Free-form inputs other than the "Something else" text. Questions asked by anything other than the agent.

## Domain terms

Interactive Question, Conversation.

## Acceptance checks

- "It doesn't work" produces a question with options relevant to the selected Application, not a guess at an answer.
- Clicking an option continues the Conversation with that context.
- Reload while a question is open: it is still open and still answerable.
- A specific, clear message gets a direct answer with no question.
- An answered card cannot be answered again.
- Tests cover saving and restoring the open and answered states.

## Notes for the agent

- Check the OpenAI Agents SDK docs for stopping a run on a specific tool call and resuming with the tool's result; pick the mechanism that survives a server restart, since state must come from the database.
- Run `/impeccable` for the card. It is the most interactive element of the chat.
