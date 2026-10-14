# Accessibility

What the kit does for keyboard, screen-reader and low-vision users, what it deliberately leaves as Figma has it, and what the automated checks cover. This is the Phase 1 version: it covers the four Phase 1 components ([components.md](components.md)) and the window chrome ([window-chrome.md](window-chrome.md)). Phase 2 extends it with the new components and the resize announcements listed under [Known gaps](#known-gaps-for-phase-2).

## The contrast decision

The kit paints every colour with Figma's own `--figma-color-*` tokens ([tokens.md](tokens.md)) and never overrides them, so a plugin looks like Figma's panels in every theme and follows Figma when its palette changes. The cost: some of Figma's own pairings are below WCAG AA for 11px text. Secondary text on the panel is about 3.9:1 in the light theme, and white on the blue brand fill is 2.99:1. Figma's own UI uses these pairings.

So the kit keeps native fidelity, and contrast is **reported, not enforced**:

- The automated axe runs check every WCAG 2.0 and 2.1 level A and AA rule **except `color-contrast`** ([below](#what-the-automated-checks-cover)).
- In its place, a contrast report computes the ratio of each token pair the kit actually paints, for each theme, from [`tokens.figma-fallback.css`](../tokens.figma-fallback.css). It runs as the `contrast report` test in [`e2e/a11y.spec.mjs`](../e2e/a11y.spec.mjs) (`npm run test:e2e` prints the table and attaches it to the Playwright report). It fails only if the table can't be produced, never on a low ratio.

### Measured ratios

Computed 2026-10-13 from the fallback palette. 11px text counts as normal text, so AA needs 4.5:1 for text and 3:1 for icons, focus rings and other non-text parts (WCAG 1.4.3 and 1.4.11). "(below)" marks a pair under its minimum.

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

### Guidance when contrast matters

- **Long or important help text:** use `--figma-color-text` instead of the secondary colour, in your own CSS after the kit blocks. For example, a warning that must be read: `.my-important-help { color: var(--figma-color-text); }`. Keep `.kit-help` for short hints, as Figma does.
- **Don't put information in placeholders.** Placeholder text is far below AA in every theme (and disappears on typing). Use a visible label and help text.
- **Don't replace tokens with darker literals.** The colour rule forbids it (`npm run audit`, rule `color-literal`), and a hard-coded colour breaks in the other theme.
- **Figma's "enhanced contrast" setting.** Figma's app CSS has enhanced-contrast variants of every theme. Whether plugins receive those values is unverified; if they do, kit components pick them up automatically, because they only use tokens.

## Keyboard

Everything in a kit UI is a native control (`<button>`, `<input>`, `<select>`), so Tab order, Enter and Space, typeahead in selects and screen-reader roles come from the browser. Keep it that way: no `div` buttons, no custom dropdowns for choosing a value.

### The resize handle

The handle is a real `<button type="button">`, placed right after the content root (`</main>`) and before your own `<script>`, so it is the last focusable element and the last stop in the Tab order. Its accessible name is `CONFIG.strings.resizeLabel` ("Resize window"), which the runtime writes to its `aria-label` at startup. Keys act only while the handle has focus and the chrome is on (`html[data-kit-chrome="on"]`).

| Key | `fit-content` | `resizable` |
|---|---|---|
| Left / Right | Width -8 / +8 px | Same |
| Shift + Left / Right | Width -32 / +32 px | Same |
| Up / Down (and with Shift) | Nothing; the key is left to the page, so it scrolls | Height -8 / +8 px (Shift: -32 / +32) |
| Enter or Space | Next snap width (320, 480, 640, then back to 320) | Same, height kept |
| Home | Default width; the height follows the content | Default width, then the height is fitted to the content |
| Escape, while dragging | Back to the size the drag started from | Same |

- Every key sends one final size, which `code.ts` saves at once ([window-chrome.md](window-chrome.md#what-is-saved-and-when)).
- Arrow keys with Ctrl, Alt or Cmd are ignored; holding Enter, Space or Home does not repeat.
- Outside a drag, Escape is left alone for the plugin. During a drag the runtime handles Escape and stops it, so a plugin's own Escape handler on `document`, an element or a bubbling `window` listener does not also fire; only a `window` listener registered with `{ capture: true }` still sees it ([window-chrome.md](window-chrome.md#gestures-and-keys)).
- Step sizes, snap widths and the label come from `CONFIG` and are overridden with a `data-kit-config` script, never by editing the runtime block ([window-chrome.md](window-chrome.md#customising-config)). A blank label is rejected, so the handle always keeps an accessible name.
- `e2e/chrome.spec.mjs` drives every row of this table through the real runtime and `installKitWindow`, in a small kit fixture page (`e2e/fixtures/`) whose kit blocks are byte copies of `ui.html`'s.

## Focus

- **Every control shows a 1px `--figma-color-border-selected` ring** when focused from the keyboard. The ring is an inset outline (`outline-offset: -1px`), not a border, so it never moves the label. Links get the same ring 1px outside.
- **Focus wins over the state rings.** An invalid field swaps its red ring for the focus ring while it has focus (the red help text keeps the error visible), and an `aria-disabled` field, which stays focusable, shows the focus ring too. `e2e/preview.spec.mjs` tabs into both.
- **Filled buttons** (primary, danger) ring in two tones: a light 1px line on the fill (`border-onbrand-strong` or `border-ondanger-strong`) and a 1px outer line (`border-selected-strong` or `border-danger-strong`), so focus reads on the fill and on the panel.
- **The kit uses `:focus-visible`, never `:focus`.** Buttons and the handle show the ring for keyboard focus only. Text fields show it on any focus, because browsers treat a focused text field as focus-visible whether it was clicked or tabbed to.
- **Pressing the handle focuses it without the ring** (`focus({ focusVisible: false })`), so Escape reaches the plugin window during a mouse drag without drawing a keyboard ring. Browsers that don't support the option draw the ring.
- Never remove outlines (`outline: none`) in host CSS. If you build your own control, give it the same `:focus-visible` ring with the kit tokens.

## Labels, descriptions and states

- **Every field has a visible `<label class="kit-label" for="…">`.** Use `aria-label` only where the design has no room for a label, such as a search field with an icon, and never on an element that already has visible text: the `aria-label` would replace what sighted users read.
- **Help text** is `<p class="kit-help" id="…">`, and the control points at it with `aria-describedby`. One help element per control.
- **Errors** are `aria-invalid="true"` on the control plus a message in the help text it already describes. Put the error in that same element (the starter's Count field swaps its help text for the error and back) instead of adding a second element, so the description screen readers announce is always the current one. Remove `aria-invalid` as soon as the value is fixed.
- **States are ARIA or HTML attributes**, never classes: `disabled` (or `aria-disabled="true"` when a control must stay focusable; ignore its clicks yourself), `aria-pressed` on toggle buttons, `aria-busy="true"` on a button while work runs. `aria-busy` blocks the mouse but not Enter or Space, so check it in the click handler ([components.md](components.md#button)).
- **Status messages** that change while the person works (results, counts) go in an element with `role="status"`, as the starter's status line does, so screen readers announce them without moving focus.
- **Structure:** real headings (`<h1 class="kit-heading">`), real `<hr class="kit-divider">` dividers, `<main data-kit-root>` as the content root, `<html lang="en">` (or your language).
- **Icons** are decorative: `aria-hidden="true"` on the `<svg>`, with the meaning carried by the button's text or `aria-label`.

## Reduced motion

The kit has no transitions: hover, pressed and focus colours change instantly, as in Figma, and the window resizes without animation. The only animation is the loading spinner on `[aria-busy="true"]` buttons, and it stops (a still ring) under `@media (prefers-reduced-motion: reduce)`. Wrap any animation you add in the same media query.

## Forced colours (Windows High Contrast)

In forced-colours mode the browser replaces every author colour with the user's system colours. Measured in Chromium 151 with Playwright's forced-colours emulation (`page.emulateMedia({ forcedColors: 'active' })`) on the preview gallery, 2026-10-13; not yet checked on Windows itself:

- **Filled buttons lose their fill.** Primary, danger and selected (`aria-pressed="true"`) buttons get the same system background as secondary ones, so the main action is no longer emphasised and a pressed toggle looks the same as an unpressed one.
- **Their shape survives.** The kit draws every button ring as an outline that is transparent on filled buttons, and forced colours make that outline visible, so every button keeps a visible border.
- **Focus rings stop standing out.** Every outline becomes the same system colour, and the outer focus line on filled buttons (a `box-shadow`) is removed. A focused button or field looks the same as an unfocused one.
- **A loading button shows its label through the spinner**, because the transparent label colour is replaced too.
- Disabled controls do turn the system's disabled colour.

A fix needs an `@media (forced-colors: active)` block in the components CSS. It can make focus and selection visible without naming any colour (a thicker outline for `:focus-visible` and `aria-pressed="true"`, for example), but matching Windows' own controls needs system colour keywords such as `Highlight`, which the colour rule currently forbids everywhere. Both are Phase 2 decisions (below).

## What the automated checks cover

`npm run test:e2e` runs these in Chromium; the CI workflow runs them on every push (it has not run on GitHub yet).

| Check | What it covers |
|---|---|
| axe-core, `@axe-core/playwright` 4.13 (`e2e/a11y.spec.mjs`) | Rule tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, with `color-contrast` disabled. Run on the preview gallery, on the kit fixture's window (resting, and in its error state with `aria-invalid` and the help text live) and on your own `ui.html`'s window, in light, dark and FigJam; on the starter demo in its error state (Count = 0) while the demo is there (`e2e/demo.spec.mjs`); and once on the whole preview page. Expects zero violations. |
| Contrast report (same file) | The table above, recomputed on every run. Never fails on a ratio. |
| Keyboard and pointer (`e2e/chrome.spec.mjs`, `e2e/chrome-v2.spec.mjs`, `e2e/menu.spec.mjs`) | Every handle key, drag, Escape, right-click, plain click and double-click, the resize hint and the debounced announcement, and the menu's keys, through the real runtime and `installKitWindow`, with zero leaked listeners. |
| Gallery states (`e2e/preview.spec.mjs`, `e2e/components.spec.mjs`) | Every component in its six states, forced colours, the tooltip's delay and keyboard focus, that disabled uses the disabled tokens rather than opacity, and that keyboard focus shows the focus ring on invalid and `aria-disabled` fields. |

What is left out, and why:

- **`color-contrast`**, for the [decision above](#the-contrast-decision); the report replaces it.
- **axe's best-practice rules** (landmarks, `region`, heading order and the like) are not WCAG requirements and are not run. The starter already uses `<main>` and real headings.
- **Things no automated check can see:** how a screen reader actually announces the plugin, real Figma (the window, its theme and whether the iframe matches the preview), forced colours on Windows, and zoom. These belong to the manual surface matrix in [release-checklist.md](release-checklist.md); none of them has been run yet.

## Known gaps for Phase 2

- **No announcement while resizing from the keyboard.** The window changes size silently. Phase 2 adds an `aria-describedby` hint on the handle (`#kit-resize-hint`, visually hidden, explaining the keys) and one `aria-live="polite"` region (`[data-kit-announce]`) that says "Window W by H" 150 ms after the last key, plus End for the largest snap width ([PLAN.md](../PLAN.md), Phase 2 item 5).
- **Tooltips and `aria-describedby` rules.** The Phase 2 tooltip must be reachable by keyboard (`:focus-visible`), point at its text with `aria-describedby`, and not hide the control's own description. The audit gains `missing-describedby` (an `aria-invalid="true"` or `role="tooltip"` without a matching `aria-describedby`) and `aria-label-override`.
- **Forced colours**: a `@media (forced-colors: active)` block for focus, selection and the loading label, and a decision on allowing system colour keywords inside it ([above](#forced-colours-windows-high-contrast)).
- **Contrast on a captured palette.** Recapture the palette from a running plugin with `tools/probe`, re-run the report, and check the focus ring (2.99:1 in light) and the label pair against the real values.
- **Real assistive technology.** A VoiceOver and NVDA pass over the starter inside Figma, recorded in the surface matrix.
