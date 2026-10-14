# Accessibility

What the kit does for keyboard, screen-reader and low-vision users, what it leaves as Figma has it on purpose, and what the automated checks cover. This page covers kit 0.3.0: the 18 components in [components.md](components.md), the window chrome in [window-chrome.md](window-chrome.md), and what Phase 2 added: [notes per component](#components), the resize handle's [hint and announcement](#the-resize-hint-and-the-announcement), and a [forced-colours block](#forced-colours-windows-high-contrast). Nothing here has been tried with a screen reader or inside the Figma app yet; [Known gaps](#known-gaps) lists what is still open.

## The contrast decision

The kit paints every colour with Figma's own `--figma-color-*` tokens ([tokens.md](tokens.md)) and never overrides them, so a plugin looks like Figma's panels in every theme and follows Figma when its palette changes. The cost: some of Figma's own pairings are below WCAG AA for 11px text. Secondary text on the panel is about 3.9:1 in the light theme, and white on the blue brand fill is 2.99:1. Figma's own UI uses these pairings.

So the kit keeps native fidelity, and contrast is **reported, not enforced**:

- The automated axe runs check every WCAG 2.0 and 2.1 level A and AA rule **except `color-contrast`** ([below](#what-the-automated-checks-cover)).
- In its place, a contrast report computes the ratio of each token pair the kit paints, for each theme, from [`tokens.figma-fallback.css`](../tokens.figma-fallback.css). It runs as the `contrast report` test in [`e2e/a11y.spec.mjs`](../e2e/a11y.spec.mjs) (`npm run test:e2e` prints the table and attaches it to the Playwright report). It fails only if the table can't be produced, never on a low ratio.

### Measured ratios

Computed from the fallback palette by the `contrast report` test. The run on 2026-10-14 at kit 0.3.0 (`npx playwright test e2e/a11y.spec.mjs --grep contrast`) gave the same values as the first run on 2026-10-13: the palette has not changed. 11px text counts as normal text, so AA needs 4.5:1 for text and 3:1 for icons, focus rings and other non-text parts (WCAG 1.4.3 and 1.4.11). "(below)" marks a pair under its minimum.

| Pair | Tokens | Light | Dark | FigJam | WCAG AA | Used by |
|---|---|---|---|---|---|---|
| Body text | `text` on `bg` | 17.49:1 | 13.97:1 | 17.49:1 | 4.5:1 | body, .kit-heading, input values |
| Label and help text | `text-secondary` on `bg` | 3.98:1 (below) | 7.65:1 | 3.98:1 (below) | 4.5:1 | .kit-label, .kit-help |
| Input text | `text` on `bg-secondary` | 16.21:1 | 11.73:1 | 16.21:1 | 4.5:1 | .kit-input |
| Placeholder | `text-tertiary` on `bg-secondary` | 2.09:1 (below) | 3.29:1 (below) | 2.09:1 (below) | 4.5:1 | .kit-input::placeholder |
| Error help text | `text-danger` on `bg` | 4.62:1 | 7.20:1 | 4.62:1 | 4.5:1 | .kit-field:has([aria-invalid]) .kit-help |
| Primary button label | `text-onbrand` on `bg-brand` | 2.99:1 (below) | 3.53:1 (below) | 4.51:1 | 4.5:1 | .kit-button-primary |
| Primary button, hover | `text-onbrand` on `bg-brand-hover` | 4.23:1 (below) | 5.28:1 | 5.66:1 | 4.5:1 | .kit-button-primary:hover |
| Danger button label | `text-ondanger` on `bg-danger` | 3.67:1 (below) | 4.31:1 (below) | 3.67:1 (below) | 4.5:1 | .kit-button-danger |
| Selected toggle label | `text-brand` on `bg-selected` | 3.77:1 (below) | 3.76:1 (below) | 4.69:1 | 4.5:1 | .kit-button[aria-pressed="true"] |
| Resize grip | `icon-secondary` on `bg` | 3.98:1 | 7.65:1 | 3.98:1 | 3:1 | .kit-resize-handle (non-text, 1.4.11) |
| Resize grip, hover / drag | `icon` on `bg` | 17.49:1 | 13.97:1 | 17.49:1 | 3:1 | .kit-resize-handle:hover |
| Select caret, input icon | `icon-secondary` on `bg` | 3.98:1 | 7.65:1 | 3.98:1 | 3:1 | .kit-select::after, .kit-input-icon |
| Focus ring | `border-selected` on `bg` | 2.99:1 (below) | 3.95:1 | 4.51:1 | 3:1 | :focus-visible outlines (non-text) |
| Error ring | `border-danger-strong` on `bg` | 4.62:1 | 7.20:1 | 4.62:1 | 3:1 | [aria-invalid="true"] outline |
| Disabled text | `text-disabled` on `bg` | 2.11:1 | 3.56:1 | 2.11:1 | not required | :disabled (exempt: inactive control) |
| Disabled filled button | `text-ondisabled` on `bg-disabled` | 1.41:1 | 3.03:1 | 1.41:1 | not required | primary/danger :disabled (exempt) |
| Secondary button ring | `border` on `bg` | 1.25:1 | 1.43:1 | 1.25:1 | not required | .kit-button ring (decorative: the label identifies it) |
| Input fill against the panel | `bg-secondary` on `bg` | 1.09:1 | 1.19:1 | 1.09:1 | not required | .kit-input fill (decorative) |

How to read it:

- **These are the fallback's values, not a capture.** The fallback is Figma's documented table, and Figma's live app CSS already differs from it on 26 light and 45 dark tokens ([tokens.md](tokens.md#browser-preview-fallback)). The ratios inside Figma may be a little different; re-run the report after the palette is recaptured with `tools/probe`.
- Translucent tokens (for example light `text-secondary`, black at 50%) are composited over the panel colour before the ratio is taken, with unrounded channels. Browser tools that round the composite first can differ by about 0.05 (axe reported 3.94:1 for the label pair).
- The resize grip meets 3:1 in every theme. The roadmap asked for exactly that: the old grip was about 1.4:1.
- The focus ring is 2.99:1 against the light panel, a hair under 3:1. It is Figma's own focus colour (`border-selected`, the brand blue).

### Phase 2 components and the report

The report still lists only the 18 pairs above: the 2026-10-14 run at kit 0.3.0 has no row for a Phase 2 component. Many Phase 2 parts paint a pair that is already a row, so that row's ratios apply to them:

| Phase 2 part | Tokens | Same pair as the row |
|---|---|---|
| Highlighted menu item (hover or keyboard focus) | `text-onbrand` on `bg-brand` | Primary button label (2.99:1 light, below) |
| Tab label, empty-state text, list row meta text | `text-secondary` on `bg` | Label and help text (3.98:1 light, below) |
| Selected tab | `text` on `bg-secondary` | Input text |
| Section header title, empty-state title, list row label | `text` on `bg` | Body text |
| List row icon | `icon-secondary` on `bg` | Select caret, input icon |
| Icon button icon | `icon` on `bg` | Resize grip, hover / drag |
| Focus ring of checkboxes, radios, tabs, list rows, the colour swatch and `.kit-scroll` | `border-selected` on `bg` | Focus ring (2.99:1 light, below) |
| Invalid checkbox or radio box | `border-danger-strong` on `bg` | Error ring |

These Phase 2 pairs have no row and no measured ratio yet. They need rows in the report's `PAIRS` list before anyone quotes a number:

- Tooltip text: `text-oninverse` on `bg-inverse`.
- Selected list row: `text-onselected` on `bg-selected`, its meta `text-onselected-secondary` and its icon `icon-onselected`.
- Checkbox and radio: the unchecked box `border-strong` on `bg` (a non-text part, 3:1) and the mark `icon-onbrand` on `bg-brand`.
- Notice text on its tint: `text` on `bg-brand-tertiary`, `bg-success-tertiary`, `bg-warning-tertiary` and `bg-danger-tertiary`. The dark fallback's warning tint is a strong orange that live Figma does not use ([components.md](components.md#inline-notice)).
- Selected or open icon button: `icon-brand` on `bg-selected`.
- Number field prefix: `text-secondary` on `bg-secondary`.
- Tab hover: `text-secondary-hover` on `bg`.

### Guidance when contrast matters

- **Long or important help text:** use `--figma-color-text` instead of the secondary colour, in your own CSS after the kit blocks. For example, a warning that must be read: `.my-important-help { color: var(--figma-color-text); }`. Keep `.kit-help` for short hints, as Figma does.
- **Don't put information in placeholders.** Placeholder text is far below AA in every theme (and disappears on typing). Use a visible label and help text.
- **Don't replace tokens with darker literals.** The colour rule forbids it (`npm run audit`, rule `color-literal`), and a hard-coded colour breaks in the other theme.
- **Figma's "enhanced contrast" setting.** Figma's app CSS has enhanced-contrast variants of every theme. Whether plugins receive those values is unverified; if they do, kit components pick them up automatically, because they only use tokens.

## Keyboard

Every kit control except the menu is a native element (`<button>`, `<input>`, `<select>`, `<textarea>`), so Tab order, Enter and Space, arrow keys inside a radio group, typeahead in selects and screen-reader roles come from the browser. The menu is built on the browser's popover API, and the runtime adds its keys ([Menu](#menu)). Keep it that way: no `div` buttons, and no custom dropdown for choosing a value (that is a select).

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
- **CSS only.** It appears 400 ms after the pointer rests on its host and at once when the control gets keyboard focus (`:focus-visible` inside the host), and it hides when both leave. It never takes focus, so it must not hold links or buttons.
- **WCAG 1.4.13 (content on hover or focus).** *Hoverable*: the pointer can move from the control onto the tooltip without losing it. *Persistent*: it stays until the pointer and focus leave. *Dismissible*: **not met.** A CSS-only tooltip can't react to Escape, so it stays while focus (or the pointer) stays on the control. `e2e/components.spec.mjs` checks the delay, the hoverable bridge, focus at once and the description.
- **Workaround for dismissible.** Add this to your own `<script>` (not the runtime block). Escape hides the tooltip under the pointer or around the focused control until the pointer or focus leaves its host, through the kit's `[hidden]` rule; the description is kept. Tried in Chromium 151 against the 0.3.0 gallery: Escape hides the tooltip for focus and for hover, and it comes back on the next focus or hover. Not tried in Figma yet.

  ```js
  // Escape hides an open tooltip until the pointer or focus leaves its control (WCAG 1.4.13).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const host = document.querySelector('.kit-tooltip-host:is(:hover, :focus-within)');
    const tip = host && host.querySelector('.kit-tooltip');
    if (!(tip instanceof HTMLElement) || tip.hidden) return;
    tip.hidden = true;
    const done = new AbortController();
    const show = () => { tip.hidden = false; done.abort(); };
    host.addEventListener('focusout', show, { signal: done.signal });
    host.addEventListener('pointerleave', show, { signal: done.signal });
  });
  ```

  The Escape still reaches your other handlers. Without the workaround, keep tooltips short and placed below or beside their control (`kit-tooltip-start`, `-end`, `-above`), so they don't cover anything the person needs.
- **On a disabled control**, use `aria-disabled="true"` (not `disabled`), so keyboard users can still focus it and hear why.

### Menu

- **Roles.** The trigger is a button with `popovertarget`, `aria-haspopup="menu"` and `aria-expanded`; the menu is `role="menu"` with a name (`aria-label`, or `aria-labelledby` pointing at its button); each item is a `<button role="menuitem">`; a separator is an `<hr>`, which is a separator to assistive technology on its own. The runtime keeps `aria-expanded` in step on every button that opens the menu.
- **Keys.** Enter or Space on the trigger opens it (the browser's `popovertarget`), and so does ArrowDown (the runtime). Opening focuses the first enabled item. ArrowDown and ArrowUp move between items and wrap; Home and End jump to the first and last. Disabled items are skipped, `aria-disabled` ones too. There is no typeahead: letter keys do nothing.
- **Focus return.** Escape closes the menu and puts focus back on its trigger, and the runtime stops that Escape, so the plugin's own Escape handler doesn't fire while a menu is open. Clicking an item runs your `click` handler, then closes the menu with focus back on the trigger. Tab and Shift+Tab close it: focus goes back to the trigger and moves on from there. A click outside closes it, and focus goes where the click went.
- `e2e/menu.spec.mjs` covers the roles, keys, focus return, placement and listener counts (11 tests), and runs axe on the gallery's live menu closed and open.
- Use it for commands only. A value picked from a list is a select, whose popup and keyboard are the operating system's.

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

The kit has no animation apart from one spinner. Hover, pressed and focus colours change instantly, as in Figma; the window resizes without animation; menus open and close without a transition; the tooltip appears without a fade (its 400 ms hover delay is a wait, not motion, and keyboard focus shows it at once). The loading spinner on `[aria-busy="true"]` buttons stops (a still ring) under `@media (prefers-reduced-motion: reduce)`. Wrap any animation you add in the same media query.

## Forced colours (Windows High Contrast)

In forced-colours mode the browser replaces every author colour with the user's system colours and removes shadows. Kit 0.3.0 adds an `@media (forced-colors: active)` block at the end of the components CSS. It names no colour, because the colour rule forbids system colour keywords such as `Highlight` too (the audit's `color-literal` rule flags them). It does three things:

- Checkboxes and radios go back to `appearance: auto` and drop the masked mark, so the system draws the box, the tick and the mixed state.
- A selected list row (`aria-current` or `aria-selected`) gets a solid outline in the system colour.
- The highlighted menu item (hover or keyboard focus, not a disabled one) gets the same outline, since its fill disappears.

`e2e/components.spec.mjs` asserts these three. The rest was measured in Chromium 151.0.7922.34 with Playwright's forced-colours emulation (`page.emulateMedia({ forcedColors: 'active' })`) on the preview gallery: the Phase 1 parts on 2026-10-13, the whole gallery again at kit 0.3.0 on 2026-10-14. **Chromium emulation only; nothing here has been checked on Windows.**

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

`npm run test:e2e` runs these in Chromium. The CI workflow's e2e job runs them on every push, but it has not run on GitHub yet. In the run on 2026-10-14 at kit 0.3.0 (Playwright 1.62.1, Chromium 151.0.7922.34) 119 tests passed and 4 screenshot tests were skipped; 27 of the 119 are axe runs.

| Check | What it covers |
|---|---|
| axe-core, `@axe-core/playwright` 4.13 | Rule tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, with `color-contrast` disabled; every run expects zero violations. [`e2e/a11y.spec.mjs`](../e2e/a11y.spec.mjs): the preview gallery (every component in every state, Phase 2 included), the kit fixture's window (resting, and in its error state with `aria-invalid` and the help text live) and your own `ui.html`'s window, each in light, dark and FigJam, and the whole preview page once. [`e2e/examples.spec.mjs`](../e2e/examples.spec.mjs): every `examples/` plugin's window, empty and with the stub's sample selection, in light and dark, and in FigJam when its manifest lists `figjam` (`a11y-contrast`, `content-fill` and `export-selection` in three themes; `rename-layers` and `variables-sync` in two). [`e2e/demo.spec.mjs`](../e2e/demo.spec.mjs): the starter demo in its error state (Count = 0) in each theme, while the demo is there. [`e2e/menu.spec.mjs`](../e2e/menu.spec.mjs): the gallery's live menu, closed and open. |
| Contrast report (`e2e/a11y.spec.mjs`) | The [table above](#measured-ratios), recomputed on every run. Never fails on a ratio. |
| Keyboard, pointer and screen-reader wiring | `e2e/chrome.spec.mjs`: every handle key, drag, Escape, right-click, plain click and double-click, through the real runtime and `installKitWindow`, with zero leaked listeners. `e2e/chrome-v2.spec.mjs`: the hint in `aria-describedby`, one polite live region outside the fit, the announcement 150 ms after the last key, translated strings, End, and `kit:fit`. `e2e/menu.spec.mjs`: roles, `aria-expanded` on every trigger, keys, focus return, placement and listener counts. |
| Component behaviour | `e2e/preview.spec.mjs`: all 25 gallery rows in their six states, disabled drawn with the disabled tokens rather than opacity, and the focus ring on invalid and `aria-disabled` fields. `e2e/components.spec.mjs`: the forced-colours block, the tooltip (delay, hoverable, keyboard focus at once, accessible description), the tabs (click and arrow keys, focus ring on the tab) and the menu's look in the top layer. |
| Static rules (`npm run audit`) | `aria-label-override`, `missing-lang`, `missing-describedby` (an `aria-invalid` control without `aria-describedby`, or a `role="tooltip"` that no control points at), `orphan-help` and `missing-disabled`, on the root and on every `examples/` folder ([pitfalls.md](pitfalls.md#audit-rules)). |

What is left out, and why:

- **`color-contrast`**, for the [decision above](#the-contrast-decision); the report replaces it.
- **axe's best-practice rules** (landmarks, `region`, heading order and the like) are not WCAG requirements and are not run. The starter already uses `<main>` and real headings.
- **WCAG 2.2 rules** (target size and the like): the runs use the 2.0 and 2.1 tags only.
- **Things no automated check can see:** how a screen reader actually announces the plugin, real Figma (the window, its theme and whether the iframe matches the preview), forced colours on Windows, and zoom. These belong to the manual checks in [release-checklist.md](release-checklist.md#manual-surface-matrix); none of them has been run yet.

## Known gaps

What Phase 1 listed here and kit 0.3.0 resolved: the keyboard resize announcement and the handle's hint ([above](#the-resize-hint-and-the-announcement)), End, the tooltip's keyboard access and `aria-describedby`, the audit rules `missing-describedby` and `aria-label-override`, and a first forced-colours block. Still open:

- **Tooltips can't be dismissed with Escape** (WCAG 1.4.13). The kit's tooltip is CSS only; the [workaround](#tooltip) is a few lines of your own script.
- **Forced colours, the rest of it:** pressed toggles, focus that looks like rest, filled buttons without emphasis, tooltips and menus without an edge, the loading label. It needs a decision on whether system colour keywords may appear inside the forced-colours block ([above](#forced-colours-windows-high-contrast)), and a check on Windows itself.
- **Contrast of the Phase 2 pairs.** The report has no row yet for the tooltip, selected list rows, checkbox and radio boxes and marks, notice tints, selected icon buttons, the number prefix and tab hover ([list above](#phase-2-components-and-the-report)).
- **Contrast on a captured palette.** Recapture the palette from a running plugin with `tools/probe`, re-run the report, and check the focus ring (2.99:1 in light) and the label pair against the real values.
- **Real assistive technology.** A VoiceOver and NVDA pass over the starter and the examples inside Figma: the handle's hint and announcement, the tabs heard as radios, tooltips as descriptions, the menu, live regions. The table to fill is in [release-checklist.md](release-checklist.md#screen-readers).
