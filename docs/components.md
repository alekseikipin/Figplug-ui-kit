# Components

The kit's components are CSS classes on plain HTML elements, defined in `<style data-kit="components">` in `ui.html`. Phase 1 has four: [button](#button), [text input](#text-input), [select](#select) and the [resize handle](#resize-handle), plus the [layout primitives](#layout-primitives) that arrange them. More arrive in later phases; this page grows with them.

Every colour they use is a `--figma-color-*` token, so they follow light, dark and FigJam on their own ([tokens.md](tokens.md)). Every control is 24px tall (32px large), the size of Figma's own UI3 controls. `preview.html` shows each component in every state, in both themes.

## States are attributes

A state is expressed with the HTML or ARIA attribute that already means it, never with an extra class. The same attribute styles the control and tells assistive tech, so the two can't disagree.

| State | Write | Notes |
|---|---|---|
| Disabled | `disabled` | Or `aria-disabled="true"` when the control must stay focusable (for example so a tooltip can explain why). It still receives clicks then: ignore them in your handler. |
| Selected (toggle) | `aria-pressed="true"` | Buttons that stay on. `aria-pressed="false"` is the off state. |
| Error | `aria-invalid="true"` + `aria-describedby="<id of the .kit-help>"` | The help text turns to the danger colour. |
| Loading | `aria-busy="true"` | Buttons show a spinner in place of the label. |
| Hover, pressed, focus | nothing | `:hover`, `:active` and `:focus-visible` handle them. The focus ring appears for keyboard focus, and on text fields always. |

Disabled controls use Figma's disabled tokens, never `opacity`. Don't add `is-active`, `selected` or `error` classes: the kit ignores them.

## Button

```html
<button class="kit-button kit-button-primary" type="button">Create</button>
<button class="kit-button kit-button-secondary" type="button">Cancel</button>
<button class="kit-button kit-button-tertiary" type="button">Reset</button>
<button class="kit-button kit-button-danger" type="button">Delete</button>
```

Always `type="button"`: inside a `<form>` a button without it submits the form. Give each button exactly one variant class.

| Variant | Looks like | Use for |
|---|---|---|
| `kit-button-primary` | Brand fill (`bg-brand`, `text-onbrand`); purple in FigJam | The one main action of a view. |
| `kit-button-secondary` | Transparent with a 1px `border` ring | Every other action: Cancel, Export, Copy. A bare `kit-button` looks the same. |
| `kit-button-tertiary` | Text only; a `bg-hover` fill on hover | Low-emphasis actions in a row of others, toolbar-like toggles. |
| `kit-button-danger` | Danger fill (`bg-danger`, `text-ondanger`) | Destructive actions: Delete, Remove all. |

**Large (32px).** Add `kit-button-large` for a prominent action or a touch-friendly target. Everything else stays the same.

```html
<button class="kit-button kit-button-primary kit-button-large" type="button">Create shapes</button>
```

**Leading icon.** Put an SVG with `class="kit-icon"` and a 24×24 viewBox first; the button drops its start padding because the icon frame already has space around the glyph. Icons paint with `currentColor`, so they follow the label colour in every variant and state.

```html
<button class="kit-button kit-button-secondary" type="button">
  <svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v9M7.5 12h9" fill="none" stroke="currentColor" stroke-linecap="round"/></svg>
  Add
</button>
```

**Toggle.** `aria-pressed` makes a button that stays on. Flip it in your script:

```html
<button class="kit-button kit-button-secondary" type="button" aria-pressed="false" id="snap">Snap to grid</button>
<script>
  const snap = document.getElementById('snap');
  snap.addEventListener('click', () => {
    snap.setAttribute('aria-pressed', String(snap.getAttribute('aria-pressed') !== 'true'));
  });
</script>
```

**Loading.** Set `aria-busy="true"` while work is running and remove it when the main thread answers. The label stays in place (painted transparent) so the button keeps its width, and a spinner is drawn over it; with reduced motion the spinner holds still. `aria-busy` blocks the mouse but not Enter or Space, so guard the handler:

