# Changelog

All notable changes to the kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/) as far as a set of pasted files can: the names under "Public surface" are the API.

**Renames stop here.** Every breaking rename (message types, storage key, class names, token names) lands in 0.2.0. No public name listed below is renamed or removed before 1.0; later releases only add.

## [Unreleased]

Nothing yet.

## [0.3.0] - Unreleased

The date is set when the `v0.3.0` tag is pushed (pending, like `v0.2.0`'s; see [docs/release-checklist.md](docs/release-checklist.md)). Phase 2 of [PLAN.md](PLAN.md#5-phase-2--next-months-3-4): the components the archetypes needed, chrome v2, audit v2, five curated examples and the docs a designer needs from a first plugin to a published one. Nothing here has been run in the real Figma app yet; what that leaves open is marked UNVERIFIED in the docs.

**No renames.** No public name from 0.2.0 is renamed or removed, `KIT_PROTOCOL` stays `1`, and the storage key and record are unchanged, so saved window sizes carry over. Upgrading from 0.2.0 is a re-paste of the kit blocks and `kit.d.ts` ([docs/upgrade.md](docs/upgrade.md#from-020-to-030)).

### Public surface added

Everything listed under 0.2.0 still holds; these names join it.

**CSS classes** ([docs/components.md](docs/components.md)):

- Fields: `kit-textarea`, `kit-number` (with `kit-number-prefix`), `kit-color` (with `kit-color-swatch`), `kit-checkbox`, `kit-radio`.
- Buttons: `kit-icon-button`.
- Content: `kit-section-header`; `kit-list` with `kit-list-row`, `kit-list-row-icon`, `kit-list-row-label`, `kit-list-row-meta`; `kit-empty` with `kit-empty-title`, `kit-empty-text`; `kit-notice` with `kit-notice-text`; `kit-footer` (the sticky footer).
- Switching and overlays: `kit-tabs` with `kit-tablist` and `kit-tab` (CSS-only, up to six panels); `kit-tooltip` with `kit-tooltip-host` and the placements `kit-tooltip-above`, `kit-tooltip-start`, `kit-tooltip-end` (CSS-only); `kit-menu` with `kit-menu-item` and `kit-menu-separator` (the first stateful component: a native popover the runtime places and drives from the keyboard).
- Layout: `kit-scroll`, a region with its own scroll for long lists in a `fit-content` window; its height is `--kit-scroll-max-height` (default 240px).

**Attributes and states.** `data-kit-tone="info|success|warning|danger"` on a notice; `aria-current="true"` (button rows) or `aria-selected="true"` (`role="option"` rows) on a list row; `checked` on checkboxes, radios and tabs, and the `indeterminate` property on a checkbox; `aria-expanded`, kept in sync by the runtime on every button that opens a menu (`popovertarget` + `aria-haspopup="menu"`).

**Tokens.** `--kit-z-tooltip`.

**Messages and types.** Main → UI `kit:fit`, within protocol 1: a 0.2.0 runtime ignores it like any `kit:*` type it doesn't know ([docs/messages.md](docs/messages.md#kitfit-main-to-ui)). `installKitWindow()` now returns `{ mode, chrome, editorType, fit() }`. New global types `KitFitMessage` and `KitWindow.fit()`; `KitMainToUiMessage` is `KitInitMessage | KitFitMessage`.

**UI API.** `window.kit.version` is `'0.3.0'`; `protocol` and `fit()` as before.

**CONFIG override.** Two new keys for translations: `strings.resizeHint` (the handle's description) and `strings.announce` (said after a keyboard resize; `{width}` and `{height}` are filled in). Both must be non-blank strings ([docs/window-chrome.md](docs/window-chrome.md#customising-config)).

**Owned by the runtime.** The id `kit-resize-hint` and the attribute `data-kit-announce` (the hint and the live region it adds at the end of `<body>`); don't use them for anything else.

**Pure helpers** between `/* kit:pure:start */` and `/* kit:pure:end */`: `widestSnap`, `announceText` and `placeMenu` join `clampSize`, `nextSnap` and `sameSize` (tested in `test/pure.test.mjs`; not an API for host code).

**npm scripts.** `build:examples`; `check` now runs it too, and `test` also runs `examples/*/*.test.mjs`.

**Audit rule ids** (13 new; [docs/pitfalls.md](docs/pitfalls.md#audit-rules)): `missing-disabled`, `sync-getter`, `unawaited-async`, `aria-label-override`, `missing-lang`, `missing-describedby`, `orphan-help`, `section-drift`, `budget`, `ses-forbidden`, `top-level-module`, `onmessage-assign`, `js-color-literal`.

### Added

- Fourteen components, each in `preview.html` in every state, in light, dark and FigJam: textarea, checkbox, radio, number field, colour field, icon button, section header, list and row, empty state, inline notice, sticky footer, tabs, tooltip and menu. The menu adds five capture listeners on `document` at startup and none per open ([docs/window-chrome.md](docs/window-chrome.md#gestures-and-keys)).
- `.kit-scroll` for long lists, so a `fit-content` window stays short and its `kit-footer` stays in view.
- Chrome v2: the handle gets a screen-reader hint through `aria-describedby`, one `aria-live` announcement 150 ms after the last resize key (pointer resizes stay silent), End for the widest snap width, and fit on request with `kit:fit` / `KitWindow.fit()` from `code.ts` ([docs/window-chrome.md](docs/window-chrome.md#screen-readers-the-hint-and-the-announcement)).
- Audit v2: the 13 rules above, which cover every failure class in the Phase 1 one-shot log, each with a regression fixture in `test/fixtures/`, plus the five Phase 1 one-shot plugins kept as fixtures. `section-drift` compares the copies of the kit inside one repo (`preview.html` against `ui.html`, each `examples/*` against the root), not your plugin against a release ([docs/upgrade.md](docs/upgrade.md#what-the-checks-compare)).
- Five curated examples in `examples/`, one per archetype and covering all three window modes: `rename-layers` (`fit-content`), `export-selection` (`resizable`), `content-fill` (`fixed`), `variables-sync` (`resizable`) and `a11y-contrast` (`fit-content`). Each began as a one-shot agent run in a fresh clone (automated one-shot rate 5 of 5; the import into Figma is still pending for every run) and ships its README with the prompt, the agent's diff and what curation changed, plus golden tests that fail on the agent's original code ([docs/prompts.md](docs/prompts.md#one-shot-log)).
- `npm run build:examples` (`scripts/build-examples.mjs`) compiles whichever examples exist, separately from `npm run build`, so deleting `examples/` never breaks your plugin's build. CI checks every committed example `code.js` too, and the Pages workflow stages the examples for the preview.
- `preview.html`: a *Plugin* picker (or `?plugin=examples/<name>`) runs any example in its own window mode; the *Window mode* switch works with any `installKitWindow({ ... })` call. Its `figma` stub now has the current page's `on('nodechange')`, `getNodeByIdAsync`, `commitUndo`, text layers whose characters need `figma.loadFontAsync`, `exportAsync`, `figma.mixed`, a small `figma.variables` and sample selections ([docs/loop.md](docs/loop.md#preview-in-a-browser)).
- Docs: [first-plugin.md](docs/first-plugin.md) (a guided first plugin from the starter), [upgrade.md](docs/upgrade.md), [publishing.md](docs/publishing.md) (the Community checklist), [ui3-mapping.md](docs/ui3-mapping.md) (official UI3 kit component to kit class), "Implementation notes" in [components.md](docs/components.md#implementation-notes) and [window-chrome.md](docs/window-chrome.md#implementation-notes); a README section per topic; `CONTRIBUTING.md`; a GitHub bug-report form that asks for the editor, the theme and the kit header.

### Changed

- The tests no longer depend on the starter demo: the kit's browser tests run against a small fixture page (`e2e/fixtures/`) whose kit blocks are byte copies of `ui.html`'s, and the demo's own unit and browser tests skip themselves once the demo is replaced, so `npm run check` and `npm run test:e2e` stay green with your plugin in place.
- The kit blocks keep only short comments, so `ui.html` stays near 56 KB under the 64 KB `budget`; the rationale they held moved to the "Implementation notes" sections of the docs. The kit blocks are about 52.6 KB of that.
- `kit-text-secondary` resets margins, like `kit-help`, so a `<p class="kit-text-secondary">` lines up with other text. Add spacing in your own CSS if you relied on the browser's paragraph margins.
- Version markers say `kit v0.3.0`: `<meta name="kit">`, the tokens block header, the `kit:window:start` line, `kit.d.ts`'s first line and `kit.version`; `package.json` is `0.3.0`.
- `.gitignore` ignores `node_modules` as a file or symlink too, not only as a folder.

## [0.2.0] - Unreleased

The date is set when the `v0.2.0` tag is pushed (pending, see [docs/release-checklist.md](docs/release-checklist.md)). This release turns the 2025 demo into a runnable, installable starter. Upgrading from the 2025 files is a replacement, not a patch: see [Breaking renames](#breaking-renames-from-the-2025-09-13-version).

### Public surface

**Files.** `manifest.json`, `code.ts` and the committed `code.js`, `kit.d.ts`, `ui.html`, `tsconfig.json`, `package.json` + `package-lock.json`, `LICENSE` (MIT); `preview.html` and `tokens.figma-fallback.css` (browser preview only); `scripts/audit.mjs`, `scripts/check-ui.mjs`, `scripts/serve.mjs`, `scripts/make-fonts-css.mjs`; tests in `test/` (`node:test`) and `e2e/` with `playwright.config.mjs`; `.github/workflows/ci.yml` and `pages.yml`; `AGENTS.md`, `CLAUDE.md`, `.claude/skills/kit-ui/`; `docs/`; `tools/probe/` (development-only measuring plugin).

**Marked blocks** (paste unchanged; upgrade by re-pasting all of them from one release):

- `ui.html`, in `<head>`, in this order: `<style data-kit="tokens">`, `<style data-kit="components">`, `<script data-kit="runtime">` (with the pure helpers `clampSize`, `nextSnap`, `sameSize` between `/* kit:pure:start */` and `/* kit:pure:end */`).
- `code.ts`: from `// ==== kit:window:start · ... ====` to `// ==== kit:window:end ====`.
- Version markers: `<meta name="kit" content="kit v0.2.0 · protocol 1 · ...">` and the first comment of the tokens block.

**CSS classes.**

- Layout: `kit-app`, `kit-section`, `kit-divider`, `kit-stack`, `kit-row`, `kit-field`, `kit-label`, `kit-help`, `kit-heading`, `kit-text-secondary`, `kit-visually-hidden`, `kit-icon`, `kit-icon-small`.
- Button: `kit-button` with `kit-button-primary`, `kit-button-secondary`, `kit-button-tertiary`, `kit-button-danger`, and `kit-button-large`.
- Fields: `kit-input`, `kit-input-icon`, `kit-select` (a wrapper around a native `<select>`).
- Window: `kit-resize-handle`.
- States are attributes, not classes: `disabled` / `aria-disabled="true"`, `aria-pressed="true"`, `aria-invalid="true"` with `aria-describedby`, `aria-busy="true"`. The `--kit-button-*` custom properties inside the button rules are private.

**Attributes.** `data-kit-root` (the element the window fits to), `data-kit-resize` (the handle), `data-kit-config` (on a `<script type="application/json">`), and on `<html>`, set by the runtime: `data-kit-chrome="on|off"`, `data-kit-mode="fit-content|resizable|fixed"`.

**Tokens** (in `<style data-kit="tokens">`; colours always come from Figma's `--figma-color-*`):

- Spacing: `--kit-spacer-0-5`, `-1`, `-1-5`, `-2`, `-2-5`, `-3`, `-4`, `-5`, `-6` (2 to 40 px).
- Radius: `--kit-radius-small`, `--kit-radius-medium`, `--kit-radius-large`, `--kit-radius-full`.
- Controls: `--kit-control-height` (24px), `--kit-control-height-large` (32px), `--kit-icon-size`, `--kit-icon-size-small`, `--kit-border-width`, `--kit-focus-width`.
- Type: `--kit-font-family`, `--kit-font-size`, `--kit-line-height`, `--kit-letter-spacing`, `--kit-font-weight`, `--kit-font-weight-strong`, and the `-large`, `-heading` and `-small` sets of `--kit-font-size-*`, `--kit-line-height-*`, `--kit-letter-spacing-*`.
- Motion: `--kit-duration-small`, `--kit-duration-medium`, `--kit-duration-large`, `--kit-easing`.
- Layers: `--kit-z-handle`, `--kit-z-toast`, `--kit-z-menu`.
- Elevation: `--kit-shadow-tooltip`, `--kit-shadow-menu`, `--kit-shadow-dialog`, `--kit-scrim` (the only literal colours in the kit, with dark values under `:root.figma-dark`).

**Messages** (`KIT_PROTOCOL = 1` in both files; types in `kit.d.ts`):

- UI → main: `kit:ready { protocol }`, `kit:resize { width, height, user?, final? }`.
- Main → UI: `kit:init { protocol, mode, chrome, editorType, bounds, size, defaultSize, restored }`.
- Every other `type` is the host's; the kit ignores it.

**Storage.** `figma.clientStorage` key `kit:window`, value `{ v: 1, editorType, width, height }`.

**Main-thread API.** `installKitWindow(options?)` with `html`, `title`, `mode` (`'fit-content'` default, `'resizable'`, `'fixed'`), `size`, `bounds` (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`) and `persist` (default `true`); returns `{ mode, chrome, editorType }`. Unknown options and values of the wrong type are ignored with one `console.warn` naming them. `KIT_PROTOCOL` (the number `1`) is readable from host code. Every other top-level name in the `kit:window` block (`kitIsSizeRecord`, `kitClampSize`, `KIT_STORAGE_KEY`, ...) is internal and may change in any release. Top-level names that start with `kit` or `Kit` plus a capital letter, or with `KIT_`, are reserved for the kit: a later release may add more, so host code must not declare its own (`code.ts` is one script scope: a clashing `const` or `function` fails `tsc`, a clashing `interface` silently merges).

**UI API.** `window.kit`: `version` (`'0.2.0'`), `protocol` (`1`), `fit()`.

**CONFIG override.** `<script type="application/json" data-kit-config>` with any of `snapWidths`, `step`, `bigStep`, `initTimeoutMs`, `fallbackMode`, `strings.resizeLabel`; read once at startup; unknown keys and wrong types or ranges (`step` and `bigStep` are whole numbers of 1 or more, `strings.resizeLabel` is not blank) are ignored with one warning, and text that is not a JSON object is ignored whole with one warning. `CONFIG` in the runtime block itself is never edited.

**Types** (global, in `kit.d.ts`): `KitMode`, `KitSize`, `KitBounds`, `KitSizeRecord`, `KitReadyMessage`, `KitResizeMessage`, `KitUiToMainMessage`, `KitInitMessage`, `KitMainToUiMessage`, `KitWindowOptions`, `KitWindow`, `KitUiApi`.

**npm scripts.** `build`, `watch`, `audit`, `check:ui`, `test`, `test:e2e`, `preview`, `check`.

**Audit rule ids.** `color-literal`, `control-height`, `manifest-fields`, `manifest-document-access`, `manifest-network-access`, `protocol-mismatch`.

### Added

- A runnable folder: `manifest.json` (`"main": "code.js"`, `"documentAccess": "dynamic-page"`, `"networkAccess": { "allowedDomains": ["none"] }`, editors Design, FigJam, Slides and Buzz), committed `code.js`, `package.json`, `tsconfig.json` for TypeScript 6, MIT `LICENSE`.
- Window modes `fit-content` (height follows `[data-kit-root]` through a `ResizeObserver`), `resizable` and `fixed`; per-editor bounds (Dev Mode minimum width 300); the resize handle only in Design, FigJam and Slides.
- The window opens hidden and shows on the first fit (500 ms cap), so it never jumps from the default size.
- Keyboard resizing on the handle (arrows, Shift + arrows, Enter/Space to snap, Home to reset), double-click snapping, Escape to cancel a drag.
- Button tertiary and danger variants, the large size, a leading icon, selected (`aria-pressed`), loading (`aria-busy`) and disabled states; input and select disabled and error states with help text, where the focus ring still shows over the error and disabled rings; `type="search"` inputs without Chromium's own clear button; field, label and help layout.
- Measured UI3 tokens (24px controls, 5px/13px radii, 11px on 16px type, elevation shadows) and a browser fallback palette for all 174 Figma colour tokens.
- `npm run audit`, `npm run check:ui`, unit tests (`npm test`), browser tests (`npm run test:e2e`), the `preview.html` gallery (`npm run preview`), a CI workflow and a GitHub Pages workflow for the preview (Pages must first be enabled by the owner; neither has run on GitHub yet, see [docs/release-checklist.md](docs/release-checklist.md)).
- Agent context: `AGENTS.md`, `CLAUDE.md`, the `kit-ui` skill, and docs in `docs/`.
- `tools/probe/`, a development plugin that measures what the docs leave open.
- Window chrome edge cases, each with a browser test: only the pointer that started a drag ends it; the second press of a double-click that drags is not snapped; in `fit-content` mode the height is measured again when a drag ends; fast key presses add up; the first size request uses `kit:init`'s size, so a restore is not undone when Figma resizes the iframe late; replacing the markup or the `[data-kit-root]` element keeps fitting, with no ResizeObserver loop error; the first fit waits for web fonts for at most `CONFIG.initTimeoutMs`; a `kit:init` that arrives after the UI's own 500 ms fallback still ends at the right size.
- Main thread: `fixed` mode ignores `kit:resize`; the saved-size read is capped at 300 ms (a slower read opens at the default size rather than jumping later); a `figma.ui.resize` that throws is caught and warned about once; a second `installKitWindow()` call also drops the first one's pending storage read.
- Checks: `protocol-mismatch` also reports a `code.js` that is older than `code.ts`; `manifest-fields` checks the types of `main`, `ui` and each `editorType` value and warns about a byte-order mark; `color-literal` finds hex after a word (`solid#000`) and entity-encoded `#`; `control-height` also covers `block-size`, `max-height` and rem, pt and `calc()` lengths, and `--kit-control-height` overrides; `check:ui` reports syntax newer than ES2020, fails on a missing folder, ui file or runtime block, and skips `type="module"` scripts with a warning; the preview server answers only requests addressed to this machine (`Host` check) and survives malformed requests; the Pages workflow deploys only after CI has passed on `main`.

### Changed

- Colours follow Figma's theme class (`figma-light` / `figma-dark`), never the operating system: `color-scheme` is no longer `light dark`.
- Controls are 24px (32px large), not 32px; icons use a 24px frame, not 12px; radii are 2/5/13px, not 1/4/6px; body text is 11px on 16px with UI3's letter-spacing.
- Default window 320 × 360 (was 320 × 345); default bounds 240-960 × 120-900 (were 280-900 × 200-800), set only in `code.ts` and sent to the UI.
- Arrow keys move 8px, 32px with Shift (were 16px wide / 12px tall, ×4 with Shift).
- Only sizes the person chose are saved, immediately when a gesture ends and debounced mid-drag; content fits are never saved; `fit-content` remembers the width only; sizes are kept per editor.

### Fixed

- The resize script's undeclared `activePointerId` (it threw under `'use strict'`), listeners that outlived an Escape, a pending frame that overrode the Escape revert, and direct sends that bypassed the dedupe.
- Right-click and second pointers started drags; the 300 ms click guard dropped real drags and a plain click persisted a size.
- `NaN` and non-numbers reached `figma.ui.resize`; the saved size was trusted without checking its shape.
- `body { min-height: 100vh }` stopped the window from shrinking; the height fit measured kit-only selectors and ran once.
- Hover borrowed `border-selected`; an `aria-label` overrode a field's visible label; the handle was a `div` with `role="separator"` and a 20px target; no `lang`; `div` headings and dividers.
- Noisy `console.log` and a `figma.notify` on storage failure in the main thread.
- Repo: stale docs link, off-repo screenshots, a personal line in `.gitignore`, no licence or issues link.

### Removed

- Density presets (`[data-density="compact"]`, `[data-density="comfortable"]`).
- Tokens with no 0.2.0 name (replacements in [Breaking renames](#breaking-renames-from-the-2025-09-13-version)): `--field-bg`, `--field-border`, `--field-text`, `--button-padding-x`, `--input-padding-x`, `--caret-size` and `--resizer-size`, which the 2025 components used, and `--size-7`, which nothing used.
- The `persist-size` message (folded into `kit:resize` with `user: true, final: true`).

### Breaking renames from the 2025-09-13 version

The 2025 files (this repo before 0.2.0, and the npm packages `figplug-ui-kit@1.0.1` and `create-figplug-ui-kit@1.0.0`) don't mix with 0.2.0. Replace all three files, then move your own code and markup across with this table.

| 2025 | 0.2.0 |
|---|---|
| UI → main `{ type: 'ready' }` | `kit:ready { protocol: 1 }` |
| UI → main `{ type: 'resize', width, height }` | `kit:resize { width, height, user?, final? }` |
| UI → main `{ type: 'persist-size', width, height }` | removed: `kit:resize` with `user: true, final: true` saves |
| main → UI `{ type: 'init', hasSavedSize, width, height, persistenceEnabled }` | `kit:init { protocol, mode, chrome, editorType, bounds, size, defaultSize, restored }` |
| storage key `plugin-size`, value `{ width, height }` | `kit:window`, value `{ v: 1, editorType, width, height }` (old saved sizes are not read: each person gets the default size once) |
| `const PERSIST_WINDOW_SIZE = true` | `installKitWindow({ persist })` |
| `MIN_WIDTH` ... `MAX_HEIGHT` in `code.ts`, `MIN_W` ... `MAX_H` in `ui.html` | `installKitWindow({ bounds })`, sent to the UI in `kit:init` |
| top-level `figma.showUI(...)` | `installKitWindow()` calls `showUI` |
| `figma.ui.onmessage = ...` | `figma.ui.on('message', ...)`; host code should use it too |
| `.container` | `.kit-section` |
| `div.divider` | `hr.kit-divider` |
| `.category-label` | `.kit-heading` on an `<h1>`/`<h2>` |
| `.group-label` | `label.kit-label` |
| `.button-group` | `.kit-row` |
| `.component-library`, `.component-section` | removed (demo wrappers) |
| `.button`, `.button-primary`, `.button-secondary` | `.kit-button`, `.kit-button-primary`, `.kit-button-secondary` |
| `.button .icon`, `.icon-right` | `svg.kit-icon` first in the button; `.icon-right` removed (wrap the label in a `<span>`) |
| `.input-field` | `.kit-input` |
| `.input-with-icon` > `.input-icon` | `.kit-input-icon` > `svg.kit-icon` |
| `.dropdown` > `select.dropdown-select` | `.kit-select` > `select` (no class) |
| `div.resize-handle#resizeHandle[role=separator]`, `.resizing` | `button.kit-resize-handle[data-kit-resize]`; `:active` while dragging |
| `--size-1` ... `--size-9` (2-32px) | `--kit-spacer-0-5`, `-1`, `-1-5`, `-2`, `-2-5`, `-3`, `-4`, `-5` (`--size-7`, 20px, removed) |
| `--field-bg`, `--field-border`, `--field-text` | removed: use `var(--figma-color-bg-secondary)`, `var(--figma-color-border)`, `var(--figma-color-text)` directly |
| `--button-padding-x` (8px), `--input-padding-x` (12px) | removed: the button, input and select rules set their own padding; in your own CSS use `--kit-spacer-2` (8px) or `--kit-spacer-2-5` (12px) |
| `--caret-size` (5px, the select caret), `--resizer-size` (20px) | removed: the select chevron and the 24px handle are sized inside the components block; not public |
| `--radius-2`, `--radius-4`, `--radius-6` (1/4/6px) | `--kit-radius-small` (2px), `--kit-radius-medium` (5px) |
| `--control-height` (32px) | `--kit-control-height` (24px), `--kit-control-height-large` (32px) |
| `--border-width`, `--focus-ring-width` | `--kit-border-width`, `--kit-focus-width` |
| `--icon-size` (12px) | `--kit-icon-size` (24px), `--kit-icon-size-small` (16px) |
| `--font-family`, `--font-sm` (11px), `--font-md` (12px) | `--kit-font-family`, `--kit-font-size` (11px), `--kit-font-size-large` (13px) |
| `[data-density]` presets | removed |

All kit names now use neutral prefixes (`kit-*` classes, `--kit-*` tokens, `kit:*` messages, `data-kit-*` attributes), so a rename of the brand never breaks a pasted copy.

## 2025-09-13

First public version: `code.ts` and `ui.html` with four components and the resize script, no manifest or build setup. Published to npm as `figplug-ui-kit@1.0.1` and `create-figplug-ui-kit@1.0.0`; both are to be deprecated in favour of this repo.

[Unreleased]: https://github.com/alekseikipin/Figplug-ui-kit/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/alekseikipin/Figplug-ui-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/alekseikipin/Figplug-ui-kit/releases/tag/v0.2.0
