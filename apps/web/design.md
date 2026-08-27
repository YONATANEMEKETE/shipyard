# Shipyard UI Design System

Status: Approved — finalized for implementation  
Theme: Harbor Amber  
Last updated: 2026-08-12

This document defines the visual foundation and starter component rules for Shipyard. The editable source of truth is [`shipyard.pen`](./shipyard.pen); the logo and social identity source is [`shipyard-logo-system.pen`](./shipyard-logo-system.pen).

> **Finalization note (2026-08-12):** This document was audited against the `shipyard.pen` canvas token layer (47 `$ds-*` variables). All light-mode values, type scale, spacing, radii, control sizes, and component states match the canvas exactly. This revision adds the approved dark-mode palette from the `Theme 01 — Harbor Amber / Dark Foundation` frame and the heading tracking values from the Type Scale frame.

## 1. Design direction

Shipyard is a focused project-management product. Its interface should feel operational, calm and dependable rather than decorative.

The system follows five principles:

1. **Clarity before decoration.** Hierarchy comes from typography, spacing and borders.
2. **Compact, not cramped.** Dense views remain readable and easy to scan.
3. **Warm precision.** Amber identifies the brand and important actions without overwhelming the workspace.
4. **Meaning beyond color.** Statuses also use labels, icons and structural changes.
5. **Reusable by default.** Product screens should use the documented tokens and components instead of one-off values.

## 2. Brand assets

The Precision Loop mark is the Shipyard symbol. The logo system file remains the source of truth for its geometry.

- Use the favicon/app mark in compact product locations such as the application header, browser icon and avatar-sized brand placements.
- Use the horizontal or stacked lockup only when the wordmark is necessary.
- Do not redraw, rotate, stretch or change the proportions of the mark.
- Use the Harbor Amber brand color on light surfaces and the white mark inside an amber container for the favicon/app icon.

## 3. Color system

### Foundation colors

| Token               |     Value | Purpose                                        |
| ------------------- | --------: | ---------------------------------------------- |
| `ds-bg`             | `#F4F3EF` | Application canvas and page background         |
| `ds-surface`        | `#FFFFFF` | Primary cards, panels and controls             |
| `ds-surface-subtle` | `#FBFAF7` | Table headers and quiet nested surfaces        |
| `ds-sidebar`        | `#EEEDE8` | Default light-mode sidebar background          |
| `ds-sidebar-dark`   | `#161512` | Dark-mode navigation and high-contrast regions |
| `ds-text`           | `#171717` | Primary text and icons                         |
| `ds-text-muted`     | `#6C6861` | Secondary copy, metadata and placeholders      |
| `ds-border`         | `#DEDCD5` | Default borders and dividers                   |
| `ds-border-strong`  | `#B9B5AC` | Emphasized boundaries                          |

### Brand colors

| Token           |     Value | Purpose                                       |
| --------------- | --------: | --------------------------------------------- |
| `ds-brand`      | `#B45309` | Primary actions, active states and brand mark |
| `ds-accent`     | `#F59E0B` | Focus, highlights and dark-surface accents    |
| `ds-brand-soft` | `#FFF4DB` | Selected rows, tags and tinted brand surfaces |
| `ds-focus`      | `#F59E0B` | Keyboard focus ring                           |

`ds-brand` is the canonical implementation token. Any `brand-primary` variable copied with brand artwork is a compatibility alias and should not be used in product code.

### Semantic colors

| State   | Foreground               | Background                    | Example                     |
| ------- | ------------------------ | ----------------------------- | --------------------------- |
| Success | `ds-success` — `#2E7D5B` | `ds-success-soft` — `#EAF5EF` | On track, saved             |
| Warning | `ds-warning` — `#A65F00` | `ds-warning-soft` — `#FFF1D6` | At risk, capacity warning   |
| Danger  | `ds-danger` — `#B42318`  | `ds-danger-soft` — `#FDECEA`  | Blocked, destructive action |
| Info    | `ds-info` — `#2563EB`    | `ds-info-soft` — `#EAF2FF`    | Planned, informational      |

Neutral states use `ds-text-muted` on a quiet neutral surface such as `#F0EFEB`.

### Dark mode palette

Approved direction from the `Theme 01 — Harbor Amber / Dark Foundation` canvas frame — _"Warm without glare: brown-black surfaces preserve the amber character."_ Only `ds-sidebar-dark` is currently tokenized in `shipyard.pen`; the remaining values are the approved canvas samples and should be tokenized as `ds-*` variables when dark-mode implementation begins.

