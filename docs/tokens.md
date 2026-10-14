# Tokens

Two kinds of variables style a kit plugin:

- **`--figma-color-*`**: every colour. Figma injects these into the plugin window and switches them live with the theme. The kit never defines them (except the browser-preview fallback, below).
- **`--kit-*`**: everything Figma does not inject: spacing, radii, control sizes, type, motion, layers and shadows. They live in `<style data-kit="tokens">` at the top of `ui.html`, with values measured from Figma's UI3.

The rule that follows from this: **every colour is `var(--figma-color-*)`**. The [role → token cheat sheet](#role--token-cheat-sheet) below is the part to copy from.

## How `--figma-color-*` gets into the window

`installKitWindow` in `code.ts` always calls `figma.showUI(__html__, { themeColors: true, ... })`. With that flag Figma:

1. adds the class `figma-light` or `figma-dark` to the plugin's `<html>`;
2. injects `<style id="figma-style">` with the `--figma-color-*` variables (third-party dumps show a single `:root { ... }` rule with nothing but colours; the docs don't say where it is inserted);
3. updates the variables live when the person switches theme in Figma.

Without `themeColors: true` nothing is injected (it defaults to `false`). It does not work for a UI that navigates to another URL or is hosted elsewhere. Source: [CSS variables](https://developers.figma.com/docs/plugins/css-variables/), [`figma.showUI`](https://developers.figma.com/docs/plugins/api/properties/figma-showui/).

Facts worth knowing before you write CSS:

- **174 documented tokens**: 43 `bg`, 30 `border`, 54 `icon`, 47 `text`. The names follow `--figma-color-{type}-{role}-{prominence}-{interaction}`: type `bg`/`text`/`icon`/`border`; roles such as `brand`, `selected`, `disabled`, `danger`, `warning`, `success`, `component`, `inverse`, `slot`, plus `on*` variants for content on a filled background (`text-onbrand`); prominence `-secondary`/`-tertiary` (borders use `-strong`); interaction `-hover`/`-pressed`. `--figma-color-bg-slot` and `--figma-color-border-slot` were added in 2026, so older copies of the list have 172.
- **Only colours.** No spacing, radius, type or shadow variables are injected. That is why the kit ships its own `--kit-*` tokens.
- **The kit follows Figma's class, never the OS.** The tokens block sets `color-scheme: light` on `:root` and `color-scheme: dark` on `:root.figma-dark`, so scrollbars and the native `<select>` popup match the theme the person chose in Figma, even when the OS is in the other mode.
- **FigJam is light only and purple.** FigJam has no dark mode; plugins get a FigJam light palette under the same names, with a purple brand (`--figma-color-bg-brand` is `#9747ff` in the docs table) where Figma Design uses blue. Kit components only use tokens, so they turn purple on their own. Which `<html>` class FigJam gets is not documented: detect the editor with `figma.editorType` in `code.ts` (the runtime receives it in `kit:init`), not with a class.
- **Other editors are unverified.** Figma's app CSS has per-editor brand colours (green for Dev Mode; orange and pink, probably Slides and Buzz). Whether plugin windows receive them is unknown ([surfaces.md](surfaces.md) records the probe runs). Never assume "brand = blue".
- **Values drift. Never hard-code them.** Figma's live app CSS (2026-10-13) differs from the docs table on 26 light and 45 dark tokens, and runtime dumps changed between 2024 and 2025. For example the docs give light `--figma-color-bg-pressed` as `#f5f5f5` (equal to `bg-hover`), the live app uses `#e6e6e6`. A component that reads the variable is right whichever value Figma injects; a copied hex is wrong as soon as Figma changes it.

### Browser preview fallback

Opened outside Figma (a browser, `preview.html`, Playwright), nothing is injected and every token is empty. [`tokens.figma-fallback.css`](../tokens.figma-fallback.css) supplies all 174 tokens for the browser, declared so that Figma's injected values always win inside Figma. Its values are provisional until a capture from a running plugin replaces them: the MIT-licensed transcription of Figma's docs table in create-figma-plugin's `theme.css` (Copyright (c) Yuan Qing Lim), plus the two slot tokens from Figma's docs. The file's header records the provenance. It is a preview aid only: don't paste it into `ui.html`. It doubles as the full list when you look for a token name.

## The colour rule and its only exceptions

- Every colour in `ui.html`, in any `<style>`, `style=""` attribute or SVG `fill`/`stroke`, is `var(--figma-color-*)`.
- Allowed anywhere: `transparent`, `currentColor`, `inherit`, `none`. SVG icons use `currentColor` and take the colour of their parent.
- Literal colours appear **only** in `<style data-kit="tokens">`, and only as the values of `--kit-shadow-tooltip`, `--kit-shadow-menu`, `--kit-shadow-dialog` and `--kit-scrim`. Figma injects no shadow or overlay colours, so these are copied exactly from UI3. Use them through `var()`; never redefine them.
- No `var(--figma-color-bg, #fff)` fallbacks: the fallback is a literal and hides a missing token. The preview fallback file covers the browser case.

`npm run audit` checks all of this (rule `color-literal`; see [pitfalls.md](pitfalls.md#8-tokens-only-colours)).

## Kit tokens

All values are px on purpose: Figma's own CSS uses rem on a 16px root, and px give the same result while staying immune to a host that changes `html { font-size }`.

| Group | Tokens |
|---|---|
| Spacing | `--kit-spacer-0-5` 2px · `-1` 4px · `-1-5` 6px · `-2` 8px · `-2-5` 12px · `-3` 16px · `-4` 24px · `-5` 32px · `-6` 40px |
| Radius | `--kit-radius-small` 2px · `--kit-radius-medium` 5px (controls) · `--kit-radius-large` 13px (menus, dialogs) · `--kit-radius-full` 9999px |
| Controls | `--kit-control-height` 24px · `--kit-control-height-large` 32px · `--kit-icon-size` 24px · `--kit-icon-size-small` 16px · `--kit-border-width` 1px · `--kit-focus-width` 1px |
| Type: body (default) | `--kit-font-size` 11px · `--kit-line-height` 16px · `--kit-letter-spacing` 0.055px · `--kit-font-weight` 450 · `--kit-font-weight-strong` 550 |
| Type: large | `--kit-font-size-large` 13px · `--kit-line-height-large` 22px · `--kit-letter-spacing-large` -0.032px |
| Type: heading | `--kit-font-size-heading` 15px · `--kit-line-height-heading` 25px · `--kit-letter-spacing-heading` -0.075px (use with weight 550) |
| Type: small | `--kit-font-size-small` 9px · `--kit-line-height-small` 14px · `--kit-letter-spacing-small` 0.045px |
| Font | `--kit-font-family`: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Motion | `--kit-duration-small` 100ms · `--kit-duration-medium` 200ms · `--kit-duration-large` 400ms · `--kit-easing` ease-out |
| Layers | `--kit-z-handle` 10 · `--kit-z-toast` 11 · `--kit-z-menu` 13 (dialogs use the top layer) |
| Elevation | `--kit-shadow-tooltip` (UI3 elevation 300) · `--kit-shadow-menu` (400) · `--kit-shadow-dialog` (500); dark values under `:root.figma-dark` |
| Overlay | `--kit-scrim` rgba(0, 0, 0, 0.5), behind modal dialogs |

**Fonts.** Figma's manifest docs say Figma preloads Inter for plugins, which is why the kit names `Inter` first and loads nothing: `networkAccess: none` stays possible. Whether the variable font (needed to render 450 and 550 exactly) is what the iframe sees is unverified; with a static font the browser rounds to 400/500/600, and without Inter the stack falls back to `system-ui`. `preview.html` has a "simulate no Inter" toggle.

**Opt-in Inter.** To be sure every plugin window renders Inter, including the exact 450 and 550 weights, embed the font yourself. Download Inter (for example `InterVariable.woff2` from [rsms.me/inter](https://rsms.me/inter/)) and turn it into `@font-face` rules with base64 `data:` URIs:

```sh
node scripts/make-fonts-css.mjs path/to/InterVariable.woff2 > fonts.css
```

The script reads only the local files you name and uses no network. Paste the rules from `fonts.css` into a plain `<style>` in `ui.html`, after the three `data-kit` blocks and never inside them, because an upgrade re-pastes those blocks and would drop the font. A `<link href="fonts.css">` does not work: Figma loads `ui.html` as an inline string (`__html__`), so a relative URL has no folder to resolve against. Data URIs need no `networkAccess` domain, so `"allowedDomains": ["none"]` still holds. The cost is size: the rules add the whole font to `ui.html` (the script prints how many KB). That weight is outside the kit's own 64 KB budget, which counts only the kit and the starter markup. Inter is under the SIL Open Font License 1.1; keep its licence notice with your plugin's sources.

The other route is a remote stylesheet, such as `<link rel="stylesheet" href="https://rsms.me/inter/inter.css">`. It only loads when every domain it uses, the stylesheet's and the font files', is listed in `networkAccess.allowedDomains`. Those domains then appear on your Community page, and the font is missing offline.

## Measured metrics

The UI3 values the kit's tokens and components are built on. "24px controls, 5px/13px radii and 11px-on-16px type" were hypotheses in the roadmap; they now come from **Figma's production CSS** and agree with the two maintained UI3 replicas, figma-kit and figui3. **Measuring the official "UI3: Figma's UI Kit" Community file through the Figma MCP is still pending**: the MCP tools only open files with a `/design/` key, so the Community file must first be duplicated into someone's drafts. Until then, treat Medium and Low rows as the ones to re-check.

Sources:

| ID | Source | Notes |
|---|---|---|
| FAPP | Figma's production CSS, `figma.com/webpack-artifacts/assets/community-*.min.css`, fetched 2026-10-13 | UI3 tokens (`--spacer-*`, `--radius-*`, `--text-*`, `--elevation-*`, `--duration-*`, `--z-index-*`) and `[data-fpl-version=ui3]` component rules. Used to measure, not redistributed. |
| FK | [figma-kit](https://github.com/tigranpetrossian/figma-kit) `beta` branch (npm `figma-kit@1.0.0-beta.26`), MIT | A React replica of Figma's UI3 controls. |
| FUI3 | [figui3](https://github.com/rogie/figui3) `@rogieking/figui3@11.1.5`, core MIT | Web-component replica of UI3. |
| DOCS | [developers.figma.com/docs/plugins/css-variables](https://developers.figma.com/docs/plugins/css-variables/) | Plugin colour tokens and theming. |

Confidence: **High** = FAPP, or FAPP and a replica agree. **Medium** = replicas only, or sources disagree. **Low** = inferred.

| Metric | Value | Kit token / where used | Source | Confidence |
|---|---|---|---|---|
| Body text | 11px / 16px line, letter-spacing 0.055px (.00344rem), weight 450 | `--kit-font-size`, `--kit-line-height`, `--kit-letter-spacing`, `--kit-font-weight`; `body` | FAPP `--text-body-medium-*`; FK; FUI3 | High |
| Strong weight | 550 | `--kit-font-weight-strong`; `.kit-heading` | FAPP `--font-weight-strong` | High |
| Large text | 13px / 22px, -0.032px | `--kit-font-size-large` and friends | FAPP `--text-body-large-*`; FK | High |
| Heading | 15px / 25px, -0.075px, 550 | `--kit-font-size-heading` and friends | FAPP `--text-heading-medium-*`; FK | High |
| Small text | 9px / 14px, 0.045px | `--kit-font-size-small` and friends | FAPP `--text-body-small-*`; FK | High |
| Font family | Inter first, then system fonts | `--kit-font-family` | FAPP `--font-family-default` (shortened) | High |
| Spacing scale | 4 · 8 · 12 · 16 · 24 · 32 · 40px (2 and 6px added) | `--kit-spacer-*` | FAPP `--spacer-*`; 2/6px from FK `--space-0_5/1_5` | High |
| Radii | 2px small · 5px medium · 13px large · 9999px full | `--kit-radius-*` | FAPP `--radius-*`; FK; FUI3 | High |
| Control height | 24px (inputs, buttons, selects, menu items, icon buttons) | `--kit-control-height` | FAPP `basic_form--input/btn { height: var(--spacer-4) }`; FK; FUI3 | High |
| Large control | 32px | `--kit-control-height-large`; `.kit-button-large` | FAPP `bigInput`/`btnBig { height: var(--spacer-5) }`; FK | High |
| Button padding | 0 8px at 24px | `.kit-button` | FAPP `var(--spacer-1) var(--spacer-2)`; FK; FUI3 `0 8px` | High |
| Large button padding | 0 12px at 32px | `.kit-button-large` | FK (FAPP `btnBig` keeps 8px) | Medium |
| Button weight | 450 (FUI3 uses 500) | `.kit-button` inherits body | FAPP `basic_form--btn`; FK | High |
| Primary / danger hover | `bg-brand-hover` / `bg-danger-hover` | `.kit-button-primary`, `-danger` | FUI3 (FK has no hover rule) | Medium |
| Pressed | `bg-pressed`; `bg-brand-pressed`; `bg-danger-pressed` | `.kit-button` `:active` | FK | High |
| Secondary button | transparent, 1px `border` ring inset, `bg-pressed` when pressed | `.kit-button-secondary` | FK | High |
| Secondary hover | `bg-hover` (FK: no change; FUI3: `bg-secondary`, the same value) | `.kit-button-secondary` | FUI3 | Medium |
| Tertiary (ghost) button | transparent; hover `bg-hover`; pressed `bg-pressed` | `.kit-button-tertiary` | FK text variant | High |
| Selected / toggled | `bg-selected` + `text`/`icon-brand` | `[aria-pressed="true"]` | FAPP `iconButtonSelected`; FK | High |
| Text input | 24px, fill `bg-secondary`, radius 5px, padding-left 8px, placeholder `text-tertiary` | `.kit-input` | FK; FAPP `textInput` | High |
| Input hover | 1px ring `border` | `.kit-input:hover` | FK; FAPP `raw_components--border:hover` | High |
| Input disabled | fill `bg`, ring `border-disabled`, text `text-disabled` | `.kit-input:disabled` | FK | High |
| Input error | ring `border-danger-strong` | `[aria-invalid="true"]` | DOCS ("input error") | High |
| Select trigger | 24px, 1px `border` ring (not filled), radius 5px, padding-left 8px, chevron right | `.kit-select` | FK `select.css`; FUI3 | High |
| Focus ring | 1px `border-selected`, inset (offset -1px) | `--kit-focus-width`; every control | FK; FAPP close button and `--icon-button-outline-width` | High |
| Focus on filled buttons | 1px `border-onbrand-strong` inside + 1px `border-selected-strong` outside (danger: `-ondanger-strong` / `-danger-strong`) | `.kit-button-primary:focus-visible` | FK | Medium |
| Disabled | disabled tokens, never opacity: `text-disabled`, `icon-disabled`, `border-disabled`; filled: `bg-disabled` + `text-ondisabled` | all components | FK; FAPP | High |
| Field label | `text-secondary`, regular weight | `.kit-label` | FAPP `raw_components--label` | High |
| Panel title | weight 550 | `.kit-heading` | FAPP `raw_components--panelTitle` | High |
| Divider | 1px `border` | `.kit-divider` | FK; FUI3 | High |
| Icon frame | 24×24 (viewBox 0 0 24 24), 1px stroke; small 16×16 | `--kit-icon-size`, `--kit-icon-size-small` | FK `icon.tsx`; FAPP `--icon-button-icon-size` | High |
| Property row | 32px tall, padding 16px left / 8px right, 24px controls | no token; use `--kit-spacer-*` | FAPP `ui3_grid_rows--row` | High |
| Section header | 40px tall, title 11/16/550 | P2 `.kit-section-header` | FAPP modal header; FK; FUI3 (panel header itself unverified) | Medium |
| Durations | 100 / 200 / 400ms | `--kit-duration-*` | FAPP `--duration-sm/md/lg` | High |
| Easing | ease-out (no UI3 token exists) | `--kit-easing` | FK and FUI3 transitions | Low |
| Hover transitions | none: colours change instantly | kit components | FK | Medium |
| Layers | toast 11 < menu 13 (Figma: visual bell 11, dropdown and tooltip 13) | `--kit-z-*` | FAPP `--z-index-*` | High |
| Tooltip shadow | elevation 300 | `--kit-shadow-tooltip` | FAPP `--elevation-300`; FK | High |
| Menu shadow | elevation 400 | `--kit-shadow-menu` | FAPP `--elevation-400`; FK | High |
| Dialog shadow | elevation 500 | `--kit-shadow-dialog` | FAPP `--elevation-500`; FK | High |
| Dark elevation | deeper shadows + faint light inner edge | `:root.figma-dark` overrides | FAPP dark `--elevation-*`; FK `.figma-dark` | High |
| Scrim | black at 50% | `--kit-scrim` | FK `--color-overlay-dialog` | Medium |
| Menu / tooltip surface | `#1e1e1e` in both themes | not reproducible, see below | FAPP; FK | High |

Open measurement items: the UI3 Community kit itself (pending, above); whether the injected `--figma-color-bg-pressed` and dark `--figma-color-bg-selected` match the docs table or the live app; whether "enhanced contrast" mode changes injected values; Inter availability and weight rendering inside the iframe.

## UI3's dark menus are not reproducible

In Figma's own UI, menus, dropdown lists and tooltips are dark (`#1e1e1e`, white text, solid blue highlight) **in both themes**. No injected token has that value in the light theme, and the only way to copy it would be a literal colour, which the colour rule forbids. So the kit builds them from tokens instead:

- **Menus** (P2): `--figma-color-bg` surface, `--kit-shadow-menu`, `--kit-radius-large`; item hover and focus `--figma-color-bg-brand` with `--figma-color-text-onbrand`. Light menus in the light theme, dark in the dark theme.
- **Tooltips and toasts** (P2, P3): `--figma-color-bg-inverse` with `--figma-color-text-oninverse`. Dark in the light theme (like Figma's), light in the dark theme (unlike Figma's).

This is a deliberate trade: it keeps every colour themeable and checkable. The native `<select>` popup is drawn by the operating system and is not affected.

## Role → token cheat sheet

Copy from here. Each name is in Figma's documented list.

| Role | Token(s) | Notes |
|---|---|---|
| Text | `--figma-color-text` | Body copy, values, headings. |
| Secondary text | `--figma-color-text-secondary` | Labels, help text, descriptions, inactive tabs. |
| Tertiary text | `--figma-color-text-tertiary` | Placeholders, hints. |
| Panel background | `--figma-color-bg` | `body`, dialogs, menus. |
| Field fill | `--figma-color-bg-secondary` | Text inputs, textareas, segmented tracks. |
| Raised neutral fill | `--figma-color-bg-tertiary` | Tracks, chips, a fill one step stronger. |
| Divider / default border | `--figma-color-border` | `hr`, secondary-button ring, select ring, input hover ring. |
| Strong border | `--figma-color-border-strong` | Checkbox box, high-emphasis outlines. |
| Hover | `--figma-color-bg-hover` | Ghost buttons, list rows. Not `border-selected`. |
| Pressed | `--figma-color-bg-pressed` | Secondary and ghost buttons while pressed. |
| Selected | `--figma-color-bg-selected` + `--figma-color-text-brand` / `--figma-color-icon-brand` | Toggled buttons, selected rows. Hover `-bg-selected-hover`, pressed `-bg-selected-pressed`. |
| Selected, solid | `--figma-color-bg-selected-strong` + `--figma-color-text-onbrand` / `--figma-color-icon-onbrand` | Strong selection, highlighted menu item. |
| Focus ring | `--figma-color-border-selected` | 1px, inset. On filled buttons: `--figma-color-border-onbrand-strong` inside + `--figma-color-border-selected-strong` outside. |
| Brand fill | `--figma-color-bg-brand` + `--figma-color-text-onbrand` | Primary button. Hover `-bg-brand-hover`, pressed `-bg-brand-pressed`. Purple in FigJam. |
| Brand text, links | `--figma-color-text-brand` | Links, brand-coloured labels. |
| Danger | `--figma-color-bg-danger` + `--figma-color-text-ondanger`; `--figma-color-text-danger`; `--figma-color-border-danger-strong`; `--figma-color-bg-danger-tertiary` | Destructive button; error text; error ring; error tint. Hover `-bg-danger-hover`, pressed `-bg-danger-pressed`. |
| Success | `--figma-color-bg-success` + `--figma-color-text-onsuccess`; `--figma-color-text-success`; `--figma-color-border-success-strong`; `--figma-color-bg-success-tertiary` | Success fill; success text; ring; tint. |
| Warning | `--figma-color-bg-warning` + `--figma-color-text-onwarning`; `--figma-color-text-warning`; `--figma-color-border-warning-strong`; `--figma-color-bg-warning-tertiary` | Text on a warning fill is dark (`text-onwarning`), not light. |
| Disabled | `--figma-color-text-disabled`, `--figma-color-icon-disabled`, `--figma-color-border-disabled`; filled: `--figma-color-bg-disabled` + `--figma-color-text-ondisabled` | Never `opacity`. |
| Icons | `--figma-color-icon`, `--figma-color-icon-secondary`, `--figma-color-icon-tertiary`, `--figma-color-icon-brand`, `--figma-color-icon-onbrand` | Secondary icons darken on hover with `--figma-color-icon-secondary-hover`. |
| Inverse surface | `--figma-color-bg-inverse` + `--figma-color-text-oninverse` | Tooltips, toasts. |
| Components (purple) | `--figma-color-bg-component`, `--figma-color-text-component`, `--figma-color-icon-component` | Only for things that refer to Figma components and instances. |

The full list of all 174 names, with fallback values for each theme, is in [`tokens.figma-fallback.css`](../tokens.figma-fallback.css). Which kit component uses which token is in [components.md](components.md).

**How many the kit uses.** `ui.html` references 34 of the 174 names (`grep -o -E -- '--figma-color-[a-z0-9-]+' ui.html | sort -u | wc -l`; the 2025 file used 15). PLAN.md section 7 set a Phase 1 target of 60 or more: **not met**. The kit doesn't add unused aliases to raise the count, because they would be dead tokens; the roles still unused (success and warning tones, `border-strong`, the inverse surface, the component purple, `bg-tertiary`, `icon-brand`) come with the Phase 2 components. Proposed: move the target to Phase 2; the owner's decision is pending ([release-checklist.md](release-checklist.md#fix-first-list-inventory-and-first-week-plan-sections-3-7-and-10)).
