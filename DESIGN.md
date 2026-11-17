---
name: Agent 6
description: Quiet, compact and precise support interfaces.
colors:
  primary: oklch(0.496 0.265 301.924)
  primary-foreground: oklch(0.977 0.014 308.299)
  background: oklch(1 0 0)
  foreground: oklch(0.141 0.005 285.823)
  card: oklch(1 0 0)
  card-foreground: oklch(0.141 0.005 285.823)
  popover: oklch(1 0 0)
  popover-foreground: oklch(0.141 0.005 285.823)
  secondary: oklch(0.967 0.001 286.375)
  secondary-foreground: oklch(0.21 0.006 285.885)
  muted: oklch(0.967 0.001 286.375)
  muted-foreground: oklch(0.552 0.016 285.938)
  accent: oklch(0.967 0.001 286.375)
  accent-foreground: oklch(0.21 0.006 285.885)
  destructive: oklch(0.577 0.245 27.325)
  border: oklch(0.92 0.004 286.32)
  input: oklch(0.92 0.004 286.32)
  ring: oklch(0.705 0.015 286.067)
  sidebar: oklch(0.985 0 0)
  sidebar-foreground: oklch(0.141 0.005 285.823)
  sidebar-accent: oklch(0.967 0.001 286.375)
  sidebar-accent-foreground: oklch(0.21 0.006 285.885)
  sidebar-border: oklch(0.92 0.004 286.32)
  dark-primary: oklch(0.438 0.218 303.724)
  dark-primary-foreground: oklch(0.977 0.014 308.299)
  dark-background: oklch(0.141 0.005 285.823)
  dark-foreground: oklch(0.985 0 0)
  dark-card: oklch(0.21 0.006 285.885)
  dark-card-foreground: oklch(0.985 0 0)
  dark-popover: oklch(0.21 0.006 285.885)
  dark-popover-foreground: oklch(0.985 0 0)
  dark-secondary: oklch(0.274 0.006 286.033)
  dark-secondary-foreground: oklch(0.985 0 0)
  dark-muted: oklch(0.274 0.006 286.033)
  dark-muted-foreground: oklch(0.705 0.015 286.067)
  dark-accent: oklch(0.274 0.006 286.033)
  dark-accent-foreground: oklch(0.985 0 0)
  dark-destructive: oklch(0.704 0.191 22.216)
  dark-border: oklch(1 0 0 / 10%)
  dark-input: oklch(1 0 0 / 15%)
  dark-ring: oklch(0.552 0.016 285.938)
  dark-sidebar: oklch(0.21 0.006 285.885)
  dark-sidebar-foreground: oklch(0.985 0 0)
  dark-sidebar-accent: oklch(0.274 0.006 286.033)
  dark-sidebar-accent-foreground: oklch(0.985 0 0)
  dark-sidebar-border: oklch(1 0 0 / 10%)
typography:
  headline:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: 1.125rem
    fontWeight: 500
    lineHeight: 1.555556
  title:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.428571
  body:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.625
  admin-body:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1.625
  meta:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.333333
rounded:
  sm: 0.375rem
  md: 0.5rem
  lg: 0.625rem
  xl: 0.875rem
spacing:
  '1': 0.25rem
  '2': 0.5rem
  '3': 0.75rem
  '4': 1rem
  '5': 1.25rem
  '6': 1.5rem
  '8': 2rem
  '10': 2.5rem
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 0 0.5rem
    height: 1.75rem
  button-outline:
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 0 0.5rem
    height: 1.75rem
  button-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 0 0.5rem
    height: 1.75rem
  button-ghost:
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 0 0.5rem
    height: 1.75rem
  button-destructive:
    textColor: '{colors.destructive}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 0 0.5rem
    height: 1.75rem
  button-link:
    textColor: '{colors.primary}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 0 0.5rem
    height: 1.75rem
  input:
    textColor: '{colors.foreground}'
    typography: '{typography.admin-body}'
    rounded: '{rounded.md}'
    height: 1.75rem
    padding: 0.125rem 0.5rem
  nav-item:
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.md}'
    size: 2rem
  tag:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    height: 1.25rem
    padding: 0.125rem 0.5rem
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    typography: '{typography.admin-body}'
    rounded: '{rounded.lg}'
    padding: 1rem 0
---

# Design System: Agent 6

## Overview

**Creative North Star: "The Support Desk"**

The Support Desk keeps the current task and its context close together. Its quiet, compact and precise character comes from a shared navigation rail, a persistent record list and an adjacent working pane. Familiar controls make the interface easy to scan; restrained violet actions, neutral surfaces and modest type changes carry the hierarchy.

