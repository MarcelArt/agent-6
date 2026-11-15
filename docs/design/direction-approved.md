# Direction approved

Step: [01 Design](../plans/01-design.md). Date: 2026-11-15.

## What was shown

The visual style was fixed by the plan: tokens from `src/styles.css`, shadcn `base-mira` components. The directions therefore differed in layout only: shell structure, density, and how the chat and admin pages are composed.

Six layout candidates were drawn as thumbnails. Each one showed the admin Repositories screen and the Client chat. Three were built in full as clickable prototypes covering every screen (Login; Repositories list, edit, create with error, and empty; Application picker; Conversation; Conversation history), in dark and light, at desktop and phone width.

| | Direction | Source | Summary |
|---|---|---|---|
| 1 | Workspace sidebar | shadcn `sidebar-07` and `dashboard-01` blocks, plus the history sidebar of chat assistants | One 16rem sidebar for both areas, holding either the admin sections or the Conversation history. The admin form opens as a right Sheet over the list. Medium density. |
| 2 | Top bar, one column | Vercel's Geist design team | A quiet top bar with admin sections as line tabs and one centred column. Forms are their own page, made of stacked Cards. Comfortable density. |
| **3** | **Three-pane split** | **Linear (Karri Saarinen)** | **Icon rail, list pane, detail pane. Editing and chatting happen beside a list that never goes away. Phone: bottom tab bar, one pane at a time. Dense.** |

Alternates shown as thumbnails only:
- D, two shells by role (37signals);
- E, launcher home (seconds roulette, layout archetype 2);
- F, settings frame (seconds roulette, layout archetype 8).

The thumbnails, the three prototypes and their screenshots lived in `design-demos/`. That folder was deleted after the choice, as the step requires. The chosen direction survives as [`prototype/`](prototype/) and [`screenshots/`](screenshots/).

## The person's choice, in their own words

> I like direction 3

## Changes after the choice

These are refinements inside direction 3, not a mix with the other directions:

- The Client list pane is titled "Conversations" on every chat screen. The prototype had titled it "History", which clashed with the active Chat icon in the rail.
- Prototype-wide decisions that every direction shared are carried into [DESIGN.md](DESIGN.md):
  - Badge text is 12px.
  - Chat message text is 14px.
  - Contrast rules for the frozen tokens.
