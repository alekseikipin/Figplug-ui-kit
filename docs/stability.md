# Stability

The kit is a set of files people paste into their own plugins, so its names are its API. A rename breaks every copy out there without warning: a class that stops matching, a token that stops resolving, a message type nobody answers any more. This page lists every public name as it is in the files today (kit 0.4.0, protocol 1), says what v1.0 will freeze, and says how names may change until then and after.

Where v1.0 stands: [roadmap-status.md](roadmap-status.md#7-v10). Release by release: [CHANGELOG.md](../CHANGELOG.md).

## What v1.0 freezes

From v1.0 on, every name in [the public surface](#the-public-surface-today) below keeps its spelling and meaning until a 2.0. That covers class names, `data-kit-*` attributes, `--kit-*` tokens, `CONFIG` keys, the `window.kit` API, the `kit:*` messages and their fields, the storage key and record, `installKitWindow`'s options and return value, the types in `kit.d.ts`, the npm script names, the audit rule ids and output format, and the file names and block markers people paste.

The freeze is about **names and meanings, not pixels**. A token's or component's value may still be corrected in a minor release to follow Figma's UI3 (a measured radius, a hover colour), and is listed under "Changed" in the CHANGELOG. Controls stay 24 and 32px tall: the audit's `control-height` rule depends on it.

Since 0.2.0 nothing public has been renamed or removed. PLAN.md asks for two consecutive releases without renames before 1.0: 0.3.0 and 0.4.0 add names and rename none, so they are those two once both are released. On 2026-10-14 `v0.3.0` is tagged in the local repo only, and 0.4.0 is not committed or tagged yet ([roadmap-status.md](roadmap-status.md#7-v10)).

## The public surface today

Each name is marked with the release that added it. Everything here is in the files of the repo as of kit 0.4.0.

### Files and markers people paste

- **Starter files:** `manifest.json` (with `"main": "code.js"` and `"ui": "ui.html"`), `code.ts` and the compiled `code.js`, `kit.d.ts`, `ui.html`, `tsconfig.json`, `package.json` (0.2.0). Preview only: `preview.html`, `tokens.figma-fallback.css` (0.2.0). Scripts: `scripts/audit.mjs`, `scripts/check-ui.mjs`, `scripts/serve.mjs`, `scripts/make-fonts-css.mjs` (0.2.0); `scripts/build-examples.mjs` (0.3.0, run by `npm run build:examples`).
- **Agent context:** `AGENTS.md`, `CLAUDE.md` and the skill `.claude/skills/kit-ui/` (name `kit-ui`) (0.2.0); the skill `.claude/skills/kit-frame-to-markup/` (name `kit-frame-to-markup`) (0.3.0). People and agents refer to them by name.
- **Marked blocks in `ui.html`**, in `<head>`, in this order: `<style data-kit="tokens">`, `<style data-kit="components">`, `<script data-kit="runtime">` (0.2.0). Inside the runtime, the lines `/* kit:pure:start */` and `/* kit:pure:end */` around the DOM-free helpers the tests extract: `clampSize`, `nextSnap`, `sameSize` (0.2.0).
- **The `code.ts` block**, from `// ==== kit:window:start · kit vX.Y.Z · protocol N · ... ====` to `// ==== kit:window:end ====`, with the same lines in `code.js` (0.2.0).
- **Version markers:** `<meta name="kit" content="kit vX.Y.Z · protocol N · https://github.com/alekseikipin/Figplug-ui-kit">` and the first comment of the tokens block, `/* kit tokens vX.Y.Z · protocol N · MIT · ... */` (0.2.0). Bug reports and upgrades read the version from them.

The `/* == name == */` sub-markers inside the components block are internal.

### CSS classes

Components and their parts. States are attributes, not classes ([below](#attributes)).

| Group | Classes | Since |
|---|---|---|
| Layout | `kit-app`, `kit-section`, `kit-divider`, `kit-stack`, `kit-row`, `kit-field`, `kit-label`, `kit-help`, `kit-heading`, `kit-text-secondary`, `kit-visually-hidden`, `kit-icon`, `kit-icon-small` | 0.2.0 |
| Layout | `kit-scroll` | 0.3.0 |
| Button | `kit-button`, `kit-button-primary`, `kit-button-secondary`, `kit-button-tertiary`, `kit-button-danger`, `kit-button-large` | 0.2.0 |
| Fields | `kit-input`, `kit-input-icon`, `kit-select` | 0.2.0 |
| Window | `kit-resize-handle` | 0.2.0 |
| Textarea | `kit-textarea` | 0.3.0 |
| Checkbox, radio | `kit-checkbox`, `kit-radio` | 0.3.0 |
| Number field | `kit-number`, part `kit-number-prefix` | 0.3.0 |
| Colour field | `kit-color`, part `kit-color-swatch` | 0.3.0 |
| Icon button | `kit-icon-button` | 0.3.0 |
| Section header | `kit-section-header` | 0.3.0 |
| List | `kit-list`, `kit-list-row`, parts `kit-list-row-icon`, `kit-list-row-label`, `kit-list-row-meta` | 0.3.0 |
| Empty state | `kit-empty`, parts `kit-empty-title`, `kit-empty-text` | 0.3.0 |
| Inline notice | `kit-notice`, part `kit-notice-text` | 0.3.0 |
| Sticky footer | `kit-footer` | 0.3.0 |
| Tabs | `kit-tabs`, `kit-tablist`, `kit-tab`, `kit-tabpanel` | 0.3.0 |
| Tooltip | `kit-tooltip-host`, `kit-tooltip`, placements `kit-tooltip-start`, `kit-tooltip-end`, `kit-tooltip-above` | 0.3.0 |
| Menu | `kit-menu`, `kit-menu-item`, `kit-menu-separator` | 0.3.0 |
| Dialog | `kit-dialog`, sizes `kit-dialog-small`, `kit-dialog-large`, parts `kit-dialog-header`, `kit-dialog-body`, `kit-dialog-footer` | 0.4.0 |
| Toast | `kit-toast-region`, `kit-toast`, part `kit-toast-text` (the runtime builds them; they are public so host CSS and tests can find them, not markup to write) | 0.4.0 |

`kit-button-secondary` and `kit-tabpanel` have no CSS rules of their own today: a bare `kit-button` already looks secondary, and panels are selected by position. Since 0.4.0 the Tabs docs and the gallery show panels without a class ([components.md](components.md#tabs)); `kit-tabpanel` stays a public name, so markup that keeps it works the same. Both may get rules in a later release.

The markup each component expects (which element, which children, which ARIA) is part of the contract too: [components.md](components.md).

### Attributes

| Attribute | Where | Since |
|---|---|---|
| `data-kit-root` | The element the window fits to (`<main class="kit-app">`) | 0.2.0 |
| `data-kit-resize` | The resize handle `<button>` | 0.2.0 |
| `data-kit-config` | On a `<script type="application/json">` with `CONFIG` overrides | 0.2.0 |
| `data-kit-chrome="on"` or `"off"` | On `<html>`, set by the runtime | 0.2.0 |
| `data-kit-mode="fit-content"`, `"resizable"` or `"fixed"` | On `<html>`, set by the runtime | 0.2.0 |
| `data-kit="tokens"`, `"components"`, `"runtime"` | The three marked blocks | 0.2.0 |
| `data-kit-tone="info"`, `"success"`, `"warning"`, `"danger"` | On `.kit-notice` | 0.3.0 |
| `data-kit-announce` | The live region for resize announcements; the runtime creates it, or uses one already in the page | 0.3.0 |
| `id="kit-resize-hint"` | The handle's description; the runtime creates it, or uses one already in the page | 0.3.0 |
| `data-kit-dialog-open="ID"` | On any element whose click opens the dialog with that id | 0.4.0 |
| `data-kit-dialog-close` | On a button inside a `dialog.kit-dialog`; its `value` attribute is the dialog's return value | 0.4.0 |
| `data-kit-dialog-light-dismiss` | On `dialog.kit-dialog`: a backdrop click closes it with `''` | 0.4.0 |
| `data-kit-tone="info"`, `"success"`, `"warning"`, `"danger"` | On `.kit-toast`, set by the runtime from the `tone` option | 0.4.0 |
| `data-kit-tooltip-dismissed` | On a `.kit-tooltip-host`, set and cleared by the runtime while Escape keeps its tooltip hidden; never write it yourself | 0.4.0 |

**State attributes** are the HTML and ARIA ones: `disabled` / `aria-disabled="true"`, `aria-pressed="true"`, `aria-invalid="true"` with `aria-describedby`, `aria-busy="true"`, `aria-current="true"` / `aria-selected="true"` on list rows, `checked`, `aria-expanded` on menu triggers ([components.md](components.md#states-are-attributes)). The kit commits to styling these and never adds state classes.

### Tokens

All in `<style data-kit="tokens">`; colours always come from Figma's `--figma-color-*`, which Figma names, not the kit ([tokens.md](tokens.md#kit-tokens)).

| Group | Tokens | Since |
|---|---|---|
| Spacing | `--kit-spacer-0-5`, `--kit-spacer-1`, `--kit-spacer-1-5`, `--kit-spacer-2`, `--kit-spacer-2-5`, `--kit-spacer-3`, `--kit-spacer-4`, `--kit-spacer-5`, `--kit-spacer-6` | 0.2.0 |
| Radius | `--kit-radius-small`, `--kit-radius-medium`, `--kit-radius-large`, `--kit-radius-full` | 0.2.0 |
| Controls | `--kit-control-height`, `--kit-control-height-large`, `--kit-icon-size`, `--kit-icon-size-small`, `--kit-border-width`, `--kit-focus-width` | 0.2.0 |
| Type | `--kit-font-family`, `--kit-font-size`, `--kit-line-height`, `--kit-letter-spacing`, `--kit-font-weight`, `--kit-font-weight-strong`; `--kit-font-size-large`, `--kit-line-height-large`, `--kit-letter-spacing-large`; `--kit-font-size-heading`, `--kit-line-height-heading`, `--kit-letter-spacing-heading`; `--kit-font-size-small`, `--kit-line-height-small`, `--kit-letter-spacing-small` | 0.2.0 |
| Motion | `--kit-duration-small`, `--kit-duration-medium`, `--kit-duration-large`, `--kit-easing` | 0.2.0 |
| Layers | `--kit-z-handle`, `--kit-z-toast`, `--kit-z-menu` | 0.2.0 |
| Layers | `--kit-z-tooltip` | 0.3.0 |
| Elevation | `--kit-shadow-tooltip`, `--kit-shadow-menu`, `--kit-shadow-dialog`, `--kit-scrim` | 0.2.0 |

**A custom property you set:** `--kit-scroll-max-height` (0.3.0), the maximum height of a `.kit-scroll` region (default 240px). It is not declared in the tokens block; host CSS sets it.

**Private, not frozen:** the custom properties inside the components (`--kit-button-*`, `--kit-list-*`, `--kit-notice-icon`, `--kit-mark`, `--kit-mark-color`). They may change in any release ([components.md](components.md#adding-your-own-css)).

### `CONFIG` and `data-kit-config`

`CONFIG` in the runtime is never edited; it is overridden with `<script type="application/json" data-kit-config>` ([window-chrome.md](window-chrome.md#customising-config)).

| Key | Default | Since |
|---|---|---|
| `snapWidths` | `[320, 480, 640]` | 0.2.0 |
| `step` | `8` | 0.2.0 |
| `bigStep` | `32` | 0.2.0 |
| `initTimeoutMs` | `500` | 0.2.0 |
| `fallbackMode` | `'fit-content'` | 0.2.0 |
| `strings.resizeLabel` | `'Resize window'` | 0.2.0 |
| `strings.resizeHint` | `'Drag, or use the arrow keys. Shift for bigger steps, Enter to snap, Home to fit, End for the widest size.'` | 0.3.0 |
| `strings.announce` | `'Window {width} by {height}'`, with the `{width}` and `{height}` placeholders | 0.3.0 |
| `strings.dismiss` | `'Dismiss'`, the name of a toast's close button | 0.4.0 |

Also part of the contract: unknown keys and bad values are ignored with one `console.warn`, and only the first `data-kit-config` script is read.

### `window.kit` (UI)

A frozen object typed `KitUiApi`: `version` (the kit release as `'X.Y.Z'`, `'0.4.0'` today), `protocol` (`1`), `fit()` (0.2.0); `dialog(idOrElement)`, which returns a `Promise<string>` of the dialog's return value (`''` after Escape, the close button or a light-dismiss click) and rejects when there is no such `<dialog>`, and `toast(message, { tone, duration, action: { label, onClick } })`, which returns `{ dismiss() }` (0.4.0). What each does: [components.md](components.md#dialog), [components.md](components.md#toast).

### Messages

`KIT_PROTOCOL = 1` in both `code.ts` and the runtime. Every message type that starts with `kit:` belongs to the kit; host messages use any other `type` ([messages.md](messages.md#the-kit-protocol-protocol-1)).

| Message | Direction | Fields | Since |
|---|---|---|---|
| `kit:ready` | UI → main | `protocol` | 0.2.0 |
| `kit:resize` | UI → main | `width`, `height`, `user?`, `final?` | 0.2.0 |
| `kit:init` | main → UI | `protocol`, `mode`, `chrome`, `editorType`, `bounds` (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`), `size` (`width`, `height`), `defaultSize`, `restored` | 0.2.0 |
| `kit:fit` | main → UI | none | 0.3.0 |

### Storage

`figma.clientStorage` key `kit:window`, value `{ v: 1, editorType, width, height }` (`KitSizeRecord`) (0.2.0).

### Main-thread API (`code.ts`)

- `installKitWindow(options?)` (0.2.0) with the options `html`, `title`, `mode` (`'fit-content'`, the default, `'resizable'` or `'fixed'`), `size` (`width`, `height`), `bounds` (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`) and `persist` (default `true`). Unknown options and wrong types are ignored with one `console.warn`.
- **Returns** a frozen `KitWindow`: `mode`, `chrome`, `editorType` (0.2.0) and `fit()` (0.3.0).
- **Documented defaults:** size 320 × 360; bounds 240-960 × 120-900, minimum width 300 in Dev Mode and never below 70; the handle only in Figma Design, FigJam and Slides. They change only with a CHANGELOG entry under "Changed", never silently.
- `KIT_PROTOCOL` (the number `1`) is readable from host code (0.2.0).
- **Reserved names:** `installKitWindow` and every top-level name that starts with `kit` or `Kit` plus a capital letter, or with `KIT_`. Host code must not declare them; the kit may add more in any release. All the other top-level names in the block (`kitIsSizeRecord`, `kitClampSize`, `KIT_STORAGE_KEY`, ...) are internal.

### Types (`kit.d.ts`, global, export-free)

`KitMode`, `KitSize`, `KitBounds`, `KitSizeRecord`, `KitReadyMessage`, `KitResizeMessage`, `KitUiToMainMessage`, `KitInitMessage`, `KitMainToUiMessage`, `KitWindowOptions`, `KitWindow`, `KitUiApi` (0.2.0); `KitFitMessage` (0.3.0); `KitToastOptions`, `KitToastHandle`, `KitDialogLike` (0.4.0), and `KitUiApi`'s `dialog` and `toast` members (0.4.0). `KitDialogLike` is the DOM-free part of a `<dialog>` that `kit.dialog()` accepts (`showModal()`, `close(returnValue?)`, `returnValue`), so `kit.d.ts` still compiles in `code.ts`.

### npm scripts

`build`, `watch`, `audit`, `check:ui`, `test`, `test:e2e`, `preview`, `check` (0.2.0); `build:examples` (0.3.0). `build` compiles the root `code.ts` only; the examples have their own script, `build:examples`, so deleting `examples/` never breaks a plugin's build, and since 0.3.0 `check` runs both. What each script runs may grow; the names stay.

### Audit and `check:ui`

- **Rule ids** (19). From 0.2.0: `color-literal`, `control-height`, `manifest-fields`, `manifest-document-access`, `manifest-network-access`, `protocol-mismatch`. From 0.3.0: `section-drift`, `missing-disabled`, `sync-getter`, `unawaited-async`, `aria-label-override`, `missing-lang`, `missing-describedby`, `budget`, `ses-forbidden`, `top-level-module`, `onmessage-assign`, `js-color-literal`, `orphan-help`. What each one means: [pitfalls.md](pitfalls.md#audit-rules).
- **`budget` in 0.4.0.** The rule keeps its id and stays a warning, but it no longer fires at 64 KB or 1,600 lines, which a plugin's own code reaches quickly. It warns when the three `data-kit` blocks together pass 60 KB (a block pasted twice, edited, or holding your own code), and when the whole ui file passes 128 KB or 3,200 lines (too much for an agent to read in one go), each with its own message; fonts in `data:` URLs count in neither ([pitfalls.md](pitfalls.md#20-the-size-budget)). The kit's own budget for the starter, under 64 KB and 1,600 lines, is now a test of the repo (`test/budget.test.mjs`), not a rule for plugins.
- **Audit output:** `node scripts/audit.mjs [--json] [dir ...]`; one finding per line as `path:line  rule-id  message`; exit 1 when there is any error; warnings never fail it; `--json` prints the findings as JSON.
- **`check:ui` output:** `ui.html:line  TSxxxx  message`, plus the `ES2020`, `check-ui` and `module  warning:` lines described in [pitfalls.md](pitfalls.md#run-the-checks-after-every-change).

## Not public

These may change in any release without notice: everything inside the marked blocks that is not listed above (internal functions and variables, the private custom properties, selector structure, the `/* == name == */` sub-markers), the demo's markup and its messages (`create-shapes`, `close`, `selection`, `created`), the starter manifest's placeholder `id`, `preview.html`'s own UI, the `figma` stub, the test files and fixtures, the browser tests' `KIT_PREVIEW_PORT` variable, the functions the scripts export for the tests (such as `scripts/serve.mjs`'s `rootId`) and the preview server's `/__kit-root` address (0.4.0), `tools/probe/`, the CI workflows and the docs' wording and anchors.

## Change policy

**Before 1.0 (now).**

- **Additive only.** Since 0.2.0, nothing in the public surface is renamed or removed and nothing changes meaning. New names may be added in any release; each is listed in the CHANGELOG with the release that added it.
- **Deprecating.** A name that should go stays and keeps working. The CHANGELOG gets a "Deprecated" entry naming it, its replacement and the earliest release it may leave, which is 2.0. The docs mark it deprecated, and the audit may warn about it, never fail on it.
- **Fixing a value is not a rename.** Token and component values may be corrected to match Figma's measured UI3 (under "Changed").
- **Audit rules.** Rule ids are never renamed or reused. New rules may be added in any minor release, and an existing rule may learn to catch more cases of the same mistake; both are listed in the CHANGELOG, because a new error can fail a build that passed before.

**From 1.0.** Semantic versioning on the public surface: additions in minor releases, fixes in patches, and a rename or removal only in a major release, after at least one minor release that carried its "Deprecated" entry.

**The protocol number.** `KIT_PROTOCOL` stays `1` while every change can be safely ignored by an older half. A new `kit:*` type, or a new optional field, is added within protocol 1, as `kit:fit` was in 0.3.0; each side ignores `kit:*` types it doesn't know. The number goes up only when a message changes shape: a field is removed, renamed, becomes required or changes type or meaning, or a type is removed. A bump is a breaking change. It is listed in the CHANGELOG with upgrade steps, both files must then come from the same release, and each side warns once on a mismatch (never throws); `npm run audit` reports it as `protocol-mismatch`.

**The storage record.** The record carries `v: 1`. A change of shape bumps `v`, and a record with an unknown `v` is ignored, so each person gets the default size once rather than a misread size.

## Reporting a break

If an upgrade breaks a plugin, for example a class that no longer styles, a token that resolves to nothing, a message nobody answers or an option ignored with a warning, open an issue at https://github.com/alekseikipin/Figplug-ui-kit/issues with "Break:" at the start of the title. Include:

- the kit version before and after (the `<meta name="kit">` line, or the first comment of the tokens block, from each `ui.html`), and the `kit:window` start line from `code.ts`;
- the name that broke and the smallest markup or code that shows it;
- `figma.editorType` and the theme;
- the output of `npm run audit` and `npm run check:ui`.

A confirmed break of a name listed here is a bug in the kit: the next patch release restores the old name (alongside the new one, if both are needed) and the CHANGELOG says so.
