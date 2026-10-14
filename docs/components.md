# Components

The kit's components are CSS classes on plain HTML elements, defined in `<style data-kit="components">` in `ui.html`, plus the [layout primitives](#layout-primitives) that arrange them: 20 components in all.

| Phase | Components |
|---|---|
| 1 | [Button](#button), [text input](#text-input), [select](#select), [resize handle](#resize-handle) |
| 2 | [Textarea](#textarea), [checkbox](#checkbox), [radio](#radio), [number field](#number-field), [colour field](#colour-field), [icon button](#icon-button), [section header](#section-header), [list](#list), [empty state](#empty-state), [inline notice](#inline-notice), [sticky footer](#sticky-footer), [tabs](#tabs), [tooltip](#tooltip), [menu](#menu) |
| 3 | [Dialog](#dialog), [toast](#toast) |

Every colour they use is a `--figma-color-*` token, so they follow light, dark and FigJam on their own ([tokens.md](tokens.md)). Every control is 24px tall (32px large), the size of Figma's own UI3 controls; list rows are 32px, like UI3's panel rows. `preview.html` shows each component in every state, in light, dark and FigJam. Only the menu, the dialog and the toast need the runtime; tabs are CSS-only, and tooltips are CSS-only apart from Escape, which the runtime handles.

## States are attributes

A state is expressed with the HTML or ARIA attribute that already means it, never with an extra class. The same attribute styles the control and tells assistive tech, so the two can't disagree.

| State | Write | Notes |
|---|---|---|
| Disabled | `disabled` | Or `aria-disabled="true"` when the control must stay focusable (for example so a tooltip can explain why). It still receives clicks then: ignore them in your handler. |
| Selected (toggle) | `aria-pressed="true"` | Buttons that stay on. `aria-pressed="false"` is the off state. |
| Error | `aria-invalid="true"` + `aria-describedby="<id of the .kit-help>"` | The help text turns to the danger colour. |
| Loading | `aria-busy="true"` | Buttons show a spinner in place of the label. |
| Checked | `checked` (and the `indeterminate` property) | Checkboxes, radios and tabs. `indeterminate` has no HTML attribute: set `input.indeterminate = true` in your script. |
| Current or selected row | `aria-current="true"` on a `<button>` row; `aria-selected="true"` on a `role="option"` row | List rows. `aria-selected` is only valid on roles such as `option`, so a plain button row uses `aria-current`. |
| Open | `aria-expanded="true"` | Set by the runtime on a menu's buttons while the menu is open; an icon button shows the selected look. |
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
- Use a bare `.kit-input` for numbers: the [number field](#number-field) adds a prefix slot and drops the spin buttons. For several lines of text, use the [textarea](#textarea).

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
- Build a custom dropdown out of `div`s. The kit's [menu](#menu) is for commands (Rename, Duplicate, Delete); choosing a value stays native.
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
- While `html[data-kit-chrome="on"]`, the kit keeps 24px clear below the content for the grip, so it never covers the last row: `.kit-app` gets 24px of bottom padding, or 8px when its last child is a `.kit-section`, which already pads 16px, or none when it ends with a [sticky footer](#sticky-footer), which keeps its buttons clear of the grip instead.
- It has no disabled state; it is hidden instead.

Don't remove `hidden` yourself, move or restyle the handle, or swap it for another element: the runtime looks it up by `data-kit-resize`.

## Textarea

```html
<div class="kit-field">
  <label class="kit-label" for="names">New names</label>
  <textarea class="kit-textarea" id="names" rows="4" placeholder="One name per line"></textarea>
</div>
```

The multi-line twin of the [text input](#text-input): same `bg-secondary` fill, rings and states, with 4px of padding above and below the text. `rows` sets the height (16px per line, plus 8px). The person can't drag it bigger (`resize: none`, as in UI3): pick a `rows` that fits, or let the window grow.

| State | Look | Written as |
|---|---|---|
| Default | `bg-secondary` fill; placeholder `text-tertiary` | |
| Hover | 1px `border` ring | |
| Focus | 1px `border-selected` ring | |
| Error | 1px `border-danger-strong` ring; help text `text-danger` | `aria-invalid="true"` + `aria-describedby` |
| Disabled | `bg` fill, `border-disabled` ring, `text-disabled` | `disabled` |
| Pressed | none, as for inputs | |

Do:
- Give it a visible label and, for errors, the same `aria-invalid` + `.kit-help` pairing as an input.

Don't:
- Set a `height` or `min-height` on it; use `rows`. In a `fit-content` window a taller textarea simply makes the window taller.

## Checkbox

```html
<label class="kit-checkbox"><input type="checkbox" checked>Include hidden layers</label>
```

The `<input>` goes inside its `<label>`, so clicking the text toggles it and the text is its accessible name. The kit draws a 16px box (radius 5px) with a 1px `border-strong` outline; checked, it fills with `bg-brand` and shows a check in `icon-onbrand`. The check and the dash are masks: the SVG supplies only the shape, a token supplies the colour, so they follow every theme. The label is a 24px row; stack several in a `.kit-stack`.

**Indeterminate** ("some of these"): there is no HTML attribute; set it from your script, and clear it when the person decides.

```js
const all = document.getElementById('all');
all.indeterminate = someChecked && !allChecked;
```

**Help text** under a checkbox: put `<p class="kit-help">` right after the label (both inside a `.kit-field` if you also need the error colour); it lines up with the label text, not the box.

```html
<div class="kit-field">
  <label class="kit-checkbox"><input type="checkbox" aria-describedby="ratio-help">Keep ratio</label>
  <p class="kit-help" id="ratio-help">Width drives height.</p>
</div>
```

| State | Look | Written as |
|---|---|---|
| Default | 1px `border-strong` box, empty | |
| Hover | the mark appears faintly (`icon-tertiary`), as in UI3 | |
| Focus | 1px `border-selected` ring; when checked, a light inner line (`border-onbrand-strong`) and a dark outer one (`border-selected-strong`) | |
| Checked / indeterminate | `bg-brand` fill, check or dash in `icon-onbrand` | `checked` / `input.indeterminate = true` |
| Error | 1px `border-danger-strong` box; help text `text-danger` | `aria-invalid="true"` + `aria-describedby` |
| Disabled | `border-disabled-strong` box, label `text-disabled`; checked: `bg-disabled` fill, mark `icon-ondisabled` | `disabled` |
| Pressed | none: UI3 checkboxes have no pressed state | |

Do:
- Write the label as a statement that is true when checked ("Include hidden layers").
- Use `disabled`, not `aria-disabled`: an `aria-disabled` checkbox still toggles when clicked.

Don't:
- Put the input outside the label, or add a second label: the label is the 24px target and the name.
- Use a checkbox for an action that happens at once; that is a [toggle button](#button) (`aria-pressed`).

Accessibility: it is a native checkbox, so Space toggles it, screen readers announce it (with "mixed" when indeterminate), and in Windows High Contrast the kit hands the drawing back to the browser so the box and the mark stay visible.

## Radio

```html
<div class="kit-stack" role="radiogroup" aria-labelledby="scope-label">
  <span class="kit-label" id="scope-label">Scope</span>
  <label class="kit-radio"><input type="radio" name="scope" value="selection" checked>Selection</label>
  <label class="kit-radio"><input type="radio" name="scope" value="page">Current page</label>
</div>
```

The checkbox's round sibling: same rules, a circle, and a 6px `icon-onbrand` dot on the `bg-brand` fill when checked. Radios that share a `name` form one group: arrow keys move the choice, Tab enters and leaves the group.

| State | Look |
|---|---|
| Default | 1px `border-strong` circle |
| Hover | faint dot (`icon-tertiary`) |
| Focus | 1px `border-selected` ring; checked: light inner line + `border-selected-strong` outer line |
| Checked | `bg-brand` fill, `icon-onbrand` dot (`checked`) |
| Error | `border-danger-strong` circle (`aria-invalid="true"` + `aria-describedby` on each radio) |
| Disabled | `border-disabled-strong`, label `text-disabled`; checked: `bg-disabled` fill, `icon-ondisabled` dot |

Do:
- Group the radios in an element with `role="radiogroup"` and a name (`aria-labelledby` pointing at a visible label, or `aria-label`), or in a `<fieldset>` with a `<legend>` styled by your own CSS.
- Check one option from the start, unless "none yet" is a real answer.

Don't:
- Use radios for more than about five options: use a [select](#select).

## Number field

```html
<div class="kit-field">
  <label class="kit-label" for="width">Width</label>
  <div class="kit-number">
    <span class="kit-number-prefix" aria-hidden="true">W</span>
    <input class="kit-input" id="width" type="number" value="320" min="1" step="1">
  </div>
</div>
```

A [text input](#text-input) of `type="number"` in a wrapper with an optional 24px prefix slot at the start, like the W and H fields in Figma's panel. The prefix holds one or two letters or a 16 or 24px icon (`<svg class="kit-icon">`), in `text-secondary`; it is decoration (`aria-hidden="true"`), so the real name comes from the label. The browser's spin buttons are removed (no token colours them); Up and Down still step by `step`, and `min`/`max` still validate. In a `.kit-row`, number fields share the width like inputs.

States are the input's (hover, focus, error, disabled); the prefix turns `text-disabled` with a disabled input.

Do:
- Validate in your script and show errors with `aria-invalid` + `.kit-help`, as for inputs: `type="number"` accepts text such as `1e3` and gives `''` for anything it can't parse.
- Put a unit in the label ("Spacing (px)") or the prefix.

Don't:
- Expect the prefix to scrub: dragging it to change the value (as Figma's panel does) needs a script; the kit's is CSS only.
- Use it for things that look like numbers but aren't (IDs, hex colours): use a text input.

## Colour field

```html
<div class="kit-field">
  <label class="kit-label" for="fill-hex">Fill</label>
  <div class="kit-color">
    <input class="kit-color-swatch" type="color" value="#0d99ff" aria-label="Pick the fill colour">
    <input class="kit-input" id="fill-hex" type="text" value="0D99FF" spellcheck="false" maxlength="7">
  </div>
</div>
```

A hex text field with the native colour input drawn as a 16px swatch (radius 2px, 1px `border` ring) in its start slot, like a fill row in Figma's panel. Clicking the swatch opens the system colour picker. The two inputs don't talk to each other on their own: keep them in sync in your script.

```js
swatch.addEventListener('input', () => { hex.value = swatch.value.slice(1).toUpperCase(); });
hex.addEventListener('change', () => {
  const ok = /^#?[0-9a-f]{6}$/i.test(hex.value.trim());
  if (ok) swatch.value = '#' + hex.value.trim().replace('#', '');
  if (ok) hex.removeAttribute('aria-invalid');
  else hex.setAttribute('aria-invalid', 'true'); // and say why in the .kit-help it describes
});
```

| State | Look |
|---|---|
| Default, hover, focus, error, disabled | the hex input's own states; hovering anywhere on the field, swatch included, shows the hover ring |
| Swatch focus | 1px `border-selected` ring 1px outside the swatch |
| Disabled | `disabled` on both inputs; the swatch keeps its colour (it is the value, not decoration) |

Do:
- Give the swatch its own `aria-label` ("Pick the fill colour"); the visible label names the hex field.
- Hex values in `value` attributes are data, not styling: the colour rule doesn't apply to them.

Don't:
- Expect the system picker to look like Figma's: it is the operating system's. Whether Figma's desktop app opens it from a plugin window is UNVERIFIED; check it in Figma (release-checklist surface matrix) before relying on it.

## Icon button

```html
<button class="kit-icon-button" type="button" aria-label="Add layer">
  <svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v9M7.5 12h9" fill="none" stroke="currentColor" stroke-linecap="round"/></svg>
</button>
```

A 24px square button holding one 24px (or 16px) icon, as in UI3's panel headers and toolbars. It is a [tertiary button](#button) underneath, so hover, pressed, focus and disabled behave the same; only the colours come from the icon tokens.

| State | Look | Written as |
|---|---|---|
| Default | no fill, icon `icon` | |
| Hover | `bg-hover` fill, icon `icon-hover` | |
| Pressed | `bg-pressed` fill | |
| Focus | 1px `border-selected` ring | |
| Selected | `bg-selected` fill, icon `icon-brand`; hover `bg-selected-hover`, pressed `bg-selected-pressed` | `aria-pressed="true"` |
| Open | same as selected, while its menu is open | `aria-expanded="true"` (the runtime sets it) |
| Disabled | icon `icon-disabled`, no fill | `disabled` |

Do:
- Always give it an `aria-label` (it has no visible text), and add a [tooltip](#tooltip) for sighted users.
- Use `aria-pressed` for a toggle (Lock ratio), and set it in your click handler.

Don't:
- Put text in it: that is a `kit-button`. Don't set its size; there is no large variant yet.

## Section header

```html
<main class="kit-app" data-kit-root>
  <header class="kit-section-header">
    <h2>Layers</h2>
    <button class="kit-icon-button" type="button" aria-label="Add layer"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v9M7.5 12h9" fill="none" stroke="currentColor" stroke-linecap="round"/></svg></button>
  </header>
  <div class="kit-section kit-stack">…</div>
  <hr class="kit-divider">
  <header class="kit-section-header"><h2>Export</h2></header>
  <div class="kit-section kit-stack">…</div>
</main>
```

The 40px title bar of a UI3 panel section: a heading (`h1`–`h4`, strong 11px, cut with an ellipsis when too long) on the left, optional icon buttons on the right. Its padding is 16px on the left, so the title lines up with the section's content, and 8px on the right, as in UI3. A `.kit-section` right after it drops its top padding, because the header already supplies the space.

States are those of the icon buttons inside it. Do: use a real heading element at the right level, and put the header and its section side by side in the root (as above). Don't: wrap the header inside the `.kit-section` (the paddings would add up), or put more than two or three icon buttons in it.

## List

```html
<ul class="kit-list" aria-label="Selected layers">
  <li class="kit-list-row">
    <svg class="kit-icon kit-list-row-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>
    <span class="kit-list-row-label">Header</span>
    <span class="kit-list-row-meta">1440 × 80</span>
  </li>
</ul>
```

Rows are 32px tall (UI3's panel rows), with three optional parts: a 24px icon (`kit-list-row-icon`, in `icon-secondary`), the label (takes the free space and ends in an ellipsis) and meta text at the end (`kit-list-row-meta`, `text-secondary`). Rows have a 5px radius and 8px side padding; for UI3's inset highlight, give the list 8px of padding in your own CSS, or put it in a `.kit-section`.

**Clickable rows** are a `<button class="kit-list-row" type="button">` inside the `<li>`, so each row is one Tab stop and Enter or Space activates it. The current one carries `aria-current="true"`:

```html
<ul class="kit-list" aria-label="Frames">
  <li><button class="kit-list-row" type="button" aria-current="true"><span class="kit-list-row-label">Hero</span></button></li>
  <li><button class="kit-list-row" type="button"><span class="kit-list-row-label">Footer</span></button></li>
</ul>
```

If you build a real listbox (`role="listbox"` with `role="option"` rows, `aria-selected`, and arrow-key handling in your script), `.kit-list-row[aria-selected="true"]` gets the same selected look.

| State | Look | Written as |
|---|---|---|
| Default | no fill | |
| Hover (button rows) | `bg-hover` | |
| Pressed | `bg-pressed` | |
| Focus | 1px `border-selected` ring | |
| Selected | `bg-selected` fill, `text-onselected` label, `icon-onselected` icon, `text-onselected-secondary` meta; hover `bg-selected-hover`, pressed `bg-selected-pressed` | `aria-current="true"` (button rows) or `aria-selected="true"` (`role="option"`) |
| Disabled | `text-disabled`, `icon-disabled`, no hover | `disabled` on a button row (`aria-disabled="true"` on others) |

Do:
- Name the list (`aria-label` or `aria-labelledby`), and keep labels short; the full text can go in a `title` or a tooltip.
- Prefer static `<li>` rows for read-only results: they don't react to the pointer, so nothing looks clickable that isn't.
- Put a list that can grow long (layers, variables, search results) in a [`.kit-scroll`](#long-lists-kit-scroll) region, so a `fit-content` window stays short and its footer stays in view.

Don't:
- Put `aria-selected` on a `<button>` (it isn't allowed there; axe flags it): use `aria-current`, or `aria-pressed` for multi-select toggles you style yourself.
- Nest buttons or inputs inside a button row.

## Empty state

```html
<div class="kit-empty">
  <svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>
  <h2 class="kit-empty-title">No layers selected</h2>
  <p class="kit-empty-text">Select one or more layers to rename them.</p>
  <button class="kit-button kit-button-secondary" type="button">Select all</button>
</div>
```

What a view shows when there is nothing to show yet: a centred column with an optional 24px icon (`icon-tertiary`), a strong title (`kit-empty-title`, on a heading or a `<p>`), a short secondary text (`kit-empty-text`, at most 240px wide) and an optional `kit-button`, with 32px of space above and below. Every part is optional except a title or text.

States are those of the button; while the action runs, `aria-busy="true"` on it shows the spinner. Do: say what is missing and how to get it, in one short sentence. Don't: use it for errors (that is a [danger notice](#inline-notice)), or put a form in it.

Accessibility: when the empty state replaces content after an action (a search with no results), announce it: put the text in, or next to, an element with `role="status"`.

## Inline notice

```html
<div class="kit-notice" data-kit-tone="warning" role="status">
  <svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>
  <p class="kit-notice-text">3 names are duplicates.</p>
  <button class="kit-button kit-button-secondary" type="button">Review</button>
</div>
```

A tinted box for a message that belongs to the content around it: an optional 24px icon, the message in `kit-notice-text` (required: it carries the padding), and an optional `kit-button` or dismiss `kit-icon-button` at the end. The tone tints the box and its 1px ring and colours the icon; the text stays in the body colour (`text`), so it reads in every theme.

| `data-kit-tone` | Fill | Ring | Icon | Role |
|---|---|---|---|---|
| none (neutral) | `bg-secondary` | none | `icon-secondary` | `role="status"` |
| `info` | `bg-brand-tertiary` | `border-brand` | `icon-brand` | `role="status"` |
| `success` | `bg-success-tertiary` | `border-success` | `icon-success` | `role="status"` |
| `warning` | `bg-warning-tertiary` | `border-warning` | `icon-warning` | `role="status"` |
| `danger` | `bg-danger-tertiary` | `border-danger` | `icon-danger` | `role="alert"` |

States: the notice itself has none (it is not a control); its buttons have theirs. `data-kit-tone` is a variant, not a state, which is why it is an attribute of its own rather than ARIA.

Do:
- Use `role="status"` (announced politely) and keep `role="alert"` for danger, which interrupts. Insert the notice, or change its text, after the page has loaded; a region that is already there at load is not announced.
- Put the meaning in the words: the colour and the icon are extra.

Don't:
- Use a notice for field errors: those go in the field's `.kit-help` with `aria-invalid`.
- Stack more than one or two; for "it worked" feedback after an action, a [toast](#toast) is lighter (or `figma.notify` in `code.ts` when the window is about to close).

Contrast: in Figma's dark theme `bg-warning-tertiary` is a dim brown (`#5c4100` in the 2026-10-14 capture, which the fallback palette now holds), and the notice's text on it is 9.50:1. Figma's docs table gives a strong orange (`#c58011`), on which the same text is about 3.25:1; the kit reads whichever Figma injects ([accessibility.md](accessibility.md#measured-ratios)).

## Sticky footer

```html
<main class="kit-app" data-kit-root>
  <div class="kit-section kit-stack">…</div>
  <footer class="kit-footer">
    <p class="kit-text-secondary" role="status">3 layers selected</p>
    <div class="kit-row">
      <button class="kit-button kit-button-secondary" type="button">Cancel</button>
      <button class="kit-button kit-button-primary" type="button">Rename</button>
    </div>
  </footer>
</main>
<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>
```

The window's action bar: a `bg` strip with a 1px `border` line on top, 8px/16px padding, buttons at the end. It is `position: sticky` at the bottom, so when the content is taller than the window (a `resizable` window, or a `fit-content` one at its maximum height) the content scrolls under it and the actions stay in reach. Make it the last child of the `[data-kit-root]` element and drop the divider before it.

- **Status text**: a `.kit-text-secondary` as the first child takes the free space (a `.kit-help` too, when a control points at it). Put the buttons in a `.kit-row` so that, in a narrow window, they wrap to a second line together instead of one by one. Update a `role="status"` line with results ("Renamed 3 layers"), not on every keystroke: each change is read out.
- **The resize grip**: while the chrome is on (`html[data-kit-chrome="on"]`), the 24×24 handle sits in the footer's bottom-right corner. The footer then keeps 32px clear on the right, so no button ever sits under the grip, and the root's usual 24px grip padding is dropped (it would only add an empty strip under the bar). Checked in `preview.html`'s host at 240px wide, in `fit-content` and `resizable` windows.
- **Focus**: Tab scrolls fields into view above the bar, not under it (`scroll-padding-bottom` on the page).
- **Tall windows**: in a `resizable` window taller than its content, the footer sits right under the content, not at the window's bottom edge. Pinning it there would need a root that fills the window, which would stop the window from ever fitting its content ([window-chrome.md](window-chrome.md)).

States are those of its buttons. Do: keep one primary action, last. Don't: put fields in the footer, or more than one footer in a window.

## Tabs

```html
<div class="kit-tabs">
  <div class="kit-tablist" role="radiogroup" aria-label="Format">
    <label class="kit-tab"><input type="radio" name="format" value="png" checked>PNG</label>
    <label class="kit-tab"><input type="radio" name="format" value="svg">SVG</label>
  </div>
  <div>PNG options…</div>
  <div>SVG options…</div>
</div>
```

CSS-only tabs for switching between up to six panels: each tab is a hidden radio inside a label, and panel N shows while tab N is checked. No script, and the browser handles the keys: Tab reaches the checked tab, arrow keys move between tabs (and switch panels), and the chosen value is a normal radio value your script can read (`querySelector('input[name="format"]:checked').value`).

Rules the CSS depends on: the `.kit-tablist` is the first child of `.kit-tabs`; the panels follow it directly, in the same order as the tabs; each tab's radio is its label's only element; one radio is `checked` from the start (with none checked, every panel hides). A panel is any element (a plain `<div>`, a `.kit-stack`, a `<section>`) and needs no class: the CSS picks panels by position, not by name. The 0.3.0 docs showed a `kit-tabpanel` class on them; it never had a CSS rule, so markup that keeps it works the same.

| State | Look | Written as |
|---|---|---|
| Default | `text-secondary`, no fill | |
| Hover | `text-secondary-hover` | |
| Focus | 1px `border-selected` ring on the tab | (keyboard focus on the radio) |
| Selected | `bg-secondary` fill, `text`, strong weight | `checked` on the radio |
| Disabled | `text-disabled` | `disabled` on the radio |
| Pressed | none | |

Do:
- Give the tab list a name (`aria-label`), and a panel its own heading if its content needs one.
- Put a `.kit-stack` or `.kit-section` inside or on a panel for spacing; hidden panels keep their own display rule when shown.

Don't:
- Use more than six tabs, or tabs for steps the person must go through in order.
- Expect the WAI-ARIA tab pattern: screen readers announce a radio group ("PNG, radio button, 1 of 2"), which is honest about how it behaves. The selected tab is bold, so its width grows by a pixel or two.

## Tooltip

```html
<span class="kit-tooltip-host">
  <button class="kit-icon-button" type="button" aria-label="Tidy up" aria-describedby="tidy-tip">…</button>
  <span class="kit-tooltip" role="tooltip" id="tidy-tip">Spaces the selected layers evenly</span>
</span>
```

A CSS tooltip (the runtime only adds Escape dismissal, see Accessibility below): a `bg-inverse` label with `text-oninverse`, 4px/8px padding, radius 5px and `--kit-shadow-tooltip`, 4px under its control. It appears 400ms (`--kit-duration-large`) after the pointer rests on the host, at once when the control gets keyboard focus, and hides as soon as both leave. Escape hides it while the pointer or focus is still there (see Accessibility below). It never takes focus. Long text wraps at 200px.

**Placement.** By default it is centred under the control. Near a window edge it would be cut off, so add one class: `kit-tooltip-start` (aligned with the control's left edge, for controls near the left), `kit-tooltip-end` (right edge, for icon buttons in a section header) or `kit-tooltip-above` (for controls in the last row or the footer). Hidden tooltips take no room, so they never widen or lengthen the page.

| State | Look |
|---|---|
| Hidden | not shown (scaled to nothing) |
| Hover | shown after 400ms |
| Focus | shown at once (`:focus-visible` inside the host) |
| Dismissed | hidden after Escape until both the pointer and keyboard focus have left the host; the runtime sets and clears `data-kit-tooltip-dismissed` on the host (never write it yourself) |
| Disabled control | still shown: use `aria-disabled="true"` on the control (not `disabled`) so keyboard users can reach it and read why |

Do:
- Point the control's `aria-describedby` at the tooltip's `id`: that is how screen readers get the text, and the audit's `missing-describedby` rule flags a tooltip nothing points at.
- Keep it to a few words that add something: what an icon button does, or why a button is disabled. Give icon buttons an `aria-label` as well.

Don't:
- Put links or buttons in a tooltip: it can't be reached by Tab.
- Wrap a field in a host inside a `.kit-row` and expect it to share the width; hosts are for buttons and icon buttons.
- Use it inside an element with `overflow: hidden` or `auto`, which would clip it.

Accessibility: the pointer can move from the control onto the tooltip without losing it (WCAG 1.4.13 "hoverable"), and it stays until the pointer or focus leaves ("persistent"). Since kit 0.4.0, Escape hides a shown tooltip without moving the pointer or focus ("dismissible"): it stays hidden while the pointer or focus remains on its control, and the next hover or focus after both have left shows it again. The runtime doesn't take that Escape: your own Escape handlers still get it, and a modal dialog it sits in still closes. An open menu is the exception it always was: its Escape closes the menu and stops there ([Menu](#menu)). Since 0.4.0 this also works in a browser without the popover API ([Implementation notes](#implementation-notes)). If your `ui.html` carries the Escape workaround from the 0.3.0 docs, you can delete it; keeping it does no harm. Keep tooltips short and below or beside what they describe so they don't cover anything the person needs.

## Menu

```html
<button class="kit-button kit-button-secondary" type="button" popovertarget="layer-menu" aria-haspopup="menu" aria-expanded="false">Options</button>
<div class="kit-menu" id="layer-menu" popover role="menu" aria-label="Layer options">
  <button class="kit-menu-item" role="menuitem" type="button">Rename</button>
  <button class="kit-menu-item" role="menuitem" type="button">Duplicate</button>
  <hr class="kit-menu-separator">
  <button class="kit-menu-item" role="menuitem" type="button" disabled>Delete</button>
</div>
```

A command menu, the kit's first stateful component. The browser's popover API opens and closes it (click the button; click outside or press Escape to close) and puts it in the top layer, above everything; the runtime does the rest: it places the menu 4px under its button (above it when there is more room there, always inside the window), keeps `aria-expanded` in sync on every button that opens it (a menu with several buttons opens under the one that was used, and Escape returns focus there), focuses the first enabled item when it opens, and handles the keys: ArrowDown and ArrowUp move between items (wrapping), Home and End jump, ArrowDown on the closed button opens it, Tab closes it, Escape closes it and returns focus to the button. Clicking an item runs your `click` handler on it, then closes the menu (call `event.preventDefault()` in the handler to keep it open). Disabled items are skipped.

```js
document.getElementById('layer-menu').addEventListener('click', (event) => {
  const item = event.target.closest('.kit-menu-item');
  if (!item || item.getAttribute('aria-disabled') === 'true') return;
  parent.postMessage({ pluginMessage: { type: 'layer-action', action: item.textContent } }, '*');
});
```

The look: a `bg` surface with `--kit-shadow-menu`, radius 13px and 8px padding; 24px items with a 5px radius and 8px side padding; a 1px `border` separator with 8px above and below; at least 120px wide, and never wider or taller than the window minus 16px (it scrolls). The trigger can be any `kit-button` or a `kit-icon-button`, which shows the selected look while open.

| State | Look | Written as |
|---|---|---|
| Closed | only the trigger | |
| Open | the menu, placed by the runtime | (popover; the runtime sets `aria-expanded="true"` on the trigger) |
| Item hover | `bg-brand` fill, `text-onbrand` | |
| Item focus | the same as hover (keyboard focus) | |
| Item pressed | none: the item acts and the menu closes | |
| Item disabled | `text-disabled`, no highlight, skipped by the keys | `disabled`, or `aria-disabled="true"` (focusable by pointer, still clicks: check it in your handler) |

Do:
- Use it for commands. A value the person picks from a list is a [select](#select).
- Give the menu a name (`aria-label`, or `aria-labelledby` pointing at its button) and every item `role="menuitem"`.

Don't:
- Put fields, checkboxes or nested menus in it; they aren't supported.
- Expect UI3's dark menus: Figma draws its own menus dark in both themes, which needs literal colours. The kit's menu is light in the light theme and dark in the dark one ([tokens.md](tokens.md#ui3s-dark-menus-are-not-reproducible)).

In Windows High Contrast, where fills disappear, the highlighted item gets an outline instead.

## Dialog

```html
<button class="kit-button kit-button-secondary" type="button" data-kit-dialog-open="rename">Rename layers…</button>

<dialog class="kit-dialog" id="rename" aria-labelledby="rename-title">
  <header class="kit-dialog-header">
    <h2 id="rename-title">Rename layers</h2>
    <button class="kit-icon-button" type="button" data-kit-dialog-close aria-label="Close"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-linecap="round"/></svg></button>
  </header>
  <div class="kit-dialog-body kit-stack">
    <div class="kit-field"><label class="kit-label" for="prefix">Prefix</label><input class="kit-input" id="prefix" type="text"></div>
  </div>
  <footer class="kit-dialog-footer">
    <button class="kit-button kit-button-secondary" type="button" data-kit-dialog-close value="cancel">Cancel</button>
    <button class="kit-button kit-button-primary" type="button" data-kit-dialog-close value="rename">Rename</button>
  </footer>
</dialog>
```

```js
const choice = await kit.dialog('rename'); // 'rename', 'cancel', or '' (Escape, the close button, a backdrop click)
if (choice === 'rename') parent.postMessage({ pluginMessage: { type: 'rename', prefix: prefix.value } }, '*');
```

A modal dialog, the kit's second stateful component. The browser's `showModal()` does the modal part: the dialog goes to the top layer, above everything (the resize handle too), the rest of the page becomes inert, Tab and Shift+Tab move through the dialog's controls and never reach the page behind it, Escape closes it, and focus goes back to the element that had it before. The runtime adds the rest:

- **Opening**: any element with `data-kit-dialog-open="ID"` (one delegated click listener), or `kit.dialog(id)` / `kit.dialog(element)` from your script. An opener acts after your own click handlers, so `event.preventDefault()` in one of them cancels the opening. `kit.dialog()` returns a promise for the dialog's `returnValue`. It rejects with a `TypeError` when the id names no `<dialog>`; an opener with a wrong id logs one `[kit]` warning instead. Called on a dialog that is already open, it returns a promise for the same close. A promise settles only when the dialog has closed: if your code closes a dialog and opens it again in one go, the promises from both opens settle at the next close, with that close's value. Calling `kit.dialog()` from a menu item's `click` handler is fine: the runtime closes the menu first, so focus goes back to the menu's button when the dialog closes.
- **Closing**: a `[data-kit-dialog-close]` button closes the dialog with its `value` attribute (`''` without one), also after your click handlers, so `event.preventDefault()` keeps the dialog open (to show a validation error, say). Escape resolves `''`: the runtime clears `returnValue` on every open, so an earlier button's value never leaks into a later Escape. Openers and close buttons with `aria-disabled="true"` do nothing.
- **The backdrop**: clicks on it are ignored, unless the dialog has `data-kit-dialog-light-dismiss`; then a click outside the dialog's box closes it with `''`. Keep light dismiss for dialogs with nothing to lose (no typed input): a drag that starts in a field and ends on the backdrop counts as a backdrop click.
- **First focus**: the element with `autofocus` if there is one; else the first element in `.kit-dialog-body` that takes focus (an enabled input, select, textarea or button, a link, or an element with a `tabindex` of 0 or more; a hidden one is passed over); else the close button.
- **Tab at the edges**: past the dialog's last control (or before its first), the browser may move focus out of the plugin's frame into Figma's own UI, as it does for any iframe; the dialog stays open, and Shift+Tab or a click brings focus back. Nothing in the page behind the dialog takes focus.
- **Nested**: an opener inside an open dialog opens a second modal on top. Escape closes the top one, and focus goes back one step at a time.
- **The window**: it is not resized for a dialog (the top layer changes no layout, so a `fit-content` window does not refit). A dialog taller than the window scrolls inside itself (at most the window height minus 16px), with its header and footer staying in view; it is never wider than the window minus 16px.

The look, measured from UI3: a `bg` surface with radius 13px (`--kit-radius-large`), `--kit-shadow-dialog` (elevation 500) and no border, over a `--kit-scrim` backdrop (black at 50%). It is 352px wide; `kit-dialog-small` makes it 288px, `kit-dialog-large` 448px. The 40px header has the title (11px on 16px, weight 550, cut with an ellipsis) and its close button, padded 16px on the left and 8px on the right like a [section header](#section-header), with a 1px `border` line below. The body has 16px padding (8px at the bottom); the footer's buttons sit at the end, 8px apart, with 8px above and 16px around.

| State | Look | Written as |
|---|---|---|
| Closed | only the opener | `<dialog>` without `open` |
| Open | the dialog in the top layer, over the scrim | `kit.dialog()` or an opener (never the `open` attribute: that is a non-modal dialog) |
| Close button hover, focus, pressed | the icon button's own states | |
| Field focus | the field's focus ring; the first field has focus when the dialog opens | |
| Disabled action | a disabled footer button | `disabled` on the button |
| Small, large | 288px or 448px wide | `kit-dialog-small`, `kit-dialog-large` |

Do:
- Name it: `aria-labelledby` pointing at its `<h2>`.
- Keep one primary button, and put a destructive choice in `kit-button-danger`.
- Read the result from the promise, or from the dialog's `close` event and its `returnValue`.

Don't:
- Open it with the `open` attribute or `show()`: that dialog is not modal, and the runtime's promise and focus rules don't apply.
- Use `<form method="dialog">`: the kit uses no `<form>` ([pitfalls.md](pitfalls.md#17-smaller-traps)).
- Put a dialog inside a menu.

In Windows High Contrast the dialog gets a 1px outline, because its shadow disappears.

## Toast

```js
kit.toast('Renamed 3 layers', { tone: 'success' });
const undo = kit.toast('Deleted 2 layers', { duration: 0, action: { label: 'Undo', onClick: () => parent.postMessage({ pluginMessage: { type: 'undo' } }, '*') } });
undo.dismiss(); // take it away early (also while it is still queued)
```

A short message at the bottom of the window, the kit's third stateful component. There is no markup to write: `kit.toast(message, { tone, duration, action })` builds it and returns `{ dismiss() }`. Types: `KitToastOptions` and `KitToastHandle` in `kit.d.ts`.

- **Queue**: one toast shows at a time, first in, first out. `duration` is how long it stays, in milliseconds (default 4000). `0` keeps it until it is dismissed, and so does a value too large for a timer (`Infinity`); a negative one falls back to 4000. The timer pauses while the pointer is on the toast or focus is inside it, then goes on with the time that was left.
- **Dismissing**: the close button, which is named by `CONFIG.strings.dismiss` (default "Dismiss"; translate it with `data-kit-config` `{"strings": {"dismiss": "…"}}`, [window-chrome.md](window-chrome.md#customising-config)); Escape while focus is inside the toast (your own Escape handler does not see that key, and a dialog the toast sits in stays open); the action button, whose `onClick` runs first; or `handle.dismiss()`, which is safe to call twice. If focus was inside the toast (Tab reaches its buttons), it goes back to where it came from, so a keyboard user doesn't lose their place.
- **Where**: in a `div.kit-toast-region` with `aria-live="polite"`, created at the first toast, fixed at the bottom centre 8px from the edge, above the resize handle (`--kit-z-toast` 11 over `--kit-z-handle` 10), and at most the window width minus 16px; while the window chrome is on, minus 64px, so a wide toast stays clear of the resize handle in the corner. While a modal dialog is open the region moves into it (into the top one when dialogs are nested), because everything outside a modal dialog is inert (hidden from screen readers and unclickable), and back to `<body>` when the dialog closes.
- **Announcements**: the polite region reads each toast when it shows; a `danger` toast has `role="alert"` and is read at once. The first toast waits 100ms after the region is created, because a live region only announces changes made after it exists.
- **The message is text**: it is set with `textContent`, so HTML in it shows as written. So is the action's label.
- **It stays clear of a footer**: the region sits 8px above the bottom of the window, or 48px when the page has a [sticky footer](#sticky-footer), so a toast never covers the footer's buttons (`e2e/toast.spec.mjs` checks it). It does cover the content just above, so keep `duration: 0` for a toast whose action the person needs (Undo), and dismiss it from your code when they move on.

The look: `bg-inverse` with `text-oninverse`, like the [tooltip](#tooltip) (dark in the light theme, light in the dark theme), radius 5px, at least 32px tall, 8px side padding, `--kit-shadow-tooltip`. A tone adds a leading icon, told apart by its shape as well as its colour: `info` an "i" in a circle and `warning` a "!" in a triangle, both in `icon-oninverse`; `success` a check in a circle, in `bg-success`; `danger` a "!" in a circle, in `bg-danger`. Without a tone there is no icon. The success and danger icons take the solid fills, not `icon-success` and `icon-danger`: on the palette captured in Figma (126.9.13, 2026-10-14) those are light tints in the dark theme and fall to 1.75:1 and 1.94:1 on the white toast, while `bg-success` (4.81:1 light, 4.13:1 dark, 4.81:1 FigJam) and `bg-danger` (3.81:1, 4.31:1, 3.81:1) keep 3:1 in every captured palette. `icon-brand` and `icon-warning` are not used on the inverse surface either: they fall below 3:1 in the dark theme (`icon-brand` 3.30:1 light, 1.89:1 dark; `icon-warning` 3.18:1 light, 1.47:1 dark; [accessibility.md](accessibility.md#toast-icons-on-the-inverse-surface)). A toast slides up 8px and fades in over 200ms, and simply appears with `prefers-reduced-motion: reduce`.

| State | Look |
|---|---|
| Shown | the toast in the region |
| Action hover, pressed | a fill mixed from the text colour, light on the dark toast and dark on the light one |
| Close button focus | the focus ring; the timer waits |
| Disabled | none: a toast that cannot act is plain text |
| Danger | the danger icon; `role="alert"` |

Do:
- Keep the message short: one line in a 320px window.
- Announce results ("Renamed 3 layers"), not progress, and give a toast one action at most.
- Use `figma.notify()` from `code.ts` instead when the window may be hidden or about to close.

Don't:
- Use a toast for an error the person must fix: put it in the field's `.kit-help` with `aria-invalid`.
- Stack toasts to show progress, or put links or fields in the message.

In Windows High Contrast a toast gets a 1px outline, and its tone icon takes the toast's text colour, so the tones differ by the icon's shape and the words.

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
| `kit-row` | Row with 8px gaps, vertically centred, wrapping. | Fields, inputs, selects, number and colour fields in a row share the width equally and shrink; buttons keep their width and wrap onto a new line when the window is too narrow. |
| `kit-field` | Column: `kit-label`, control, optional `kit-help`, 4px apart. | The label dims when the control is disabled; the help text turns to danger when the control has `aria-invalid="true"`. |
| `kit-label` | Field label: secondary text, regular weight (as in UI3). | Use a `<label for>`. |
| `kit-help` | Help or error text under a control. | Give it an `id` and point the control's `aria-describedby` at it. Only for text a control points at: the audit's `orphan-help` rule warns about a `.kit-help` no `aria-describedby` names. |
| `kit-heading` | Panel title: 11px on 16px, weight 550. | Use a real `<h1>`/`<h2>`/`<h3>`; the browser's margins and sizes are reset. |
| `kit-text-secondary` | Secondary text colour, no margins. | For status lines, descriptions and meta text that no control points at. Since 0.3.0 it resets margins, like `kit-help`, so a `<p class="kit-text-secondary">` lines up the same. |
| `kit-scroll` | A region with its own maximum height (`--kit-scroll-max-height`, default 240px) that scrolls. | For long lists in a `fit-content` window: see [Long lists](#long-lists-kit-scroll). |
| `kit-visually-hidden` | Hidden on screen, still read by screen readers. | For labels the design has no room for. |
| `kit-icon`, `kit-icon-small` | 24×24 and 16×16 icon frames. | Use an inline `<svg viewBox="0 0 24 24">` (or `0 0 16 16`) with `currentColor` and `aria-hidden="true"`. |

### Long lists: kit-scroll

A `fit-content` window grows with its content up to its maximum height (900px by default); a list of 200 layers would make the whole window scroll and push a [sticky footer](#sticky-footer)'s actions out of view until the person scrolls to the end. Put the list in a `.kit-scroll` region instead: it scrolls on its own, and the window stays as tall as everything else plus the region.

```html
<main class="kit-app" data-kit-root>
  <div class="kit-section kit-stack">
    <h1 class="kit-heading">Variables</h1>
    <div class="kit-scroll" tabindex="0" role="region" aria-label="Variables">
      <ul class="kit-list">
        <li class="kit-list-row"><span class="kit-list-row-label">color/brand</span></li>
        …
      </ul>
    </div>
  </div>
  <footer class="kit-footer">…</footer>
</main>
```

- **Height**: 240px by default (seven 32px rows and a half, so it is clear there is more). Set `--kit-scroll-max-height` on the region, or on a parent, in your own CSS: `.layers { --kit-scroll-max-height: 320px; }`.
- **Keyboard**: a region whose content takes no focus (static `<li>` rows) needs `tabindex="0"`, a `role="region"` and an `aria-label`, so keyboard users can reach and scroll it; it then shows the usual 1px focus ring. With button rows, Tab moves through the rows and scrolls them into view, so leave `tabindex` off.
- **Don't** set a fixed `height` on it, or nest one `.kit-scroll` in another. A `resizable` window doesn't need it: the whole window scrolls under its footer there.

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
- **Don't recolour kit components** or set their private custom properties (`--kit-button-*`, `--kit-list-*`, `--kit-notice-icon`, `--kit-mark`, `--kit-mark-color`); pick another variant or tone instead. They are not part of the API and may change.

Run `npm run audit` after every change; [pitfalls.md](pitfalls.md) explains each rule it reports.

## Implementation notes

The components block keeps no comments beyond its header and one `/* == name == */` marker per component. These notes explain the CSS behind the components above: read them before you change the block (in a fork, or in a pull request). Order matters in several places, so keep rules where they are.

- **Base.** `[hidden]` gets `display: none !important`: the runtime toggles `hidden` on the resize handle, and without `!important` a kit `display` rule would undo it. Buttons, inputs, selects and textareas get `font: inherit`, because form controls don't inherit type and would fall back to the browser's 13px.
- **Layout.** `.kit-app` is `display: flow-root`, so its last child's bottom margin stays inside the root and the runtime's fit counts it. In a `.kit-row`, fields, inputs, selects, number and colour fields share the width and may shrink (`flex: 1 1 0; min-width: 0`); buttons keep their width and wrap.
- **Button.** Variants and states only change private custom properties (`--kit-button-bg`, `-bg-hover`, `-bg-pressed`, `-text`, `-ring`); one rule paints them, for `.kit-icon-button` too. The ring is an inset `outline`, not a border, so recolouring it never moves the label. The disabled rules repaint the background themselves and come after `:hover` and `:active`, so disabled wins by source order alone. The loading spinner is sized with `aspect-ratio`, so the only heights on button rules stay 24 and 32px (the audit's `control-height` rule); with reduced motion it is a still ring.
- **Text input and textarea.** One set of rules serves both; only the height differs. The placeholder sets `opacity: 1` because Firefox fades placeholders on top of the token. The focus rule comes after the error and disabled rules, so an invalid or `aria-disabled` field still shows where focus is; the error stays visible in the red help text. The search field's clear button is hidden because no token colours it. The icon fills the 24px start slot and ignores the pointer, so clicks reach the input. A colour field rings its hex input while the pointer is anywhere on the field, swatch included (`:where(.kit-color:hover) > .kit-input`).
- **Select.** The `.kit-select` wrapper exists because a `<select>` cannot draw `::after`. `option` and `optgroup` get `bg` and `text` because Windows and Linux paint the open list from them; without that, dark mode can show light text on a light list. The caret is two borders of a rotated square in the 24px end slot: no image, and forced colours keep it.
- **Resize handle.** The grip is the two diagonal lines (`::before`, `::after`) of a resizable textarea. `touch-action: none` lets pen and touch drags reach the pointer handlers. The root's 24px grip padding (only while `html[data-kit-chrome="on"]`) drops to 8px when the root ends with a `.kit-section`, which already pads 16px, and to 0 when it ends with a [sticky footer](#sticky-footer), which keeps its right side clear instead.
- **Checkbox and radio.** The native input is drawn with `appearance: none` as a 16px box. The mark is a `mask`: an inline SVG `data:` URL supplies only the shape, and `--kit-mark-color`, set from a token per state, supplies the colour, so it follows every theme (the audit ignores `url()` contents). Hover previews the mark faintly in `icon-tertiary`, as UI3 does. In forced colours the box goes back to `appearance: auto` and the mask is dropped.
- **Number field.** The spin buttons are hidden because no token colours them; the arrow keys still step.
- **List.** The disabled row rule ends in `:is(*, :hover)` only to raise its specificity above `button.kit-list-row:hover`, so a disabled row never highlights.
- **Tabs.** Panel N is hidden unless the tab list's Nth radio is checked: one `:has()` selector per panel, six in all.
- **Tooltip.** A hidden tooltip is `scale: 0` and `visibility: hidden`, so it never widens or lengthens the page. The hover delay is a `transition-delay` on `visibility` (keyboard focus shows it at once), and its `::before` reaches 4px past the tooltip so the pointer can cross the gap from the control without losing it (WCAG 1.4.13, "hoverable").
- **Tooltip, Escape (since 0.4.0).** The menus' capture `keydown` listener on `document` also handles it, so there is no new `document` listener. On Escape it marks every `.kit-tooltip-host` that matches `:hover` or `:has(:focus-visible)` (exactly when its tooltip shows) with `data-kit-tooltip-dismissed`, and gives that host two listeners, `pointerleave` and `focusout`, under one `AbortController`. They remove the attribute, and themselves, once the pointer has left with no keyboard focus inside, or focus has moved outside the host while the pointer isn't over it. The hiding rule comes after the two showing rules with the same specificity, and sets `transition: none`, so the tooltip hides at once; when the attribute goes under a resting pointer, the usual hover delay applies. The runtime never calls `preventDefault()` or `stopPropagation()` for it. Since 0.4.0 the capture `keydown` listener is added with or without the popover API; without it, the listener does only this (the menu keys need popovers). `e2e/components.spec.mjs` covers hover, keyboard focus, the leave listeners, a host Escape handler and a tooltip inside a modal dialog.
- **Menu.** `position: fixed; inset: auto; margin: 0` cancels the browser's centring of popovers; the runtime sets `left` and `top` ([window-chrome.md](window-chrome.md#implementation-notes), Menus).
- **Sticky footer.** `:root:has(.kit-footer)` sets `scroll-padding-bottom: 40px`, so Tab never scrolls a field under the bar.
- **Dialog.** `.kit-dialog` shares the panel surface rule with `.kit-menu` (no border, radius 13px, `bg` and `text`, never larger than the window minus 16px, `overflow: auto`) and its header rules with `.kit-section-header`. The header and the footer are `position: sticky` with a `bg` fill and `z-index: 1`: kit buttons are `position: relative` and would otherwise paint over a scrolled header. `::backdrop` reads `var(--kit-scrim)`, but `::backdrop` inherits custom properties from its dialog only in newer engines (Chromium 122 and later, as far as is known; checked on Chromium 151); an older one shows no scrim, and the dialog is still modal.
- **Dialog, runtime.** `kit.dialog()` sets `returnValue = ''` and calls `showModal()` inside the promise's executor, so a throw rejects the promise, and listens once for `close`. The browser dispatches `close` a task after `close()`, so a close event can arrive after host code has opened the dialog again; the listener ignores a `close` that finds the dialog open and waits for the next one. Without an `[autofocus]` it tries the body's focusable elements in order and stops at the first that takes focus (a `hidden` field doesn't): `showModal()` has already focused the first focusable element, the close button, which keeps focus when nothing in the body takes it. Focus return is the browser's (a dialog gives focus back to the element focused before it opened). That is why `kit.dialog()` first hides an open menu: `hidePopover()` gives focus back to the menu's button, and `showModal()` then records the button; left to `showModal()`, the menu would close with focus on its hidden item, and focus would end on `<body>`. Openers, close buttons and light dismiss share the menu's capture `click` listener on `document` and act in a `setTimeout(0)`, after every click handler, so `preventDefault()` cancels them, as for menu items. Light dismiss checks that the click's target is the dialog itself and that the point is outside its box (a click on the dialog's own padding or scrollbar is inside). Since 0.4.0 the `click` and `keydown` listeners are added with or without the popover API, and only their menu parts need it, so openers, close buttons and a tooltip's Escape work without it; `beforetoggle`, `toggle` and `scroll` are still added only where popovers exist.
- **Toast.** `.kit-toast` shares the inverse surface with `.kit-tooltip` and the text rule with `.kit-notice-text`. Figma has no hover token for the inverse surface, so the buttons in a toast set `--kit-button-bg-hover` (and pressed) to `color-mix(in srgb, currentColor 16%, transparent)`: their own `text-oninverse` at 16%, a colour derived from a token rather than a literal ([tokens.md](tokens.md#the-colour-rule-and-its-only-exceptions)). The close button keeps `text-oninverse` under the pointer; as an icon button it would turn `icon-hover`, which disappears on the inverse surface. The slide is applied only under `prefers-reduced-motion: no-preference`.
- **Toast, runtime.** One queue of `show` functions and one shown toast. Each toast builds its fixed parts with `innerHTML` and sets the message, the action's label and the close button's `aria-label` with `textContent` and `setAttribute`, so no HTML from the host is ever parsed. Its six listeners (`mouseenter`, `mouseleave`, `focusin`, `focusout`, `keydown`, `click`) sit on the toast element under one `AbortController`, which `dismiss()` aborts, clearing the timer too. The timer keeps the time left across pauses. `focusin` remembers where focus came from (its `relatedTarget`, when that is outside the toast), and `dismiss()` focuses that element again before it removes a toast that holds focus; otherwise focus would fall to `<body>` and the next Tab would start from the top. `placeToasts()` puts the region in the modal dialog that holds focus, else the dialog `kit.dialog()` opened last that is still modal (the top one: the top layer's order is not exposed, and the first `dialog:modal` in document order may be a lower, inert one), else the first open modal dialog, else `<body>`; it runs when a toast shows and when a kit dialog opens or closes. While the chrome is on, the region's `max-width` keeps 32px free on each side, which clears the 24px handle.
- **Listener budget.** Dialogs, toasts and the tooltips' Escape add no `document`, `window` or handle listeners: the baseline stays the five capture listeners on `document` from startup (`e2e/menu.spec.mjs` counts them, [window-chrome.md](window-chrome.md#gestures-and-keys)); in a browser without the popover API there are two (`keydown` and `click`). An open dialog holds one `close` listener until it closes; a toast's listeners go with it; a dismissed tooltip's host holds two until it clears.
- **Forced colours.** High-contrast modes drop fills and shadows, so selected list rows and the highlighted menu item get an outline instead, and dialogs and toasts a 1px outline around them. Every `.kit-icon` gets `color: inherit !important` there: an SVG keeps a `color` the kit gives it (SVG defaults to `forced-color-adjust: preserve-parent-color`), so a toast's info icon stayed white on a white toast, while inheriting takes the forced colour of what the icon sits in (`GrayText` in a disabled button).
