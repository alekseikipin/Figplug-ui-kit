# AGENTS.md

For coding agents (Claude Code, Cursor, Codex, Copilot, ...) building a Figma plugin from this repo. People start with [README.md](README.md). The canonical docs are in [docs/](docs/index.md); this file is the short version and links into them.

## What this repo is

A zero-build starter for a Figma **classic plugin** with native-looking UI. It imports into the Figma desktop app from `manifest.json` with no terminal, because the compiled `code.js` is committed.

| File | Runs in | What you do with it |
|---|---|---|
| `manifest.json` | (read by Figma) | Change `name` and `id`; keep `"main": "code.js"`, `"documentAccess": "dynamic-page"`, `networkAccess` |
| `code.ts` → `code.js` | main thread | Write plugin logic below `// ---- Your plugin starts here ----`; rebuild |
| `ui.html` | iframe | Replace what is inside `<main class="kit-app" data-kit-root>`; your CSS and JS in your own blocks |
| `kit.d.ts` | both (types) | Never edit; protocol types for `kit:*` messages and `installKitWindow` |

No bundler, framework, runtime dependency, web component, CLI or generator: don't add one. The only build is `tsc` (code.ts → code.js).

Adding the kit to a plugin that already exists (Figma's own template, for example): follow [docs/messages.md](docs/messages.md#adding-the-kit-to-an-existing-plugin).

## Two threads, and how they talk

- `code.ts` runs in Figma's main-thread sandbox: the `figma` API, no DOM (`document`, `window`, `Blob`, `localStorage` don't exist).
- `ui.html` runs in an iframe: the DOM, no `figma` object. Document reads and writes happen only in `code.ts`.
- They share nothing but messages ([docs/messages.md](docs/messages.md)):

| | Send | Receive |
|---|---|---|
| UI | `parent.postMessage({ pluginMessage: msg }, '*')` | `window.addEventListener('message', (e) => { const msg = e.data && e.data.pluginMessage; })` |
| Main | `figma.ui.postMessage(msg)` | `figma.ui.on('message', (msg) => { ... })`, never `figma.ui.onmessage = ...` |

- The kit's own messages are `kit:ready`, `kit:init`, `kit:resize` and `kit:fit` (types in `kit.d.ts`). Give yours any other `type` (never `kit:...`), check the `type` first, ignore what you don't know.
- Type your messages like `kit.d.ts` types the kit's: one `interface` per message type in `code.ts` (`interface RenameMessage { type: 'rename'; prefix: string }`), a union per direction (`type UiToMain = RenameMessage | CloseMessage`), and a type guard that checks `type` and every field before the handler trusts it (the demo's `isCreateShapesMessage`). Prefix the names if they could collide (pitfall 9 below).
- The demo's messages, to replace with yours: UI → main `{ type: 'create-shapes', count, shape }` and `{ type: 'close' }`; main → UI `{ type: 'selection', count }` and `{ type: 'created', count }`.
- Payloads are plain data: objects, arrays, strings, numbers, booleans, `null`, `Date`, `Uint8Array`. No functions, nodes, `Blob` or `ArrayBuffer`.

## The marked blocks: never edit them

`ui.html` has exactly three marked elements in `<head>`: `<style data-kit="tokens">`, `<style data-kit="components">` and `<script data-kit="runtime">`. `code.ts` has one block from `// ==== kit:window:start ...` to `// ==== kit:window:end ====`. They must stay byte-identical to the release, so the audit can compare them and an upgrade is a re-paste. Don't edit inside them, not even to fix or "improve" something; report a kit bug instead. Customise from outside:

- **Your CSS**: the plain `<style>` after the three blocks (it starts `/* Your styles. ... */`).
- **Your JS**: a plain classic `<script>` with `'use strict'` at the end of `<body>`, where the demo script is. No modules, no `<script src>` (`networkAccess` blocks it).
- **Runtime options**: `<script type="application/json" data-kit-config>{"snapWidths":[300,400]}</script>` anywhere in the page. Keys: `snapWidths`, `step`, `bigStep`, `initTimeoutMs`, `fallbackMode`, and the strings for translations: `strings.resizeLabel` (the handle's name), `strings.resizeHint` (its description for screen readers) and `strings.announce` (said after keyboard resizes; `{width}` and `{height}` are filled in). Unknown keys and bad values (`step` and `bigStep` must be whole numbers of 1 or more, strings non-blank) are ignored with one warning; JSON that is broken or not an object is ignored whole ([docs/window-chrome.md](docs/window-chrome.md#customising-config)).
- **Window options**: `installKitWindow({ mode, size, bounds, persist, title, html })` in `code.ts`, called once, before your own code. It calls `figma.showUI` itself: never call `showUI` or `figma.ui.resize` yourself. Unknown or wrong-typed options are ignored with one warning. Modes: `'fit-content'` (default; height follows `[data-kit-root]`), `'resizable'`, `'fixed'` ([docs/window-chrome.md](docs/window-chrome.md)).
- **Fit on request**: `installKitWindow()` returns `{ mode, chrome, editorType, fit() }`. In `'resizable'` mode, call `fit()` after posting the UI content that changes its height (it sends `kit:fit`; the UI fits the height and keeps the width); from the UI side the same is `kit.fit()`. `'fit-content'` follows its content on its own, `'fixed'` ignores both ([docs/window-chrome.md](docs/window-chrome.md#fit-on-request-kitfit-and-kitwindowfit)).
- Keep the resize handle once, after `</main>`: `<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>`.
- No HTML comments (`<!--`) anywhere in `ui.html`, a precaution: whether Figma's sandbox scans `ui.html` the way it scans `code.ts` is UNVERIFIED. Use `/* */` in CSS and `//` in scripts; the kit version is in `<meta name="kit">`. ([#7](docs/pitfalls.md#7-text-the-sandbox-rejects))

## Colours: tokens only

Every colour is `var(--figma-color-*)`: Figma injects these (`themeColors: true`) and switches them with light, dark and FigJam. Allowed keywords: `transparent`, `currentColor`, `inherit`, `none`. No hex, `rgb()`, `hsl()` or named colours, no `var(--figma-color-bg, #fff)` fallbacks, also not from your scripts (`el.style.color = '#f00'`). SVG icons use `currentColor`. Shadows use `var(--kit-shadow-tooltip|menu|dialog)`, overlays `var(--kit-scrim)`. Pick tokens from the role → token cheat sheet in [docs/tokens.md](docs/tokens.md#role--token-cheat-sheet) (text, text-secondary, bg, bg-secondary, border, bg-brand + text-onbrand, text-danger, the disabled set ...).

Colours that come from the document (a swatch for a fill, a variable or a style) are data, not styling: set them as a CSS custom property on the element, `swatch.style.setProperty('--swatch', hex)`, and paint with `background-color: var(--swatch)` in your CSS ([pitfall 8](docs/pitfalls.md#8-tokens-only-colours)).

## Sizes, layout and components

- Controls are **24px** tall (`--kit-control-height`), large ones **32px** (`kit-button-large`, `--kit-control-height-large`). Don't set `height` or `min-height` on controls at all.
- Spacing `--kit-spacer-*` (2, 4, 6, 8, 12, 16, 24, 32, 40px), radii `--kit-radius-small|medium|large|full`, type `--kit-font-*` (body 11px on 16px). Never change `html { font-size }`.
- Layout: `<main class="kit-app" data-kit-root>`, `kit-section` (16px padding; separate sections with `<hr class="kit-divider">`), `kit-stack` (column), `kit-row` (row), `kit-field` > `label.kit-label` + control + `p.kit-help`, `kit-heading` on a real `<h1>`/`<h2>`, `kit-text-secondary`, `kit-visually-hidden`, `kit-icon` / `kit-icon-small`, `kit-scroll`.
- The 18 components, markup and every state in [docs/components.md](docs/components.md): button (`kit-button` + one of `kit-button-primary|secondary|tertiary|danger`, always `type="button"`), `kit-icon-button`, text input (`kit-input`, `kit-input-icon`), `kit-textarea`, `kit-number`, `kit-color`, `<div class="kit-select"><select>...</select></div>` (native popup), `kit-checkbox`, `kit-radio`, `kit-tabs`, `kit-tooltip`, `kit-menu`, `kit-list`, `kit-empty`, `kit-notice`, `kit-section-header`, `kit-footer` and `kit-resize-handle`. Use only classes listed there. For something the kit lacks, write host CSS with your own class name (not `kit-*`), tokens only.
- Menu: `<button class="kit-button kit-button-secondary" type="button" popovertarget="m" aria-haspopup="menu" aria-expanded="false">` + `<div class="kit-menu" id="m" popover role="menu">` holding `<button class="kit-menu-item" role="menuitem" type="button">` items and `<hr class="kit-menu-separator">`; the runtime places it, moves focus with the arrow keys and closes it after your item's `click` handler has run ([docs/components.md](docs/components.md#menu)).
- States are attributes, never classes: `disabled` (or `aria-disabled="true"`), `aria-pressed="true"`, `aria-invalid="true"` + `aria-describedby` pointing at the `.kit-help`, `aria-busy="true"`, `aria-current="true"` on a list row.
- `.kit-help` is only for the help or error text of one control (its `aria-describedby` points at it); a status line or any other secondary text is `.kit-text-secondary`.
- Long lists (layers, variables, results) go in `<div class="kit-scroll">`, which scrolls on its own, so a `fit-content` window stays short and its `kit-footer` stays in view ([docs/components.md](docs/components.md#long-lists-kit-scroll)).
- The root must get its height from its content: never `height: 100%` or `min-height: 100vh` on `[data-kit-root]` or `body`.

## Status text and downloads

- **Announce results, not typing.** A `role="status"` (or `aria-live`) region is read out on every change: update it when something finishes ("Renamed 3 layers", "No matches"), never on every keystroke or input event. Validation errors go in the field's `.kit-help` with `aria-invalid`, not in the status line.
- **A page can't confirm a download.** The plugin iframe may block a download silently and no event says whether it saved, so say what you did: "Started 3 downloads", never "Downloaded 3 files" ([pitfall 15](docs/pitfalls.md#15-blob-exists-only-in-the-ui)).

## The loop

- **ui.html changed**: no build. The person reruns the plugin in Figma with Cmd+Opt+P (Ctrl+Alt+P on Windows).
- **code.ts changed**: `npm run build` (or keep `npm run watch` running), then rerun. Always `tsc -p tsconfig.json` via the scripts, never `tsc code.ts`.
- Then: `npm run audit && npm run check:ui`. `npm run check` runs build + audit + check:ui + unit tests.
- No `node_modules`? `npm install` first (Node 24 or later).

Details: [docs/loop.md](docs/loop.md).

## Pitfalls (each is explained in docs/pitfalls.md)

1. **No `import`, `export` or bundling in `code.ts`**, not even `export {}`; tsc would end `code.js` with `export {};` and Figma fails on it. Everything stays in one file. ([#2](docs/pitfalls.md#2-no-bundling-no-imports-no-top-level-export))
2. **No `dom` lib**: keep `tsconfig.json` as it is (`"lib": ["es2020"]`, `"types": ["@figma/plugin-typings"]`). "Cannot find name 'document'" in `code.ts` means the code belongs in `ui.html`. ([#3](docs/pitfalls.md#3-no-dom-lib-in-codets), [#12](docs/pitfalls.md#12-typescript-6-turned-types-off-by-default))
3. **`await` every `*Async` call**, inside `try`/`catch`, and always answer the UI, also on failure. ([#4](docs/pitfalls.md#4-await-every-async-call))
4. **`dynamic-page` getters**: use `getNodeByIdAsync`, `getLocalVariablesAsync`, `getLocalPaintStylesAsync`, `setCurrentPageAsync`, `getMainComponentAsync` ...; `figma.root.findAll` needs `loadAllPagesAsync` (prefer `figma.currentPage`). Load fonts before editing text: `await figma.loadFontAsync(...)`. ([#5](docs/pitfalls.md#5-sync-getters-under-dynamic-page))
5. **Manifest shape**: `name`, unique `id`, `"api": "1.0.0"`, `"main": "code.js"` (never `.ts`), `"ui": "ui.html"`, non-empty `editorType` (`dev` can't be combined with `figjam`), `"documentAccess": "dynamic-page"`, `"networkAccess": { "allowedDomains": ["none"] }` or the real domains. Give every new plugin its own `id`: `figma.clientStorage` is keyed by it. ([#6](docs/pitfalls.md#6-manifest-shape), [#10](docs/pitfalls.md#10-a-unique-plugin-id))
6. **Sandbox text**: never write `import(`, `<!--` or `-->` in `code.ts`, even in comments or strings. ([#7](docs/pitfalls.md#7-text-the-sandbox-rejects))
7. **`Blob` only in the UI**: main sends `Uint8Array` bytes (`exportAsync`), the UI builds the `Blob` and the download. ([#15](docs/pitfalls.md#15-blob-exists-only-in-the-ui))
8. **postMessage shapes** differ per side (table above); `'*'` is required. ([#13](docs/pitfalls.md#13-postmessage-shapes-differ-on-each-side), [#14](docs/pitfalls.md#14-what-a-message-can-carry))
9. **Global names**: `code.ts` is a script sharing one namespace with Figma's typings; prefix your types (`Action`, `Variable`, `Rect`, `Paint` are taken). Top-level names that start with `kit` or `Kit` plus a capital letter, or with `KIT_` (`kitClampSize`, `KitSize`, `KIT_PROTOCOL`), and `installKitWindow` are reserved for the kit, which may add more; don't declare your own. After `figma.closePlugin()`, `return`. No `<form>` submit and no `localStorage` in the UI. ([#17](docs/pitfalls.md#17-smaller-traps))

## Always run the checks after generating

After every change, and before you say you are done:

```sh
npm run build && npm run audit && npm run check:ui
```

Fix **every** finding and rerun until all three are clean; never tell the person to import a plugin that fails them. The audit prints `path:line  rule-id  message` and exits 1 on errors; warnings don't fail it, but read each one. Rule ids: `manifest-fields`, `manifest-document-access`, `manifest-network-access`, `color-literal`, `js-color-literal`, `control-height`, `missing-disabled`, `aria-label-override`, `missing-lang`, `missing-describedby`, `orphan-help`, `sync-getter`, `unawaited-async`, `top-level-module`, `ses-forbidden`, `onmessage-assign`, `protocol-mismatch`, `section-drift`, `budget` (meaning and fix of each: [docs/pitfalls.md](docs/pitfalls.md#audit-rules)). `check:ui` type-checks the classic `<script>`s in `ui.html` against `kit.d.ts` and prints `ui.html:line  TSxxxx  message`; `ES2020` marks syntax newer than ES2020, `check-ui` a missing folder, ui file or runtime block, and `module  warning:` a `type="module"` script it skipped.

## Then tell the person how to import it

Finish with the check results and these steps (no terminal needed):

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file they can edit.
2. Figma menu > **Plugins > Development > Import plugin from manifest...**, and pick `manifest.json` in this folder. Some versions label it "Import new plugin from manifest...". Use the Plugins menu, not Widgets.
3. Run it from **Plugins > Development**, then the plugin's name. After editing `ui.html`, Cmd+Opt+P reruns it; after editing `code.ts`, build first.

If nothing happens, or macOS asks for access to Documents, see the import gotchas in [docs/install.md](docs/install.md#import-gotchas). Console: Plugins > Development > Show/Hide console.
