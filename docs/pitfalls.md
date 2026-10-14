# Pitfalls

What goes wrong when a plugin is built by an agent (or by hand) and how to put it right. Most of these come from first-hand accounts of designers building Figma plugins with Claude Code, Cursor and similar tools: they rarely fail on components. They fail on context: a wrong manifest, a missing `await`, a sync getter under `dynamic-page`, invented hex colours.

Each pitfall below lists the **symptom** you see, the **cause**, the **fix**, and **what catches it**: an audit rule (by its id), the TypeScript build, a test, or "not yet checked". Not-yet-checked items are the ones to read twice.

## Run the checks after every change

| Command | What it checks |
|---|---|
| `npm run build` | Compiles `code.ts` to `code.js` with `tsc -p tsconfig.json`. Catches DOM or `Blob` use in the main thread (as long as `tsconfig.json` keeps `"lib": ["es2020"]`, see [pitfall 3](#3-no-dom-lib-in-codets)), wrong types and bad kit calls. |
| `npm run audit` | `node scripts/audit.mjs [--json] [dir ...]`. The kit's rules on `manifest.json`, `ui.html`, `code.ts`, `code.js` and, for drift between copies of the kit, `kit.d.ts` and `preview.html` ([rule reference](#audit-rules)). |
| `npm run check:ui` | `node scripts/check-ui.mjs [dir ...]`. Type-checks the inline classic `<script>`s in `ui.html` against `kit.d.ts`: the kit runtime in strict mode, your own scripts non-strict. Also fails on APIs and syntax newer than ES2020 (`.at()`, `??=`, class fields), a ui file without `<script data-kit="runtime">`, and a folder with no ui file to check. `type="module"` scripts get a warning and are not checked (they have their own scope; the kit's scripts are classic). |
| `npm run check` | `npm run build`, then `npm run build:examples` (compiles whichever `examples/` folders exist), the audit and `check:ui` above, then `npm test`, which also checks that `tsconfig.json` keeps `"lib": ["es2020"]`. |

The audit and `check:ui` look at `.` plus every `examples/*` folder that has a `manifest.json`, or the folders you name; `tools/` and `test/fixtures/` only when you name them. The audit prints one line per finding, then a summary:

```
ui.html:212  color-literal  literal colour #333333 in color; use a var(--figma-color-*) token (transparent and currentColor are fine)
ui.html:240  orphan-help  warning: no aria-describedby points at this .kit-help#status: .kit-help is the help or error text of one control (...)
manifest.json:1  manifest-network-access  missing "networkAccess"; add { "allowedDomains": ["none"] } or list the domains the plugin calls
audit: 2 error(s), 1 warning(s) in 1 plugin folder; see docs/pitfalls.md
```

It exits 1 if any finding is an error (warnings never fail it), and `--json` prints the findings as an array of `{ file, line, rule, message, severity }`. `check:ui` prints `ui.html:123  TS2345  message`, with the line in `ui.html` as your editor counts it (the code is `ES2020` for newer syntax and `check-ui` for a missing folder, runtime or ui file), and exits 1 on any error. A `type="module"` script it skipped prints `ui.html:123  module  warning: ...`, which doesn't fail it.

### Audit rules

Fix every error; read every warning (a warning marks something that is often wrong, or a risk that is not yet measured). "Your own" code means everything outside the kit's marked blocks: the three `data-kit` blocks in `ui.html` and the `kit:window` block in `code.ts` are checked only for drift, never by the style, markup and script rules.

| Rule | Severity | What it checks | How to fix it | Pitfall |
|---|---|---|---|---|
| `manifest-fields` | error (a byte-order mark: warning) | `manifest.json` is missing or not JSON; `name`, `id`, `api`, `main`, `ui` or `editorType` is missing; `main` is not a string naming a `.js` file that exists; `ui` is not a file name or a non-empty object of file names, or names a missing file; `editorType` is not a non-empty array of `figma`, `figjam`, `dev`, `slides` and `buzz`, or combines `dev` with `figjam`. | Start from the kit's `manifest.json`; `main` is the compiled `code.js` (run `npm run build`). | [6](#6-manifest-shape) |
| `manifest-document-access` | error | `"documentAccess"` is missing or not `"dynamic-page"`. | `"documentAccess": "dynamic-page"`. | [6](#6-manifest-shape) |
| `manifest-network-access` | error | `"networkAccess"` is missing, `allowedDomains` is not a non-empty array, or `["*"]` has no `reasoning`. | `"networkAccess": { "allowedDomains": ["none"] }`, or list the domains you call. | [6](#6-manifest-shape) |
| `color-literal` | error | A hex, `rgb()`, `hsl()` (and other colour functions) or named colour in any `<style>`, `style=""` attribute, or SVG `fill`/`stroke`/`stop-color` attribute, also when minified (`1px solid#000`) or written with character references in an attribute (`&#35;fff`). The only exceptions are `--kit-shadow-*` and `--kit-scrim` inside `<style data-kit="tokens">`, and the `mask` / `mask-image` properties (a mask uses only alpha, so `linear-gradient(black, transparent)` is fine there). | A `var(--figma-color-*)` token; `currentColor` for icons. | [8](#8-tokens-only-colours) |
| `js-color-literal` | error | A colour **literal** set from your own `<script>`: assigned (`=` or `+=`) to `el.style.<prop>`, `el.style['<prop>']`, `el.style.cssText` or `el.style`, set with `Object.assign(el.style, { prop: ... })`, passed to `style.setProperty()`, `setAttribute('style' \| 'fill' \| ...)` or `setAttributeNS(ns, 'fill', ...)`, or inside a `style="..."` / `fill="..."` in an HTML string or template (`innerHTML`). Values held in variables (document data) are not literals and pass, as do `${}` holes in a template and a colour function a literal leaves open for data (`'rgb(' + r + ...`). | `'var(--figma-color-*)'`, or an attribute your CSS styles with tokens; a colour from the document goes in a custom property: `el.style.setProperty('--swatch', hex)` plus `background: var(--swatch)` in CSS. | [8](#8-tokens-only-colours) |
| `control-height` | error | A `height`, `min-height`, `max-height`, `block-size`, `min-block-size` or `max-block-size` other than 24 or 32 px on a rule whose subject is a `button`, `input`, `select`, `.kit-button` (and its `-primary`, `-secondary`, `-tertiary`, `-danger`, `-large` variants), `.kit-input`, `.kit-select` or `.kit-icon-button`, or in an inline `style` on one (nested rules count as CSS nesting reads them: `.kit-button { &.big { ... } }` is `.kit-button.big`). px, rem (16 px), pt and `calc()` of one length are converted; other units (`em`, `vh`) always count; `var()`, percentages and keywords never do, and 0 or 1 px (the visually-hidden idiom) pass. Also `--kit-control-height` or `--kit-control-height-large` set, in any `<style>` or any element's `style`, to anything but 24 px, 32 px or one of those two variables. | Remove the height (kit classes size themselves), or use `var(--kit-control-height)` / `var(--kit-control-height-large)`. | [9](#9-24-and-32-px-controls) |
| `missing-disabled` | error | In your own `<style>`, a `:hover` rule that gives visible feedback (colour, background, border, outline, shadow, opacity, filter, cursor, a custom property) to a control (a `button`, `input`, `select` or `textarea`, a kit control class, `[role="button"]`, or a class or id that your markup or an HTML string in your script puts on one), when no rule styles that control `:disabled` or `[aria-disabled]` and the hover selector does not exclude them (nested `&:hover` and `&:disabled` rules count). Only on pages that disable something (a `disabled` or `aria-disabled` attribute, or `disabled` in your script). | `.row:hover:not(:disabled):not([aria-disabled="true"])`, or a `.row:disabled, .row[aria-disabled="true"]` rule with the disabled tokens. | [18](#18-hover-on-a-disabled-control) |
| `aria-label-override` | error | An `aria-label` that replaces a visible label without keeping its words: on a control with a `<label for>` or a wrapping `<label>`, on a button, link, `<summary>` or `role="button"`-like element with visible text, or on a submit button with a `value`. Every word of the visible text has to start a word of the `aria-label`. Visually hidden labels, icon-only and symbol-only content (including one letter, such as "X" to close or "B" for bold), the value text of a `slider`, `spinbutton` or `combobox`, and elements with `aria-labelledby` are left alone. | Remove the `aria-label` (the visible label already names the control), or make it contain the visible words. | [19](#19-names-descriptions-and-the-page-language) |
| `missing-lang` | error | An HTML ui file whose `<html>` has no `lang` (or an empty one), or that has no `<html>` element. | `<html lang="en">`, or the language of your text. | [19](#19-names-descriptions-and-the-page-language) |
| `missing-describedby` | error | An element with `aria-invalid` (other than `"false"`) and no `aria-describedby` or `aria-errormessage`, in the markup or set by your script (`el.setAttribute('aria-invalid', 'true')` where `el` is found by a literal id: `getElementById('x')`, `querySelector('#x')`, a `byId('x')` helper); a `role="tooltip"` with no id, or whose id no `aria-describedby` (or `aria-labelledby`) references in the markup, a `setAttribute()` with a literal id, or an HTML string in your script. Content of `<template>` is skipped (scripts wire it up). | Point the control at its `.kit-help` (or the tooltip) with `aria-describedby="id"`. | [19](#19-names-descriptions-and-the-page-language) |
| `orphan-help` | warning | A `.kit-help` element that nothing points at with `aria-describedby` (or `aria-errormessage`), counted the same way as for tooltips. | `.kit-help` is the help or error text of one control: put `aria-describedby="its-id"` on that control. For other secondary text (a status line, an intro) use `.kit-text-secondary`. | [19](#19-names-descriptions-and-the-page-language) |
| `sync-getter` | error | In `code.ts` (or the main `.js`): `figma.getNodeById()`, `getStyleById()`, `getFileThumbnailNode()`, `getLocal{Paint,Text,Effect,Grid}Styles()`, the sync `figma.variables` getters, `.setRangeFillStyleId()` / `.setRangeTextStyleId()`, reading `.mainComponent`, assigning `figma.currentPage`, `.fillStyleId` (and the other `*StyleId` setters, `.backgroundStyleId`, `.vectorNetwork`); and `figma.root.findAll()` / `findOne()` / `findAllWithCriteria()` / `findWidgetNodesByWidgetId()` or `figma.on('documentchange')` when the file never calls `loadAllPagesAsync()`. Also spelled `figma?.getNodeById(id)`, `figma['getNodeById'](id)`, `figma.getNodeById?.(id)`, or through a name the file gives `figma`, `figma.root` or `figma.variables` (`const f = figma`, `const root = figma.root`, `const { variables } = figma`). Comments and strings never count; a sync call behind a `typeof x.<name>Async` check is taken as a fallback. | The `*Async` version, awaited (the message names it); search `figma.currentPage` instead of `figma.root`. | [5](#5-sync-getters-under-dynamic-page) |
| `unawaited-async` | error | In `code.ts`: a call of a function whose name ends in `Async` (or of `Promise.all` / `allSettled` / `race` / `any`) whose promise is dropped (a statement of its own), tested (`if (x.getAsync())`, `!x.getAsync()`), read before it settles (`x.getAsync().name`, also `await x.getAsync().name`), put in a template string, destructured, or stored in a variable that is never awaited, returned, then-ed, collected or handed on; also a `forEach` whose callback is `async`, is an `*Async` function, or returns an `*Async` call (`forEach` drops every promise). Calls after a `case` or `default` label, and in files without semicolons, count as statements. A heuristic: see [what the JavaScript rules read](#what-the-javascript-rules-read-and-miss). | `await` it inside an `async` function, `return` it, collect it in `await Promise.all([...])`, or end the chain with `.catch()`; `void` marks a deliberate fire-and-forget. | [4](#4-await-every-async-call) |
| `top-level-module` | error | An `import` or `export` statement at the top level of `code.ts` (not `import(`, `import.meta`, or an `export` inside a `declare namespace`). | Remove it: `code.ts` is one plain script and sees `kit.d.ts`'s global types without imports. | [2](#2-no-bundling-no-imports-no-top-level-export) |
| `ses-forbidden` | error in `code.ts` / `code.js`; warning in a ui file | The raw text `import(` (also `import (` and `import/*`, unless after a `.`), `<!--` or `-->` anywhere in `code.ts` or the compiled `code.js`, comments and strings included (`i-->0` counts); `<!--` in a ui file. | Reword comments ("dynamic import"), split strings (`'<' + '!--'`), write `i-- > 0`; in `ui.html` use `/* */` or `//` comments. | [7](#7-text-the-sandbox-rejects) |
| `onmessage-assign` | warning | `code.ts` assigns `figma.ui.onmessage` more than once (also through a name for `figma` or for `figma.ui`), reported at every assignment after the first. The property holds one handler, so each later assignment silently replaces the one before (inferred from the property; not measured on its own). A single assignment, Figma's template style, is quiet: it does not remove the kit's `figma.ui.on('message')` listener (measured in Figma desktop 126.9.13, 2026-10-14). Clearing it (`= undefined`, `= null`, `= void 0`, also in parentheses or with `as T`) doesn't count, and the next assignment after a clear starts over. | Register each handler with `figma.ui.on('message', (msg) => { ... })`, which keeps them all; remove one with `figma.ui.off('message', handler)`. | [13](#13-postmessage-shapes-differ-on-each-side) |
| `protocol-mismatch` | error | `KIT_PROTOCOL` differs between `code.ts` (or the main `.js`) and the `ui.html` runtime, or only one side has it; or the compiled `code.js` says something other than `code.ts` (it is stale: run `npm run build`). Comments and strings are ignored. | Re-paste the kit blocks of both files from one release; `npm run build`. | [16](#16-kit-blocks-from-two-releases) |
| `section-drift` | error | A copy of the kit that differs from its source, reported at the first differing line: the three `data-kit` blocks of `preview.html` against `ui.html` (in the folder that has a `preview.html`, the repo root); and in each `examples/<name>`, its `ui.html` blocks, its `code.ts` `kit:window` block and its `kit.d.ts` against the root's. A missing or doubled block counts; line endings don't (a CRLF copy is the same kit), other whitespace does. | Paste the block (or copy `kit.d.ts`) from the root again, unchanged; your own code goes outside the blocks. | [16](#16-kit-blocks-from-two-releases) |
| `budget` | warning | Two cases, each with its own message. **The kit blocks:** the three `data-kit` blocks of an HTML ui file together over 60 KB (61,440 bytes), reported at the first block: a release's blocks stay under that, so more means a block pasted twice or edited, or code of your own inside one. **The whole file:** over 3,200 lines or 128 KB (131,072 bytes), reported at line 1, with how much of it is the kit and how much your own code. Fonts in `data:` URLs inside `url()` count in neither (images do). | Kit blocks: paste all three again, unchanged, from one release, and keep your CSS and scripts in your own elements after them. Whole file: reuse kit classes, keep your own markup, CSS and scripts lean, and move work to `code.ts`. | [20](#20-the-size-budget) |

#### What the JavaScript rules read, and miss

The rules that read scripts (`sync-getter`, `unawaited-async`, `top-level-module`, `onmessage-assign`, `js-color-literal`, and the script side of `missing-disabled`, `missing-describedby` and `orphan-help`) run on a small scanner that knows comments, strings, template literals with their `${}` holes, and regular expression literals, so text in a comment or a string never counts as code (`ses-forbidden` is the exception on purpose: Figma's check reads the raw text). They read text, not types or the order of execution:

- `unawaited-async` follows a call's promise only as far as the surrounding text shows it. It trusts any call that receives the promise as an argument (`track(x.getAsync())`), an object property or a property assignment (`this.ready = x.getAsync()`), a ternary or `||` branch, and a variable that is later awaited, returned, then-ed, pushed, `set()`, put in an array or `Promise.all`, or passed to a call that is itself awaited or returned. It reports `forEach` with an `async` callback, an `*Async` function or a callback that returns an `*Async` call, but not other callers that drop promises (`setTimeout(async () => ...)`, `.map(...)` as a statement). It misses async functions whose names don't end in `Async` (and skips `isAsync()` and its like, which return booleans), calls with type arguments (`getAsync<T>(...)`), aliases (`const load = figma.loadFontAsync; load(font)`), a dropped call behind `&&` or `||` (`ok && x.setAsync()`) or `?:`, and a `.then()` with no rejection handler.
- `sync-getter` matches the exact Figma names, also with `?.`, in brackets (`figma['getNodeById']`) and through a name declared for `figma`, `figma.root` or `figma.variables` in the same file (`const f = figma`, `const root = figma.root`, `const { root } = figma`). A name passed in from elsewhere (a function parameter, `const api = figma as PluginAPI`) and a method taken off `figma` (`const { getNodeById } = figma`) are missed, and `.instances`, `.consumers` and `node.reactions =` are not checked at all (a plugin's own objects use those names too). The receiver-free checks (`.mainComponent`, `.fillStyleId =`, `.vectorNetwork =`) also fire on a plugin's own object with that property (`row.fillStyleId = node.fillStyleId` while serialising). One `loadAllPagesAsync()` call anywhere in the file accepts every `figma.root.find*` and `documentchange` in it, wherever they are.
- `onmessage-assign` counts the assignments in the text, not the ones that run: two assignments in the two branches of an `if`/`else` warn too, and one assignment inside a function that runs twice does not. Names the file declares for `figma` or `figma.ui` count (`const f = figma`, `const ui = figma.ui`, `const { ui } = figma`); a name passed in from elsewhere (a function parameter), or a name built from another name (`const u = f.ui`), is missed, as for `sync-getter`.
- `js-color-literal` sees literals only: a colour kept in a constant (`const RED = '#f00'; el.style.color = RED`) and canvas colours (`ctx.fillStyle`) pass. `Object.assign(el.style, {...})` is read key by key.
- `missing-disabled` knows a class is a control from your markup and the HTML strings in your scripts, so a button made with `createElement('button')` and `className = 'row'` is not recognised.
- `orphan-help` and `missing-describedby` resolve ids written literally (markup, `setAttribute('aria-describedby', 'id')`, HTML strings). An id computed in a script (`setAttribute('aria-describedby', help.id)`) cannot be resolved: write it in the markup, or put the element in a `<template>`, whose content the rules skip. A script's `setAttribute('aria-invalid', 'true')` is checked only when its element comes from a literal id in the same script (`const count = byId('count')`); an element passed into a helper (`setError(input)`) is not followed.

**Author note: the audit's size.** PLAN.md budgets the first audit at about 40 lines. `scripts/audit.mjs` is far larger (about 1,450 lines with audit v2's 13 new rules and the fixes from attacking them) because the rules read real files instead of grepping them: it masks HTML comments, script bodies, CSS comments, strings and `url()`; it parses attributes as a browser does and keeps every finding on its true line; it walks nested CSS rules (and resolves CSS nesting's `&`) to know each declaration's selector; it scans JavaScript well enough to tell code from comments, strings, templates and regular expressions; and it follows a promise a few tokens either way. Each case is pinned by a fixture or a variant in `test/audit.test.mjs`, and the five Phase 1 one-shot plugins are kept as regression fixtures. It still has no dependencies and stays one file, with one function per rule.

### At a glance

| # | Pitfall | Caught by |
|---|---|---|
| 1 | [Two threads, two sets of globals](#1-two-threads-two-sets-of-globals) | `npm run build` (main thread side only) |
| 2 | [No bundling, no imports, no top-level export](#2-no-bundling-no-imports-no-top-level-export) | `top-level-module`; `ses-forbidden` for `import(` |
| 3 | [No `dom` lib in code.ts](#3-no-dom-lib-in-codets) | `npm test` (`test/tsconfig.test.mjs`); `npm run build` does not |
| 4 | [Await every `*Async` call](#4-await-every-async-call) | `unawaited-async` |
| 5 | [Sync getters under `dynamic-page`](#5-sync-getters-under-dynamic-page) | `sync-getter`; editors strike them through |
| 6 | [Manifest shape](#6-manifest-shape) | `manifest-fields`, `manifest-document-access`, `manifest-network-access` |
| 7 | [Text the sandbox rejects (`import(`, `<!--`, `-->`)](#7-text-the-sandbox-rejects) | `ses-forbidden` |
| 8 | [Tokens-only colours](#8-tokens-only-colours) | `color-literal`, `js-color-literal` |
| 9 | [24 and 32 px controls](#9-24-and-32-px-controls) | `control-height` |
| 10 | [A unique plugin id](#10-a-unique-plugin-id) | not yet checked |
| 11 | [Run tsc through the project](#11-run-tsc-through-the-project) | `npm run build` uses the right command |
| 12 | [TypeScript 6 turned `types` off by default](#12-typescript-6-turned-types-off-by-default) | `npm run build` fails loudly |
| 13 | [postMessage shapes differ on each side](#13-postmessage-shapes-differ-on-each-side) | partly `npm run check:ui`; `onmessage-assign` (warning) |
| 14 | [What a message can carry](#14-what-a-message-can-carry) | not yet checked |
| 15 | [`Blob` exists only in the UI](#15-blob-exists-only-in-the-ui) | `npm run build` |
| 16 | [Kit blocks from two releases](#16-kit-blocks-from-two-releases) | `protocol-mismatch`, `section-drift` |
| 17 | [Smaller traps](#17-smaller-traps) | not yet checked |
| 18 | [Hover on a disabled control](#18-hover-on-a-disabled-control) | `missing-disabled` |
| 19 | [Names, descriptions and the page language](#19-names-descriptions-and-the-page-language) | `aria-label-override`, `missing-lang`, `missing-describedby`, `orphan-help` (warning) |
| 20 | [The size budget](#20-the-size-budget) | `budget` (warning) |

## 1. Two threads, two sets of globals

**Symptom.** `ReferenceError: figma is not defined` in the UI's console, or `document is not defined` (or `window`) in the main thread.

**Cause.** A plugin runs in two places. `code.ts` (compiled to `code.js`) runs in Figma's main-thread sandbox: it has the `figma` API and no DOM. `ui.html` runs in an iframe: it has the DOM and no `figma` object. They share nothing but messages.

**Fix.** Read and change the document only in `code.ts`. Render and handle input only in `ui.html`. Pass plain data between them ([messages.md](messages.md)). `figma.clientStorage` is main-only too, so the UI asks main to read or write it.

**Caught by.** `npm run build` rejects DOM names in `code.ts` (`TS2584: Cannot find name 'document'`), but only while `tsconfig.json` keeps `"lib": ["es2020"]` ([pitfall 3](#3-no-dom-lib-in-codets)). No audit rule: nothing checks `figma` in the UI yet, and `check:ui` would only catch it if your script's types say so.

Sources: [How plugins run](https://developers.figma.com/docs/plugins/how-plugins-run/), [Creating a user interface](https://developers.figma.com/docs/plugins/creating-ui/).

## 2. No bundling, no imports, no top-level export

**Symptom.** The plugin fails to start with a syntax error on line 1 ("Unexpected token"), or crashes because `code.js` ends with `export {};`.

**Cause.** Figma runs the manifest's `main` file as one plain script. `import` needs a bundler, which the kit deliberately does not have. Any `import` or `export` in `code.ts`, even `export {}`, makes TypeScript emit a module, and `tsc` then writes `export {};` at the end of `code.js` (verified with TypeScript 6.0.3).

**Fix.** Keep all main-thread code in `code.ts` with no `import` or `export` statements. The kit's types are global on purpose: `kit.d.ts` declares them without exports, so `code.ts` sees them through `tsconfig.json`'s `files`. In `ui.html`, inline everything: `<script src>` only works for domains you list in `networkAccess`.

**Caught by.** `top-level-module` (any top-level `import` or `export` statement in `code.ts`); a dynamic `import(` is `ses-forbidden` ([pitfall 7](#7-text-the-sandbox-rejects)).

Sources: [Libraries and bundling](https://developers.figma.com/docs/plugins/libraries-and-bundling/), [forum: export added during compile causes crash](https://forum.figma.com/t/figma-plugin-export-added-during-compile-causes-crash/65934).

## 3. No `dom` lib in code.ts

**Symptom.** `npm run build` passes, and then the plugin throws `ReferenceError: document is not defined` (or `window`) in Figma.

**Cause.** Someone (often an agent "fixing" `Cannot find name 'document'`) added `"dom"` to `lib` in `tsconfig.json`, or removed `lib` so the default pulls the DOM in. From then on `document`, `window` and the rest of the DOM type-check in `code.ts`, although the main thread has none of them. The DOM's `console` and `fetch` also collide with the ones Figma's typings declare (`TS2451: Cannot redeclare block-scoped variable 'console'`, `TS2300: Duplicate identifier 'Navigation'`), but those errors sit in `.d.ts` files, and the kit's `"skipLibCheck": true` skips them, so the build stays green (verified with TypeScript 6.0.3).

**Fix.** Keep `"lib": ["es2020"]` exactly. If the compiler says `document` is missing in `code.ts`, the code is in the wrong thread ([pitfall 1](#1-two-threads-two-sets-of-globals)), not missing a lib.

**Caught by.** `npm test` (and so `npm run check`): `test/tsconfig.test.mjs` fails unless `lib` is exactly `["es2020"]`. `npm run build` alone does not, and no audit rule reads `tsconfig.json`.

## 4. Await every `*Async` call

**Symptom.** A value prints as `[object Promise]`, a node is `undefined` when you expected it, changes land after the plugin closed, or the console shows an unhandled promise rejection.

**Cause.** Every Figma API ending in `Async` returns a promise. Without `await` the code moves on before the work is done, and errors vanish. Two quieter forms: `await figma.getNodeByIdAsync(id).name` awaits the promise's `.name` (always `undefined`), not the node's, and `if (figma.getNodeByIdAsync(id))` is always true.

**Fix.** `await` each call inside an `async` function, `return` it, or collect several with `await Promise.all([...])`; write `(await figma.getNodeByIdAsync(id))?.name`. Wrap the body of message handlers in `try`/`catch` and always answer the UI, also on failure. Load fonts before editing text: `await figma.loadFontAsync(node.fontName as FontName)` (see [pitfall 17](#17-smaller-traps)). A deliberate fire-and-forget gets `void` and its own `.catch()`.

**Caught by.** `unawaited-async`, a heuristic on the text around each call, which also reports `list.forEach(async (x) => { await ... })`: `forEach` never waits, so the loop's work finishes after the code that follows it (use `for (const x of list) { await ... }`). Its limits are [listed above](#what-the-javascript-rules-read-and-miss).

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

Still synchronous and fine: reading `figma.currentPage`, `figma.currentPage.selection` (read and write), `figma.currentPage.children` and `findAll`, `figma.root.children`, assigning `instance.mainComponent`, and the `selectionchange` and `currentpagechange` events.

**Caught by.** `sync-getter`, for every row above except `instances`, `consumers`, `reactions` and string ids to `figma.variables` (names a plugin's own code uses too, or argument types the audit can't see), plus `figma.root.find*` and `documentchange` in a file that never calls `loadAllPagesAsync()`. `npm run build` rejects none of them.

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

**Cause.** Figma's main-thread sandbox scans the source text before running it, in the style of the SES (Secure ECMAScript) shim: it rejects anything that looks like a dynamic `import(` call and the HTML comment markers `<!--` and `-->`, even inside comments and strings. Bundled libraries (Babel, template engines) trip it; so does an HTML string with a comment in it passed to `figma.showUI`, or a loop written `while (i-->0)`. Figma does not document the rule; the error wording matches SES's check.

**Fix.** Never write those three character sequences in `code.ts` (and so `code.js`), not even in a comment. Reword comments ("dynamic import"), split strings that must contain them (`'<' + '!--'`), and put a space in `i-- > 0`. Keep HTML in `ui.html`, not in strings in `code.ts`.

The kit's `ui.html` files contain no `<!--` either, as a precaution: whether Figma's sandbox scans `ui.html` the way it scans `code.ts` is UNVERIFIED (`ui.html` reaches `figma.showUI` as the `__html__` string). Comments in them are `/* */` in CSS and `//` in scripts, and the kit version lives in `<meta name="kit">` and in the tokens block's header comment, not in an HTML comment. Keep your own markup free of HTML comments too.

**Caught by.** `ses-forbidden`: an error for the three sequences anywhere in `code.ts` or the compiled `code.js` (comments and strings included, as the sandbox reads them), a warning for `<!--` in a ui file.

Sources: [forum: possible import expression rejected](https://forum.figma.com/t/getting-syntaxerror-possible-import-expression-rejected-around-line-1-when-importing-babel/90549), [SES_IMPORT_REJECTED](https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_IMPORT_REJECTED.md).

## 8. Tokens-only colours

**Symptom.** The plugin looks right in one theme and wrong in the other: white panels in dark mode, unreadable text, a blue accent in FigJam (whose brand colour is purple).

**Cause.** A literal colour (`#333`, `rgb(...)`, `white`) never changes with the theme. With `themeColors: true`, Figma injects `--figma-color-*` variables that switch live between light, dark and FigJam; literals ignore them. A `var(--figma-color-bg, #fff)` fallback is a literal too, and so is a colour a script sets (`el.style.color = '#fff'`).

**Fix.** Use a `var(--figma-color-*)` token for every colour ([tokens.md](tokens.md) lists them and what each is for). `transparent`, `currentColor`, `inherit` and `none` are fine anywhere. SVG icons use `fill="currentColor"` or `stroke="currentColor"` and take their colour from the CSS `color` of their parent. The only literals in the kit are the shadow and scrim tokens (`--kit-shadow-*`, `--kit-scrim`) inside `<style data-kit="tokens">`; use them through `var()`, never redefine them elsewhere.

From a script, set a state the CSS styles (`aria-invalid`, `data-tone`, a class) rather than a colour, or a token: `el.style.color = 'var(--figma-color-text-danger)'`. A colour that comes from the document (a variable's value, a fill) is data, not theme, and is fine: hand it to CSS through a custom property, `swatch.style.setProperty('--swatch', hex)` with `.swatch { background: var(--swatch); }`.

**Caught by.** `color-literal`, in `<style>` blocks (nested rules included), `style=""` attributes and SVG paint attributes, minified or not, with attribute values decoded as the browser decodes them; comments, strings, `url(...)` contents and selectors such as `#app` are ignored. `js-color-literal`, for literals your scripts set (style properties, `Object.assign(el.style, ...)`, `setProperty`, `cssText`, `setAttribute` / `setAttributeNS`, and `style="..."` / `fill="..."` in HTML strings); values from variables pass. Not checked: colours kept in a constant first, canvas colours, `data:` SVGs in `url()`, and the colours of a `mask` or `mask-image` (only their alpha shows). Use a `data:` SVG only as a `mask-image` with `background-color: var(--figma-color-icon)`, where its fill colour doesn't matter.

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

**Caught by.** Not yet checked (no audit rule: the kit's own manifest carries the placeholder on purpose).

Sources: [clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage/).

## 11. Run tsc through the project

**Symptom.** With TypeScript 6: `error TS5112: tsconfig.json is present but will not be loaded if files are specified on commandline.` With TypeScript 5: `Cannot find name 'figma'`.

**Cause.** `tsc code.ts` (a file name on the command line) ignores `tsconfig.json`, so the Figma typings and the kit's settings never load. TypeScript 6 turned that into an error.

**Fix.** Use `npm run build` (which runs `tsc -p tsconfig.json`) or `npm run watch`. A watch task stops when VS Code closes and has to be started again; see [loop.md](loop.md).

**Caught by.** `npm run build` always uses the right command; nothing stops a hand-typed `tsc code.ts` (no audit rule).

## 12. TypeScript 6 turned `types` off by default

**Symptom.** `error TS2304: Cannot find name 'figma'` (and `__html__`) with a tsconfig copied from Figma's quickstart template or the plugin-typings README.

**Cause.** TypeScript 6 changed the default of `types` to `[]`, so `typeRoots` alone no longer loads `@figma/plugin-typings`. TypeScript 7 keeps that default, and an unpinned `npm install -D typescript` now installs 7.

**Fix.** Keep the kit's `tsconfig.json`: `"types": ["@figma/plugin-typings"]` (no `typeRoots`), `"lib": ["es2020"]`, and `files` listing `code.ts` and `kit.d.ts`. The kit pins `typescript` to `~6.0.3`.

**Caught by.** `npm run build` fails loudly (no audit rule).

Sources: [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/).

## 13. postMessage shapes differ on each side

**Symptom.** Messages never arrive, or arrive as `undefined`, or a handler stops firing once another part of `code.ts` assigns `figma.ui.onmessage` again.

**Cause.** The two directions are not symmetric, and agents mix them up:

| | Send | Receive |
|---|---|---|
| UI (`ui.html`) | `parent.postMessage({ pluginMessage: msg }, '*')` | `window.addEventListener('message', (e) => { const msg = e.data && e.data.pluginMessage; })` |
| Main (`code.ts`) | `figma.ui.postMessage(msg)` | `figma.ui.on('message', (msg) => { ... })` |

The `'*'` is required (the iframe has a `null` origin). Forgetting `pluginMessage` on the UI side, or reading `msg.pluginMessage` on the main side, loses the payload.

`figma.ui.onmessage` holds one handler: a second assignment replaces the first without an error (that is what a property does; the probe has not measured it on its own, since it cleared the property between its two assignments). It does not clear the listeners added with `figma.ui.on('message')`, the kit's included: `tools/probe` measured that on 2026-10-14 in Figma desktop 126.9.13, with both firing in Design, FigJam, Slides, Dev Mode and Buzz ([messages.md](messages.md#use-figmauionmessage-for-your-handlers)).

**Fix.** Use the table. Give your own messages a `type` that does not start with `kit:`, and ignore types you don't know. Declare one TypeScript interface per message type and a union per direction, as `kit.d.ts` does for `kit:*`. Register handlers with `figma.ui.on('message', ...)`, which runs every handler registered, so a new one never replaces another. A plugin that already assigns `figma.ui.onmessage` once keeps working next to the kit; never assign it a second time.

**Caught by.** Partly `npm run check:ui` (the kit's own message types are checked against `kit.d.ts`); `onmessage-assign` warns when `code.ts` assigns `figma.ui.onmessage` more than once. Until the 2026-10-14 measurement it warned on any assignment, in case assigning cleared the kit's listener; the measurement refuted that, so a single assignment is now quiet. Missing `pluginMessage` wrappers and untyped host messages are not checked.

## 14. What a message can carry

**Symptom.** A function arrives as nothing, a class instance loses its methods, a node you posted is not a node on the other side, or a `Blob` or `ArrayBuffer` never arrives.

**Cause.** Messages are copied, not shared, with structured-clone-like rules. Allowed: objects, arrays, numbers, strings, booleans, `null`, `undefined`, `Date` and `Uint8Array`. Not allowed: `Blob`, `ArrayBuffer`, typed arrays other than `Uint8Array`. Functions and prototypes are dropped.

**Fix.** Send plain data. A node is an API object, not data: send the fields you need (`id`, `name`, `type`) and look it up again in main with `await figma.getNodeByIdAsync(id)`. Send bytes as `Uint8Array`.

**Caught by.** Not yet checked (no audit rule).

Sources: [Creating a user interface](https://developers.figma.com/docs/plugins/creating-ui/).

## 15. `Blob` exists only in the UI

**Symptom.** `ReferenceError: Blob is not defined` in the main thread when saving an export.

**Cause.** The main-thread sandbox has no `Blob`, `URL.createObjectURL` or downloads; only the UI iframe does.

**Fix.** In main, `const bytes = await node.exportAsync({ format: 'PNG' })` and `figma.ui.postMessage({ type: 'export-done', bytes, name })`. In the UI, `new Blob([msg.bytes], { type: 'image/png' })`, `URL.createObjectURL(blob)`, and click an `<a download>`. A page cannot tell whether the browser saved the file (a sandbox can block it silently), so say what was handed over ("Started 3 downloads"), never "Downloaded 3".

**Caught by.** `npm run build` (`TS2304: Cannot find name 'Blob'` in `code.ts`); no audit rule.

Sources: [exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/).

## 16. Kit blocks from two releases

**Symptom.** The window doesn't fit its content, the resize handle does nothing, or the console shows a protocol-mismatch warning: each side warns once (two `console.warn` lines), naming both protocol numbers. Or an upgrade quietly drops a change someone made inside a kit block.

**Cause.** `code.ts`'s `kit:window` block and `ui.html`'s three `data-kit` blocks came from different kit releases (or one side was never pasted), so they speak different versions of the `kit:*` messages. Or a block was edited in place: the blocks are pasted byte for byte, and the next upgrade replaces them whole.

**Fix.** Re-paste the `kit:window` block in `code.ts` and all three `data-kit` blocks in `ui.html` from the same release, then `npm run build`. Put your own CSS and scripts in separate `<style>` and `<script>` elements after the kit blocks, and your own code below the `kit:window` block. Override settings with `<script type="application/json" data-kit-config>`, never by editing `CONFIG`.

**Caught by.** `protocol-mismatch`, which also reports a `code.js` that is older than `code.ts` (Figma runs `code.js`); `section-drift`, which compares each copy of the kit with its source (preview.html's blocks with ui.html's in the repo root; each example's ui blocks, `kit:window` block and `kit.d.ts` with the root's) and points at the first line that differs, saying so when only spaces or tabs differ. Line endings are not compared, so a CRLF checkout is not drift.

## 17. Smaller traps

- **`figma.closePlugin()` doesn't stop your code.** Lines after it still run, against an API that is already shut down. Follow it with `return`.
- **Nothing can be saved on close.** `figma.on('close')` cannot wait for an async write, so `clientStorage.setAsync` there is unreliable. Save when the value changes, as the kit does for the window size.
- **Load fonts before editing text.** Changing `characters`, `fontSize`, `fontName` and similar layout properties throws unless the font was loaded with `await figma.loadFontAsync(...)`. Check `node.hasMissingFont` first, and note `fontName` can be `figma.mixed`.
- **Global names collide in `code.ts`.** It is a script, so your top-level names share one namespace with Figma's typings. `type Action` fails as a duplicate; `interface Rect` silently merges with Figma's `Rect`. Prefix your own types (the kit uses `Kit`). Top-level names that start with `kit` or `Kit` followed by a capital letter, or with `KIT_`, and `installKitWindow` are reserved for the kit block, which may add more; don't declare your own. A clashing `const` or `function` fails `tsc`; a clashing `interface` silently merges.
- **No `localStorage` in the UI.** The iframe has a `null` origin, so browser storage is unavailable or throws. Store through `figma.clientStorage` in main, via messages.
- **No Clipboard API in the UI.** `navigator.clipboard.writeText` does not exist in the plugin iframe (measured on 2026-10-14 in Figma desktop 126.9.13, all five editors). To copy text, put it in a `<textarea>`, select it and call `document.execCommand('copy')`, which worked there; say "Copied" only when it returns `true`.
- **Don't rely on `<form>` submission in the UI.** In a sandboxed iframe without `allow-forms`, Chromium blocks the submission before the `submit` event fires, so the handler never runs (seen in a test host; Figma's own sandbox flags are not documented). Use `type="button"` with a `click` handler, plus a `keydown` handler for Enter in a field, as the demo in `ui.html` does.
- **A live region that talks on every keystroke.** A `role="status"` line rewritten on each `input` event makes a screen reader speak after every key. Announce results (after Apply, after a selection change), not typing.
- **A long list in a fit-content window.** The window grows to its maximum height and then the whole page scrolls, footer and all. Give the list its own scrolling region (`.kit-scroll`, see [components.md](components.md)).

All of these: not yet checked (no audit rule; a static check can't tell when `closePlugin` returns or a status line is updated).

## 18. Hover on a disabled control

**Symptom.** A disabled button (or one with `aria-disabled="true"` while busy) still lights up when the pointer passes over it, so it looks clickable.

**Cause.** Your own `.row:hover { background: ... }` applies whether or not the control is disabled, and it usually wins over a disabled rule of the same specificity. The kit's components already exclude their disabled states; your CSS has to as well.

**Fix.** Exclude disabled controls in the hover selector, `.row:hover:not(:disabled):not([aria-disabled="true"]) { ... }`, or give them their own rule with the disabled tokens (never `opacity`): `.row:disabled, .row[aria-disabled="true"] { color: var(--figma-color-text-disabled); background: transparent; }`.

**Caught by.** `missing-disabled`, on pages that disable something. Hover rules that only change layout, and hover on elements that aren't controls (a card, a list item), are left alone.

## 19. Names, descriptions and the page language

**Symptom.** A screen reader reads something nobody sees, or skips the help and error text, or reads English text with another language's voice; voice control can't find a button by the word on it.

**Cause.** Four habits:

- **An `aria-label` that replaces a visible label.** `aria-label` wins over `<label>` and over a button's text, so `<label for="prefix">Prefix</label><input id="prefix" aria-label="Text to add">` is announced as "Text to add" and a voice user saying "Prefix" gets nothing (WCAG 2.5.3, Label in Name).
- **No `lang` on `<html>`.** The reader guesses the language from the user's settings.
- **`aria-invalid="true"` with nothing that explains it,** or a `role="tooltip"` that no control references: the error and the tooltip text are never read.
- **`.kit-help` as plain secondary text.** The kit's `.kit-help` is the help or error text of one control: the control points at it with `aria-describedby`, and the kit's CSS turns it to the danger colour when that control is `aria-invalid`. Used for a status line or an intro paragraph it reads the same on screen, but it says "help for a control" to the next person (or agent) reading the markup, and no control announces it. Every Phase 1 one-shot plugin did this ([below](#what-the-phase-1-one-shot-runs-found)).

**Fix.** Drop the `aria-label` when a visible label exists (or make it contain the visible words: `aria-label="Close dialog"` on a "Close" button is fine). Keep `<html lang="en">` (or your language). Give every `aria-invalid` control `aria-describedby="<id of its .kit-help>"`, and every tooltip's control `aria-describedby="<tooltip id>"`. Use `.kit-text-secondary` for secondary text that belongs to no control.

**Caught by.** `aria-label-override`, `missing-lang` and `missing-describedby` (errors); `orphan-help` (a warning). The reference checks resolve ids written in the markup, in `setAttribute()` with a literal id, and in HTML strings, and `missing-describedby` also checks an `aria-invalid` your script sets on an element it found by a literal id; ids computed in a script are not resolved ([details](#what-the-javascript-rules-read-and-miss)). Not checked: elements a script creates, and contrast (see [accessibility.md](accessibility.md)).

## 20. The size budget

**Symptom.** `ui.html` keeps growing until an agent can no longer read it in one go: its edits start to miss parts of the file, upgrades become hard to review, and the plugin is slow to open. Or the kit's own blocks are suddenly larger than a release's.

**Cause.** Everything in a plugin's UI lives in one file: the kit blocks, your markup, CSS and scripts. The kit keeps its own part small: the starter `ui.html`, kit blocks and demo together, is under 64 KB (65,536 bytes) and 1,600 lines, which `test/budget.test.mjs` checks in this repo, and the three blocks alone stay under 60 KB. Your plugin's code is yours to size, but past about 128 KB or 3,200 lines the whole file no longer fits comfortably in an agent's context. Kit blocks that grow past 60 KB were pasted twice, edited, merged by hand from two releases, or hold code of your own. Fonts embedded as `data:` URLs ([tokens.md](tokens.md), `scripts/make-fonts-css.mjs`) are outside every budget.

**Fix.** For the kit blocks: paste all three again, unchanged, from one release, and move anything of your own into a plain `<style>` or `<script>` after them. For the whole file: reuse kit classes instead of writing CSS, keep scripts to what the plugin does, and move work that belongs to the main thread into `code.ts`. Prefer inline SVG icons with `currentColor` over base64 images, which count against the budget; fonts made with `scripts/make-fonts-css.mjs` do not.

**Caught by.** `budget`, a warning in two cases, each with its own message: the kit blocks over 60 KB (at the first block), and the whole file over 3,200 lines or 128 KB (at line 1, with the kit's share and yours). Before kit 0.4.0 it warned at 64 KB or 1,600 lines for the whole file, which a plugin's own code reached quickly; that limit is now the kit's own test for the starter.

## What the Phase 1 one-shot runs found

The [one-shot log](prompts.md#one-shot-log) records five agent-built plugins from a fresh clone. All five passed audit v1; each failure the graders logged now has a rule, a fix in the kit, or a line in [AGENTS.md](../AGENTS.md). The five plugins are kept, with their own code verbatim, as regression fixtures (`test/fixtures/oneshot-*`), so the audit's view of real agent output can't change unnoticed.

| Run | What went wrong | Now |
|---|---|---|
| `rename-layers`, `export-selection`, `content-fill`, `variables-sync`, `a11y-contrast` | `.kit-help` used as a status line, an empty-state message, an intro or a hint, with no control pointing at it (the kit's own demo did the same) | `orphan-help` (warning): 1 to 3 per plugin, 9 in all |
| `variables-sync` | A swatch coloured from script with `style.color = hex` (document data, legitimate) | `js-color-literal` flags colour literals set from script and lets data through; [pitfall 8](#8-tokens-only-colours) shows the custom-property pattern |
| `variables-sync` | A long list scrolled the whole fit-content window, footer out of view | `.kit-scroll` and [pitfall 17](#17-smaller-traps) (not an audit matter) |
| `rename-layers` | A `role="status"` line rewritten on every keystroke | [Pitfall 17](#17-smaller-traps) and AGENTS.md (a static check can't tell typing from results) |
| `export-selection` | The status claimed "Downloaded N" for downloads the sandbox may block silently | [Pitfall 15](#15-blob-exists-only-in-the-ui) and AGENTS.md |
| `a11y-contrast` | Untyped host messages | [Pitfall 13](#13-postmessage-shapes-differ-on-each-side) and AGENTS.md (not checked) |
| `a11y-contrast` | Contrast maths wrong for group opacity and overlapping text | Golden-scene tests in the Phase 2 example (domain logic, not checkable) |
| all | Kit tests and the preview coupled to the demo, preview stub gaps, the preview's mode switch | Fixed in the kit's tests and `preview.html` (not plugin defects) |

None of the five plugins tripped `sync-getter`, `unawaited-async`, `ses-forbidden`, `top-level-module`, `onmessage-assign`, `missing-disabled`, `aria-label-override`, `missing-lang`, `missing-describedby`, `section-drift` or `budget`: their awaited `getNodeByIdAsync` lookups (one through `Promise.all`, one with `.catch()`), their help text wired from a `<template>`, and a swatch coloured from data all stay quiet, which the fixtures pin.
