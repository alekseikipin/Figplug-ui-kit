# UI3 mapping

Which kit markup to write for each component of Figma's official UI3 kit, so a frame designed with that kit (or one that only looks like UI3) becomes `ui.html` markup without guessing. The [`kit-frame-to-markup` skill](../.claude/skills/kit-frame-to-markup/SKILL.md) reads a frame through the Figma MCP server and uses this page to translate it; you can use the tables by hand too.

**Status (2026-10-14): the UI3 component names are UNVERIFIED.** The Figma MCP tools only open files with a `/design/` link, and the Community file is not in the account's libraries (searched 2026-10-14), so the file's own component names, pages and variant properties have not been read. The left column is built from what the research could read: the two maintained UI3 replicas (figma-kit and FigUI3) and the class names in Figma's production CSS (`raw_components--label`, `basic_form--btn` ...), the sources listed under [Measured metrics](tokens.md#measured-metrics) as FK, FUI3 and FAPP. Read every name in it as *name to verify against the Community file*. The kit columns are checked against the kit 0.4.0 files. [Finish the verification](#finish-the-verification) says how to replace the guesses.

**Attribution.** This page refers to [UI3: Figma's UI Kit](https://www.figma.com/community/file/1486123838948777078/ui3-figmas-ui-kit) by Figma, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([Figma Community copyright and licensing](https://help.figma.com/hc/en-us/articles/360042296374-Figma-Community-copyright-and-licensing)). The kit copies no artwork, icons or components from the file: this page only names its components, and the kit's values were measured from other sources ([tokens.md](tokens.md#measured-metrics)).

## How to read the tables

- **One class set per UI3 component.** The kit markup column is the whole answer: element, classes and required attributes. Every class is defined in [components.md](components.md); never invent a `kit-*` class.
- **Variants become classes, states become attributes.** A variant that changes the look (primary or secondary, a tone) is a class or `data-kit-tone`; a state (disabled, selected, error) is the HTML or ARIA attribute that already means it ([States are attributes](components.md#states-are-attributes)). Hover, pressed and focus come from the browser and need nothing.
- **Values never cross over.** Hex colours, pixel heights and paddings from the design are not copied: the classes already carry UI3's measured values, and colours are Figma's injected tokens ([tokens.md](tokens.md#role--token-cheat-sheet)).

### Variant properties to attributes

The usual Figma property names, as guesses; the per-component rows below say where a component differs.

| UI3 variant property (name to verify) | Kit |
|---|---|
| `State=Default` (or Rest, Enabled) | nothing |
| `State=Hover`, `State=Pressed` (or Active) | nothing: `:hover`, `:active` |
| `State=Focus` (or Focused) | nothing: `:focus-visible` (text fields: `:focus`) |
| `State=Disabled` | `disabled` (`aria-disabled="true"` only when it must stay focusable) |
| `Selected=True`, `State=Selected`, `On=True` (toggle buttons) | `aria-pressed="true"` |
| `State=Error` (or Invalid) | `aria-invalid="true"` + `aria-describedby` pointing at the `.kit-help` |
| `Loading=True` | `aria-busy="true"` (buttons) |
| `Checked=True` / `Checked=Mixed` (or Indeterminate) | `checked` / `input.indeterminate = true` in your script |
| `Open=True` (menu triggers, dialogs) | nothing: the runtime sets a menu trigger's `aria-expanded`; a dialog is opened by its trigger (`data-kit-dialog-open`) or `kit.dialog()`, never by the `open` attribute |
| `Size=Default` / `Size=Large` | nothing / `kit-button-large` (buttons only) |
| `Theme=Light` / `Theme=Dark` | nothing: Figma's injected tokens switch the theme |

## Layout

| UI3 component / variant (name to verify) | Kit markup | State mapping | Notes |
|---|---|---|---|
| Panel (the whole properties panel or plugin view) | `<main class="kit-app" data-kit-root>` | none | One per window. The resize handle goes after `</main>` ([resize handle](components.md#resize-handle)). Never give it a height. |
| Panel section | `<section class="kit-section">` (often `kit-section kit-stack`) | none | 16px padding. FAPP's panel rows pad 16px left and 8px right; the kit's section pads 16px all round. |
| Section divider | `<hr class="kit-divider">` | none | 1px `border` line between sections. |
| Panel section header (title, then icon buttons) | `<header class="kit-section-header"><h2>Title</h2> ...icon buttons</header>`, then its `.kit-section` | the icon buttons' own | 40px, padding 16px left / 8px right. Seen as FAPP `raw_components--panelTitle`, FUI3 `fig-header`. The panel header's exact height is Medium confidence ([tokens.md](tokens.md#measured-metrics)). |
| Panel title (text only) | `<h1 class="kit-heading">` (or `h2`, `h3`) | none | 11px on 16px, weight 550. |
| Property row: label beside one or more controls, 32px | `<div class="kit-row">` holding a `label.kit-label` and the control(s), inside a `.kit-section` | the controls' own | There is no 32px row class and no label grid: [PLAN.md](../PLAN.md#8-explicit-non-goals-and-rejected-ideas) rejects a property-row component. Seen as FAPP `ui3_grid_rows--row` (32px, 16px / 8px padding). |
| Two-line row: label above the control | `<div class="kit-field">` > `label.kit-label` + control + optional `p.kit-help` | `disabled` on the control dims the label; `aria-invalid` turns the help red | Seen as FAPP `ui3_grid_rows--oneInputRow`, FUI3 `fig-field direction="vertical"`. |
| Label | `<label class="kit-label" for="...">` | label disabled: put `disabled` on its control | Secondary text, regular weight. Seen as FAPP `raw_components--label`, `labelDisabled`. |
| Help or description under a control | `<p class="kit-help" id="...">` + the control's `aria-describedby` | error: `aria-invalid="true"` on the control | Only for text a control points at; any other secondary text is `.kit-text-secondary`. |
| Secondary text, status line | `<p class="kit-text-secondary">` (`role="status"` for results) | none | |
| Auto layout, vertical / horizontal | `.kit-stack` / `.kit-row` | none | 8px gap. Another gap is host CSS with a `--kit-spacer-*` token ([Spacing, radius and effects](#spacing-radius-and-effects)). |
| Scroll area | `<div class="kit-scroll">` (`tabindex="0" role="region" aria-label` when its rows take no focus) | none | For long lists in a `fit-content` window ([Long lists](components.md#long-lists-kit-scroll)). |
| Icon, 24 or 16 | `<svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true">` / `kit-icon kit-icon-small` with `viewBox="0 0 16 16"` | none | Inline SVG painted with `currentColor`, never an `<img>` or a remote URL. Copying a UI3 icon's path reuses the file's CC BY content: credit the file in your plugin (whether its icons carry other terms is UNVERIFIED). |

## Components

The kit's cap is 20 components ([PLAN.md](../PLAN.md#7-component-and-token-inventory-target)), and kit 0.4.0 has all 20: the dialog and the toast joined in Phase 3.

| UI3 component / variant (name to verify) | Kit markup | State mapping | Notes |
|---|---|---|---|
| Button: Primary, Secondary, Tertiary (or Ghost, Text), Destructive (or Danger) | `<button class="kit-button kit-button-primary" type="button">`, or `kit-button-secondary`, `-tertiary`, `-danger` | `Variant=` → the class; `Size=Large` → `kit-button-large`; `Selected=True` → `aria-pressed="true"` (not on primary or danger); `Loading=True` → `aria-busy="true"`; `State=Disabled` → `disabled` | Always `type="button"`. A leading icon is an `svg.kit-icon` first in the button; a trailing one needs the label in a `<span>`. Seen as FAPP `basic_form--btn`, `primaryBtn`, `negativeBtn`, `btnBig`; FK `button`; FUI3 `fig-button variant=...`. Inverse and success buttons have no kit variant ([below](#ui3-parts-with-no-kit-equivalent)). [Button](components.md#button) |
| Icon button | `<button class="kit-icon-button" type="button" aria-label="...">` + one `svg.kit-icon` | `Selected=True` → `aria-pressed="true"`; `Open=True` → nothing (runtime `aria-expanded`); `State=Disabled` → `disabled` | 24×24 only: a 32px icon button has no kit size. A dialog's close X is an icon button with `aria-label="Close"` and `data-kit-dialog-close`. Seen as FAPP `raw_components--_iconButton`, `iconButtonSelected`, `close_button--closeX`; FK `icon-button`. [Icon button](components.md#icon-button) |
| Text input | `<div class="kit-field">` > `label.kit-label` + `<input class="kit-input" type="text">` | `State=Error` → `aria-invalid="true"` + `aria-describedby`; `State=Disabled` → `disabled`; placeholder text → `placeholder` | 24px. A 32px (large) input has no kit size. Seen as FAPP `basic_form--textInput`, `raw_components--input`; FK `input`; FUI3 `fig-input-text`. [Text input](components.md#text-input) |
| Text input with icon, search field | `<div class="kit-input-icon">` > `svg.kit-icon` + `input.kit-input` (`type="search"` for search) | as text input | The icon slot ignores the pointer: no buttons inside. [Text input](components.md#text-input) |
| Textarea (multi-line input) | `<textarea class="kit-textarea" rows="4">` in a `.kit-field` | as text input | Height comes from `rows`, never `height`; no resize grip. Seen as FAPP `raw_components--textAreaInput`; FK `textarea`; FUI3 `fig-input-text multiline`. [Textarea](components.md#textarea) |
| Number or value field (W, H, X, Y, rotation; label or icon slot) | `<div class="kit-number">` > `span.kit-number-prefix[aria-hidden="true"]` + `<input class="kit-input" type="number">` | as text input | No scrubbing (drag on the prefix) and no unit suffix: put the unit in the label or the prefix. Two or more side by side (W and H): a `.kit-row` of `.kit-number` fields. Seen as FK `value-field`, FAPP `raw_components--multiValueInput`, FUI3 `fig-input-number`. [Number field](components.md#number-field) |
| Colour or fill row (swatch + hex) | `<div class="kit-color">` > `input.kit-color-swatch[type="color"][aria-label]` + `input.kit-input` | as text input, on the hex input; `disabled` on both inputs | The swatch opens the system colour picker, not UI3's (whether Figma's desktop app opens it is UNVERIFIED). Opacity: a `.kit-number` beside it in a `.kit-row`; no combined field. Seen as FUI3 `fig-input-color`, `fig-input-fill`. [Colour field](components.md#colour-field) |
| Select or dropdown (closed trigger with chevron) | `<div class="kit-select"><select>` + `<option>`s `</select></div>` | `State=Error` and `State=Disabled` → on the `<select>`, not the wrapper | The open list is the operating system's popup, not UI3's dark menu. Option icons and descriptions can't be shown. Seen as FAPP `raw_components--chevron`, `selectHiddenInput`; FK `select`; FUI3 `fig-dropdown`. [Select](components.md#select) |
| Checkbox | `<label class="kit-checkbox"><input type="checkbox">Label</label>` | `Checked=True` → `checked`; `Checked=Mixed` → `input.indeterminate = true`; `State=Disabled` → `disabled`; `State=Error` → `aria-invalid` + `aria-describedby` | 16px box in a 24px row. Seen as FAPP `base--check`; FK `checkbox`; FUI3 `fig-checkbox`. [Checkbox](components.md#checkbox) |
| Radio, radio group | `<div class="kit-stack" role="radiogroup" aria-labelledby="...">` of `<label class="kit-radio"><input type="radio" name="...">Label</label>` | `Checked=True` → `checked`; `State=Disabled` → `disabled` | The kit's checked look is a brand fill with a light dot (FK draws a dark ring; Medium confidence). Seen as FK `radio-group`, FUI3 `fig-radio`. [Radio](components.md#radio) |
| Tabs | `<div class="kit-tabs">` > `div.kit-tablist[role="radiogroup"][aria-label]` of `<label class="kit-tab"><input type="radio" name="..." checked>Tab</label>`, then one panel `div` per tab | `Selected=True` (or `State=Active`) → `checked` on that tab's radio; `State=Disabled` → `disabled` on the radio | CSS only, up to six tabs; screen readers hear a radio group. Seen as FK `tabs`; FUI3 `fig-tabs`, `fig-tab`. [Tabs](components.md#tabs) |
| Tooltip | `<span class="kit-tooltip-host">` > the control (with `aria-describedby`) + `<span class="kit-tooltip" role="tooltip" id="...">` | `Position=` or `Placement=` → `kit-tooltip-start`, `kit-tooltip-end` or `kit-tooltip-above` (default: centred below) | `bg-inverse` in the kit: dark in the light theme only, where UI3 is dark in both ([why](tokens.md#ui3s-dark-menus-are-not-reproducible)). No arrow, no shortcut text. Seen as FAPP `tooltip--content`; FK `tooltip`; FUI3 `fig-tooltip`. [Tooltip](components.md#tooltip) |
| Menu, dropdown menu (commands) | trigger `<button ... popovertarget="m" aria-haspopup="menu" aria-expanded="false">` + `<div class="kit-menu" id="m" popover role="menu" aria-label="...">` of `<button class="kit-menu-item" role="menuitem" type="button">` and `<hr class="kit-menu-separator">` | `State=Disabled` on an item → `disabled`; item hover and highlight → nothing | Light in the light theme and dark in the dark one, not UI3's always-dark menu. No submenus, check items, shortcut column or group labels. Seen as FAPP `base--dropdown`, `base--option`, `multilevel--*`; FK `dropdown-menu`, `context-menu`; FUI3 `fig-menu`. [Menu](components.md#menu) |
| List or layer row (icon, name, meta) | `<ul class="kit-list" aria-label="...">` > `li.kit-list-row` (static) or `li` > `button.kit-list-row[type="button"]` (clickable), with `kit-list-row-icon`, `kit-list-row-label`, `kit-list-row-meta` | `Selected=True` → `aria-current="true"` (button rows) or `aria-selected="true"` (`role="option"`); `State=Disabled` → `disabled` | 32px rows. No indentation, expand chevrons or secondary selection (FAPP `raw_components--rowSelectedSecondary`): host CSS for indentation. Layer-row height in the editor is unverified (Low). [List](components.md#list) |
| Empty state | `<div class="kit-empty">` > optional `svg.kit-icon` + `.kit-empty-title` + `.kit-empty-text` + optional `kit-button` | the button's own | No UI3 source found: built from UI3's spacing and type. [Empty state](components.md#empty-state) |
| Banner, callout, inline message | `<div class="kit-notice" data-kit-tone="..." role="status">` > optional `svg.kit-icon` + `p.kit-notice-text` + optional button | `Type=` or `Tone=` Info, Success, Warning, Danger (or Error) → `data-kit-tone="info"`, `"success"`, `"warning"`, `"danger"` (`role="alert"` for danger); Neutral → no tone | Not for field errors (those use `.kit-help`). Seen as FAPP `states_panel--errorStateBox`, `raw_components--propertiesPanelErrorBox`, `feature_callout--featureCallout`. [Inline notice](components.md#inline-notice) |
| Footer, action bar | `<footer class="kit-footer">` as the root's last child: `p.kit-text-secondary[role="status"]` + `div.kit-row` of buttons | the buttons' own | Sticky at the bottom; one per window. Seen as FAPP `header_modal--bottomSection`, PropsKit `fig-footer`. [Sticky footer](components.md#sticky-footer) |
| Window resize corner | `<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window">` | none: the runtime shows and hides it | No UI3 counterpart expected: it is the kit's window chrome. Leave it as the only element after `</main>`. [Resize handle](components.md#resize-handle) |
| Dialog, modal (40px header with close X, body, actions) | `<dialog class="kit-dialog" id="d" aria-labelledby="d-title">` > `header.kit-dialog-header` (`<h2 id="d-title">` + `button.kit-icon-button[data-kit-dialog-close][aria-label="Close"]`) + `div.kit-dialog-body` + `footer.kit-dialog-footer` of `kit-button`s with `data-kit-dialog-close` and a `value`; inside `[data-kit-root]`, after the content. Its trigger gets `data-kit-dialog-open="d"`, or the script calls `await kit.dialog('d')` | `Size=Small` / `Size=Large` (or a 288 / 448px frame) → `kit-dialog-small` / `kit-dialog-large` (default 352px); a disabled action → `disabled` on its button; `Open=True` → nothing in the markup; closes on an outside click → `data-kit-dialog-light-dismiss` (only with nothing to lose) | Each action becomes a button `value`, and the script reads the one that closed the dialog from `kit.dialog()` (`''` after Escape or the close X). The dimmed backdrop, the shadow and the 13px radius come with the class: draw none of them. An alert dialog (FK `alert-dialog`) is the same markup with `kit-dialog-small`. A closed dialog takes no room, and an open one never resizes the window. Seen as FAPP `header_modal--modal`, `draggable_modal--frame`; FK `dialog`, `alert-dialog`. [Dialog](components.md#dialog) |
| Toast, visual bell | No markup: `kit.toast('Renamed 3 layers', { tone, duration, action })` in the UI script, when the result arrives | `Type=` or `Tone=` Info, Success, Warning, Danger (or Error) → `tone: 'info'`, `'success'`, `'warning'`, `'danger'`; Neutral → no `tone`; a button in it → `action: { label, onClick }` (one at most); a timeout → `duration` in ms (`0` until dismissed) | One at a time, at the bottom centre of the plugin window, on the inverse surface like the tooltip: dark in the light theme and light in the dark one ([why](tokens.md#ui3s-dark-menus-are-not-reproducible)). Copy the frame's message, never its position or colours. From `code.ts`, `figma.notify(message, { error, timeout, button })` (Figma's own toast, outside the window) is the alternative when the window is hidden or about to close, or the plugin has no UI. Seen as FAPP `--z-index-visual-bell` only. [Toast](components.md#toast) |

## UI3 parts with no kit equivalent

What to write instead. Report each one you hit when you translate a frame.

| UI3 component (name to verify) | Use instead | Notes |
|---|---|---|
| Switch, toggle | `label.kit-checkbox`, or a toggle button with `aria-pressed` for an action that happens at once | [PLAN.md](../PLAN.md#8-explicit-non-goals-and-rejected-ideas) rejects a switch. FK `switch`, FUI3 `fig-switch`. |
| Segmented control | A `.kit-tablist` of `.kit-tab` radios inside `.kit-tabs` with no panels (one choice of a few), or a `.kit-row` of `kit-icon-button[aria-pressed]` (icon segments, alignment) | Looks like tabs, not UI3's track with a raised item. FK `segmented-control`, FUI3 `fig-segmented-control`. |
| Slider, range | A `.kit-number` with `min` and `max` | A native `<input type="range">` has no kit styling: style it yourself with tokens, 24px tall. FK `slider`, FUI3 `fig-slider`. |
| Colour picker (the fill picker popover) | The native picker through `.kit-color`'s swatch | System UI, not Figma's; UNVERIFIED in Figma's desktop app. FK `color-picker`, FUI3 `fig-fill-picker`. |
| Combobox, autocomplete | A search field (`.kit-input-icon` + `type="search"`) above a `.kit-list` of button rows | FK `combobox`. |
| Popover (a floating panel that isn't a menu) | Show the content in the page (a section or a notice), or in a `kit-dialog` when it needs the person's full attention | `.kit-menu` is for commands only. FK `popover`. |
| Collapsible section, disclosure | A `.kit-section-header` with a `kit-icon-button[aria-expanded]` that toggles `hidden` on its section, in your script | No kit chevron or animation. FK `collapsible`. |
| Context menu (right-click) | A `.kit-menu` opened from a button | The kit's menu opens from a `popovertarget` button. |
| Submenu, menu check items, shortcut column | Flatten into the menu, or into the page | FAPP `multilevel--submenu`, `rightColumnShortcut`. |
| Inverse button, success (green) button | `kit-button-secondary` or `kit-button-primary` | FAPP `basic_form--inverseBtn`, `greenBtn`. |
| Large (32px) input, select or icon button | The 24px control | Only buttons have a large size. FAPP `basic_form--bigInput`. |
| Toolbar | A `.kit-row` of `.kit-icon-button`s | No roving arrow-key focus. FAPP `toolbar_styles--*`. |
| Tree, nested layer list | `.kit-list` rows with indentation in host CSS | No expand or collapse. |
| Variable pill, chit, badge, tag, avatar | Host CSS with tokens (`bg-tertiary`, or the `*-component` tokens for components) | FAPP `variable_pill_base--*`, `chit--chit`; FUI3 `fig-chit`, `fig-avatar`. |
| Skeleton, shimmer, standalone spinner | `aria-busy="true"` on the button that started the work, and a status line | FAPP `file_load--shimmer`; FUI3 `fig-skeleton`, `fig-spinner`. |
| Link | A plain `<a href>`: the kit already colours it `text-brand` | No class needed. |
| Image, file, gradient, joystick and other FUI3 inputs | Plain HTML with your own class names and tokens | Not UI3 panel parts the kit covers. |

## Frames without UI3 components

A frame drawn with plain layers (rectangles and text, or another library's instances) maps by what each group of layers is for, not by its pixels. Typical cues:

| Looks like | Kit |
|---|---|
| A 24 or 32px rounded box with centred text, brand fill / 1px outline / no fill / red fill | `kit-button` with `-primary` / `-secondary` / `-tertiary` / `-danger` (32px: add `kit-button-large`) |
| A 24px square holding one icon | `kit-icon-button` |
| A 24px filled box with left-aligned text or a placeholder | `kit-input` (with a leading icon: `kit-input-icon`) |
| The same, several lines tall | `kit-textarea` |
| A 24px outlined box with a chevron at the end | `kit-select` |
| A letter (W, H, X) or an icon, then a number | `kit-number` |
| A small colour square, then a hex code | `kit-color` |
| A 16px square or circle next to a text | `kit-checkbox` / `kit-radio` |
| Text labels in a row, the chosen one bold on a grey pill | `kit-tabs` |
| Rows of icon + name (+ value at the end) | `kit-list` |
| A 1px full-width line | `kit-divider` |
| A bold title with icons at the right, at the top of a block | `kit-section-header` |
| A tinted box with an icon and a sentence | `kit-notice` with a tone |
| An icon, a title and a sentence centred in an empty area | `kit-empty` |
| A bar of buttons at the bottom | `kit-footer` |
| A card with a title bar, a close X and buttons at the bottom, over a dimmed page | `kit-dialog` (the dimming is its backdrop; don't draw it) |
| A small dark pill near the bottom with one sentence, maybe an icon or a button | `kit.toast()` in your script, not markup |
| Any other height (28, 36, 40px controls) | Still 24 or 32px: never copy heights ([pitfall 9](pitfalls.md#9-24-and-32-px-controls)) |

## Text styles

Names follow FAPP's `--text-*` tokens, to verify against the file's text styles. Body text needs nothing: `body` already uses it.

| UI3 text style (name to verify) | Value | Kit |
|---|---|---|
| Body medium | 11 / 16px, 450 | nothing (default) |
| Body medium strong | 11 / 16px, 550 | `.kit-heading` on a heading, or `font-weight: var(--kit-font-weight-strong)` |
| Body large | 13 / 22px, 450 | `font-size: var(--kit-font-size-large); line-height: var(--kit-line-height-large); letter-spacing: var(--kit-letter-spacing-large)` |
| Body large strong, heading small | 13 / 22px, 550 | the body large set + `--kit-font-weight-strong` |
| Heading medium | 15 / 25px, 550 | `--kit-font-size-heading`, `--kit-line-height-heading`, `--kit-letter-spacing-heading` + `--kit-font-weight-strong` |
| Body small | 9 / 14px, 450 | `--kit-font-size-small`, `--kit-line-height-small`, `--kit-letter-spacing-small` |
| Body small strong | 9 / 14px, 500, wider tracking | the body small set + `--kit-font-weight-strong` (550, not 500) |
| Heading large | 24 / 32px, 550 | no kit token: use heading medium and report it |
| Display, mono | 48 / 56px Whyte; Roboto Mono | no kit token: display is not for plugins; mono only in host CSS if the content needs it |

The full kit type scale is under [Kit tokens](tokens.md#kit-tokens).

## Spacing, radius and effects

| In the design | Kit |
|---|---|
| Gap or padding 2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 · 40px | `--kit-spacer-0-5` · `-1` · `-1-5` · `-2` · `-2-5` · `-3` · `-4` · `-5` · `-6` |
| Another value (10, 14, 20px ...) | The nearest spacer; report it |
| Radius 2 · 5 · 13px · full | `--kit-radius-small` · `-medium` · `-large` · `-full` |
| Elevation 300 · 400 · 500 (tooltip, menu, dialog) | `var(--kit-shadow-tooltip)` · `var(--kit-shadow-menu)` · `var(--kit-shadow-dialog)` (the kit's tooltip, toast, menu and dialog already have theirs) |
| A dimmed overlay behind a modal | None in your CSS: a `kit-dialog`'s backdrop is `var(--kit-scrim)` |
| Elevation 100 or 200, any other shadow | None; report it |
| Fixed frame width | Drop it inside the window; the window's width goes in `installKitWindow({ size: { width } })` in `code.ts` ([window-chrome.md](window-chrome.md#pick-a-mode)) |
| Fixed frame height | Drop it: the window fits its content |

## Colour variables

Every colour becomes a `--figma-color-*` token from the [role → token cheat sheet](tokens.md#role--token-cheat-sheet); the hex values a design reports are never copied ([pitfall 8](pitfalls.md#8-tokens-only-colours)).

- **A fill or stroke bound to a variable.** UI3's variables are expected to mirror the names Figma injects into plugins, so a path such as `bg/brand/hover` would map to `--figma-color-bg-brand-hover`, and `icon/default/secondary` (with `default` dropped) to `--figma-color-icon-secondary`. UNVERIFIED for the UI3 file: check that the name exists in [`tokens.figma-fallback.css`](../tokens.figma-fallback.css), which lists all 174.
- **No match** (menu or tooltip variables, which Figma's app has and plugins don't get, or a raw hex fill): pick the token by role from the cheat sheet. Menus use `bg`, tooltips `bg-inverse`.
- **A colour that is the plugin's data** (the value of a colour field, a swatch of a document fill) stays data: an input's `value`, or `el.style.setProperty('--swatch', hex)` ([pitfall 8](pitfalls.md#8-tokens-only-colours)).

## Finish the verification

Replacing the guessed names needs a Figma account, the Community file duplicated into your drafts, and an agent with the Figma MCP server connected: the remote server (`https://mcp.figma.com/mcp`) or the desktop server. Do it in the same session as [capture (b)](release-checklist.md#b-the-official-ui3-kit-through-the-figma-mcp-item-6), which measures the metrics; this procedure only checks names, variant properties and coverage.

1. **Duplicate the file.** Open [UI3: Figma's UI Kit](https://www.figma.com/community/file/1486123838948777078/ui3-figmas-ui-kit) signed in and choose **Open in Figma**, which copies it into your drafts. Copy the duplicate's link: `https://www.figma.com/design/<fileKey>/...`. There is no need to share or publish the duplicate.
2. **List the pages.** Call `get_metadata` with the `fileKey` and no `nodeId`: it returns the top-level pages.
3. **List the components.** Call `get_metadata` on each page that holds components. Note each component set and component: its name, its node id, and its variant properties (a variant's name reads `Property=Value, ...`). On a large page, call it on the page's frames one at a time.
4. **Read each one.** Call `get_design_context` on each component set (one variant per state is enough) and `get_screenshot` to see it; `get_variable_defs` on two or three of them checks the variable-name rule in [Colour variables](#colour-variables).
5. **Update this page.** Write the exact names into the left columns and the property names into the state columns; move any component the tables lack into [Components](#components) or [UI3 parts with no kit equivalent](#ui3-parts-with-no-kit-equivalent). In rows that are already there, change only the left and state columns: the kit markup column follows the kit's own files and changes only with a kit release. A metric that disagrees with a kit value goes in capture (b)'s table and an issue, not here.
6. **Record it.** Replace the status line at the top with the date, the file version Figma shows, and what was checked; drop "name to verify" from the column headers and keep UNVERIFIED on anything still unchecked. Then run `node --test test/docs-links.test.mjs`.

A prompt that runs steps 2 to 5 in your AI agent, with the duplicate's link filled in:

```text
Read docs/ui3-mapping.md. With the Figma MCP server, call get_metadata on <duplicate link> with no node id, then on every page that holds components. List every component set with its node id and variant properties, call get_design_context on each one, and update only the UI3 name and state-mapping columns of docs/ui3-mapping.md. Report every component the tables don't list and every name you could not match.
```