```js
button.addEventListener('click', () => {
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  parent.postMessage({ pluginMessage: { type: 'create-shapes', count: 5, shape: 'rectangle' } }, '*');
});
window.addEventListener('message', (event) => {
  if (event.data.pluginMessage?.type === 'created') button.removeAttribute('aria-busy');
});
```

| State | Primary / danger | Secondary | Tertiary |
|---|---|---|---|
| Default | `bg-brand` / `bg-danger` fill | `border` ring, no fill | no ring, no fill |
| Hover | `bg-brand-hover` / `bg-danger-hover` | `bg-hover` fill | `bg-hover` fill |
| Pressed | `bg-brand-pressed` / `bg-danger-pressed` | `bg-pressed` fill | `bg-pressed` fill |
| Focus | 1px `border-onbrand-strong` inside + 1px `border-selected-strong` outside (danger: `border-ondanger-strong` + `border-danger-strong`) | 1px `border-selected` ring | 1px `border-selected` ring |
| Selected `aria-pressed="true"` | not for filled buttons | `bg-selected` fill, `text-brand` label and icon; hover `bg-selected-hover`, pressed `bg-selected-pressed` | same |
| Disabled | `bg-disabled` fill, `text-ondisabled` | `text-disabled`, `border-disabled` ring | `text-disabled` |
| Loading `aria-busy="true"` | spinner in the label colour | same | same |

Do:
- Keep one primary button per view, usually last in the action row.
- Prefer `disabled`; use `aria-disabled="true"` only when the button must stay focusable, and ignore its clicks.
- For a trailing icon, wrap the label in a `<span>` so the icon is not the first element and the start padding stays.