The system uses the existing shadcn base-mira components, Base UI behavior and Lucide icons. Administration stays dense, while Client messages, choices and the composer receive more reading room. Light and dark themes express the same hierarchy. This document records the implemented system and preserves the approved three-pane direction.

**Key Characteristics:**

- Quiet, compact and precise, with familiar task controls.
- A shared three-pane shell that becomes one pane with bottom navigation on phones.
- One violet action accent over zinc neutral surfaces.
- Geist throughout, with larger Client conversation text.
- Explicit status, visible keyboard focus and recoverable error states.

This root document is the portable system record. The preserved [screen guide](docs/design/DESIGN.md) supplies detailed screen patterns, and [direction-approved.md](docs/design/direction-approved.md) records the approved direction. For exact current values, use `src/styles.css` and the component source; the frontmatter is an extracted snapshot, not a second stylesheet. Unprefixed color tokens describe light theme; `dark-` tokens record dark-theme overrides of the same semantic role. Typography and component tokens are shared across themes.

Evidence: source plus paired light/dark desktop Repository and phone Conversation captures in `docs/design/screenshots/`. Those captures and the prototype stylesheet predate the root-size increase in commit `562ad4b`; their palettes match current source, but their pixel dimensions are historical. Browser access was unavailable during this extraction, so fresh runtime computed styles and preview rendering were not verified. Format: [DESIGN.md specification](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md).

## Colors

Deep Violet supplies the action accent; Zinc Neutrals organize the working surfaces, text and state changes.

### Primary

- **Deep Violet** (`primary`, `dark-primary`): primary actions, checked controls and the Agent 6 mark. The light primary foreground remains the paired high-contrast text role in both themes. Hover reduces the primary fill opacity to 80%.
- Checked choice cards use the same primary at 5% in light theme and 10% in dark theme. These are state treatments, not additional brand colors.

### Neutral

- **Zinc Neutrals surfaces:** `background` is the working canvas; `card` and `popover` contain grouped or floating content; `sidebar` sets navigation apart. Each has its paired foreground role.
- **Neutral state surfaces:** `secondary`, `muted` and `accent` are semantic roles sharing the existing neutral values. They do not introduce secondary brand hues. Secondary fills hold Client bubbles and Tags; muted fills identify selected records.
- **Neutral ink and edges:** `foreground` carries primary text, `muted-foreground` carries secondary text, and `border`, `input` and `ring` define separation and focus. Dark borders and inputs use the source's translucent white values.
- **Error red:** `destructive` and `dark-destructive` communicate failures and destructive intent, paired with words or icons. It is a status color, not a decorative accent.

**The Semantic Color Rule.** Use the existing semantic theme roles; do not introduce local color literals or a second accent palette.

**The Contrast Pair Rule.** Primary is a fill, not running text. Keep selected-row secondary text at foreground with 70% opacity; use destructive outline actions instead of destructive tinted buttons for confirmations.

The preserved guide identifies three text combinations to avoid: primary on dark canvas, destructive on destructive tint in light theme, and muted text on selected neutral surfaces in light theme. Keep its 4.5:1 text-contrast requirement; do not interpret the presence of a primitive variant as approval to use every color pairing. The sidecar's synthesized tonal ramps are swatch-preview aids, not extra implementation colors.

## Typography

**Family:** Geist Variable with sans-serif fallback, shared by headings, controls and body text. There is no separate display face. Weight and measured spacing provide hierarchy without a decorative type layer.

### Hierarchy

| Role | Frontmatter token | Use |
|---|---|---|
| Headline | `headline` | Login and Application-picker headings; compact, medium weight. |
| Title | `title` | Pane headers and Card titles. |
| Body | `body` | Client/agent messages, with relaxed leading. Choice labels and composer text share its size, with their component-specific weight and leading. |
| Admin body | `admin-body` | Dense forms and supporting component copy. |
| Label | `label` | Buttons; field labels and Tags share the size/weight, with their own tighter leading. |
| Metadata | `meta` | Names, timestamps and compact secondary text; record rows set their own line heights. |

The root is 112.5% of the browser default (18px when that default is 16px). Therefore the common 0.75rem admin text is 13.5px, Client text at 0.875rem is 15.75px and the compact headline at 1.125rem is 20.25px under those settings. Preserve rem values and the user's browser preference. The older guide's 12px/14px shorthand describes the former 16px-root scale, not fixed current dimensions.

Login and empty-state titles use tight tracking (-0.025em); do not apply it to every label. Counts and pagination use tabular numerals. Badge usages explicitly raise text to the admin scale rather than keeping the primitive's 0.625rem default. Small phone account-avatar initials retain a 0.625rem source override; this is not a general text role. Inputs use the larger text size below the desktop breakpoint and the admin size from that breakpoint; the composer explicitly keeps its larger text throughout.