| Token (proposed)      |     Value | Purpose                                                        |
| --------------------- | --------: | -------------------------------------------------------------- |
| `ds-sidebar-dark`     | `#161512` | Dark-mode sidebar and high-contrast regions (tokenized)        |
| `ds-surface-dark`     | `#1B1916` | Dark-mode card and panel surface                               |
| `ds-accent-soft-dark` | `#332513` | Dark-mode selection tint, active nav and amber-tinted surfaces |
| `ds-text-dark`        | `#F7F4ED` | Dark-mode primary text                                         |
| `ds-text-muted-dark`  | `#AAA39A` | Dark-mode secondary copy and metadata                          |

### Color usage

- Reserve solid `ds-brand` for the most important action or selected control in a section.
- Use `ds-brand-soft` for selection and emphasis without implying an action.
- Use semantic colors only for their documented meaning.
- Never communicate status with color alone.
- Normal text must reach at least a 4.5:1 contrast ratio.

## 4. Typography

### Font families

| Token          | Family     | Usage                                                    |
| -------------- | ---------- | -------------------------------------------------------- |
| `ds-font-ui`   | Inter      | Headings, body text, controls and navigation             |
| `ds-font-mono` | Geist Mono | Labels, IDs, statuses, metadata and compact numeric data |

Inter weights in use: 400 Regular, 500 Medium, 600 Semibold, 700 Bold (650 is rendered as semibold in headings).

The Shipyard wordmark uses Geist as defined in the logo system; it is not a general interface font.

### Product type scale

| Style        |   Size |  Weight | Line height |  Tracking | Typical use                            |
| ------------ | -----: | ------: | ----------: | --------: | -------------------------------------- |
| Display      |   40px |     700 |        1.08 |    -0.8px | Product moments and major empty states |
| Heading 1    |   32px |     650 |        1.15 |    -0.8px | Page title                             |
| Heading 2    |   24px |     650 |        1.20 |    -0.8px | Major page section                     |
| Heading 3    |   20px |     600 |        1.25 |         0 | Card or panel heading                  |
| Body         |   14px |     400 |        1.50 |         0 | Default product copy                   |
| Small        |   12px |     400 |        1.50 |         0 | Supporting text and metadata           |
| System label | 9–11px | 600–700 |        1.35 | 0.7–1.5px | Uppercase labels and statuses          |

### Typography rules

- Use sentence case for product copy, navigation and controls.
- Use uppercase Geist Mono sparingly for system labels.
- Give uppercase mono labels generous letter spacing, generally `0.7–1.5px`.
- Apply `-0.8px` tracking to Display, Heading 1 and Heading 2 only.
- Prefer verbs and concrete nouns: “Create task,” “Assign owner,” “Move to sprint.”
- Keep headings short enough to scan without wrapping when possible.

## 5. Spacing

Shipyard uses a 4px base unit.

| Token         | Value | Common use                         |
| ------------- | ----: | ---------------------------------- |
| `ds-space-1`  |   4px | Micro alignment                    |
| `ds-space-2`  |   8px | Icon-to-label gaps, compact groups |
| `ds-space-3`  |  12px | Button groups and control spacing  |
| `ds-space-4`  |  16px | Form stacks and dense card padding |
| `ds-space-5`  |  20px | Medium internal spacing            |
| `ds-space-6`  |  24px | Sections, standard card padding    |
| `ds-space-8`  |  32px | Page padding and major sections    |
| `ds-space-10` |  40px | Large separation                   |
| `ds-space-12` |  48px | Large composition spacing          |
| `ds-space-16` |  64px | Major page separation only         |

Do not introduce arbitrary spacing values when an existing token can express the relationship.

## 6. Layout and density

- Use a 12-column product grid.
- Default column gutter: 24px.
- Default page inset: 32px.
- Sidebar width: 240–272px.
- Main content is fluid with a recommended maximum width of 1440px.
- Major page sections use 24–32px vertical spacing.
- Cards use 16px padding for dense data and 24px for narrative or form content.
- Form field groups use 16px vertical spacing.
- Button and toolbar groups use 8–12px gaps.
- Dense table rows use 44px; comfortable or summary rows may use 52px.

## 7. Shape

### Radius scale