Don't:
- Set `height`, `padding` or colours on `.kit-button` (the audit's `control-height` and `color-literal` rules catch most of it). Use `kit-button-large` for 32px.
- Use `aria-pressed` on primary or danger buttons: the selected look replaces the fill.
- Rely on the private `--kit-button-*` properties the component uses internally. They are not part of the API and may change.

## Text input

```html
<div class="kit-field">
  <label class="kit-label" for="name">Layer name</label>
  <input class="kit-input" id="name" type="text" placeholder="Frame">
</div>
```

A `.kit-field` stacks a label, the control and optional help text with 4px between them. The input is a filled field (`bg-secondary`), 24px tall, as wide as its container.

**Help text and errors.** Help text is a `<p class="kit-help">` with an `id` that the input points to with `aria-describedby`. For an error, set `aria-invalid="true"` on the input and put the message in that help text; the ring and the message turn to the danger colour.

```html
<div class="kit-field">
  <label class="kit-label" for="prefix">Prefix</label>
  <input class="kit-input" id="prefix" type="text" value="#Frame" aria-invalid="true" aria-describedby="prefix-help">
  <p class="kit-help" id="prefix-help">Use letters, numbers and dashes only.</p>
</div>
```

```js
function setError(input, help, message) {
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  help.textContent = message || 'Letters, numbers and dashes.';
}
```

**With an icon.** Wrap the icon and the input in `.kit-input-icon`. The icon sits in a 24px slot at the start of the field, in `icon-secondary`; clicks pass through it to the input. A 16px icon (`kit-icon kit-icon-small`, viewBox 0 0 16 16) is centred in the same slot.

```html
<div class="kit-input-icon">
  <svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11.5" cy="11.5" r="4" fill="none" stroke="currentColor"/><path d="m14.5 14.5 3 3" fill="none" stroke="currentColor" stroke-linecap="round"/></svg>
  <input class="kit-input" type="search" placeholder="Search layers" aria-label="Search layers">
</div>
```

`type="search"` works with or without the icon. The kit hides the clear button Chromium draws in search fields (and so Figma's desktop app does too), because its colour comes from the browser, not from a token. Escape still clears the field.

| State | Look | Written as |
|---|---|---|
| Default | `bg-secondary` fill, no ring; placeholder `text-tertiary` | |
| Hover | 1px `border` ring | |
| Focus | 1px `border-selected` ring, also over the error and `aria-disabled` rings | |
| Error | 1px `border-danger-strong` ring (the focus ring while focused); help text `text-danger` | `aria-invalid="true"` + `aria-describedby` |
| Disabled | `bg` fill, `border-disabled` ring, `text-disabled`; label `text-disabled`; icon `icon-disabled` | `disabled` |
| Pressed | none: UI3 inputs have no pressed state | |

Do:
- Give every input a visible `<label class="kit-label" for="...">`. Use `aria-label` only where the design has no room for a label, such as a search field with an icon.
- Keep `aria-describedby` pointing at the help text while the error shows, and remove `aria-invalid` once the value is fixed.

Don't:
- Use the placeholder as the label: it disappears as soon as the person types.
- Put buttons or links inside `.kit-input-icon`: the icon slot ignores the pointer.
- Use `.kit-input` for numbers that need a unit or a scrubber; a number field is planned for Phase 2.

## Select

```html
<div class="kit-field">
  <label class="kit-label" for="shape">Shape</label>
  <div class="kit-select">
    <select id="shape">
      <option value="rectangle">Rectangle</option>
      <option value="ellipse">Ellipse</option>
    </select>
  </div>
</div>
```

The kit keeps the native `<select>`: its popup, typeahead, keyboard and screen-reader behaviour come from the browser and the operating system. Only the closed control is styled: a 24px field with a 1px `border` ring and a caret drawn by the wrapper (a `<select>` cannot draw one itself). The open list is the system popup: on macOS a native menu; on Windows and Linux a list the browser draws, whose options the kit paints with `bg` and `text` so dark mode stays readable. It follows Figma's theme through `color-scheme`, not UI3's dark menu style.

| State | Look | Written as |
|---|---|---|
| Default | `bg` fill, 1px `border` ring, caret `icon-secondary` | |
| Hover | caret darkens to `icon-secondary-hover` | |
| Focus | 1px `border-selected` ring (keyboard focus), also over the error and `aria-disabled` rings | |
| Open | the system popup | |
| Error | 1px `border-danger-strong` ring (the focus ring while focused); help text `text-danger` | `aria-invalid="true"` + `aria-describedby` on the `<select>` |
| Disabled | `border-disabled` ring, `text-disabled`, caret `icon-disabled` | `disabled` on the `<select>` |

Do:
- Put `disabled`, `aria-invalid` and `aria-describedby` on the `<select>`, not on the wrapper.
- Keep option labels short; a long one is cut with an ellipsis in the closed control.

Don't:
- Build a custom dropdown out of `div`s. A custom menu arrives in Phase 2 for commands; choosing a value stays native.
- Use `multiple` or `size`: only the single-line select is styled.

## Resize handle

```html
<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>
```

Put it once, right after `</main>` (the `[data-kit-root]` element) and before your own `<script>`, so it is the last stop in the Tab order, and leave the rest to the runtime: it shows the handle when `kit:init` turns the window chrome on and hides it otherwise (Dev Mode, Buzz and `fixed` mode). How dragging, double-click snapping and the keyboard work is in [window-chrome.md](window-chrome.md).

What the CSS does:

- A 24×24 target fixed to the bottom-right corner, above the content (`--kit-z-handle`).
- The grip is the two diagonal lines browsers draw on a resizable textarea, in `icon-secondary` (at least 3:1 against the panel in both themes). It darkens to `icon` on hover and while dragging (`:active`); keyboard focus draws a 1px `border-selected` ring.
- The cursor is the diagonal resize cursor; it becomes the horizontal one while `html[data-kit-mode="fit-content"]`, where only the width can be dragged.
- While `html[data-kit-chrome="on"]`, the kit keeps 24px clear below the content for the grip, so it never covers the last row: `.kit-app` gets 24px of bottom padding, or 8px when its last child is a `.kit-section`, which already pads 16px.
- It has no disabled state; it is hidden instead.

Don't remove `hidden` yourself, move or restyle the handle, or swap it for another element: the runtime looks it up by `data-kit-resize`.

## Layout primitives

They are not counted as components, but every kit UI is built from them.

```html
<body>
  <main class="kit-app" data-kit-root>
    <section class="kit-section kit-stack">
      <h1 class="kit-heading">Create shapes</h1>
      <div class="kit-row">
        <div class="kit-field">
          <label class="kit-label" for="count">Count</label>
          <input class="kit-input" id="count" type="text" inputmode="numeric" value="5">
        </div>
        <div class="kit-field">
          <label class="kit-label" for="kind">Shape</label>
          <div class="kit-select"><select id="kind"><option>Rectangle</option><option>Ellipse</option></select></div>
        </div>
      </div>
    </section>
    <hr class="kit-divider">
    <section class="kit-section">
      <div class="kit-row">
        <button class="kit-button kit-button-secondary" type="button">Cancel</button>
        <button class="kit-button kit-button-primary" type="button">Create</button>
      </div>
    </section>
  </main>
  <button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>
</body>
```

| Class | What it does | Notes |
|---|---|---|
| `kit-app` on `<main data-kit-root>` | The root the runtime measures to fit the window height. | It contains its children's margins, so the fit never cuts them off. Never give it, or `body`, `height: 100%` or `min-height: 100vh`: the window could then never shrink. |
| `kit-section` | 16px padding around a block of content. | Separate consecutive sections with `<hr class="kit-divider">`. |
| `kit-divider` | A full-width 1px `border` line. | Use a real `<hr>`. |
| `kit-stack` | Column with 8px gaps. | Children stretch to the full width, buttons included; wrap buttons in a `kit-row` to keep their natural width. |
| `kit-row` | Row with 8px gaps, vertically centred, wrapping. | Fields, inputs and selects in a row share the width equally and shrink; buttons keep their width and wrap onto a new line when the window is too narrow. |
| `kit-field` | Column: `kit-label`, control, optional `kit-help`, 4px apart. | The label dims when the control is disabled; the help text turns to danger when the control has `aria-invalid="true"`. |
| `kit-label` | Field label: secondary text, regular weight (as in UI3). | Use a `<label for>`. |
| `kit-help` | Help or error text under a control. | Give it an `id` and point the control's `aria-describedby` at it. |
| `kit-heading` | Panel title: 11px on 16px, weight 550. | Use a real `<h1>`/`<h2>`/`<h3>`; the browser's margins and sizes are reset. |
| `kit-text-secondary` | Secondary text colour. | For descriptions and meta text. |
| `kit-visually-hidden` | Hidden on screen, still read by screen readers. | For labels the design has no room for. |
| `kit-icon`, `kit-icon-small` | 24×24 and 16×16 icon frames. | Use an inline `<svg viewBox="0 0 24 24">` (or `0 0 16 16`) with `currentColor` and `aria-hidden="true"`. |

## Adding your own CSS

The three `data-kit` blocks in `<head>` (tokens, components, runtime) are the kit; you upgrade by re-pasting all three. Your own styles go in a separate, plain `<style>` element **after** them, so an upgrade never overwrites your work and your rules win ties against the kit's.

```html
<style>
  /* Your plugin's styles. Tokens only. */
  .actions { justify-content: flex-end; }
  .preview {
    padding: var(--kit-spacer-2);
    border-radius: var(--kit-radius-medium);
    background-color: var(--figma-color-bg-secondary);
    color: var(--figma-color-text-secondary);
  }
</style>
```

Rules for host CSS:

- **Never edit inside the `data-kit` blocks.** The copies must stay byte-identical so upgrades and the audit can compare them.
- **Colours are tokens only**: `var(--figma-color-*)`, plus `transparent`, `currentColor`, `inherit`, `none` ([tokens.md](tokens.md) has a role → token cheat sheet). Shadows use `var(--kit-shadow-*)`.
- **Spacing, radii and type use `--kit-*` tokens**, so your parts line up with the kit's.
- **Controls are 24px or 32px tall.** Use `var(--kit-control-height)` or `var(--kit-control-height-large)` if you build your own control; never another height.
- **States are attributes.** If you give your own control a `:hover` rule, give it a `:disabled` (or `[aria-disabled="true"]`) rule too, and use the disabled tokens rather than `opacity`.
- **Don't recolour kit components** or set their private `--kit-button-*` properties; pick another variant instead.

Run `npm run audit` after every change; [pitfalls.md](pitfalls.md) explains each rule it reports.
