# Agent 6 design rules

Rules for every screen. The reference is the prototype in [`prototype/`](prototype/) (open the HTML files directly in a browser) and the screenshots in [`screenshots/`](screenshots/). The chosen direction is "three-pane split"; see [direction-approved.md](direction-approved.md).

The colour, radius and font tokens in `src/styles.css` are frozen. Components are the shadcn **base-mira** preset (Base UI, zinc, Lucide icons), installed with the shadcn CLI and not restyled except where this file says so. Layout uses Tailwind utilities.

## 1. Shell

Every logged-in screen is one full-height frame (`flex h-svh`) of up to three panes. The page itself never scrolls; each pane scrolls on its own (`min-h-0 overflow-y-auto`).

| Pane | Size | Contents |
|---|---|---|
| **Rail** | `w-14 shrink-0 border-r bg-sidebar px-3 py-2`, items `gap-1`; expanded `w-56` | Top: product mark (a `size-8 rounded-lg bg-primary` square with "6"). Then the Chat, History and Tickets icons. Admins only: a separator, then All Conversations, All Tickets (with a count badge of pending Tickets), Users, Repositories, Applications, Database Connections and Log Connections (each with a count badge of connections that need a secret), Settings. Bottom (`mt-auto`): the expand/collapse control, then the current user's Avatar. |
| **List pane** | `w-80 shrink-0 border-r` | Records of the current section: Repositories, Conversations, Users and so on. |
| **Detail pane** | `flex-1 min-w-0` | The selected record's form, a Conversation, the Application picker, or an empty hint. |

- **Rail items** are icon buttons (`size-8`), inactive `text-muted-foreground`, active `bg-sidebar-accent text-sidebar-accent-foreground`. Every item has an `aria-label` and a Tooltip (side right) with its name. The list pane header always names the section in text, so icons are never the only label.
- **Expanded rail:** the control above the Avatar widens the rail to `w-56`, pushing the panes. Each item shows its name beside the icon, count badges move to the row end, the separator spans the rail with an "Admin" group name below it, and the Avatar shows the user's name. Tooltips are disabled while names are visible. The width animates over 240ms with the `ease-out-quint` token, and names fade in; reduced motion removes both. The choice is remembered per browser (`src/lib/rail.ts`) and applied by a pre-paint script on `<html data-rail="expanded">`, which the `rail-expanded:` variant reads.
- **User menu and theme** (Admin and chat areas alike): the rail Avatar opens a DropdownMenu to the right of the rail, aligned to the bottom (`w-60`). It holds:
  - Avatar, name and email;
  - separator;
  - the label "Theme" and a radio group with Light, Dark and System (icons sun, moon, monitor);
  - separator;
  - Account (the page where a user changes their own password, `/chat/account`);
  - Log out.

  This is the only theme control in the app. Login has its own (see 6).
- **Admin and chat share the shell.** Clients see only Chat, History and Tickets in the rail. Admins see the same plus the eight admin sections. There is no separate "admin mode".
- **Sections without records** (Settings) have no list pane: rail plus detail pane.

### Routes and panes

Every pane state is a URL. The table shows desktop. At phone width only one pane shows; see 7.

| Route | List pane | Detail pane |
|---|---|---|
| `/admin/repositories` | Repositories | Empty hint "Select a Repository to edit it" + "Connect repository" |
| `/admin/repositories/new` | Repositories | Create form |
| `/admin/repositories/$repositoryId` | Repositories, that row selected | Edit form |
| `/admin/<section>`, `/new`, `/$id` | Same pattern for Users, Applications, Database Connections, Log Connections, and Conversations (step 14, read-only detail) | |
| `/chat` | Conversations | Application picker (new Conversation) |
| `/chat/$conversationId` | Conversations, that row selected | The Conversation |
| `/chat/account` | none | The logged-in user's own account: name, email, role, and the change-password form |
| `/chat/history` (suggested name) | Conversations | Empty hint "Select a Conversation to reopen it" + "New conversation" |

List filters and search live in search params and survive a reload.

## 2. Spacing, density, width

