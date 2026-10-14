# Accessibility

What the kit does for keyboard, screen-reader and low-vision users, what it leaves as Figma has it on purpose, and what the automated checks cover. This page covers kit 0.4.0: the 20 components in [components.md](components.md) and the window chrome in [window-chrome.md](window-chrome.md). Phase 2 added the [notes per component](#components), the resize handle's [hint and announcement](#the-resize-hint-and-the-announcement) and a [forced-colours block](#forced-colours-windows-high-contrast); Phase 3 added the [dialog](#dialog)'s focus handling, the [toast](#toast)'s live region and tone icons, Escape for [tooltips](#tooltip), and contrast rows for every Phase 2 and 3 part ([Measured ratios](#measured-ratios)). Since 2026-10-14 the ratios come from the palette Figma injected into a running plugin (Figma desktop 126.9.13). Nothing here has been tried with a screen reader yet, and of what this page describes, only the starter's look and its resize keys have been checked inside the Figma app; [Known gaps](#known-gaps) lists what is still open.

## The contrast decision

The kit paints every colour with Figma's own `--figma-color-*` tokens ([tokens.md](tokens.md)) and never overrides them, so a plugin looks like Figma's panels in every theme and follows Figma when its palette changes. The cost: some of Figma's own pairings are below WCAG AA for 11px text. Secondary text on the panel is 4.00:1 in the light theme (3.98:1 in FigJam), and white on the blue brand fill is 2.99:1. Figma's own UI uses these pairings.

So the kit keeps native fidelity, and contrast is **reported, not enforced**:

- The automated axe runs check every WCAG 2.0 and 2.1 level A and AA rule **except `color-contrast`** ([below](#what-the-automated-checks-cover)).
- In its place, a contrast report computes the ratio of each token pair the kit paints, for each theme, from [`tokens.figma-fallback.css`](../tokens.figma-fallback.css), which holds the palette captured in Figma. It runs as the `contrast report` test in [`e2e/a11y.spec.mjs`](../e2e/a11y.spec.mjs) (`npm run test:e2e` prints the table and attaches it to the Playwright report). It fails only if the table can't be produced, never on a low ratio.

### Measured ratios

Computed by the `contrast report` test, in the run on 2026-10-14 at kit 0.4.0 (`npx playwright test e2e/a11y.spec.mjs --grep contrast`), from `tokens.figma-fallback.css` as captured with `tools/probe` the same day in Figma desktop 126.9.13: Design light and dark from a Design file, FigJam from a FigJam board ([tokens.md](tokens.md#browser-preview-fallback)). Until that capture the file held Figma's docs table, and this table was computed from it; the rows that moved are noted under the table. 11px text counts as normal text, so AA needs 4.5:1 for text and 3:1 for icons, focus rings and other non-text parts (WCAG 1.4.3 and 1.4.11). "(below)" marks a pair under its minimum.

| Pair | Tokens | Light | Dark | FigJam | WCAG AA | Used by |
|---|---|---|---|---|---|---|
| Body text | `text` on `bg` | 17.40:1 | 13.97:1 | 17.49:1 | 4.5:1 | body, .kit-heading, input values |
| Label and help text | `text-secondary` on `bg` | 4.00:1 (below) | 7.62:1 | 3.98:1 (below) | 4.5:1 | .kit-label, .kit-help |
| Input text | `text` on `bg-secondary` | 16.13:1 | 11.73:1 | 16.21:1 | 4.5:1 | .kit-input |
| Placeholder | `text-tertiary` on `bg-secondary` | 2.11:1 (below) | 3.29:1 (below) | 2.09:1 (below) | 4.5:1 | .kit-input::placeholder |
| Error help text | `text-danger` on `bg` | 4.62:1 | 7.20:1 | 4.62:1 | 4.5:1 | .kit-field:has([aria-invalid]) .kit-help |
| Primary button label | `text-onbrand` on `bg-brand` | 2.99:1 (below) | 3.53:1 (below) | 4.51:1 | 4.5:1 | .kit-button-primary |
| Primary button, hover | `text-onbrand` on `bg-brand-hover` | 4.23:1 (below) | 5.28:1 | 5.66:1 | 4.5:1 | .kit-button-primary:hover |
| Danger button label | `text-ondanger` on `bg-danger` | 3.67:1 (below) | 4.31:1 (below) | 3.67:1 (below) | 4.5:1 | .kit-button-danger |
| Selected toggle label | `text-brand` on `bg-selected` | 3.77:1 (below) | 5.18:1 | 4.69:1 | 4.5:1 | .kit-button[aria-pressed="true"] |
| Resize grip | `icon-secondary` on `bg` | 4.00:1 | 7.62:1 | 3.98:1 | 3:1 | .kit-resize-handle (non-text, 1.4.11) |
| Resize grip, hover / drag | `icon` on `bg` | 17.40:1 | 13.97:1 | 17.49:1 | 3:1 | .kit-resize-handle:hover |
| Select caret, input icon | `icon-secondary` on `bg` | 4.00:1 | 7.62:1 | 3.98:1 | 3:1 | .kit-select::after, .kit-input-icon |
| Focus ring | `border-selected` on `bg` | 2.99:1 (below) | 3.95:1 | 4.51:1 | 3:1 | :focus-visible outlines (non-text) |
| Error ring | `border-danger-strong` on `bg` | 4.62:1 | 7.20:1 | 4.62:1 | 3:1 | [aria-invalid="true"] outline |
| Tab, hover | `text-secondary-hover` on `bg` | 17.40:1 | 13.97:1 | 17.49:1 | 4.5:1 | .kit-tab:hover |
| Number prefix | `text-secondary` on `bg-secondary` | 3.94:1 (below) | 6.65:1 | 3.91:1 (below) | 4.5:1 | .kit-number-prefix |
| Checkbox and radio border | `border-strong` on `bg` | 13.97:1 | 11.55:1 | 13.97:1 | 3:1 | :is(.kit-checkbox, .kit-radio) > input (non-text, 1.4.11) |
| Checked box against the panel | `bg-brand` on `bg` | 2.99:1 (below) | 3.95:1 | 4.51:1 | 3:1 | :is(.kit-checkbox, .kit-radio) > input:checked (non-text) |
| Tick and radio dot | `icon-onbrand` on `bg-brand` | 2.99:1 (below) | 3.53:1 | 4.51:1 | 3:1 | :is(.kit-checkbox, .kit-radio) > input:checked mark (non-text) |
| Selected icon button | `icon-brand` on `bg-selected` | 3.77:1 | 5.18:1 | 4.69:1 | 3:1 | .kit-icon-button[aria-pressed="true"], [aria-expanded="true"] |
| Selected list row | `text-onselected` on `bg-selected` | 15.73:1 | 8.27:1 | 14.80:1 | 4.5:1 | .kit-list-row[aria-selected="true"], [aria-current="true"] |
| Selected list row, meta | `text-onselected-secondary` on `bg-selected` | 3.91:1 (below) | 5.74:1 | 3.83:1 (below) | 4.5:1 | .kit-list-row-meta in a selected row |
| Selected list row, icon | `icon-onselected` on `bg-selected` | 15.73:1 | 9.79:1 | 14.80:1 | 3:1 | .kit-list-row-icon in a selected row |
| Notice text, info | `text` on `bg-brand-tertiary` | 15.73:1 | 9.79:1 | 14.80:1 | 4.5:1 | .kit-notice[data-kit-tone="info"] |
| Notice text, success | `text` on `bg-success-tertiary` | 15.55:1 | 9.94:1 | 15.19:1 | 4.5:1 | .kit-notice[data-kit-tone="success"] |
| Notice text, warning | `text` on `bg-warning-tertiary` | 15.65:1 | 9.50:1 | 15.72:1 | 4.5:1 | .kit-notice[data-kit-tone="warning"] |
| Notice text, danger | `text` on `bg-danger-tertiary` | 14.59:1 | 10.48:1 | 14.66:1 | 4.5:1 | .kit-notice[data-kit-tone="danger"] |
| Notice icon, info | `icon-brand` on `bg-brand-tertiary` | 3.77:1 | 5.18:1 | 4.69:1 | 3:1 | .kit-notice[data-kit-tone="info"] > .kit-icon |
| Notice icon, success | `icon-success` on `bg-success-tertiary` | 3.26:1 | 5.69:1 | 2.47:1 (below) | 3:1 | .kit-notice[data-kit-tone="success"] > .kit-icon |
| Notice icon, warning | `icon-warning` on `bg-warning-tertiary` | 3.89:1 | 6.44:1 | 1.33:1 (below) | 3:1 | .kit-notice[data-kit-tone="warning"] > .kit-icon |
| Notice icon, danger | `icon-danger` on `bg-danger-tertiary` | 3.79:1 | 5.40:1 | 3.01:1 | 3:1 | .kit-notice[data-kit-tone="danger"] > .kit-icon |
| Tooltip and toast text | `text-oninverse` on `bg-inverse` | 11.55:1 | 17.40:1 | 11.60:1 | 4.5:1 | .kit-tooltip, .kit-toast and its buttons |
| Toast icon (no tone, info, warning) | `icon-oninverse` on `bg-inverse` | 11.55:1 | 17.40:1 | 11.60:1 | 3:1 | .kit-toast > .kit-icon |
| Toast icon, success | `bg-success` on `bg-inverse` | 4.81:1 | 4.13:1 | 4.81:1 | 3:1 | .kit-toast[data-kit-tone="success"] > .kit-icon |
| Toast icon, danger | `bg-danger` on `bg-inverse` | 3.81:1 | 4.31:1 | 3.81:1 | 3:1 | .kit-toast[data-kit-tone="danger"] > .kit-icon |
| Disabled text | `text-disabled` on `bg` | 2.12:1 | 3.56:1 | 2.11:1 | not required | :disabled (exempt: inactive control) |
| Disabled filled button | `text-ondisabled` on `bg-disabled` | 1.41:1 | 3.03:1 | 1.41:1 | not required | primary/danger :disabled (exempt) |
| Secondary button ring | `border` on `bg` | 1.25:1 | 1.43:1 | 1.25:1 | not required | .kit-button ring (decorative: the label identifies it) |
| Input fill against the panel | `bg-secondary` on `bg` | 1.09:1 | 1.19:1 | 1.09:1 | not required | .kit-input fill (decorative) |

How to read it:

- **These are Figma's injected values, from one capture.** Figma changes its palette without notice, so re-run the report after each monthly recapture ([tokens.md](tokens.md#browser-preview-fallback)). The FigJam column did not move: FigJam's injected palette matched the docs table exactly. Slides, Dev Mode and Buzz bring their own brand colours and are not in the table ([below](#other-editors-brand-colours)).
- **What the capture changed** (Design only): light text tokens are hex with alpha (`#000000e5`, `#00000080`) instead of 0.9 and 0.5, which moves body text to 17.40:1 and the label pair to 4.00:1; dark `bg-selected` is darker (`#394360`), so the selected toggle label (5.18:1) and a selected row's meta text (5.74:1) now pass in dark; dark `bg-warning-tertiary` is a dim brown (`#5c4100`), not the docs' strong orange, so the dark warning notice's text is 9.50:1 instead of 3.25:1; the success, warning and danger icons are darker in light and lighter in dark, which lifts the notice icons above 3:1 in Design and dropped `icon-success` and `icon-danger` below it on the toast in dark, so the toast now paints those two with the solid fills ([below](#toast-icons-on-the-inverse-surface)).
- Translucent tokens (for example light `text-secondary`, black at 50%, `#00000080`) are composited over the panel colour before the ratio is taken, with unrounded channels. Browser tools that round the composite first can differ by about 0.05 (on the docs-table palette axe reported 3.94:1 for the label pair, where this report had 3.98:1).
- The resize grip meets 3:1 in every theme (4.00:1 light, 7.62:1 dark, 3.98:1 FigJam). The roadmap asked for exactly that: the old grip was about 1.4:1.
- The focus ring is 2.99:1 against the light panel, a hair under 3:1. It is Figma's own focus colour (`border-selected`, the brand blue `#0d99ff`), the same in the capture as in the docs.
- **Phase 2 parts under their minimum** are Figma's own pairings too: the number prefix (3.94:1 light, 3.91:1 FigJam), the meta text of a selected list row (3.91:1 light, 3.83:1 FigJam; 5.74:1 in dark), and a checked checkbox or radio against the light panel and its tick on the fill (2.99:1, the brand blue again). The unchecked box's border is far above 3:1 in every theme.
- **Notice icons now meet 3:1 in Design** (light: success 3.26:1, warning 3.89:1, danger 3.79:1; dark from 5.18:1 up) **but not in FigJam** (success 2.47:1, warning 1.33:1). A notice's words carry its meaning and the icon repeats it, so write the message so that it reads without the icon.
- **The toast's success and danger icons use `bg-success` and `bg-danger`** (at least 3.81:1 in every captured palette). The `icon-success` and `icon-danger` the kit first picked on the docs-table palette measure 1.75:1 and 1.94:1 on the white toast with Figma's dark values ([below](#toast-icons-on-the-inverse-surface)).

### Other editors' brand colours

Slides, Dev Mode and Buzz inject the Design palette with their own brand and selection colours (34 tokens; [tokens.md](tokens.md#browser-preview-fallback)). The fallback file doesn't carry them, so the report doesn't either. Computed for this page with the report's method from the same capture, **in Figma's dark theme only** (the light-theme values of these editors were not captured), the rows that change:

| Pair | Tokens | Design dark | Slides | Dev Mode | Buzz | WCAG AA |
|---|---|---|---|---|---|---|
| Primary button label | `text-onbrand` on `bg-brand` | 3.53:1 (below) | 3.46:1 (below) | 4.13:1 (below) | 3.78:1 (below) | 4.5:1 |
| Primary button, hover | `text-onbrand` on `bg-brand-hover` | 5.28:1 | 4.29:1 (below) | 4.83:1 | 4.86:1 | 4.5:1 |
| Focus ring, checked box | `border-selected`, `bg-brand` on `bg` | 3.95:1 | 4.04:1 | 3.38:1 | 3.69:1 | 3:1 |
| Selected toggle label | `text-brand` on `bg-selected` | 5.18:1 | 3.39:1 (below) | 3.03:1 (below) | 3.94:1 (below) | 4.5:1 |
| Selected list row, meta | `text-onselected-secondary` on `bg-selected` | 5.74:1 | 4.17:1 (below) | 3.50:1 (below) | 4.63:1 | 4.5:1 |

The selected icon button (`icon-brand` on `bg-selected`, 3:1 needed) is the toggle label's ratio, so it passes in all four. Run the starter in each editor before relying on these.

### Parts that share a row

Many parts paint a pair that already has a row, so that row's ratios apply to them:

| Part | Tokens | Same pair as the row |
|---|---|---|
| Highlighted menu item (hover or keyboard focus) | `text-onbrand` on `bg-brand` | Primary button label (2.99:1 light, below) |
| Tab label, empty-state text, list row meta text | `text-secondary` on `bg` | Label and help text (4.00:1 light, 3.98:1 FigJam, below) |
| Selected tab | `text` on `bg-secondary` | Input text |
| Section header title, empty-state title, list row label, dialog title and text | `text` on `bg` | Body text |
| List row icon | `icon-secondary` on `bg` | Select caret, input icon |
| Icon button icon, the dialog's close X among them | `icon` on `bg` | Resize grip, hover / drag |
| Focus ring of checkboxes, radios, tabs, list rows, the colour swatch, `.kit-scroll` and the fields and buttons in a dialog | `border-selected` on `bg` | Focus ring (2.99:1 light, below) |
| Invalid checkbox or radio box | `border-danger-strong` on `bg` | Error ring |
| A toast's action and close button labels | `text-oninverse` on `bg-inverse` | Tooltip and toast text |

Two toast pairs have no row yet; computed for this page with the report's method from the same palette: the focus ring of a toast's buttons, `border-selected` on `bg-inverse`, is 4.67:1 light, 3.53:1 dark and 3.10:1 in FigJam (3:1 needed), and a hovered action's label on its mixed fill (`text-oninverse` at 16% over `bg-inverse`) is 7.50:1 light, 12.96:1 dark and 7.52:1 in FigJam. The dialog's scrim and the line under its header (`border` on `bg`) are decorative.

### Toast icons on the inverse surface

A toast is `bg-inverse` (dark in the light theme, white in the dark theme), so the tone tokens drawn for the panel don't all work on it. On the captured palette, `icon-brand` on `bg-inverse` is 3.30:1 light but 1.89:1 dark (2.47:1 in FigJam), and `icon-warning` is 3.18:1 light but 1.47:1 dark (9.32:1 in FigJam): each fails 3:1 in at least one theme. The kit paints neither on a toast. Instead:

| Tone | Icon token | Light | Dark | FigJam |
|---|---|---|---|---|
| `info`, `warning` | `icon-oninverse` | 11.55:1 | 17.40:1 | 11.60:1 |
| `success` | `bg-success` | 4.81:1 | 4.13:1 | 4.81:1 |
| `danger` | `bg-danger` | 3.81:1 | 4.31:1 | 3.81:1 |

The three right-hand columns are the report's "Toast icon" rows. The rejected `icon-brand` and `icon-warning` pairs are not in the report, because the kit doesn't paint them; their numbers were computed for this page with the report's method from the same palette. Info and warning share a colour, so their icons also differ in shape (an "i" in a circle, a "!" in a triangle), as do success (a tick in a circle) and danger (a "!" in a circle). A toast without a tone (or with a tone the kit doesn't know) has no icon.

**Why the solid fills.** The kit first picked `icon-success` and `icon-danger` on the docs-table palette, where they kept at least 3.8:1 in both themes. Figma's injected dark values are light tints (`icon-success` `#7cd797`, `icon-danger` `#fca397`), made for the dark panel, so on the white toast they fell to 1.75:1 and 1.94:1 (in light 3.77:1 and 3.02:1). No `icon-*` or `text-*` success or danger token keeps 3:1 on `bg-inverse` in all three captured palettes; the solid fills do, so since the 2026-10-14 capture, still within 0.4.0, the toast paints its success and danger icons with `bg-success` and `bg-danger` (the table above). These ratios are computed from the captured palette; a toast has not been looked at in Figma yet ([release-checklist.md](release-checklist.md#components-in-the-figma-app)).

### Guidance when contrast matters

- **Long or important help text:** use `--figma-color-text` instead of the secondary colour, in your own CSS after the kit blocks. For example, a warning that must be read: `.my-important-help { color: var(--figma-color-text); }`. Keep `.kit-help` for short hints, as Figma does.
- **Don't put information in placeholders.** Placeholder text is far below AA in every theme (and disappears on typing). Use a visible label and help text.
- **Don't replace tokens with darker literals.** The colour rule forbids it (`npm run audit`, rule `color-literal`), and a hard-coded colour breaks in the other theme.
- **Figma's "enhanced contrast" setting.** Figma's app CSS has enhanced-contrast variants of every theme. Whether plugins receive those values is unverified; if they do, kit components pick them up automatically, because they only use tokens.

## Keyboard

Every kit control except the menu is a native element (`<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`), so Tab order, Enter and Space, arrow keys inside a radio group, typeahead in selects and screen-reader roles come from the browser. The menu is built on the browser's popover API, and the runtime adds its keys ([Menu](#menu)); the dialog is the browser's own modal `<dialog>`, which the runtime opens and focuses ([Dialog](#dialog)); a toast is made of native buttons ([Toast](#toast)). Keep it that way: no `div` buttons, and no custom dropdown for choosing a value (that is a select).

### The resize handle

The handle is a real `<button type="button">`, placed right after the content root (`</main>`) and before your own `<script>`, so it is the last focusable element and the last stop in the Tab order. Its accessible name is `CONFIG.strings.resizeLabel` ("Resize window"), which the runtime writes to its `aria-label` at startup. Keys act only while the handle has focus and the chrome is on (`html[data-kit-chrome="on"]`).

| Key | `fit-content` | `resizable` |
|---|---|---|
| Left / Right | Width -8 / +8 px | Same |
| Shift + Left / Right | Width -32 / +32 px | Same |
| Up / Down (and with Shift) | Nothing; the key is left to the page, so it scrolls | Height -8 / +8 px (Shift: -32 / +32) |
| Enter or Space | Next snap width (320, 480, 640, then back to 320) | Same, height kept |
| Home | Default width; the height follows the content | Default width, then the height is fitted to the content |
| End (kit 0.3.0) | Widest snap width that fits the bounds (640 by default) | Same, height kept |
| Escape, while dragging | Back to the size the drag started from | Same |

- Every key sends one final size, which `code.ts` saves at once ([window-chrome.md](window-chrome.md#what-is-saved-and-when)).
- Arrow keys with Ctrl, Alt or Cmd are ignored; holding Enter, Space, Home or End does not repeat.
- Outside a drag, Escape is left alone for the plugin. During a drag the runtime handles Escape and stops it, so a plugin's own Escape handler on `document`, an element or a bubbling `window` listener does not also fire; only a `window` listener registered with `{ capture: true }` still sees it ([window-chrome.md](window-chrome.md#gestures-and-keys)).
- Step sizes, snap widths and the three strings come from `CONFIG` and are overridden with a `data-kit-config` script, never by editing the runtime block ([window-chrome.md](window-chrome.md#customising-config)). A blank string is rejected, so the handle always keeps a name, a hint and an announcement.
- `e2e/chrome.spec.mjs` and `e2e/chrome-v2.spec.mjs` drive every row of this table through the real runtime and `installKitWindow`, in a small kit fixture page (`e2e/fixtures/`) whose kit blocks are byte copies of `ui.html`'s.

### The resize hint and the announcement

Kit 0.3.0 (Phase 2, chrome v2). Before, the window changed size silently for a screen-reader user. Now, at startup, if the page has a `[data-kit-resize]` handle, the runtime adds two visually hidden elements at the end of `<body>`, once ([window-chrome.md](window-chrome.md#screen-readers-the-hint-and-the-announcement) has the markup):

- **A hint.** `#kit-resize-hint` holds `CONFIG.strings.resizeHint` ("Drag, or use the arrow keys. Shift for bigger steps, Enter to snap, Home to fit, End for the widest size."). The runtime adds its id to the handle's `aria-describedby`, after any ids already there, so a screen reader reads the name, the role and then how to use it.
- **One live region.** A `[data-kit-announce]` element with `aria-live="polite"` says `CONFIG.strings.announce` ("Window {width} by {height}", with the size the window ends at) 150 ms after the last key. Ten quick presses, or a held key, give one announcement.
- **What is announced:** keyboard resizes only, including a key that hits the bounds (the size is said again, so the person knows it stayed). Drags and double-clicks are silent, because the pointer is the feedback, and a drag drops a pending announcement. Keys the handle doesn't use (Up and Down in `fit-content`, letters) are not announced.
- Both elements are 1 × 1 px and absolutely positioned, so they never change the fitted height. Without a handle neither is made. The id `kit-resize-hint` and the attribute `data-kit-announce` belong to the kit.
- Translate both strings with `data-kit-config`; the hint should name the keys in the person's language.
- `e2e/chrome-v2.spec.mjs` checks the wiring (the description, a single polite region outside the fit, the 150 ms wait, translated strings). How VoiceOver and NVDA actually read them is not checked yet ([release-checklist.md](release-checklist.md#screen-readers)).

## Components

Notes per component on what assistive technology gets and what you must add. The markup, states and do's and don'ts are in [components.md](components.md); the button, text input and select follow the [labels and states](#labels-descriptions-and-states) rules below.

### Checkbox and radio

- **Native inputs.** Each is an `<input type="checkbox">` or `<input type="radio">` inside its `<label>`, so the label text is the name, Space toggles, and the browser reports checked, unchecked and, for a checkbox whose `indeterminate` property is set, mixed. The kit only redraws the box (`appearance: none`); in forced colours it hands the drawing back to the system ([below](#forced-colours-windows-high-contrast)).
- **Radio groups.** Radios that share a `name` are one group: Tab enters it at the checked radio and leaves it, and the arrow keys move the choice. Give the group a name: `role="radiogroup"` with `aria-labelledby` pointing at a visible label (or `aria-label`), or a `<fieldset>` with a `<legend>`.
- Use `disabled` on a checkbox, never `aria-disabled`: an `aria-disabled` checkbox still toggles when clicked.
- Errors are `aria-invalid="true"` + `aria-describedby` on the input (on each radio of a group), with the message in the `.kit-help` it points at.

### Tabs

- **Screen readers announce a radio group, not tabs.** Each tab is a real radio inside a label, in a `.kit-tablist` with `role="radiogroup"` and a name. Tab reaches the checked tab; the arrow keys move between tabs and switch the panel, because that is what arrow keys do in a radio group. A screen reader says something like "PNG, radio button, 1 of 3" (the exact words depend on the screen reader).
- **Why not the WAI-ARIA tab pattern: there is no script.** The kit's tabs are CSS only: the browser keeps the checked radio, and one `:has()` rule per panel shows the matching panel. The tab pattern (`role="tablist"`, `role="tab"` with `aria-selected` and `aria-controls`, `role="tabpanel"`, a roving `tabindex` and arrow-key handling) needs script to keep those attributes true. Without that script, `role="tab"` would announce a selection that never updates and keys that don't behave as announced. The radio semantics come with the element, so what a screen reader announces is always what the control does.
- Hidden panels are `display: none`, so they also leave the accessibility tree; only the shown panel is read.
- Name the group (`aria-label` on the `.kit-tablist`), and give a panel its own heading when its content needs one.

### Tooltip

- **It is the control's description.** The tooltip is a `role="tooltip"` element, and the control's `aria-describedby` points at its `id`, so a screen reader reads it after the control's name and role, also while the tooltip is not shown (checked in Chromium 151: the description stays even while the tooltip is `hidden`). The audit's `missing-describedby` rule flags a tooltip that nothing points at.
- **It never names the control.** An icon button still needs its `aria-label`; the tooltip adds to it. Text that repeats the name is read twice.
- **Shown by CSS, dismissed by the runtime.** It appears 400 ms after the pointer rests on its host and at once when the control gets keyboard focus (`:focus-visible` inside the host), and it hides when both leave. It never takes focus, so it must not hold links or buttons.
- **WCAG 1.4.13 (content on hover or focus).** *Hoverable*: the pointer can move from the control onto the tooltip without losing it. *Persistent*: it stays until the pointer and focus leave. *Dismissible*: **met since kit 0.4.0.** Escape hides every tooltip shown by hover or keyboard focus at that moment, and it stays hidden until both the pointer and focus have left its host; the next hover or focus shows it again. The control keeps its focus and its description. While a tooltip is dismissed the runtime marks its host with `data-kit-tooltip-dismissed` and listens for `pointerleave` and `focusout` on that host only, then removes the attribute and both listeners. In 0.3.0 this was a known gap with a script workaround; a copy of that script in your own code can go when you upgrade.
- **The Escape is not taken.** The runtime only notes the key: your own Escape handlers still get it, not prevented, and Escape on a tooltip inside a modal dialog still closes the dialog. (An open menu is the exception it always was: its Escape closes the menu and stops there.) Hiding the tooltip runs in the menu's capture `keydown` listener on `document`, so it adds no listener at startup. `e2e/components.spec.mjs` checks the delay, the hoverable bridge, focus at once, the description, Escape for hover and for focus, the host's listeners before and after, and the dialog case.
- **On a disabled control**, use `aria-disabled="true"` (not `disabled`), so keyboard users can still focus it and hear why.

### Menu

- **Roles.** The trigger is a button with `popovertarget`, `aria-haspopup="menu"` and `aria-expanded`; the menu is `role="menu"` with a name (`aria-label`, or `aria-labelledby` pointing at its button); each item is a `<button role="menuitem">`; a separator is an `<hr>`, which is a separator to assistive technology on its own. The runtime keeps `aria-expanded` in step on every button that opens the menu.
- **Keys.** Enter or Space on the trigger opens it (the browser's `popovertarget`), and so does ArrowDown (the runtime). Opening focuses the first enabled item. ArrowDown and ArrowUp move between items and wrap; Home and End jump to the first and last. Disabled items are skipped, `aria-disabled` ones too. There is no typeahead: letter keys do nothing.
- **Focus return.** Escape closes the menu and puts focus back on its trigger (the one that opened it, when several buttons open the same menu, also in a browser whose toggle events don't report their `source`), and the runtime stops that Escape, so the plugin's own Escape handler doesn't fire while a menu is open. Clicking an item runs your `click` handler, then closes the menu with focus back on the trigger. Tab and Shift+Tab close it: focus goes back to the trigger and moves on from there. A click outside closes it, and focus goes where the click went.
- `e2e/menu.spec.mjs` covers the roles, keys, focus return, placement and listener counts (12 tests), and runs axe on the gallery's live menu closed and open.
- Use it for commands only. A value picked from a list is a select, whose popup and keyboard are the operating system's.

### Dialog

- **A native modal.** `kit.dialog()` and `data-kit-dialog-open` openers call the browser's `showModal()`, so the dialog role and its modal state come from the browser: everything outside the dialog is inert (screen readers can't reach it, clicks don't land, Tab never reaches it). Tab cycles through the dialog's controls; past the last one the browser can move focus out of the plugin's frame into Figma, as it does for any iframe, because `showModal()` makes only the plugin's own page inert. The dialog stays open, and Shift+Tab or a click brings focus back ([Known gaps](#known-gaps)). Never open a kit dialog with the `open` attribute or `show()`: that dialog is not modal, and none of this applies.
- **Its name is its title.** `aria-labelledby` points at the `<h2>` in its header. Nothing checks it: axe's dialog-name rule is a best-practice rule, which the runs leave out ([below](#what-the-automated-checks-cover)), so always write it.
- **First focus.** On opening, focus goes to the element with `autofocus` if there is one, else to the first element in `.kit-dialog-body` that takes focus (an enabled input, select, textarea or button, a link, or a `tabindex` of 0 or more; a hidden field is passed over), else to the first focusable element, the header's close button. A screen reader announces the dialog's name, then the focused field.
- **Escape** closes the dialog with the return value `''` (the runtime clears the value on every open, so a button's value from an earlier close never comes back). With a dialog opened from a dialog, Escape closes only the top one.
- **Focus returns** to the element that had it before the dialog opened, usually its opener; with nested dialogs, one step at a time. A dialog opened from a menu item (its `click` handler calling `kit.dialog()`, or `data-kit-dialog-open` on the item) gives focus back to the menu's button: the runtime closes the menu before the dialog opens.
- **The backdrop** ignores clicks unless the dialog has `data-kit-dialog-light-dismiss`. Keyboard users close it with Escape or its buttons either way.
- **The close X** is an icon button, so it needs an `aria-label` ("Close").
- Toasts shown while a dialog is open move into it, so they stay audible ([Toast](#toast)).
- `e2e/dialog.spec.mjs` checks first focus (a hidden field passed over), focus return (from a menu item too), Escape and its return value, Tab never reaching the page behind, nested dialogs and light dismiss, and runs axe with a dialog open and with a nested one.

### Toast

- **One polite live region.** The first `kit.toast()` adds a `div.kit-toast-region` with `aria-live="polite"` at the end of the page, and the toast goes into it 100 ms later, because a live region only announces changes made after it exists. Each toast is read once as it appears, when the screen reader is free (polite, like `role="status"`). Toasts that aren't `danger` have no role of their own.
- **`danger` is assertive.** A `danger` toast has `role="alert"` and is read at once. Keep it for failures.
- **Inside an open modal dialog.** Everything outside a modal dialog is inert and hidden from screen readers, so while one is open the runtime moves the region into it, and back to `<body>` when it closes. `e2e/toast.spec.mjs` checks the move and runs axe with a toast and a dialog open.
- **Focus never moves to a toast.** Its buttons (the action, and the close button named by `CONFIG.strings.dismiss`, "Dismiss") are reachable with Tab, as the last stops in the page or in the open dialog. While focus or the pointer is inside the toast, its timer waits. Escape with focus inside dismisses it, without reaching the plugin's own Escape handler and without closing a dialog the toast sits in.
- **Focus comes back (WCAG 2.4.3).** When a toast goes while focus is inside it (Enter on its close button or its action, Escape, or `dismiss()` from your code), focus returns to the element it came from, so the next Tab goes on from there instead of from the top of the page.
- **Time limits (WCAG 2.2.1).** A toast disappears after `duration` (4 s by default). A message-only toast is a status message (WCAG 4.1.3), but a toast with an action is a time limit on that action: give it `duration: 0`, so it stays until dismissed (the Undo example in [components.md](components.md#toast) does), or offer the same action somewhere that doesn't disappear.
- **The words carry the meaning.** The tone icon is `aria-hidden`; "Couldn't export 2 layers" says what the red icon only hints at. The icons also differ in shape ([Toast icons on the inverse surface](#toast-icons-on-the-inverse-surface)).
- **The message is text**, set with `textContent`, so markup in it is read and shown as written.
- `e2e/toast.spec.mjs` checks the polite region, `role="alert"` for danger and no role otherwise, hidden icons, the close button's name and its translation, the paused timer, Escape, focus coming back after each way of dismissing, and the move into a dialog (the top one when dialogs are nested).

### List rows

- **Clickable rows are `<button>`s** inside the `<li>`: one Tab stop each, activated with Enter or Space.
- **The current row is `aria-current="true"`**, which screen readers announce as the current item (the wording varies). `aria-selected` is valid only on `role="option"` rows inside a `role="listbox"`, which you script yourself (arrow keys and a roving `tabindex`; the kit has no listbox behaviour). `aria-selected` on a button is invalid, and axe flags it.
- Name the list (`aria-label` or `aria-labelledby`). Read-only results are static `<li>` rows; when they sit in a `.kit-scroll` region, give the region `tabindex="0"`, `role="region"` and an `aria-label`, so keyboard users can reach and scroll it.
- Disabled rows are `disabled` buttons.

### Inline notice and empty state

- **`role="status"` for neutral, info, success and warning notices; `role="alert"` for danger.** A status is read when the screen reader is free (polite); an alert interrupts (assertive), so keep it for real problems.
- **Live regions announce changes, not content that is there at load.** Insert the notice, or change its text, after the page has loaded. The same goes for every `role="status"` line: update it when something finishes ("Renamed 3 layers", "No matches"), never on each keystroke.
- The words carry the meaning; the tone's colour and icon are extra (in forced colours only the icon and words remain).
- A field's error never goes in a notice: it belongs in the field's `.kit-help` with `aria-invalid`.
- An empty state that replaces content after an action (a search with no results) is announced only if its text is in, or next to, a `role="status"` element.

### Icon button

- **`aria-label` is required**: the button has no visible text, and its SVG is `aria-hidden="true"`. Add a [tooltip](#tooltip) for sighted users, with text that adds to the name rather than repeating it.
- A toggle is `aria-pressed`; a menu trigger gets `aria-haspopup="menu"`, and the runtime sets its `aria-expanded`.
- It is 24 × 24 px, which is WCAG 2.2's minimum target size (2.5.8). The kit's axe runs check WCAG 2.0 and 2.1 only.

### Colour, number and textarea fields

- **Colour field:** the swatch (`<input type="color">`) needs its own `aria-label` ("Pick the fill colour"); the visible label names the hex field. Validate the hex field with `aria-invalid` and its `.kit-help`. Whether the system colour picker opens from a plugin window is UNVERIFIED; typing a code works either way.
- **Number field:** the prefix letter or icon is `aria-hidden="true"`, so the name comes from the label. Up and Down step by `step`. Validate in your script and show errors with `aria-invalid` + `.kit-help`.
- **Textarea:** a visible label, and the same `aria-invalid` + `.kit-help` pairing as an input.

### Section header and sticky footer

- **Section header:** a real heading element (`h1` to `h4`) at the right level, so screen-reader users can jump between sections.
- **Sticky footer:** Tab scrolls a focused field into view above the bar (`scroll-padding-bottom` on the page), so focus never ends up hidden under it. A status line in the footer follows the live-region rule above.

## Focus

- **Every control shows a 1px `--figma-color-border-selected` ring** when focused from the keyboard. The ring is an inset outline (`outline-offset: -1px`), not a border, so it never moves the label. Links and the colour swatch get the same ring 1px outside.
- **Focus wins over the state rings.** An invalid field swaps its red ring for the focus ring while it has focus (the red help text keeps the error visible), and an `aria-disabled` field, which stays focusable, shows the focus ring too. `e2e/preview.spec.mjs` tabs into both.
- **Filled parts ring in two tones:** a light 1px line on the fill (`border-onbrand-strong` or `border-ondanger-strong`) and a 1px outer line (`border-selected-strong` or `border-danger-strong`), so focus reads on the fill and on the panel. Primary and danger buttons do this, and so do checked checkboxes and radios.
- **Phase 2 parts:** a tab draws the ring on the whole tab (its radio is invisible), a list row and a `.kit-scroll` region draw it inset, and a focused menu item gets the highlight fill instead of a ring, the same look as hover.
- **Dialogs move focus in and back** ([Dialog](#dialog)): first focus inside on opening, back to the opener on closing. **Toasts never take focus**; their buttons are reached with Tab and show the same ring (4.67:1 light, 3.53:1 dark on the inverse surface).
- **The kit uses `:focus-visible`, never `:focus`.** Buttons and the handle show the ring for keyboard focus only. Text fields show it on any focus, because browsers treat a focused text field as focus-visible whether it was clicked or tabbed to.
- **Pressing the handle focuses it without the ring** (`focus({ focusVisible: false })`), so Escape reaches the plugin window during a mouse drag without drawing a keyboard ring. Browsers that don't support the option draw the ring.
- Never remove outlines (`outline: none`) in host CSS. If you build your own control, give it the same `:focus-visible` ring with the kit tokens.

## Labels, descriptions and states

- **Every field has a visible `<label class="kit-label" for="…">`.** Use `aria-label` only where the design has no room for a label, such as a search field with an icon, and never on an element that already has visible text: the `aria-label` would replace what sighted users read (the audit's `aria-label-override` rule).
- **Help text** is `<p class="kit-help" id="…">`, and the control points at it with `aria-describedby`. One help element per control, and only for a control (the audit's `orphan-help` rule warns about a `.kit-help` nothing points at; a status line is `.kit-text-secondary`).
- **Errors** are `aria-invalid="true"` on the control plus a message in the help text it already describes. Put the error in that same element (the starter's Count field swaps its help text for the error and back) instead of adding a second element, so the description screen readers announce is always the current one. Remove `aria-invalid` as soon as the value is fixed.
- **States are ARIA or HTML attributes**, never classes: `disabled` (or `aria-disabled="true"` when a control must stay focusable; ignore its clicks yourself), `aria-pressed` on toggle buttons, `aria-busy="true"` on a button while work runs, `checked` on checkboxes, radios and tabs, `aria-current="true"` on the current list row, `aria-expanded` on a menu trigger (set by the runtime). `aria-busy` blocks the mouse but not Enter or Space, so check it in the click handler ([components.md](components.md#button)).
- **Status messages** that change while the person works (results, counts) go in an element with `role="status"`, as the starter's status line does, so screen readers announce them without moving focus.
- **Structure:** real headings (`<h1 class="kit-heading">`, or the heading in a `kit-section-header`), real `<hr class="kit-divider">` dividers, `<main data-kit-root>` as the content root, `<html lang="en">` (or your language; the audit's `missing-lang` rule).
- **Icons** are decorative: `aria-hidden="true"` on the `<svg>`, with the meaning carried by the button's text or `aria-label`.

## Reduced motion

The kit has no animation apart from the spinner and the toast's entrance. Hover, pressed and focus colours change instantly, as in Figma; the window resizes without animation; menus and dialogs open and close without a transition; the tooltip appears without a fade (its 400 ms hover delay is a wait, not motion, and keyboard focus shows it at once). The loading spinner on `[aria-busy="true"]` buttons stops (a still ring) under `@media (prefers-reduced-motion: reduce)`. A toast slides up 8px and fades in over 200 ms only under `prefers-reduced-motion: no-preference`; with `reduce` it simply appears (`e2e/toast.spec.mjs` checks both). Wrap any animation you add in the same media query.

## Forced colours (Windows High Contrast)

In forced-colours mode the browser replaces every author colour with the user's system colours and removes shadows. Kit 0.3.0 adds an `@media (forced-colors: active)` block at the end of the components CSS. It names no colour, because the colour rule forbids system colour keywords such as `Highlight` too (the audit's `color-literal` rule flags them). It does five things:

- Checkboxes and radios go back to `appearance: auto` and drop the masked mark, so the system draws the box, the tick and the mixed state.
- A selected list row (`aria-current` or `aria-selected`) gets a solid outline in the system colour.
- The highlighted menu item (hover or keyboard focus, not a disabled one) gets the same outline, since its fill disappears.
- Kit 0.4.0: a dialog and a toast get a 1px solid outline, since their shadows disappear. No test asserts this one yet, and it was not part of the emulated run below.
- Kit 0.4.0: every icon (`.kit-icon`) takes the forced colour of what it sits in. An SVG keeps a colour the kit gives it, so before this the info and warning toast icons disappeared (white on a white toast in a light palette, black on black in a dark one), and list-row, field and empty-state icons were faint black on a black page. Now they are the toast's or the row's text colour, or the system's disabled colour inside a disabled button.

`e2e/components.spec.mjs` asserts the first three and the last (each toast tone's icon and the list, field and empty-state icons, in a light and a dark forced palette). The rest was measured in Chromium 151.0.7922.34 with Playwright's forced-colours emulation (`page.emulateMedia({ forcedColors: 'active' })`) on the preview gallery: the Phase 1 parts on 2026-10-13, the whole gallery again at kit 0.3.0 on 2026-10-14. **Chromium emulation only; nothing here has been checked on Windows.**

- **Works:** checkboxes and radios (checked and mixed are visible); selected list rows and the highlighted menu item (outlined); every button, icon button and notice keeps a visible outline, because the kit draws their rings as outlines that are transparent until forced colours make them visible; the focused tab gets an outline; disabled controls turn the system's disabled colour.
- **Filled buttons lose their fill.** Primary, danger and selected buttons get the same system background as secondary ones, so the main action is no longer emphasised.
- **Toggles lose their state.** A button or icon button with `aria-pressed="true"` looks the same as one without.
- **Focus rings stop standing out.** Every outline becomes the same system colour, and the outer focus line on filled buttons (a `box-shadow`) is removed. A focused button looks the same as an unfocused one, and a focused list row looks the same as the current one.
- **Tabs keep only the bold weight.** The selected tab's fill goes; its text stays bold.
- **Notices lose their tint.** The ring stays in every tone, so the tones differ only by their icon and words.
- **Tooltips and menus lose their edge.** Their background becomes the system background, their shadow is removed and neither has a border, so a tooltip reads as loose text under its control and an open menu has no visible edge against the page behind it.
- **A loading button shows its label through the spinner**, because the transparent label colour is replaced too.

Fixing the rest without colour keywords is possible for some of it (a thicker or double outline for `:focus-visible` and `aria-pressed="true"`, a 1px `solid` outline on `.kit-tooltip` and `.kit-menu`); matching Windows' own controls needs system colour keywords, which would mean an exception to the colour rule inside this one media block. Both are open ([Known gaps](#known-gaps)).

## What the automated checks cover

`npm run test:e2e` runs these in Chromium. The CI workflow's e2e job runs them on every push, but it has not run on GitHub yet. In the run on 2026-10-14 at the `v0.4.0` tag (Playwright 1.62.1, Chromium 151.0.7922.34) 165 tests passed and 10 were skipped (the docs screenshots and the listing images, made only on request); 31 of the 165 run axe. With the fixes from the Figma run the same day, 169 passed and 10 were skipped, of 179, still with 31 axe runs.

| Check | What it covers |
|---|---|
| axe-core, `@axe-core/playwright` 4.13 | Rule tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, with `color-contrast` disabled; every run expects zero violations. [`e2e/a11y.spec.mjs`](../e2e/a11y.spec.mjs): the preview gallery (every component in every state, Phase 2 included), the kit fixture's window (resting, and in its error state with `aria-invalid` and the help text live) and your own `ui.html`'s window, each in light, dark and FigJam, and the whole preview page once. [`e2e/examples.spec.mjs`](../e2e/examples.spec.mjs): every `examples/` plugin's window, empty and with the stub's sample selection, in light and dark, and in FigJam when its manifest lists `figjam` (`a11y-contrast`, `content-fill` and `export-selection` in three themes; `rename-layers` and `variables-sync` in two). [`e2e/demo.spec.mjs`](../e2e/demo.spec.mjs): the starter demo in its error state (Count = 0) in each theme, while the demo is there. [`e2e/menu.spec.mjs`](../e2e/menu.spec.mjs): the gallery's live menu, closed and open. [`e2e/dialog.spec.mjs`](../e2e/dialog.spec.mjs): the kit fixture with a dialog open and with a nested one on top, and the gallery's live dialog closed and open. [`e2e/toast.spec.mjs`](../e2e/toast.spec.mjs): a toast inside an open dialog. |
| Contrast report (`e2e/a11y.spec.mjs`) | The [table above](#measured-ratios), recomputed on every run. Never fails on a ratio. |
| Keyboard, pointer and screen-reader wiring | `e2e/chrome.spec.mjs`: every handle key, drag, Escape, right-click, plain click and double-click, through the real runtime and `installKitWindow`, with zero leaked listeners. `e2e/chrome-v2.spec.mjs`: the hint in `aria-describedby`, one polite live region outside the fit, the announcement 150 ms after the last key, translated strings, End, and `kit:fit`. `e2e/menu.spec.mjs`: roles, `aria-expanded` on every trigger, keys, focus return, placement and listener counts. `e2e/dialog.spec.mjs`: first focus, focus return (from a menu item too), Escape, Tab never reaching the page behind, nested dialogs, light dismiss, listener counts, and openers and close buttons without the popover API. `e2e/toast.spec.mjs`: the polite region, `role="alert"` for danger, the close button's name, Escape, the paused timer, focus back after a dismissal, the move into an open dialog, listener cleanup. |
| Component behaviour | `e2e/preview.spec.mjs`: all 27 gallery rows in their six states (the dialog and the toast among them), disabled drawn with the disabled tokens rather than opacity, and the focus ring on invalid and `aria-disabled` fields. `e2e/components.spec.mjs`: the forced-colours block, the tooltip (delay, hoverable, keyboard focus at once, accessible description, Escape for hover and for focus, Escape inside a dialog), the tabs (click and arrow keys, focus ring on the tab) and the menu's look in the top layer. |
| Static rules (`npm run audit`) | `aria-label-override`, `missing-lang`, `missing-describedby` (an `aria-invalid` control without `aria-describedby`, or a `role="tooltip"` that no control points at), `orphan-help` and `missing-disabled`, on the root and on every `examples/` folder ([pitfalls.md](pitfalls.md#audit-rules)). |

What is left out, and why:

- **`color-contrast`**, for the [decision above](#the-contrast-decision); the report replaces it.
- **axe's best-practice rules** (landmarks, `region`, heading order, a dialog's name and the like) are not WCAG requirements and are not run. The starter already uses `<main>` and real headings.
- **WCAG 2.2 rules** (target size and the like): the runs use the 2.0 and 2.1 tags only.
- **Things no automated check can see:** how a screen reader actually announces the plugin, real Figma (the window, its theme and whether the iframe matches the preview), forced colours on Windows, and zoom. These belong to the manual checks in [release-checklist.md](release-checklist.md#manual-surface-matrix). Of them, only real Figma has been looked at: on 2026-10-14 the starter ran in Figma desktop 126.9.13 in both themes and in FigJam, Slides and Buzz, its handle took Shift+Right, and its look was compared with Figma's own panel (the README's side by side). Screen readers, Windows forced colours and zoom are still to do.

## Known gaps

What Phase 1 listed here and kit 0.3.0 resolved: the keyboard resize announcement and the handle's hint ([above](#the-resize-hint-and-the-announcement)), End, the tooltip's keyboard access and `aria-describedby`, the audit rules `missing-describedby` and `aria-label-override`, and a first forced-colours block. What kit 0.4.0 resolved: Escape for tooltips (WCAG 1.4.13 dismissible, [above](#tooltip)), report rows for every Phase 2 part ([Measured ratios](#measured-ratios)), focus that fell to the top of the page when a focused toast went ([Toast](#toast)), dialog openers, close buttons and tooltip Escape in a browser without the popover API, and the report on a captured palette (Figma desktop 126.9.13, 2026-10-14: the focus ring is still 2.99:1 in light, the label pair 4.00:1), and the toast's success and danger icons, which that capture put below 3:1 in dark and which now use the solid fills ([Toast icons on the inverse surface](#toast-icons-on-the-inverse-surface); computed, not yet looked at in Figma). Still open:

- **Forced colours, the rest of it:** pressed toggles, focus that looks like rest, filled buttons without emphasis, tooltips and menus without an edge, the loading label. It needs a decision on whether system colour keywords may appear inside the forced-colours block ([above](#forced-colours-windows-high-contrast)), and a check on Windows itself.
- **Contrast below the minimum in Figma's own pairs**, measured on the captured palette: the notice icons on their tints in FigJam, the checked box on the light panel, the number prefix and a selected row's meta text in light and FigJam ([Measured ratios](#measured-ratios)), and the brand and selection pairs of Slides, Dev Mode and Buzz ([Other editors' brand colours](#other-editors-brand-colours)). Kept for fidelity, like the label pair. Two toast pairs, its focus ring and a hovered action, are computed on this page but not yet rows of the report ([Parts that share a row](#parts-that-share-a-row)).
- **The palette drifts.** The report is only as current as the last capture; recapture monthly and re-run it. Slides, Dev Mode and Buzz were captured in the dark theme only, and whether Figma's "enhanced contrast" setting changes the injected values is unverified.
- **Real assistive technology.** A VoiceOver and NVDA pass over the starter and the examples inside Figma: the handle's hint and announcement, the tabs heard as radios, tooltips as descriptions, the menu, the dialog (its name, first focus, focus return), toasts (polite and `danger` ones, also inside an open dialog), live regions. The table to fill is in [release-checklist.md](release-checklist.md#screen-readers).
- **Toasts with an action are timed** (WCAG 2.2.1) unless you pass `duration: 0`; the kit's default is 4 s for every toast ([Toast](#toast)).
- **Menus need the popover API.** Without it a menu cannot open, and the runtime adds no menu listeners. Since kit 0.4.0, dialog openers, close buttons and Escape on a tooltip work without it (`e2e/dialog.spec.mjs` runs them with `showPopover` removed). Chromium has had it since version 114, and the `tools/probe` runs on 2026-10-14 found it in Figma's plugin window (Figma desktop 126.9.13, Chrome 150) in Design, FigJam, Slides, Dev Mode and Buzz. Opening a kit menu inside Figma has not been tried yet ([release-checklist.md](release-checklist.md#manual-surface-matrix)).
- **Tab can leave a modal dialog for Figma's UI.** The plugin runs in an iframe, and `showModal()` makes only the plugin's page inert, not Figma's around it, so Tab past a dialog's last control (or Shift+Tab before its first) can move focus into Figma's UI; Escape then no longer reaches the dialog until focus comes back. The kit does not wrap Tab inside the dialog. Measured in the preview (Chromium 151); in Figma it is unchecked ([release-checklist.md](release-checklist.md#manual-surface-matrix)).