| Token            | Value | Usage                                    |
| ---------------- | ----: | ---------------------------------------- |
| None             |   0px | Tables and edge-to-edge structures       |
| `ds-radius-sm`   |   4px | Small checks and compact details         |
| `ds-radius-md`   |   8px | Buttons, inputs and navigation items     |
| `ds-radius-lg`   |  12px | Cards and panels                         |
| `ds-radius-xl`   |  16px | Large panels and elevated containers     |
| `ds-radius-pill` | 999px | Statuses, filters and compact pills only |

Avoid making every container a pill or using large radii on dense data structures.

### Borders and focus

| Token                    |     Value | Usage                                              |
| ------------------------ | --------: | -------------------------------------------------- |
| `ds-border-thin`         |       1px | Default boundary and divider                       |
| `ds-border-strong-width` |       2px | Emphasized state or boundary                       |
| Focus ring               | 3px amber | Visible keyboard focus around interactive controls |

Borders provide the default surface hierarchy. Use shadows only when an element genuinely floats over another layer.

## 8. Elevation

| Level   | Treatment                          | Usage                                       |
| ------- | ---------------------------------- | ------------------------------------------- |
| Level 0 | No shadow                          | Canvas and embedded surfaces                |
| Level 1 | `0 1px 3px rgba(0,0,0,0.08)`       | Resting cards when a border is insufficient |
| Level 2 | `0 8px 24px -4px rgba(0,0,0,0.16)` | Popovers, dropdowns and floating layers     |

Do not stack borders, strong shadows and tinted fills unless the interaction requires all three.

## 9. Sizing and iconography

### Controls

| Token           | Height | Usage                                    |
| --------------- | -----: | ---------------------------------------- |
| `ds-control-sm` |   32px | Dense tables and secondary toolbars      |
| `ds-control-md` |   36px | Default product control                  |
| `ds-control-lg` |   44px | Primary forms and touch-friendly actions |

### Icons

Use Lucide outline icons throughout the product.

| Token        | Size | Usage                                   |
| ------------ | ---: | --------------------------------------- |
| `ds-icon-sm` | 14px | Metadata and compact statuses           |
| `ds-icon-md` | 18px | Buttons and standard controls           |
| `ds-icon-lg` | 24px | Navigation landmarks and larger actions |

- Use one icon style per screen.
- Pair unfamiliar icons with text.
- Keep icons optically centered rather than forcing identical visual weight.

## 10. Interaction states

### Primary button

| State    | Treatment                                       |
| -------- | ----------------------------------------------- |
| Default  | `ds-brand` background with white content        |
| Hover    | Darken to `#9A4807`                             |
| Pressed  | Darken to `#7C3A06`                             |
| Focus    | Default button plus visible 3px `ds-focus` ring |
| Disabled | `#E8E5DE` background and `#9B968D` content      |

### Inputs

| State    | Treatment                                                    |
| -------- | ------------------------------------------------------------ |
| Default  | White surface with `ds-border`                               |
| Focus    | 2px `ds-focus` border                                        |
| Error    | `ds-danger-soft` surface with `ds-danger` border and message |
| Disabled | `#F0EFEB` surface with muted content                         |

### Selection

- Active navigation: dark amber tint (`#332513` on dark surfaces) with amber text and icon.
- Selected row: `ds-brand-soft` plus a check or other explicit selection cue.
- Active filter: solid brand treatment when it represents an applied action.

## 11. Component library

The following starter components exist as reusable elements in `shipyard.pen`:

### Actions

- `Button / Primary` — one main action per section.
- `Button / Secondary` — supportive brand-tinted action.
- `Button / Outline` — tertiary action such as Export or Cancel.
- `Button / Ghost` — inline or low-priority action.
- `Button / Destructive` — irreversible or harmful action.
- `Button / Icon` — familiar actions with an accessible label.

### Forms

- `Input / Text`
- `Input / Search`
- `Input / Select`
- `Checkbox / Checked`
- `Toggle / On`
- `Progress / Default`

Inputs require a visible label unless an equivalent accessible label is provided by the implementation.

### Navigation

- Active and default sidebar navigation items
- `Tabs / Default`

Use one active item per navigation level. Tabs switch between peer views; they should not trigger unrelated actions.

### Feedback

- `Alert / Success`
- `Alert / Warning`
- `Alert / Danger`

Alerts must include an icon and direct message. Provide an action only when the user can resolve or inspect the condition.

