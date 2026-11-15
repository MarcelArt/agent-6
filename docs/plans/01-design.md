# 01 Design

Read [00-README.md](00-README.md) and [`docs/plan.md`](../plan.md) first.

## Goal

Choose the layout of Agent 6 once, before any screen is built, and save it as a design reference that every later step follows.

This step writes no application code. It produces standalone HTML prototypes and documents.

## Depends on

Nothing.

## How to run

Use the `/huashu-design` skill, web module. The skill's three-direction gate applies: show three directions, then stop and wait for the person to pick. Do not continue to "Output" before they have picked.

## Constraints

- **Tokens are frozen.** Copy the `:root` and `.dark` custom properties from `src/styles.css` into the prototype and use only those for colour, radius and font (Geist Variable). Do not add colours, fonts or a different radius. Do not edit `src/styles.css`.
- **Stay close to the shadcn preset.** `components.json` sets the style `base-mira` on Base UI with the zinc base colour. Buttons, inputs, tables, dialogs, menus and cards in the prototype must look like that preset's components, so that the real shadcn components match without restyling.
- **The directions differ in layout only**: shell structure (for example sidebar, top bar, or a split view), density, and how the chat and the admin pages are composed. A direction that needs new tokens is not valid.
- **Dark first.** Design and present each screen in dark theme. Each screen must also be correct in light theme using the `:root` tokens.
- Use the terms in [`CONTEXT.md`](../../CONTEXT.md) for every label. Use realistic content (repository names, a believable Client question, a short agent answer of four to five non-technical sentences). No placeholder text.
- Clients are non-technical and may be on a phone. The chat and the Conversation history must work at phone width. Admin screens are desktop first but must not break at phone width.

## Screens to prototype

Each direction covers the same four screens:

1. **Login**: email and password, plus the place where an OAuth provider button would appear.
2. **Admin shell with Repositories**: the admin navigation with all sections (users, repositories, applications, database connections, log connections, settings), the Repositories list with Tags and sync status, and the create/edit form. This is the list-and-form pattern all other admin sections reuse.
3. **Chat**: the Application picker shown before the first message, a Conversation with a Client question, an attached image, an agent answer, an Interactive Question with single-choice and multiple-choice options, and a Filed Issue notice.
4. **Conversation history**: the list of past Conversations and how one is reopened.

Every screen also shows the theme toggle (light, dark, system) and the current user with logout, in the place the direction puts them.

## Output

During the direction pick, work in `design-demos/` at the repository root.

After the person has picked:

- `docs/design/prototype/`: the chosen direction's HTML, one file per screen, openable directly in a browser.
- `docs/design/screenshots/`: a dark and a light screenshot of each screen, at desktop width, plus phone width for the chat and the Conversation history.
- `docs/design/DESIGN.md`: short rules a later agent can follow without having seen this step:
  - shell structure and where navigation, theme toggle and user menu sit, for the admin area and for the chat area;
  - spacing, density and page width rules;
  - the list-and-form pattern: list layout, row actions, empty state, form layout, where save and cancel sit, how errors show;
  - chat rules: message layout, image attachment, Interactive Question card, Filed Issue notice, the composer;
  - which shadcn component is used for which element;
  - phone-width behaviour.
- Record the three directions shown and the person's choice, in their own words, in `docs/design/direction-approved.md`.
- Delete `design-demos/` and the two directions that were not chosen.

## Out of scope

Any change under `src/`. Installing shadcn components. Screens beyond the four listed; later steps build those from the patterns in `DESIGN.md`.

## Acceptance checks

- Three directions were shown and the person picked one before `docs/design/` was written.
- Each of the four screens exists in `docs/design/prototype/` and has dark and light screenshots.
- Every colour, radius and font in the prototype comes from the tokens in `src/styles.css`; a search of the prototype finds no other colour values.
- Text meets a contrast ratio of at least 4.5:1 in both themes.
- `DESIGN.md` covers every heading listed under "Output".
- `git status` shows changes only under `docs/design/`.

## Notes for the agent

- The checks in the README about `npm run typecheck`, `lint` and `test` do not apply to this step.
- Look up the current shadcn `base-mira` style through Context7 or the shadcn docs before drawing components, so the prototype matches what the CLI installs.