**The Reading Scale Rule.** Preserve the browser-relative root size and the larger Client text. Do not shrink text to recover space in dense panes.

## Layout

The logged-in frame fills the small viewport height and prevents page scrolling. At the desktop breakpoint the navigation rail, record list and flexible detail pane sit side by side. Settings and Account omit the list. Pane bodies own their scrolling and retain minimum-zero flex sizing so content can shrink without pushing the page sideways.

| Element | Observed size or rhythm |
|---|---|
| Navigation rail | 3.5rem wide; 2rem mark and rail controls. |
| Record list | 20rem wide; fixed beside a flexible detail pane. |
| Pane header | 3rem high, 1rem horizontal inset, 0.5rem gaps. |
| Record forms | 36rem maximum width; 1rem/1.5rem horizontal/vertical padding, increasing to 2rem/2.5rem on desktop; 1.5rem between sections. |
| Conversation | 42rem maximum width, 1rem horizontal and 1.5rem vertical padding; 1.25rem between messages. |
| Application picker | 36rem maximum width, centered within the working pane. |
| Record rows | 0.5rem horizontal inset; vertical padding 0.625rem on phones and 0.375rem on desktop; two text lines and a status icon. |
| Bottom navigation | 3.5rem high, equal-width labeled destinations. |

The base spacing step is 0.25rem. Half steps also appear in icon/text groups. With an 18px root, the rail/list/header measure 63px/360px/54px; these are examples of rem scaling, not replacement fixed pixel dimensions.