### Data display

- `Card / Project Summary`
- `Table / Projects`

Cards should contain one primary idea. Tables must follow the structure `Table → Row → Cell → Content`, use 4–7 columns when possible and keep numeric data aligned consistently.

## 12. Accessibility guardrails

- Maintain at least 4.5:1 contrast for normal text.
- Never rely on color alone for status, selection or validation.
- Preserve visible keyboard focus on every interactive element.
- Use 44px targets where touch interaction is likely.
- Provide accessible names for icon-only controls.
- Keep heading levels sequential.
- Connect errors to the relevant field and explain how to fix them.
- Respect reduced-motion preferences when motion is introduced.

## 13. Content style

- Use plain, direct language.
- Lead actions with verbs.
- Prefer “Project name is required” over “Invalid input.”
- Keep status labels concise: “On track,” “At risk,” “Blocked,” “Planned.”
- Use consistent nouns across navigation, tables and forms.
- Avoid technical language unless the user is working in a technical context.

## 14. Implementation checklist

Before a screen is considered ready:

- It uses the documented `ds-*` tokens.
- It follows the typography hierarchy.
- Spacing values come from the 4px scale.
- There is one clearly dominant action per section.
- Hover, pressed, focus, disabled, loading, empty and error states are considered.
- Status is understandable without color.
- Text and controls meet contrast and target-size requirements.
- Reusable components are used before creating new variants.
- Layout works at the intended dashboard widths without clipping or overlap.

## 15. Token inventory

Canonical `$ds-*` variables defined in `shipyard.pen` (47 variables). Values marked with a note are canvas samples pending tokenization.

### Colors

| Token               | Value     | Token                     | Value     |
| ------------------- | --------- | ------------------------- | --------- |
| `ds-bg`             | `#F4F3EF` | `ds-success`              | `#2E7D5B` |
| `ds-surface`        | `#FFFFFF` | `ds-success-soft`         | `#EAF5EF` |
| `ds-surface-subtle` | `#FBFAF7` | `ds-warning`              | `#A65F00` |
| `ds-sidebar`        | `#EEEDE8` | `ds-warning-soft`         | `#FFF1D6` |
| `ds-sidebar-dark`   | `#161512` | `ds-danger`               | `#B42318` |
| `ds-text`           | `#171717` | `ds-danger-soft`          | `#FDECEA` |
| `ds-text-muted`     | `#6C6861` | `ds-info`                 | `#2563EB` |
| `ds-border`         | `#DEDCD5` | `ds-info-soft`            | `#EAF2FF` |
| `ds-border-strong`  | `#B9B5AC` | `ds-brand`                | `#B45309` |
| `ds-accent`         | `#F59E0B` | `ds-focus`                | `#F59E0B` |
| `ds-brand-soft`     | `#FFF4DB` | `brand-primary` _(alias)_ | `#B45309` |

### Dimensions and families

| Token                    | Value                  | Token             | Value            |
| ------------------------ | ---------------------- | ----------------- | ---------------- |
| `ds-font-ui`             | Inter                  | `ds-font-mono`    | Geist Mono       |
| `ds-space-1..6`          | 4, 8, 12, 16, 20, 24px | `ds-space-8..16`  | 32, 40, 48, 64px |
| `ds-radius-sm`           | 4px                    | `ds-radius-md`    | 8px              |
| `ds-radius-lg`           | 12px                   | `ds-radius-xl`    | 16px             |
| `ds-radius-pill`         | 999px                  | `ds-border-thin`  | 1px              |
| `ds-border-strong-width` | 2px                    | `ds-control-sm`   | 32px             |
| `ds-control-md`          | 36px                   | `ds-control-lg`   | 44px             |
| `ds-icon-sm`             | 14px                   | `ds-icon-md`      | 18px             |
| `ds-icon-lg`             | 24px                   | `ds-sidebar-dark` | `#161512`        |

## 16. Governance

Update the Pencil design system first when changing a shared visual decision. Once the canvas direction is approved, update this document in the same change.

New tokens or component variants must solve a recurring product need. Avoid adding a new value when an existing token or component can be reused.

**Implementation export:** the shadcn v4 / Tailwind v4 token export of this design system lives in [`03-UI/exports/globals.css`](./exports/globals.css) (with `components.json` and the token-mapping reference in the same folder). Re-export whenever the canvas token layer changes; never edit the export values directly.
