# PropsKit bridge

PropsKit is Figma's own set of `fig-*` web components for plugin UI. Today it works only in **generative plugins**, the ones the Figma agent builds and Figma hosts. [PLAN.md](../PLAN.md#6-phase-3--later-months-5-7) (Phase 3, item 4) sets one trigger: the week PropsKit reaches classic plugins, publish a `fig-*` → kit mapping and a demo. This page records whether that has happened, holds the mapping as a draft so it ships that same week, and sets out the demo plan and the licence caveats.

Status of all Phase 3 items: [roadmap-status.md](roadmap-status.md).

## Status on 2026-10-13: not triggered

**The trigger has not fired as of 2026-10-13. PropsKit is still for generative plugins only.** Checked the same day against these sources:

| Source | What it says on 2026-10-13 | Last changed |
|---|---|---|
| Help centre: [PropsKit component playground](https://help.figma.com/hc/en-us/articles/41306719221143-PropsKit-component-playground) | A caution box still says PropsKit components can only be used with generative plugins. The rest of the page is a short intro and the playground (`propskit.figma.site`), whose "Copy prompt" button writes a prompt for the Figma agent. | Body last edited 2026-07-01 (`edited_at` in the help centre's [article API](https://help.figma.com/api/v2/help_center/en-us/articles/41306719221143.json)); metadata touched 2026-10-06 |
| Help centre: [About building plugins in Figma](https://help.figma.com/hc/en-us/articles/41407987481879-About-building-plugins-in-Figma) | Its comparison table: classic plugins get full control of look and feel; generative plugins use PropsKit components. | Edited 2026-09-01 |
| Developer docs: [Generative plugins and shaders](https://developers.figma.com/docs/figma-mcp-server/generative-plugins-and-shaders/) (Figma MCP server) | A note says PropsKit is for generative plugins only. It lists the same `fig-*` controls as Figma's generative-plugins skill (below). | Read 2026-10-13 |
| Forum: [Will classic plugins be able to use PropKit and the new Generative Plugin APIs?](https://forum.figma.com/ask-the-community-7/will-classic-plugins-be-able-to-use-propkit-and-the-new-generative-plugin-apis-55286) | A Figma staff reply (badge "Figmate", 2026-07-02) says PropsKit and on-canvas handles are planned for classic plugins "in the coming months". It is still the newest of the thread's three replies. | 2026-07-02 |
| [Figma release notes](https://www.figma.com/release-notes/) | No entry mentions PropsKit, classic plugins getting it, or plugin hosting. The newest plugin entry is 2026-10-06 "The Figma agent is generally available" (generative plugins are GA). | Newest entry 2026-10-13 |
| [Plugin API updates](https://developers.figma.com/docs/plugins/updates/) | Newest is Version 1, Update 140; no PropsKit or hosting items. | Read 2026-10-13 |
| Figma's generative-plugins skill, [`references/authoring.md`](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-generative-plugins/references/authoring.md) | The recommended `fig-*` controls (the input to the mapping below). | Last commit 2026-09-01 |
| npm [`@rogieking/figui3`](https://www.npmjs.com/package/@rogieking/figui3) | FigUI3, the library PropsKit is built on (by Rogie King, a product designer at Figma). Latest 11.1.5, published 2026-10-13; 595 versions; majors 7 to 11 all shipped between 2026-08-12 and 2026-10-08. | 2026-10-13 |

More than three months have passed since the staff reply, and no official channel has said more.

### What counts as the trigger

- **Counts:** an official Figma statement (help centre, developer docs, release notes or Plugin API update) that classic plugins can use PropsKit, for example a supported way to load it in a classic plugin's `ui.html`, or the generative-only caution removed from the playground article.
- **Doesn't count:** FigUI3 on npm. Any classic plugin can already inline its MIT core, but that isn't PropsKit for classic plugins, and the kit itself never takes a web-component dependency ([PLAN.md](../PLAN.md#8-explicit-non-goals-and-rejected-ideas)). Generative plugins written through the Figma MCP server don't count either: they are still generative plugins.

### How to re-check

Do it monthly, with the other watched items ([roadmap-status.md](roadmap-status.md#re-checking-the-watched-items)):

```sh
# Body edit date of the playground article: a new date means its text changed
curl -s https://help.figma.com/api/v2/help_center/en-us/articles/41306719221143.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).article;console.log(a.edited_at, /only be used with generative plugins/.test(a.body)?"still generative-only":"CAUTION CHANGED: read it")})'
```

Then read the newest replies in the forum thread and scan the release notes and the Plugin API updates for "PropsKit". If anything has changed, update the status table above (date and source) and follow [When it ships](#when-it-ships).

## Draft mapping: `fig-*` to kit classes

**DRAFT, not verified against a classic-plugin release.** It is built from the controls Figma's generative-plugins skill recommends (read 2026-10-13, last changed 2026-09-01) and the FigUI3 11.1.5 core reference. FigUI3 changes its API often (five majors in two months), so check every tag and attribute again against whatever Figma ships for classic plugins.

Kit markup and states are in [components.md](components.md). "None" means the kit has no equivalent; build it in your own CSS with your own class name (not `kit-*`) and tokens only.

### Panel structure

Figma's skill prescribes `<fig-content>` followed by `<fig-footer>`, controls in `<fig-field>` with a child `<label>`, and related controls in `<fig-group name="…">`.

| PropsKit | Kit | Notes |
|---|---|---|
| `<fig-content>` | `<main class="kit-app" data-kit-root>` with `.kit-section` blocks | The window fits its height to `[data-kit-root]` ([window-chrome.md](window-chrome.md#the-content-root-data-kit-root)). |
| `<fig-footer>` (status + primary action) | `<footer class="kit-footer">`, status in `.kit-text-secondary`, then the buttons | The footer keeps the resize grip's corner free. |
| `<fig-field>` + child `<label>` | `.kit-field` > `label.kit-label[for]` + control (+ `p.kit-help`) | `fig-field` lays out horizontally by default (label left), while `.kit-field` stacks label over control. Use `.kit-row` to put fields side by side. The kit has no horizontal label layout. |
| `<fig-group name="…">` | `<header class="kit-section-header"><h2>…</h2></header>` + `.kit-section` | Separate groups with `<hr class="kit-divider">`. |
| `<fig-header>` | `header.kit-section-header` | |

### The controls Figma recommends

| Input | PropsKit | Kit | Notes |
|---|---|---|---|
| Primary action | `<fig-button type="submit">` in `<fig-footer>` | `<button class="kit-button kit-button-primary" type="button">` in `.kit-footer` | Kit buttons are always `type="button"`. |
| Text | `<fig-input-text>`; `multiline` for long text | `input.kit-input`; multiline → `textarea.kit-textarea` | `type` (text, email, password, search, url), `placeholder`, `disabled` and `readonly` are native attributes. Leading icon (`slot="prepend"`) → `.kit-input-icon`. No `size="large"` field. |
| Numeric input | `<fig-input-number>` | `.kit-number` > (`span.kit-number-prefix`) + `input.kit-input[type=number]` | `min`, `max` and `step` are native. A unit goes in the label or the prefix. No steppers and no `precision`: round in your script. |
| Colour | `<fig-input-color picker="figma-native">` | `.kit-color` > `input.kit-color-swatch[type=color]` + `input.kit-input` (hex) | The swatch opens the browser's colour dialog, not Figma's picker. No alpha. |
| Small choice set | `<fig-options options="A, B, C">` | A radio group (`label.kit-radio`), or `.kit-tabs` when the choice switches panels | `fig-options` is a segmented control; the kit has none. |
| Large choice set | `<fig-dropdown>` with `<option>` children | `<div class="kit-select"><select>…</select></div>` | Native popup. For a list of commands, not values, use `.kit-menu`. |
| Boolean | `<fig-switch>` | `label.kit-checkbox` > `input[type=checkbox]` | No switch: a switch is a kit non-goal ([PLAN.md](../PLAN.md#8-explicit-non-goals-and-rejected-ideas)). |
| Bounded number | `<fig-slider text>` | None | The kit doesn't style `<input type="range">`. A `.kit-number` with `min`/`max` is the closest. |
| Gradient | `<fig-input-gradient>` | None | |
| Palette | `<fig-input-palette>` | None | A `.kit-row` of `.kit-color` fields comes closest. |
| 2D point | `<fig-joystick fields>` | None | Two `.kit-number` fields (X, Y). |
| Image upload | `<fig-image upload>` | None | A native `<input type="file" accept="image/*">` styled in your own CSS. |
| Other file upload | `<fig-input-file>` | None | Same, with your own `accept`. |

### Other elements the playground registers

The PropsKit playground bundle defines more elements than the skill recommends. These have a kit counterpart:

| PropsKit / FigUI3 | Kit |
|---|---|
| `fig-checkbox`, `fig-radio` | `.kit-checkbox`, `.kit-radio` |
| `fig-tabs`, `fig-tab`, `fig-tab-content` | `.kit-tabs` > `.kit-tablist` > `label.kit-tab`, then the panels: plain elements right after `.kit-tablist`, no class needed (CSS-only, up to six; [components.md](components.md#tabs)) |
| `fig-segmented-control`, `fig-segment` | A radio group, or `.kit-tabs` |
| `fig-tooltip` | `.kit-tooltip-host` > control + `span.kit-tooltip[role=tooltip]` |
| `fig-menu`, `fig-menu-item`, `fig-menu-separator` | `div.kit-menu[popover][role=menu]`, `button.kit-menu-item`, `hr.kit-menu-separator` |
| `<dialog is="fig-dialog">` | The kit dialog, `dialog.kit-dialog` (since 0.4.0, [components.md](components.md#dialog)) |
| `<dialog is="fig-toast">` | `kit.toast()` (since 0.4.0, [components.md](components.md#toast)) |
| `<dialog is="fig-popup">` | Partly: `.kit-menu` for commands, `.kit-tooltip` for hints |
| `fig-spinner` | `aria-busy="true"` on a `.kit-button` |
| `fig-swatch` | `.kit-color-swatch` (inside `.kit-color`) |
| `fig-icon` | `<svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true">` with `currentColor` |
| `fig-layer` (separate bundle) | `li.kit-list-row` (no nesting, no visibility toggle) |
| `fig-toolbelt` (FigUI3 11) | Partly: a `.kit-row` of `.kit-icon-button[aria-pressed]`, without the roving arrow keys |

No kit equivalent: `fig-3d-rotate`, `fig-angle`, `fig-avatar`, `fig-button-combo`, `fig-chit`, `fig-choice`, `fig-chooser`, `fig-color-tip`, `fig-combo-input`, `fig-easing-curve`, `fig-fill-picker` (editor bundle, see [Licences](#licences)), `fig-handle`, `fig-input-combo`, `fig-input-fill`, `fig-media`, `fig-media-controls`, `fig-origin-grid`, `fig-preview`, `fig-shimmer`, `fig-skeleton`, `fig-truncate`, `fig-video`.

### Attributes and events

| FigUI3 | Kit |
|---|---|
| `fig-button variant=""` (primary) · `secondary` · `ghost` · `destructive` | `kit-button-primary` · `kit-button-secondary` · `kit-button-tertiary` · `kit-button-danger` |
| `fig-button variant` = `property`, `input`, `overlay`, `link`, `destructiveSecondary`, `destructiveGhost`, `destructiveLink` | None |
| `size="large"` | `kit-button-large` on buttons only; kit fields are 24px |
| `size="compact"` | None |
| `selected`; `type="toggle"` | `aria-pressed="true"`, toggled by your click handler |
| `icon` (icon-only button) | `button.kit-icon-button[aria-label]` |
| `disabled` | `disabled`, or `aria-disabled="true"` when it must stay focusable |
| `full` | Fields fill a `.kit-stack` and share a `.kit-row` on their own |
| `input` while editing, `change` on commit, values in `event.detail` | The same native events on native elements; read `.value` or `.checked` |

## When it ships

The week Figma makes PropsKit available to classic plugins:

1. **Verify the mapping.** Read the classic-plugin docs Figma publishes, check every tag and attribute above against them, drop the DRAFT label and write the date and the PropsKit version checked into this page.
2. **Build the demo: a side-by-side page in `preview.html`.** One row per mapped control: PropsKit on the left, the kit markup on the right, both under the preview's theme switch (light, dark, FigJam), since both read Figma's `--figma-color-*` tokens. Load PropsKit only in the browser preview, from an exact pinned version (never `@latest`) and only from its MIT core files, wherever Figma says to get it. Add a screenshot test and an axe run for the new section, as the gallery has (`e2e/`).
3. **Keep the plugins as they are.** No `ui.html` or example gains a PropsKit dependency: the kit stays free of web components and runtime dependencies, and its plugins stay at `"networkAccess": { "allowedDomains": ["none"] }`. The kit's window chrome, conventions, audit and archetypes still apply to a plugin that uses PropsKit controls ([PLAN.md](../PLAN.md#9-success-metrics-and-risks)). Check that a PropsKit form inside `[data-kit-root]` still fits the window.
4. **Say when to use which.** Add a short "PropsKit or the kit?" note to the README and AGENTS.md that links here.
5. **Record it.** Mark item 4 done in [roadmap-status.md](roadmap-status.md#4-propskit-bridge) with the date, and add the mapping page to the CHANGELOG entry of that release.

## Licences

- **FigUI3 is split-licensed** (its `LICENSE`, checked in 11.1.5 on 2026-10-13):
  - **MIT** (Copyright (c) 2026 Rogie King) covers the core: `fig.js`, `fig-layer.js`, `fig.css`, `fig-layer.css`, `base.css`, `components.css`, `polyfills/` and the matching `dist/` files.
  - **PolyForm Shield 1.0.0**, not an OSI open-source licence, covers the editor and lab bundles: `fig-editor.*`, `fig-lab.*`, their CSS and the fig-editor and fig-lab skill docs. That includes the fill picker. PolyForm Shield forbids using the software to offer a product that competes with the licensor's, and a UI kit could count as one. Never copy, vendor or load those files, not even in the preview.
- **This page copies no code.** It records tag and attribute names, which are facts about an interface, with links to the sources. The demo would load only the MIT core, pinned, and credit it.
- **Figma's generative-plugins skill** (`figma/mcp-server-guide`) has no licence file: link to it, never copy it into this repo.
- **Whatever Figma ships for classic plugins may come with its own terms.** Read them before building the demo, and update this section.