At the default `md` breakpoint (48rem, 768 CSS px at the browser's initial 16px font), the rail and adjacent panes become visible. Below it, one pane occupies the width and labeled bottom navigation remains visible. Back controls return from detail to list. The `sm` breakpoint (40rem) handles compact action labels and dialog widths. Media-query rem units use the browser's initial font size, not the page's 112.5% root override. Keep the 375px no-horizontal-scroll baseline.

Login uses a two-column split from `md`; its product panel becomes a compact top strip on phones. It shares the same tokens and controls.

**The Pane Continuity Rule.** Keep selection, search and pagination in the URL, and let each visible pane scroll independently.

## Elevation & Depth

Flat work surfaces; lifted menus and overlays. Borders, tonal changes and thin foreground rings provide most separation. Cards use the preset one-pixel foreground-at-10% ring. Dropdowns and select popups additionally retain the preset medium shadow; dialogs use a dark backdrop and optional small backdrop blur. This is the current component behavior, and is more specific than reading the older guide's “no extra shadows” instruction as a ban on preset floating-control shadows.

The medium shadow is `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`, inherited from Tailwind by the installed components. Focus uses a two-pixel ring at 30% of the ring color for standard controls, with a ring-colored border. Some navigation/avatar controls use their own preset focus treatment.

**The Floating Surface Rule.** Keep work surfaces flat. Retain the component preset shadows on floating menus and selects, without adding decorative shadows to panes or cards.

State transitions use the existing 150ms default and standard easing. Dialog, dropdown and select transitions specify 100ms, with fade/zoom and directional entry from their anchor. Repository syncing uses a one-second linear spin; investigation activity uses reduced-motion-aware spinners. There is no implemented global entrance choreography or universal reduced-motion policy to document.

## Shapes

Controls have gently curved medium corners; Cards, image attachments and the product mark use the larger corner, while dialogs use the extra-large corner. Tags and avatars are fully rounded. The base radius is 0.625rem; the frontmatter resolves its observed multipliers for small, medium, large and extra-large corners.

Borders are thin and semantic. Empty and unavailable states may use dashed outlines. The geometry stays rectangular and aligned with the pane grid; selection comes from a surface change, not a new silhouette. Icons use the installed Lucide stroke vocabulary.

## Components

**Character:** Compact, familiar and restrained.

### Buttons

Compact medium-weight labels, medium corners and a transparent border form the base. The default height and padding are recorded in `button-primary`; small header buttons are 1.5rem high and large form buttons are 2rem. Primary fills carry the paired foreground; outline buttons are secondary actions; ghost buttons serve unobtrusive icon actions. Neutral secondary buttons are also available.

Hover changes the fill, focus adds the preset ring/border, and ordinary pressed buttons move down one pixel. Popup triggers omit that pressed translation. Disabled controls halve opacity and prevent interaction; invalid controls use destructive border/ring states. The library also contains destructive-tinted and primary-link variants: retain them in the catalog, but respect the contrast restrictions above when composing actual screens.

Source: `src/components/ui/button.tsx`. Do not use the smallest button sizes for new screen content. Destructive record actions belong in the overflow menu and a named confirmation; the confirmation uses outline styling with destructive text.

### Inputs / Fields

Thin input borders, a subtle input-color fill and medium corners keep forms continuous with the surrounding pane. The standalone input has compact vertical/horizontal padding and an explicit placeholder color. InputGroup unifies search icons, locked values, the composer and grouped actions within one border. Focus follows the control or the focused child, so the group reads as one unit.

Labels sit above controls with supporting copy below. Invalid states set both field and control semantics, plus a corrective error message. Disabled fields retain their values with reduced opacity. Optional labels and saved-secret replacement patterns follow the preserved screen guide. Sources: `src/components/ui/input.tsx`, `input-group.tsx`, `field.tsx` and `src/components/records/record-detail.tsx`.

### Chips / Tags

Tags use the neutral secondary fill, a pill shape and the explicit admin-size text override. Removable Tags include an accessible remove control and wrap within the input group. Status badges are outline rather than decorative colored pills; pair the icon with status words. Source: `src/components/ui/badge.tsx`, `src/components/records/tags-input.tsx` and the connection/repository status components.

### Cards / Containers

Cards use the card surface/foreground pair, large corners and the thin preset ring. Default spacing is 1rem and the small variant uses 0.75rem, shared by the header/content/footer. Use Cards for actual grouped content such as an Interactive Question; the main administration structure remains panes and forms. Dialogs use the popover pair with extra-large corners and compact padding. Sources: `src/components/ui/card.tsx`, `dialog.tsx` and `alert-dialog.tsx`.

### Navigation

The desktop rail uses accessible icon links with right-hand tooltips, neutral active fills and a bottom-anchored account menu. The phone bar gives each destination an icon and text; Admin opens the section menu and Account opens the user menu. Active state is explicit through `aria-current` as well as the selected surface or label weight. Theme selection lives in the account menu, with its own control on Login. Sources: `src/components/shell/app-shell.tsx`, `nav.ts` and `user-menu.tsx`.

### Record List and Detail

The recurring administration pattern is a count/create header, search/filter toolbar, two-line status rows and a separate detail header/form. Row hover uses a half-opacity muted fill; selection uses muted with foreground-derived secondary text. Overflow actions stay in the detail header. Pagination occupies a compact bordered footer. Reuse `src/components/records/record-list.tsx` and `record-detail.tsx` instead of recreating the pattern.

### Conversation and Interactive Questions

Client messages align to the end in neutral secondary bubbles; Agent 6 answers align to the start as unfilled prose. Metadata remains smaller than message text. The centered composer stays under the independently scrolling message region. Image previews open in a Dialog. Progress is expressed in plain words, and failures offer recovery in an Alert.

Interactive Questions use the small Card, bordered radio/checkbox choices and a minimum 2.5rem choice height. Single-choice activation submits on click or Enter/Space; arrow navigation selects without submitting. Multiple choice has an explicit Send answer action. “Something else” routes focus to the composer. Answered questions retain the selections as disabled/read-only controls with an Answered footer. Sources: `src/components/chat/conversation.tsx`, `composer.tsx` and `interactive-question.tsx`.

### Empty States and Tooltips

An empty region names what is missing, explains the next step and offers the relevant action. Tooltips use inverse foreground/background colors, medium corners and a small matching arrow; navigation names also remain available to assistive technology. Reuse `src/components/ui/empty.tsx` and `tooltip.tsx`.

## Do's and Don'ts

### Do:

- **Do** reuse the existing UI primitives and shared record list/detail components.
- **Do** preserve both themes, semantic tokens and browser-relative sizing.
- **Do** give icon controls accessible names, keyboard focus and explanatory tooltips where established.
- **Do** pair status icons with words and preserve error, loading, disabled and empty states.
- **Do** verify desktop and 375px phone layouts in both themes when changing UI.
- **Do** keep Client-facing progress and recovery copy plain and actionable.

### Don't:

- **Don't** change the frozen color, font or radius tokens as part of a screen extension.
- **Don't** introduce gradients, ornamental shadows or a separate administration identity.
- **Don't** use primary-colored running text in dark theme or destructive text on a destructive tint in light theme.
- **Don't** use muted text on a selected neutral row; use the established foreground-opacity treatment.
- **Don't** use the smallest preset buttons or keyboard-key component, or rely on the Badge primitive's smaller default text.
- **Don't** place destructive record actions next to Save; keep them in the record menu and confirmation flow.
- **Don't** treat the older screenshots' pixel dimensions as current measurements.
