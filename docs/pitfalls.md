# Pitfalls

What goes wrong when a plugin is built by an agent (or by hand) and how to put it right. Most of these come from first-hand accounts of designers building Figma plugins with Claude Code, Cursor and similar tools: they rarely fail on components. They fail on context: a wrong manifest, a missing `await`, a sync getter under `dynamic-page`, invented hex colours.

Each pitfall below lists the **symptom** you see, the **cause**, the **fix**, and **what catches it**: an audit rule, the TypeScript build, or "not yet checked". Not-yet-checked items are the ones to read twice.

## Run the checks after every change

| Command | What it checks |
|---|---|
| `npm run build` | Compiles `code.ts` to `code.js` with `tsc -p tsconfig.json`. Catches DOM or `Blob` use in the main thread (as long as `tsconfig.json` keeps `"lib": ["es2020"]`, see [pitfall 3](#3-no-dom-lib-in-codets)), wrong types and bad kit calls. |
| `npm run audit` | `node scripts/audit.mjs [--json] [dir ...]`. The kit's rules on `manifest.json`, `ui.html`, `code.ts` and `code.js` (table below). |
| `npm run check:ui` | `node scripts/check-ui.mjs [dir ...]`. Type-checks the inline classic `<script>`s in `ui.html` against `kit.d.ts`: the kit runtime in strict mode, your own scripts non-strict. Also fails on APIs and syntax newer than ES2020 (`.at()`, `??=`, class fields), a ui file without `<script data-kit="runtime">`, and a folder with no ui file to check. `type="module"` scripts get a warning and are not checked (they have their own scope; the kit's scripts are classic). |
| `npm run check` | All of the above plus `npm test`, which also checks that `tsconfig.json` keeps `"lib": ["es2020"]`. |

The audit and `check:ui` look at `.` plus every `examples/*` folder that has a `manifest.json`, or the folders you name. The audit prints one line per finding, then a summary:

```
ui.html:212  color-literal  literal colour #333333 in color; use a var(--figma-color-*) token (transparent and currentColor are fine)
manifest.json:1  manifest-network-access  missing "networkAccess"; add { "allowedDomains": ["none"] } or list the domains the plugin calls
audit: 2 error(s), 0 warning(s) in 1 plugin folder; see docs/pitfalls.md
```

It exits 1 if any finding is an error (warnings never fail it), and `--json` prints the findings as an array of `{ file, line, rule, message, severity }`. `check:ui` prints `ui.html:123  TS2345  message`, with the line in `ui.html` as your editor counts it (the code is `ES2020` for newer syntax and `check-ui` for a missing runtime or ui file), and exits 1 on any error.

### Audit rules

| Rule | Checks | Pitfall |
|---|---|---|
| `color-literal` | A hex, `rgb()`, `hsl()` (and other colour functions) or named colour in any `<style>`, `style=""` attribute, or SVG `fill`/`stroke`/`stop-color` attribute, also when minified (`1px solid#000`) or written with character references in an attribute (`&#35;fff`). The only exceptions are `--kit-shadow-*` and `--kit-scrim` inside `<style data-kit="tokens">`. | [Tokens-only colours](#8-tokens-only-colours) |
| `control-height` | A `height`, `min-height`, `max-height`, `block-size`, `min-block-size` or `max-block-size` other than 24 or 32 px on a rule whose subject is a `button`, `input`, `select`, `.kit-button` (and its `-primary`, `-secondary`, `-tertiary`, `-danger`, `-large` variants), `.kit-input`, `.kit-select` or `.kit-icon-button`, or in an inline `style` on one. px, rem (16 px), pt and `calc()` of one length are converted; other units (`em`, `vh`) always count; `var()`, percentages and keywords never do, and 0 or 1 px (the visually-hidden idiom) pass. Also `--kit-control-height` or `--kit-control-height-large` set, in any `<style>` or any element's `style`, to anything but 24 px, 32 px or one of those two variables. | [24 and 32 px controls](#9-24-and-32-px-controls) |
| `manifest-document-access` | `"documentAccess"` is missing or not `"dynamic-page"`. | [Manifest shape](#6-manifest-shape) |
| `manifest-network-access` | `"networkAccess"` is missing, `allowedDomains` is not a non-empty array, or `["*"]` has no `reasoning`. | [Manifest shape](#6-manifest-shape) |
| `manifest-fields` | `manifest.json` is missing or not JSON; `name`, `id`, `api`, `main`, `ui` or `editorType` is missing; `main` is not a string naming a `.js` file that exists; `ui` is not a file name or a non-empty object of file names, or names a missing file; `editorType` is not a non-empty array of `figma`, `figjam`, `dev`, `slides` and `buzz`, or combines `dev` with `figjam`. A byte-order mark at the start of the file is a warning (whether Figma accepts one is unverified). | [Manifest shape](#6-manifest-shape) |
| `protocol-mismatch` | `KIT_PROTOCOL` differs between `code.ts` (or the main `.js`) and the `ui.html` runtime, or only one side has it; or the compiled `code.js` says something other than `code.ts` (it is stale: run `npm run build`). Comments and strings are ignored. | [Kit blocks from two releases](#16-kit-blocks-from-two-releases) |

Planned for Phase 2: `section-drift`, `missing-disabled`, `sync-getter`, `unawaited-async`, `aria-label-override`, `missing-lang`, `missing-describedby`, `budget`, `ses-forbidden`, `top-level-module`, `onmessage-assign`.

**Author note: the audit's size.** PLAN.md budgets the first audit at about 40 lines. `scripts/audit.mjs` is several times that because the rules have to read real files, not just grep them: it masks HTML comments, script bodies, CSS comments, strings and `url()` so none of them produce findings; it parses attributes the way a browser does (quoting, the first of a repeated attribute, character references) and keeps every finding on its true line; it walks nested CSS rules to know each declaration's selector; it converts lengths and reads selector subjects so `control-height` neither misses `block-size` nor flags a checkbox; and it checks the manifest's field types. Each case is pinned by a fixture or variant in `test/audit.test.mjs`. It still has no dependencies and stays one file, with one function per rule.

### At a glance

| # | Pitfall | Caught by |
|---|---|---|
| 1 | [Two threads, two sets of globals](#1-two-threads-two-sets-of-globals) | `npm run build` (main thread side only) |
| 2 | [No bundling, no imports, no top-level export](#2-no-bundling-no-imports-no-top-level-export) | not yet checked (`top-level-module`, Phase 2) |
| 3 | [No `dom` lib in code.ts](#3-no-dom-lib-in-codets) | `npm test` (`test/tsconfig.test.mjs`); `npm run build` does not |
| 4 | [Await every `*Async` call](#4-await-every-async-call) | not yet checked (`unawaited-async`, Phase 2) |
| 5 | [Sync getters under `dynamic-page`](#5-sync-getters-under-dynamic-page) | not yet checked (`sync-getter`, Phase 2); editors strike them through |
| 6 | [Manifest shape](#6-manifest-shape) | `manifest-fields`, `manifest-document-access`, `manifest-network-access` |
| 7 | [Text the sandbox rejects (`import(`, `<!--`, `-->`)](#7-text-the-sandbox-rejects) | not yet checked (`ses-forbidden`, Phase 2) |
| 8 | [Tokens-only colours](#8-tokens-only-colours) | `color-literal` |
| 9 | [24 and 32 px controls](#9-24-and-32-px-controls) | `control-height` |
| 10 | [A unique plugin id](#10-a-unique-plugin-id) | not yet checked |
| 11 | [Run tsc through the project](#11-run-tsc-through-the-project) | `npm run build` uses the right command |
| 12 | [TypeScript 6 turned `types` off by default](#12-typescript-6-turned-types-off-by-default) | `npm run build` fails loudly |
| 13 | [postMessage shapes differ on each side](#13-postmessage-shapes-differ-on-each-side) | partly `npm run check:ui`; `onmessage-assign` in Phase 2 |
| 14 | [What a message can carry](#14-what-a-message-can-carry) | not yet checked |
| 15 | [`Blob` exists only in the UI](#15-blob-exists-only-in-the-ui) | `npm run build` |
| 16 | [Kit blocks from two releases](#16-kit-blocks-from-two-releases) | `protocol-mismatch` |
| 17 | [Smaller traps](#17-smaller-traps) | not yet checked |

## 1. Two threads, two sets of globals

**Symptom.** `ReferenceError: figma is not defined` in the UI's console, or `document is not defined` (or `window`) in the main thread.

**Cause.** A plugin runs in two places. `code.ts` (compiled to `code.js`) runs in Figma's main-thread sandbox: it has the `figma` API and no DOM. `ui.html` runs in an iframe: it has the DOM and no `figma` object. They share nothing but messages.

**Fix.** Read and change the document only in `code.ts`. Render and handle input only in `ui.html`. Pass plain data between them ([messages.md](messages.md)). `figma.clientStorage` is main-only too, so the UI asks main to read or write it.

**Caught by.** `npm run build` rejects DOM names in `code.ts` (`TS2584: Cannot find name 'document'`), but only while `tsconfig.json` keeps `"lib": ["es2020"]` ([pitfall 3](#3-no-dom-lib-in-codets)). Nothing checks `figma` in the UI yet: `check:ui` would only catch it if your script's types say so.

Sources: [How plugins run](https://developers.figma.com/docs/plugins/how-plugins-run/), [Creating a user interface](https://developers.figma.com/docs/plugins/creating-ui/).

## 2. No bundling, no imports, no top-level export

**Symptom.** The plugin fails to start with a syntax error on line 1 ("Unexpected token"), or crashes because `code.js` ends with `export {};`.

**Cause.** Figma runs the manifest's `main` file as one plain script. `import` needs a bundler, which the kit deliberately does not have. Any `import` or `export` in `code.ts`, even `export {}`, makes TypeScript emit a module, and `tsc` then writes `export {};` at the end of `code.js` (verified with TypeScript 6.0.3).

**Fix.** Keep all main-thread code in `code.ts` with no `import` or `export` statements. The kit's types are global on purpose: `kit.d.ts` declares them without exports, so `code.ts` sees them through `tsconfig.json`'s `files`. In `ui.html`, inline everything: `<script src>` only works for domains you list in `networkAccess`.

**Caught by.** Not yet checked (`top-level-module`, Phase 2). Look at the last line of `code.js` after a build.

Sources: [Libraries and bundling](https://developers.figma.com/docs/plugins/libraries-and-bundling/), [forum: export added during compile causes crash](https://forum.figma.com/t/figma-plugin-export-added-during-compile-causes-crash/65934).

## 3. No `dom` lib in code.ts

**Symptom.** `npm run build` passes, and then the plugin throws `ReferenceError: document is not defined` (or `window`) in Figma.

**Cause.** Someone (often an agent "fixing" `Cannot find name 'document'`) added `"dom"` to `lib` in `tsconfig.json`, or removed `lib` so the default pulls the DOM in. From then on `document`, `window` and the rest of the DOM type-check in `code.ts`, although the main thread has none of them. The DOM's `console` and `fetch` also collide with the ones Figma's typings declare (`TS2451: Cannot redeclare block-scoped variable 'console'`, `TS2300: Duplicate identifier 'Navigation'`), but those errors sit in `.d.ts` files, and the kit's `"skipLibCheck": true` skips them, so the build stays green (verified with TypeScript 6.0.3).

**Fix.** Keep `"lib": ["es2020"]` exactly. If the compiler says `document` is missing in `code.ts`, the code is in the wrong thread ([pitfall 1](#1-two-threads-two-sets-of-globals)), not missing a lib.

**Caught by.** `npm test` (and so `npm run check`): `test/tsconfig.test.mjs` fails unless `lib` is exactly `["es2020"]`. `npm run build` alone does not, and the audit does not read `tsconfig.json`.

## 4. Await every `*Async` call

**Symptom.** A value prints as `[object Promise]`, a node is `undefined` when you expected it, changes land after the plugin closed, or the console shows an unhandled promise rejection.

**Cause.** Every Figma API ending in `Async` returns a promise. Without `await` the code moves on before the work is done, and errors vanish.

**Fix.** `await` each call inside an `async` function, `return` it, or collect several with `await Promise.all([...])`. Wrap the body of message handlers in `try`/`catch` and always answer the UI, also on failure. Load fonts before editing text: `await figma.loadFontAsync(node.fontName as FontName)` (see [pitfall 17](#17-smaller-traps)).

**Caught by.** Not yet checked (`unawaited-async`, Phase 2).

## 5. Sync getters under `dynamic-page`

**Symptom.** A call throws as soon as it runs, and the error names an `*Async` replacement. Your editor shows the old API struck through (the typings mark it `@deprecated` and say it throws under `dynamic-page`).

**Cause.** With `"documentAccess": "dynamic-page"` (required for new plugins, and what the kit's manifest uses) Figma loads only the current page. The old synchronous APIs that might need another page throw instead.

**Fix.** Use the async version and `await` it:

| Throws under `dynamic-page` | Use instead |
|---|---|
| `figma.getNodeById(id)` | `await figma.getNodeByIdAsync(id)` |
| `figma.getStyleById(id)` | `await figma.getStyleByIdAsync(id)` |
| `figma.getFileThumbnailNode()` | `await figma.getFileThumbnailNodeAsync()` |
| `figma.getLocalPaintStyles()`, `getLocalTextStyles()`, `getLocalEffectStyles()`, `getLocalGridStyles()` | the same name plus `Async`, e.g. `await figma.getLocalPaintStylesAsync()` |
| `figma.variables.getVariableById(id)`, `getVariableCollectionById(id)` | `await figma.variables.getVariableByIdAsync(id)`, `getVariableCollectionByIdAsync(id)` |
| `figma.variables.getLocalVariables()`, `getLocalVariableCollections()` | `await figma.variables.getLocalVariablesAsync()`, `getLocalVariableCollectionsAsync()` |
| `node.setRangeFillStyleId(...)`, `node.setRangeTextStyleId(...)` | `await node.setRangeFillStyleIdAsync(...)`, `setRangeTextStyleIdAsync(...)` |
| reading `component.instances` | `await component.getInstancesAsync()` |
| reading `style.consumers` | `await style.getStyleConsumersAsync()` |
| reading `instance.mainComponent` | `await instance.getMainComponentAsync()` |
| `figma.currentPage = page` | `await figma.setCurrentPageAsync(page)` |
| `node.fillStyleId = id` (also `strokeStyleId`, `effectStyleId`, `gridStyleId`, `textStyleId`) | `await node.setFillStyleIdAsync(id)` (and `setStrokeStyleIdAsync`, `setEffectStyleIdAsync`, `setGridStyleIdAsync`, `setTextStyleIdAsync`) |
| `node.backgroundStyleId = id` | deprecated: `await node.setFillStyleIdAsync(id)` |
| `node.reactions = [...]`, `node.vectorNetwork = ...` | `await node.setReactionsAsync([...])`, `await node.setVectorNetworkAsync(...)` |
| string ids passed to `figma.variables.createVariable`, `setBoundVariable`, `setExplicitVariableModeForCollection`, `clearExplicitVariableModeForCollection` | pass the `Variable` / `VariableCollection` objects |

These need `await figma.loadAllPagesAsync()` first (slow on big files): `figma.root.findAll`, `findOne`, `findAllWithCriteria`, `findWidgetNodesByWidgetId`, and `figma.on('documentchange')`. Prefer the current page (`figma.currentPage.findAll(...)`) or `figma.on('stylechange')` / `page.on('nodechange')`. A page other than the current one needs `await page.loadAsync()` before you touch its `children`, `find*` or `exportAsync`.

Still synchronous and fine: reading `figma.currentPage`, `figma.currentPage.selection` (read and write), `figma.currentPage.children` and `findAll`, `figma.root.children`, and the `selectionchange` and `currentpagechange` events.

**Caught by.** Not yet checked (`sync-getter`, Phase 2). `npm run build` does not reject them either.

Sources: [Migrating to dynamic page loading](https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/), [Accessing the document](https://developers.figma.com/docs/plugins/accessing-document/).

## 6. Manifest shape

**Symptom.** "Import plugin from manifest" refuses the file, the plugin is missing from an editor's menu, "Loading n pages for plugin…" appears before every run, or network calls fail with a Content Security Policy error.

**Cause.** A field is missing or wrong. The common ones: `main` names `code.ts` (Figma runs JavaScript, never TypeScript); no `documentAccess`; no `networkAccess`; `editorType` combining `dev` with `figjam`, which Figma does not support.

**Fix.** Start from the kit's `manifest.json`:

```json
{
  "name": "Kit starter",
  "id": "kit-starter-change-this-id",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma", "figjam", "slides", "buzz"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
```

- `main` is the compiled `code.js`, which the kit commits so the folder imports without a terminal. Run `npm run build` after editing `code.ts`.
- `"allowedDomains": ["none"]` blocks all network access and still allows inline scripts and styles. To call an API, list its domains (`"https://api.example.com"`); `["*"]` needs a `reasoning` string, and so do localhost entries (or put dev servers in `devAllowedDomains`). The domains and reasoning appear on your Community page.
- Dev Mode needs a separate manifest (`["figma", "dev"]` plus `"capabilities": ["inspect"]`); see [surfaces.md](surfaces.md).
- Change `id` before you share the plugin ([pitfall 10](#10-a-unique-plugin-id)).

**Caught by.** `manifest-fields`, `manifest-document-access`, `manifest-network-access`.

Sources: [Manifest](https://developers.figma.com/docs/plugins/manifest/), [Making network requests](https://developers.figma.com/docs/plugins/making-network-requests/), [Setting editor type](https://developers.figma.com/docs/plugins/setting-editor-type/).

## 7. Text the sandbox rejects

**Symptom.** The plugin fails to load with `SyntaxError: possible import expression rejected around line 1`, or a similar "HTML comment rejected" error, though the code looks fine.

**Cause.** Figma's main-thread sandbox scans the source text before running it, in the style of the SES (Secure ECMAScript) shim: it rejects anything that looks like a dynamic `import(` call and the HTML comment markers `<!--` and `-->`, even inside comments and strings. Bundled libraries (Babel, template engines) trip it; so does an HTML string with a comment in it passed to `figma.showUI`. Figma does not document the rule; the error wording matches SES's check.

**Fix.** Never write those three character sequences in `code.ts` (and so `code.js`), not even in a comment. Reword comments ("dynamic import"), and split strings that must contain them: `'<' + '!--'`. Keep HTML in `ui.html`, not in strings in `code.ts`.

The kit's `ui.html` files contain no `<!--` either, as a precaution: whether Figma's sandbox scans `ui.html` the way it scans `code.ts` is UNVERIFIED (`ui.html` reaches `figma.showUI` as the `__html__` string). Comments in them are `/* */` in CSS and `//` in scripts, and the kit version lives in `<meta name="kit">` and in the tokens block's header comment, not in an HTML comment. Keep your own markup free of HTML comments too.

**Caught by.** Not yet checked (`ses-forbidden`, Phase 2).

Sources: [forum: possible import expression rejected](https://forum.figma.com/t/getting-syntaxerror-possible-import-expression-rejected-around-line-1-when-importing-babel/90549), [SES_IMPORT_REJECTED](https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_IMPORT_REJECTED.md).

## 8. Tokens-only colours

**Symptom.** The plugin looks right in one theme and wrong in the other: white panels in dark mode, unreadable text, a blue accent in FigJam (whose brand colour is purple).

**Cause.** A literal colour (`#333`, `rgb(...)`, `white`) never changes with the theme. With `themeColors: true`, Figma injects `--figma-color-*` variables that switch live between light, dark and FigJam; literals ignore them. A `var(--figma-color-bg, #fff)` fallback is a literal too.

**Fix.** Use a `var(--figma-color-*)` token for every colour ([tokens.md](tokens.md) lists them and what each is for). `transparent`, `currentColor`, `inherit` and `none` are fine anywhere. SVG icons use `fill="currentColor"` or `stroke="currentColor"` and take their colour from the CSS `color` of their parent. The only literals in the kit are the shadow and scrim tokens (`--kit-shadow-*`, `--kit-scrim`) inside `<style data-kit="tokens">`; use them through `var()`, never redefine them elsewhere.

**Caught by.** `color-literal`, in `<style>` blocks, `style=""` attributes and SVG paint attributes, minified or not, with attribute values decoded as the browser decodes them. Comments, strings, `url(...)` contents and selectors such as `#app` are ignored. Not checked: colours set from JavaScript (`el.style.color = '#fff'`) and inside `data:` SVGs in `url()`. Use a `data:` SVG only as a `mask-image` with `background-color: var(--figma-color-icon)`, where its fill colour doesn't matter.

Sources: [CSS variables and theming](https://developers.figma.com/docs/plugins/css-variables/).

## 9. 24 and 32 px controls

**Symptom.** Buttons and fields look oversized next to Figma's own panels (28, 36, 40 px are web habits).

**Cause.** Figma's UI3 panels use 24 px controls, with 32 px for large ones (measured; see [tokens.md](tokens.md)).

**Fix.** Don't set heights on controls at all: kit classes already use `height: var(--kit-control-height)` (24 px) and `.kit-button-large` uses `var(--kit-control-height-large)` (32 px). If you must, use those variables. Don't redefine `--kit-control-height` (pointing it at `var(--kit-control-height-large)` for a section of large controls is fine). Icons, checkboxes, radios and pseudo-elements (spinners, carets) have their own sizes and are not controls; neither are wrappers such as `.kit-input-icon` or your own `.kit-button-group`. Multi-line controls (`textarea`, `select[multiple]`, `select[size]`) size to their rows, so they are not held to 24 or 32 px either.

**Caught by.** `control-height`. It checks height properties in px, rem, pt or a one-length `calc()` (other units such as `em` always count as wrong), and leaves `var()`, percentages, keywords and 0 or 1 px alone. Author note: the rule was first specified with `textarea` among the checked controls; it exempts it, and multi-line selects, because no multi-line field is 24 or 32 px tall and an agent told to fix such a finding would squash it.

## 10. A unique plugin id

**Symptom.** A plugin you just made opens at another plugin's saved window size, or sees its stored settings; or after changing the id, everything it stored is gone.

**Cause.** `figma.clientStorage` is scoped to the manifest's `id`. Every plugin copied from the kit with the placeholder id `kit-starter-change-this-id` shares one storage bucket on your machine, and data saved under an old id can't be read under a new one.

**Fix.** Give each plugin its own `id` before its first run: use "Plugins > Development > New plugin…" to get one from Figma, or any unique string for local use. Figma assigns the final id when you publish.

**Caught by.** Not yet checked.

Sources: [clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage/).

## 11. Run tsc through the project

**Symptom.** With TypeScript 6: `error TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline.` With TypeScript 5: `Cannot find name 'figma'`.

**Cause.** `tsc code.ts` (a file name on the command line) ignores `tsconfig.json`, so the Figma typings and the kit's settings never load. TypeScript 6 turned that into an error.

**Fix.** Use `npm run build` (which runs `tsc -p tsconfig.json`) or `npm run watch`. A watch task stops when VS Code closes and has to be started again; see [loop.md](loop.md).

**Caught by.** `npm run build` always uses the right command; nothing stops a hand-typed `tsc code.ts`.

## 12. TypeScript 6 turned `types` off by default

**Symptom.** `error TS2304: Cannot find name 'figma'` (and `__html__`) with a tsconfig copied from Figma's quickstart template or the plugin-typings README.

**Cause.** TypeScript 6 changed the default of `types` to `[]`, so `typeRoots` alone no longer loads `@figma/plugin-typings`. TypeScript 7 keeps that default, and an unpinned `npm install -D typescript` now installs 7.

**Fix.** Keep the kit's `tsconfig.json`: `"types": ["@figma/plugin-typings"]` (no `typeRoots`), `"lib": ["es2020"]`, and `files` listing `code.ts` and `kit.d.ts`. The kit pins `typescript` to `~6.0.3`.

**Caught by.** `npm run build` fails loudly.

Sources: [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/).

## 13. postMessage shapes differ on each side

**Symptom.** Messages never arrive, or arrive as `undefined`, or (possibly) a handler stops firing after you paste the kit into a plugin that assigns `figma.ui.onmessage`.

**Cause.** The two directions are not symmetric, and agents mix them up:

| | Send | Receive |
|---|---|---|
| UI (`ui.html`) | `parent.postMessage({ pluginMessage: msg }, '*')` | `window.addEventListener('message', (e) => { const msg = e.data && e.data.pluginMessage; })` |
| Main (`code.ts`) | `figma.ui.postMessage(msg)` | `figma.ui.on('message', (msg) => { ... })` |

The `'*'` is required (the iframe has a `null` origin). Forgetting `pluginMessage` on the UI side, or reading `msg.pluginMessage` on the main side, loses the payload.

**Fix.** Use the table. Give your own messages a `type` that does not start with `kit:`, and ignore types you don't know. Register handlers with `figma.ui.on('message', ...)`, never `figma.ui.onmessage = ...`: whether assigning `onmessage` removes the kit's listener is unverified ([messages.md](messages.md)).

**Caught by.** Partly `npm run check:ui` (the kit's own message types are checked against `kit.d.ts`); `onmessage-assign` is planned for Phase 2.

## 14. What a message can carry

**Symptom.** A function arrives as nothing, a class instance loses its methods, a node you posted is not a node on the other side, or a `Blob` or `ArrayBuffer` never arrives.

**Cause.** Messages are copied, not shared, with structured-clone-like rules. Allowed: objects, arrays, numbers, strings, booleans, `null`, `undefined`, `Date` and `Uint8Array`. Not allowed: `Blob`, `ArrayBuffer`, typed arrays other than `Uint8Array`. Functions and prototypes are dropped.

**Fix.** Send plain data. A node is an API object, not data: send the fields you need (`id`, `name`, `type`) and look it up again in main with `await figma.getNodeByIdAsync(id)`. Send bytes as `Uint8Array`.

**Caught by.** Not yet checked.

Sources: [Creating a user interface](https://developers.figma.com/docs/plugins/creating-ui/).

## 15. `Blob` exists only in the UI

**Symptom.** `ReferenceError: Blob is not defined` in the main thread when saving an export.

**Cause.** The main-thread sandbox has no `Blob`, `URL.createObjectURL` or downloads; only the UI iframe does.

**Fix.** In main, `const bytes = await node.exportAsync({ format: 'PNG' })` and `figma.ui.postMessage({ type: 'export-done', bytes, name })`. In the UI, `new Blob([msg.bytes], { type: 'image/png' })`, `URL.createObjectURL(blob)`, and click an `<a download>`.

**Caught by.** `npm run build` (`TS2304: Cannot find name 'Blob'` in `code.ts`).

Sources: [exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/).

## 16. Kit blocks from two releases

**Symptom.** The window doesn't fit its content, the resize handle does nothing, or the console shows a protocol-mismatch warning: each side warns once (two `console.warn` lines), naming both protocol numbers.

**Cause.** `code.ts`'s `kit:window` block and `ui.html`'s three `data-kit` blocks came from different kit releases (or one side was never pasted), so they speak different versions of the `kit:*` messages.

**Fix.** Re-paste the `kit:window` block in `code.ts` and all three `data-kit` blocks in `ui.html` from the same release, then `npm run build`.

**Caught by.** `protocol-mismatch`, which also reports a `code.js` that is older than `code.ts` (Figma runs `code.js`).

## 17. Smaller traps

- **`figma.closePlugin()` doesn't stop your code.** Lines after it still run, against an API that is already shut down. Follow it with `return`.
- **Nothing can be saved on close.** `figma.on('close')` cannot wait for an async write, so `clientStorage.setAsync` there is unreliable. Save when the value changes, as the kit does for the window size.
- **Load fonts before editing text.** Changing `characters`, `fontSize`, `fontName` and similar layout properties throws unless the font was loaded with `await figma.loadFontAsync(...)`. Check `node.hasMissingFont` first, and note `fontName` can be `figma.mixed`.
- **Global names collide in `code.ts`.** It is a script, so your top-level names share one namespace with Figma's typings. `type Action` fails as a duplicate; `interface Rect` silently merges with Figma's `Rect`. Prefix your own types (the kit uses `Kit`). Top-level names that start with `kit` or `Kit` followed by a capital letter, or with `KIT_`, and `installKitWindow` are reserved for the kit block, which may add more; don't declare your own. A clashing `const` or `function` fails `tsc`; a clashing `interface` silently merges.
- **No `localStorage` in the UI.** The iframe has a `null` origin, so browser storage is unavailable or throws. Store through `figma.clientStorage` in main, via messages.
- **Don't rely on `<form>` submission in the UI.** In a sandboxed iframe without `allow-forms`, Chromium blocks the submission before the `submit` event fires, so the handler never runs (seen in a test host; Figma's own sandbox flags are not documented). Use `type="button"` with a `click` handler, plus a `keydown` handler for Enter in a field, as the demo in `ui.html` does.

All of these: not yet checked.