- **Density is dense.**
  - The root font size is `112.5%` (18px with the browser's default settings). Rem-based type, controls, and spacing scale together for readability while respecting the user's preferred font size.
  - Admin text: `text-xs` (the preset's size).
  - Titles: `text-sm font-medium`.
  - Controls: preset `h-7`; header actions `size="sm"`.
  - Only Client-facing chat text is larger (see 4).
- **Pane headers:** every pane starts with an `h-12 shrink-0 border-b px-4` header, items `gap-2`.
- **Pane bodies:**
  - Forms: `mx-auto w-full max-w-xl px-4 py-6 md:px-8 md:py-10`, `gap-6` between blocks.
  - Conversation: `mx-auto w-full max-w-2xl px-4 py-6`, `gap-5` between messages.
  - Picker: `max-w-xl`, vertically centred.
- **Text sizes:**
  - Nothing is smaller than 12px. Badge gets `className="text-xs"`; that is the one size override of a shadcn component, because the preset's 10px is below the floor.
  - Do not use Kbd or the `xs` Button size.
- **Colour** only through token utilities (`bg-background`, `bg-card`, `bg-muted`, `bg-sidebar`, `text-muted-foreground`, `ring-foreground/10` and so on). Elevation is the preset's `ring-1 ring-foreground/10`; no extra shadows, gradients or colour literals.
- **Contrast is at least 4.5:1 in both themes.** These token pairs fail and must not be used for text:
  - `text-primary` on dark backgrounds (2.25:1). That includes the Button `link` variant in dark. Primary is a fill colour, never a text colour.
  - `text-destructive` on a destructive tint (`bg-destructive/10`: the destructive Button and Badge variants) in light (3.97:1). Instead:
    - show failure states as an outline Badge, or a plain row, with a destructive icon;
    - destructive actions are DropdownMenu items (`variant="destructive"`), or `Button variant="outline"` with `text-destructive` for a confirm button.
  - `text-muted-foreground` on `bg-muted`, `bg-secondary`, `bg-accent` or a checked choice card in light (4.4:1). On a selected (`bg-muted`) row, secondary text becomes `text-foreground/70`. AvatarFallback gets `text-foreground`.

## 3. List-and-form pattern (all admin sections)

### List pane

- **Header:**
  - section name (`text-sm font-medium`);
  - record count (`text-xs tabular-nums text-muted-foreground`);
  - on the right, one ghost `icon-sm` "+" button with `aria-label` (for example "Connect repository") that goes to `/new`.
- **Toolbar** under the header (`px-2 py-2`): search as InputGroup with a search-icon addon and an InputGroupInput. Add a Select filter next to it when the section has one (Application, status).
- **Rows:**
  - layout: `ul.px-2.pb-2` of links, `flex items-start gap-2.5 rounded-md px-2 py-1.5`, hover `bg-muted/50`, selected `bg-muted` plus `aria-current`;
  - a leading status icon (`size-3.5`), then two lines of `text-xs`:
    - line 1 (`leading-5`): name in `font-medium`, truncated; one key property on the right (for example the Tracked Branch, with its icon);
    - line 2 (`leading-4`, muted): status word and time ("Ready · 4 min ago"); a secondary property on the right (Tags as "backend +2").
  - status icons: Ready = muted `circle-check`; Syncing = spinning `loader-circle` in `text-foreground`; Failed = `circle-alert` in `text-destructive`, with the word "Failed" in `text-destructive` and the error text on line 2 (up to two lines); Pending = muted `circle-dashed`.
- **Row actions:**
  - Record actions (Sync now, Remove) live in the detail pane header, not on the row.
  - Lists whose records have no detail form (Conversations: Rename, Delete) get a ghost `icon-sm` "…" button at the right of the row. On desktop it appears on hover and focus; on phone it is always visible. It opens a DropdownMenu.
- **Empty state:** the list pane shows an Empty (icon media, title, one-line description), for example "No Repositories yet" / "Connect a GitHub repository so the agent can read its code." The detail pane shows the explanation and the primary button ("Connect repository").

### Detail pane (form)

- **Header:**
  - title (record name, or "Connect a Repository" on create), truncated;
  - status as an outline Badge with an icon;
  - "Last synced 4 min ago · 7d03b18" in muted `text-xs` (from `lg`; below that it moves to the top of the form);
  - on the right: secondary actions (`Button variant="outline" size="sm"`, for example Sync now), then a ghost `icon-sm` "…" DropdownMenu holding destructive actions (Remove repository). Destructive actions never sit next to Save.
- **Removal** asks for confirmation in an AlertDialog that names what is affected (for example the Applications a Repository is attached to).
- **Fields:**
  - FieldGroup of Fields, labels above controls, FieldDescription under the control;
  - mark optional fields with " (optional)" in `font-normal text-muted-foreground` inside the label;
  - read-only values (the GitHub repository on edit) are an InputGroup with a lock addon;
  - Tags are a wrapping InputGroup-style box (`h-auto min-h-7 flex-wrap gap-1 p-1`) of secondary Badges, each with an x button, plus a bare input "Add a Tag".
- **Save and Cancel** sit at the bottom left of the form, in that order: `Button` "Save changes" (or "Connect repository" on create), then `Button variant="outline"` "Cancel". Cancel goes back to the list route.
- **Errors:**
  - A field error sets `data-invalid` on the Field and `aria-invalid` on the control, and shows a FieldError under it, written as what happened plus what to do: "Agent 6 cannot read halden/rates-engine with the configured GitHub token. Give the token read access to this repository, then try again."
  - Fields that depend on the failing one are disabled, with a placeholder that says why ("Check the repository first").
  - Errors not tied to a field use an Alert (destructive variant) at the top of the form.

### Extending the pattern

Applications, Database Connections, Log Connections and Users use the same list and form.
- The shared parts are in `src/components/records/`: `record-list.tsx` (header, search, rows, pagination, empty state) and `record-detail.tsx` (header, form, actions, hint, confirmation). Users (`src/routes/admin/users/`) is the worked example.
- A list longer than one page gets a footer (`h-10 border-t px-4`, muted `text-xs`): "21–40 of 43" and ghost `icon-sm` previous and next links. The page is a search param.
- Users: the status icon is muted `circle-check` (Active) or muted `ban` (Disabled). Disable is the destructive action in the "…" menu; a disabled user gets an outline "Enable user" button instead.
- Sub-lists inside a record (an Application's Attachments) are a FieldSet in the form: rows with a "…" menu, and an "Add" button that opens a Dialog.
- Secrets (passwords, auth headers) are never shown again after saving. Their field shows "Saved" and offers "Replace".

## 4. Chat

Clients read this area, often on a phone, so chat text is larger than admin text:
- message text, option labels and composer text: `text-sm`;
- meta (names, times, hints): `text-xs`.

Pass these as `className` on the shadcn components; the preset's sizes are 12px and 10px.

- **List pane** (Conversations):
  - header: title "Conversations" and `Button variant="outline" size="sm"` "New conversation";
  - toolbar: search by title, and an Application filter Select ("All Applications");
  - rows: title (line 1), and "Customer Portal · Today, 09:15" (line 2). Where the Conversation has Tickets, add a `ticket` icon with "Ticket created" (or "2 tickets created"); a Conversation from before Tickets with a Filed Issue keeps the `circle-dot` icon and "Reported to the team".
- **Detail header:** Conversation title, and the Application as an outline Badge with that Application's icon.
- **Messages** (MessageScroller; starts scrolled to the newest message):
  - A "Today" Marker (separator variant) opens each day.
  - **Client:** Message aligned end; MessageHeader "Rina · 09:12" (`text-xs`); Bubble `variant="secondary"` with `text-sm/relaxed`.
  - **Agent:** Message aligned start; MessageHeader with a `size-4 rounded-sm bg-primary` "6" mark, "Agent 6 · 09:13" (`px-0`). Bubble `variant="ghost"`: plain prose, `text-sm/relaxed`, four to five sentences.
- **Image attachment** (in a Client message, under the bubble):
  - a button card `w-64 sm:w-72 overflow-hidden rounded-lg border bg-card`, with the image on top and a footer `border-t px-2.5 py-1.5 text-xs` (image icon + filename);
  - clicking opens the image larger in a Dialog;
  - before sending, picked images show as Attachments (with a remove action) above the textarea in the composer.
- **Interactive Question:** a Card `size="sm" w-full max-w-md` in an agent message.
  - Header: CardTitle = the question. Multiple choice adds CardDescription "Choose all that apply."
  - Options: choice cards (FieldLabel > Field `orientation="horizontal"` `py-2.5` > Checkbox or RadioGroupItem + FieldTitle `text-sm`), `gap-1.5`, at least 40px tall. "Something else" is always the last option.
  - **Multiple choice:** CardFooter with `Button size="lg"` "Send answer" and the hint "Or type your own answer below." (`text-xs text-muted-foreground`).
  - **Single choice** sends on click; it has no Send button.
  - **Answered:** the options become a plain list of disabled radios or checkboxes, the chosen one `font-medium`, the others muted. CardFooter `border-t` shows a lock icon and "Answered". The answer also appears as the Client's Bubble right after it.
- **Ticket notice:** an Alert `w-fit` directly under the agent answer that created the Ticket, with a `ticket` icon, AlertTitle by status ("Ticket waiting for review", "Ticket accepted", "Ticket declined"), a one-line explanation and a "View ticket" link (`/chat/tickets/$id` for the owner, `/admin/tickets/$id` in the audit view). Admins also get "Filed Issue #482 in halden/billing-service" once it is accepted.
- **Filed Issue notice** (answers from before Tickets): an Alert `w-fit` directly under the agent answer that led to it, with a `circle-dot` icon, AlertTitle "Reported to the team", AlertDescription "The developers have what they need to fix this."
  - Clients see no issue number and no link.
  - Admins (step 14 audit view) see "Filed Issue #482 in halden/billing-service" as a link to GitHub.
- **Progress and errors:**
  - While the agent works, show a Marker with a Spinner and plain text ("Looking at how the app works…"), never tool names.
  - Failures are a destructive Alert in the Conversation, with an outline "Try again" button.
- **Composer:** pinned under the messages, same `max-w-2xl` column (`px-4 pb-3 md:pb-4`). It is an InputGroup:
  - InputGroupTextarea (2 rows, `text-sm`, placeholder "Message the agent…");
  - an InputGroupAddon `align="block-end"` holding a ghost `icon-sm` "Attach image" button (image icon) and, at `ml-auto`, the default `icon-sm` send button (arrow-up).
  - The textarea has a visually hidden label.
- **Application picker** (`/chat`):
  - centred `max-w-xl`: heading "Which Application do you need help with?" plus the helper line;
  - Applications as choice cards with icon, name and description;
  - an unavailable Application has a dashed border and a muted title, shows its reason with a clock icon ("Not ready yet: its Repository is still syncing."), and cannot be picked;
  - the composer sits directly under the choices.

## 5. shadcn components by element

| Element | Component |
|---|---|
| Rail items | `Link` rows (`h-8`, ghost-button states) + `Tooltip` disabled while expanded; plain `<nav>`, not the Sidebar component |
| User menu, row menus, "…" actions, phone Admin menu | `DropdownMenu` (`DropdownMenuLabel`, `DropdownMenuRadioGroup` for Theme, `DropdownMenuItem variant="destructive"`) |
| Avatar | `Avatar` + `AvatarFallback className="text-foreground"` |
| Search fields | `InputGroup` + `InputGroupAddon` + `InputGroupInput` |
| Filters, Tracked Branch | `Select` |
| Status and Tags | `Badge` (`outline` for status, with icon; `secondary` for Tags), `className="text-xs"` |
| Forms | `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldSet`, `Input`, `Textarea`, `Button` |
| Remove confirmation | `AlertDialog` |
| Empty states | `Empty` (`EmptyHeader`, `EmptyMedia variant="icon"`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`) |
| Form-level and chat errors, Filed Issue notice | `Alert` |
| Messages | `MessageScroller`, `Message`, `MessageContent`, `MessageHeader`, `Bubble` (`secondary` Client, `ghost` agent), `Marker` |
| Pending images in composer | `Attachment` |
| Enlarged image | `Dialog` |
| Interactive Question | `Card size="sm"` + `RadioGroup` / `Checkbox` inside `FieldLabel` choice cards |
| Composer | `InputGroup`, `InputGroupTextarea`, `InputGroupAddon align="block-end"`, `InputGroupButton` |
| Progress | `Spinner` inside a `Marker` |
| Login theme switch | `ToggleGroup variant="outline" size="sm"` (icon-only items with `aria-label`) |
| Login "or" | `FieldSeparator` |

## 6. Login

- **Layout:** split screen.
  - The left half (`md:w-1/2 bg-sidebar md:border-r md:p-10`) holds the product mark and "Agent 6" at the top, and two plain sentences at the bottom on what it does for the organization.
  - The right half centres the form (`max-w-sm`).
- **Form:**
  - h1 "Sign in to Agent 6" (`text-lg font-medium`), plus the organization line;
  - Email and Password fields;
  - `Button size="lg"` full width, "Sign in";
  - a FieldSeparator "or", then `Button variant="outline" size="lg"` full width "Continue with <provider>" (key-round icon). This button appears only when OAuth is configured;
  - small text: "Accounts are created by your Admin."
- **Theme:** a ToggleGroup (light, dark, system) fixed at the top right.

## 7. Phone width (below `md`, 768px)

- **Rail becomes a bottom tab bar:** `h-14 border-t bg-sidebar`, tabs `flex-1`, each an icon (`size-5`) over a `text-xs` label; active tab `font-medium text-foreground`. The tabs are:
  - Chat;
  - History;
  - Tickets;
  - Admin (Admins only, with the pending Ticket count), which opens a DropdownMenu of the admin sections upwards;
  - Account (the Avatar), which opens the user menu upwards.

  The tab bar stays visible on every screen.
- **One pane at a time:**
  - List routes (`/admin/repositories`, `/chat/history`) show the list pane full width.
  - Record routes (`/admin/repositories/$id`, `/new`, `/chat/$conversationId`) and `/chat` (picker) show the detail pane full width. Its header starts with a ghost `icon` back button (chevron-left, `-ml-2`) to the list route.
- **Rows** grow to `py-2.5` (at least 44px tall). Secondary properties show in full (all Tags), and "…" row menus are always visible.
- **Chat header:** the title on one line, and the Application as a muted line with its icon underneath (instead of the Badge).
- **Header buttons with text** keep their icon and hide the label (`max-sm:sr-only`), for example Sync now.
- **Login:** the left half becomes a short top bar with the mark.
- **No horizontal page scroll** at 375px.

## 8. Prototype files

| File | Screens (hash) | Screenshots (`screenshots/`, dark and light) |
|---|---|---|
| [login.html](prototype/login.html) | Login | `login-desktop-*` |
| [repositories.html](prototype/repositories.html) | list (default), `#repositories-edit`, `#repositories-new` (with error), `#repositories-empty` | `repositories-desktop-*`, `repositories-edit-desktop-*`, `repositories-new-desktop-*`, `repositories-empty-desktop-*`, `repositories-phone-*`, `repositories-edit-phone-dark`, `user-menu-desktop-dark` |
| [chat.html](prototype/chat.html) | Conversation (default), `#chat-new` (Application picker) | `chat-desktop-*`, `chat-full-desktop-*` (whole Conversation), `chat-picker-desktop-*`, `chat-phone-*`, `chat-picker-phone-*`, `user-menu-phone-dark` |
| [history.html](prototype/history.html) | Conversation history | `history-desktop-*`, `history-phone-*` |

Desktop screenshots are 1440×900; phone screenshots are 375×812 at 2×.

### How the prototype is made

- **Component classes:** `ui-*` classes in the HTML are the base-mira components, with props as data attributes (`<button class="ui-button" data-variant="outline" data-size="sm">` is `<Button variant="outline" size="sm">`). Their CSS is in [tools/kit.css](prototype/tools/kit.css), copied from the shadcn registry.
- **Rebuild the CSS** after editing the HTML: `node docs/design/prototype/tools/build.mjs`. It reads the tokens from `src/styles.css` and removes Tailwind's own palette, shadows and fonts, so nothing outside the tokens can appear.
- **Colour check:** `node docs/design/prototype/tools/check-colors.mjs docs/design/prototype/*.html docs/design/prototype/assets/app.css` must report clean.
- **Screenshots and contrast audit:** `node docs/design/prototype/tools/shoot.mjs <page> <outDir> <hash>@<w>x<h>@<theme> --audit`. It needs Playwright.
