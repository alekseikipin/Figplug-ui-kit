# Surfaces

One plugin can run in several Figma editors, and each one hosts the UI differently. This page says where the UI appears in each editor, what the kit does there, and which of these facts are documented, measured or still assumptions. Branch on `figma.editorType` in `code.ts` when your plugin needs to behave differently; `installKitWindow()` returns it, and `kit:init` carries it to the UI ([messages.md](messages.md)).

**Measured** on this page means one run on **2026-10-14 in Figma desktop 126.9.13** (Electron 43.7.9, Chrome 150.0.7871.250) on macOS (Apple silicon): [`tools/probe`](#measure-it-yourself) in all five editors, the starter in four of them and the five examples in Figma Design. It was driven by Claude through computer use in the owner's Figma account, in scratch files, with Figma in its dark theme (switched to light and back during the Design run). The [raw reports](#raw-reports) are in the repo. Nothing has been measured on Windows, in Figma in the browser or in Figma for VS Code, so everything about those stays UNVERIFIED.

The starter `manifest.json` lists `"editorType": ["figma", "figjam", "slides", "buzz"]`. Dev Mode needs a manifest of its own; see [Dev Mode](#dev-mode). Each example has its own manifest and its own list ([The examples](#the-examples)).

## At a glance

Documented, and measured 2026-10-14 in Figma desktop 126.9.13 (macOS). Brand colours are for Figma's dark theme except where a light value is given; panel sizes depend on the Figma window and on how wide the person has made the panel.

| Editor | `editorType` | Where the UI appears | `figma.ui.resize` | Resize handle (kit) | Kit default bounds (W x H) | `<html>` class | `--figma-color-bg-brand` |
|---|---|---|---|---|---|---|---|
| Figma Design | `figma` | Floating window over the canvas | Honoured, from 70 x 0 up to Figma's window | On | 240-960 x 120-900 | `figma-light` or `figma-dark`, follows Figma, switches live | `#0d99ff` light, `#0c8ce9` dark (blue) |
| FigJam | `figjam` | Floating window over the board | Honoured, as in Design | On | 240-960 x 120-900 | Always `figma-light`, also when Figma is dark | `#9747ff` (purple; light only) |
| Slides | `slides` | Floating window | Honoured, as in Design | On | 240-960 x 120-900 | `figma-dark` with Figma dark; light not captured | `#f65009` (orange) |
| Dev Mode | `dev` | Fills the Inspect panel (320 x 1179 in the run) | Ignored: the panel keeps its size | Off | **300**-960 x 120-900 | `figma-dark` with Figma dark; light not captured | `#198f51` (green) |
| Buzz | `buzz` | Left side panel, full height (280 x 1324 in the run); can pop out into a modal (not measured) | Ignored in the side panel | Off | 240-960 x 120-900 | `figma-dark` with Figma dark; light not captured | `#f316b0` (pink) |
| Any other (an editor newer than the kit) | its own value | Unknown | Unknown | Off | 240-960 x 120-900 | Unknown | Unknown |

"Resize handle off" means `kit:init` sends `chrome: false`: the runtime hides the handle and stops reserving its corner. In `fit-content` mode the runtime still sends its content fits, and main still calls `figma.ui.resize`; in the Dev Mode and Buzz panels Figma accepts the call without an error and ignores it (measured), so the fits cost nothing and the kit keeps sending them. The panel's size wins over the kit's bounds and over your `bounds` option there. Nothing is saved on these surfaces in practice: without a handle the person never resizes through the kit, and only their resizes are stored. Your `bounds` option is merged over these defaults on every surface.

An `editorType` the kit does not list gets the handle off and the default bounds, so a plugin opened in a new editor works but loses its grip there. The fix belongs in the kit, not in your plugin: once Figma documents the new editor's window type, a kit release adds it to `kitSurface()` in the `kit:window` block, with its own handle and bounds, and a row in this table.

## In every editor

Measured 2026-10-14 in Figma desktop 126.9.13 (macOS), with the same result in Design, FigJam, Slides, Dev Mode and Buzz unless a line says otherwise.

- **Messages.** A `figma.ui.postMessage` sent right after a hidden `showUI` is queued and delivered after the page's `load` event: 3 to 5 ms after the UI script started, 307 ms in Slides. Assigning `figma.ui.onmessage` does not remove listeners added with `figma.ui.on('message')`, such as the kit's: both fire ([messages.md](messages.md#use-figmauionmessage-for-your-handlers)).
- **Theme class.** `<html>` has no class when the UI's first script runs. Figma adds `figma-light` or `figma-dark` 2 to 3 ms later, before `load`. Detect the editor with `figma.editorType`, never from the class: FigJam and Design in light both say `figma-light`.
- **Colour variables.** `<style id="figma-style">` is in the page from the start. It holds a single `:root { --figma-color-…: …; }` rule with exactly the 174 documented names and nothing else: no fonts, no other variables. The value format differs by editor (hex with 3, 4, 6 or 8 digits in Design, Slides, Dev Mode and Buzz, plus one `rgba()` for `bg-slot`; 6-digit hex and `rgba()` in FigJam), so never parse the values. [Palettes](#results-palettes) has the numbers.
- **Don't read the theme from `prefers-color-scheme`.** The media query matched `dark` in the four reports taken with Figma in its dark theme, FigJam included, whose palette is light. It did not match in the Design report, which was taken after Figma had been switched to light. So it does not follow the editor's palette. Whether it follows Figma's own theme or the operating system is UNVERIFIED. The kit's tokens block sets `color-scheme` from the `<html>` class (`light`, or `dark` under `.figma-dark`), so native controls follow the palette. A page that sets none computes `color-scheme: normal`.
- **Window sizes are whole numbers.** `figma.ui.resize(333.6, 401.4)` throws `Property "resize width" failed validation: Expected integer, received float`. `figma.ui.resize(NaN, 300)` throws `Expected number, received nan`. Both throw in the docked panels too, and the size stays as it was. The kit clamps and rounds every size before it calls `resize` ([messages.md](messages.md#kitresize-ui-to-main)).
- **Storage.** `figma.clientStorage` `setAsync`, `getAsync`, `keysAsync` and `deleteAsync` all work. `keysAsync()` lists only the running plugin's keys: storage is per plugin id.
- **`"documentAccess": "dynamic-page"`.** `figma.currentPage.selection` works synchronously. `figma.getNodeById()` throws `Cannot call with documentAccess: dynamic-page. Use figma.getNodeByIdAsync instead.` ([pitfalls.md](pitfalls.md#5-sync-getters-under-dynamic-page)).
- **The iframe.** `location.origin` is `"null"`, the page is a `data:` URL with no referrer, and `devicePixelRatio` was 2 (a Retina screen). `popover`, `<dialog>`, `:has()`, CSS anchor positioning and `ResizeObserver` are all supported. The kit's menu, dialog and runtime use them.
- **No Clipboard API.** `navigator.clipboard.writeText` does not exist in the plugin iframe. `document.execCommand('copy')` on a selected `<textarea>` worked: the probe's Copy button falls back to it ([pitfalls.md](pitfalls.md#17-smaller-traps)).
- **Inter.** Figma injects a `<style>` with 18 `@font-face` rules: static Inter 3.10, weights 100 to 900, upright and italic, from static.figma.com. The faces load under `"networkAccess": { "allowedDomains": ["none"] }`. With no variable face, weight 450 draws as 500 and 550 as 600 ([tokens.md](tokens.md#kit-tokens)). `document.fonts.check('11px Inter')` returns `false` until a face is used, because the faces load on demand.
- **Quirks mode.** Figma writes its own `<script>`, then `<style id="figma-style">`, then the Inter `<style>` ahead of the plugin's HTML. Because of that, the plugin's `<!doctype html>` is ignored and every plugin UI runs in quirks mode: `document.compatMode` is `BackCompat` and `document.doctype` is `null`. Two quirks matter to a kit page. A `<table>` resets its text to 16px, so the kit's base rule gives tables `font: inherit`. `document.documentElement.clientHeight` is the page's height, not the window's, so the runtime measures the viewport on `document.scrollingElement`. `preview.html` loads the UI the same way, from a `data:` URL with its host tags first, so the tests run in quirks mode too. An `<iframe srcdoc>` is always in standards mode, by spec, so the preview can't use one.
- **The host script.** Figma's injected script: sends F6 and Shift+F6 to Figma to move focus between areas; turns Cmd+Option+P into "run the plugin again"; maps Cmd+A, Cmd+Z and Shift+Cmd+Z to `execCommand` select all, undo and redo in the desktop app; rewrites `#figma-style` and the `figma-*` class when the theme changes; forwards uncaught errors and unhandled rejections to Figma; and logs a hint when a request breaks the `networkAccess` policy. All of its listeners run in the capture phase.

## Figma Design

The reference surface: everything in the kit is designed and checked here first.

- **A floating window.** `showUI` sizes it, and `figma.ui.resize` changes it later. The documented minimum is 70 x 0 ([showUI](https://developers.figma.com/docs/plugins/api/properties/figma-showui/)). Measured: `resize(10, 10)` gives 70 x 10 and `resize(70, 0)` gives 70 x 0. There is no fixed maximum: `resize(4000, 4000)` gave 2508 x 1283, the space Figma's window had. The kit's default bounds cap the window at 960 x 900.
- **Theme.** With `themeColors: true` (which `installKitWindow` always sets), Figma adds `figma-light` or `figma-dark` to `<html>`, injects the `--figma-color-*` variables, and updates them live when the person switches theme ([CSS variables](https://developers.figma.com/docs/plugins/css-variables/)). Measured: switching Figma from dark to light while the probe was open changed the class and the whole palette, and switching back to dark with the starter open recoloured it without a reopen. Brand `#0d99ff` in light, `#0c8ce9` in dark.
- **The API.** The full plugin API is available. With `"documentAccess": "dynamic-page"`, only the current page is loaded; use the `*Async` APIs for everything else ([pitfalls.md](pitfalls.md)).
- **The kit:** a floating window with the resize handle.
- **The starter (measured):** with Figma in its light theme, it opened hidden and appeared already fitted. In that run, Shift+Right twice on the focused handle widened the window by 64 px and the height stayed fitted, and closing and rerunning restored that width. Switched to dark while open, it recoloured without a reopen; it was never opened fresh in the dark theme. In both themes its controls matched Figma's own Design panel next to it: 24 px fields, a 5 px radius, the same label and heading styles. Create made 5 rectangles, selected them and zoomed to them; the status read "5 layers selected" and "Created 5 rectangles", and the window refitted for the two-line status. Dragging the handle with a pointer was not tested: the automation tool's synthetic drags into a background window did not move it, which is a limit of the tool. Pointer drags in Figma stay UNVERIFIED.

## FigJam

- **Light only, with a purple brand.** FigJam has no dark mode. Plugins get a FigJam-specific light palette under the same variable names, with a **purple brand** where Design uses blue ([CSS variables](https://developers.figma.com/docs/plugins/css-variables/), [working in FigJam](https://developers.figma.com/docs/plugins/working-in-figjam/)). Measured: the class is always `figma-light`, also when Figma is in its dark theme, and `--figma-color-bg-brand` is `#9747ff`. 54 of the 174 values differ from Design's light palette: 33 in the brand, selected and on-selected families, and 21 more among the pressed, status (success, warning, danger) and component-secondary colours. Kit components only use tokens, so they turn purple on their own; never hard-code "brand = blue" in your own CSS.
- **Detect FigJam with `figma.editorType === 'figjam'`** in `code.ts`, not from the class: Design in light also says `figma-light`.
- **The window** floats over the board and honours `figma.ui.resize` with the same limits as Design (measured).
- Not available: `createComponent()`, `combineAsVariants()`, every `create*Style()` and the `moveLocal*After()` functions.
- FigJam's own node APIs (`createSticky`, `createShapeWithText`, `createConnector`, `createCodeBlock`, `createTable`, `createGif`, `figma.timer`) are missing in Figma Design; Figma's FigJam guide says they need `figjam` in `editorType`. Slides also supports `createShapeWithText()`, `createTable()` and `createGif()` ([working in Slides](https://developers.figma.com/docs/plugins/working-in-slides/)). Check `figma.editorType` before calling any of them.
- **The kit:** the same window and handle as in Design.
- **The starter (measured):** light, with a purple Create button, fitted to its content at the default width. The size saved in Design was ignored, as designed: saved sizes are per editor. The window first appeared at its starting size and fitted about 1 s later ([visible before it fitted](#seen-in-the-run-a-window-visible-before-it-fitted)). Create and a reopen in FigJam were not tried.

## Slides

- Slides has no **components, styles, variables or libraries**; calls that depend on them are unavailable, as are `createConnector()`, `createCodeBlock()`, `createSection()`, `createLinkPreviewAsync()` and `setFileThumbnailNodeAsync()`. ([working in Slides](https://developers.figma.com/docs/plugins/working-in-slides/))
- Slides has three node APIs that Figma Design lacks: `createShapeWithText()`, `createTable()` and `createGif()`.
- The content model is `SLIDE` nodes (always 1920 x 1080) inside `SLIDE_ROW`s inside the slide grid. When you check for `node.type === 'FRAME'`, also check `'SLIDE'`. The focused slide is `figma.currentPage.focusedSlide`.
- A Slides file has a single page.
- **The window** is not covered by Figma's docs. Measured: a floating window that honours `figma.ui.resize` with Design's limits, 70 x 0 up to Figma's window.
- **Theme (measured):** `figma-dark` with Figma in its dark theme and an **orange brand**, `#f65009`. 34 of the 174 values differ from Design's dark palette: the brand and selection families (`*-brand*`, `*-selected*`, `*-onselected*`, `border-onbrand` and `icon-pressed`). The light palette was not captured: UNVERIFIED.
- **The kit:** the same window and handle as in Design.
- **The starter (measured):** dark, with an orange Create button, fitted to its content. Like FigJam, it first appeared at its starting size and fitted about 1 s later.
- **The demo:** "Create shapes" adds the shapes to the page, not into a slide. Where they show up in Slides is UNVERIFIED: Create was not pressed in the run. A real Slides plugin appends to `focusedSlide` or a slide it creates.

## Dev Mode

Dev Mode plugins are for developers inspecting a design. They live in the **Inspect panel**, and they are **read-only**. ([working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode/))

- **The UI fills the Inspect panel**, its full width and height. The person resizes the panel, not the window, and in Figma for VS Code the panel is horizontal (UNVERIFIED: not run there). Figma's guidance: make the UI responsive, design it tall with scrolling overflow, and optimise for a **minimum width of 300px** (a guideline, not an enforced limit).
- **Measured:** `figma.mode` is `'inspect'`, and the UI got the panel's size, 320 x 1179, whatever `showUI` asked for. Every `figma.ui.resize` call left it at 320 x 1179. Invalid sizes (`NaN`, fractions) still throw.
- **Read-only:** creating, deleting or editing nodes throws (`figma.createRectangle()`, `node.remove()`, `node.name = ...`). Reading the document, events, network requests, `showUI`, `pluginData`, `relaunchData` and `exportAsync()` all work.
- **Selection:** the guide says the selection holds at most one node. In the run, `figma.currentPage.selection` returned **3 nodes** in Dev Mode, so don't rely on either number. Pages are always loaded dynamically.
- **Theme (measured):** `figma-dark` with Figma in its dark theme and a **green brand**, `#198f51`. The same 34 values differ from Design's dark palette as in Slides. The light palette was not captured: UNVERIFIED.
- **The kit:** `chrome: false` (no handle) and a minimum width of 300 in its bounds. The panel ignores both the bounds and the fits, so the page has to lay out at whatever width the panel has (320 in the run).
- **The starter:** not offered in Dev Mode, because its manifest has no `dev` (as designed). The probe ran there with a `["figma", "dev"]` manifest and `"capabilities": ["inspect"]`.
- **The demo:** "Create shapes" throws here (Dev Mode is read-only), so the demo shows a Figma error toast and answers the UI with `{ type: 'created', count: 0 }`. Not run in Figma: the starter is not offered there.
- **Codegen** plugins (the Code section of Inspect) are a different shape: `figma.codegen.on('generate', ...)` with a 3-second limit, and `showUI` is not allowed inside that callback. The kit does not cover them.

### The Dev Mode manifest

Figma does not allow `"dev"` and `"figjam"` in the same manifest ([setting the editor type](https://developers.figma.com/docs/plugins/setting-editor-type/)), so the starter manifest cannot include Dev Mode. A Dev Mode plugin needs this manifest instead:

```json
{
  "name": "Kit starter (Dev Mode)",
  "id": "kit-starter-dev-mode-change-this-id",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma", "dev"],
  "capabilities": ["inspect"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
```

- `"capabilities": ["inspect"]` puts the plugin in the Inspect panel. Add `"vscode"` to run it in Figma for VS Code too (then open links with `figma.openExternal(url)`, and build your own dialogs instead of `alert()`/`confirm()`).
- Keeping `"figma"` lets the same plugin also run in Design as a normal floating window, with the handle on.
- One manifest is one plugin. To cover both FigJam and Dev Mode you ship **two plugins** with two ids (and two separate `clientStorage` buckets). Either replace the root `manifest.json` with the one above (if you don't need FigJam, Slides or Buzz), or make a second folder holding this manifest plus copies of `code.js` and `ui.html`, the way [`tools/probe/dev-mode/`](../tools/probe/dev-mode/) does. Whether `"main": "../code.js"` works from a subfolder is UNVERIFIED, so copy the files.
- Figma reads a development plugin's manifest again on every run: in the 2026-10-14 run, switching the already imported probe's own `tools/probe/manifest.json` to `"editorType": ["figma", "dev"]` and adding `"capabilities": ["inspect"]` took effect on the next run, with no new import, and the Dev Mode report comes from that run (the file was restored afterwards; [install.md](install.md#import-gotchas)).
- Some community manifests combine `dev` and `figjam` anyway; whether Figma accepts them is UNVERIFIED. Follow the docs.

## Buzz

Buzz is Figma's editor for producing marketing assets at scale. ([working in Buzz](https://developers.figma.com/docs/plugins/working-in-buzz/))

- **The UI opens in the left side panel at full height.** The person can resize the panel and pop the plugin out into a modal. Figma's guidance: make the UI responsive and design it vertically, with scrolling overflow.
- **Measured (side panel):** the UI got 280 x 1324, whatever `showUI` asked for, and every `figma.ui.resize` call left it there. Invalid sizes still throw. 280 px is narrower than the kit's default width of 320, so check your layout at 280. The pop-out modal was not tried: whether it honours `showUI`'s size and `figma.ui.resize` is UNVERIFIED.
- **Theme (measured):** `figma-dark` with Figma in its dark theme and a **pink brand**, `#f316b0`. The same 34 values differ from Design's dark palette as in Slides. The light palette was not captured: UNVERIFIED.
- Add content to the asset grid with `figma.buzz.createFrame(row, col)` rather than `figma.createFrame()` or `currentPage.appendChild()`; put image fills on a child rectangle, not the top-level frame. A Buzz file has a single page.
- Not available: `createPage`, `createConnector`, `createCodeBlock`, `createTable`, `createSticky`, `createSlide`, `createSlideRow`, `createPageDivider`, `createLinkPreviewAsync`, `setFileThumbnailNodeAsync`.
- **The kit:** `chrome: false` (no handle; the panel has its own sizing). The panel ignores the kit's fits.
- **The starter (measured):** it rendered in the 280 px side panel with a pink Create button and no handle. Create was not pressed, and the pop-out was not tried.
- **The demo:** "Create shapes" adds loose shapes to the canvas outside the asset grid (UNVERIFIED: not run). A real Buzz plugin uses `figma.buzz.createFrame`.

## Seen in the run: a window visible before it fitted

With the code at the `v0.4.0` tag, the starter in FigJam and Slides appeared at its starting size and fitted about 1 s later. The heavier pages, the five examples and the 0.4.0 one-shot plugins, showed a visible but blank window for up to about 1 s before their content painted, in Figma Design too, and then fitted. The cause: `installKitWindow` showed a window that had not asked for a size 500 ms after the call, and in Figma a page can take longer than that to load and paint. Since the run, still within 0.4.0, `installKitWindow` keeps every window hidden until its UI has loaded: it shows it on the first `kit:resize`, after `kit:init` in `fixed` mode, 800 ms after `kit:ready` if no size comes, or 3 s after the call for a page without the kit runtime ([messages.md](messages.md#kitresize-ui-to-main), step 4). Rerun later on 2026-10-14 with the kit tour, which has the fix. In Design, screenshots taken right after the run caught no window, and the next ones caught the fitted, painted window. In FigJam the tour still appeared blank at its starting size, then fitted and painted about 1 s later. FigJam does honour `visible: false`: with `show()` held back for 8 s, the probe's window stayed hidden and Figma showed its "Running kit probe" toast instead. So the flash comes after `show()`: Figma seems to show the window before it applies the `resize` sent just before, and before the page paints. Still open in FigJam: a fix would need the UI to report that it has painted at the new size before `show()`, and whether a hidden plugin page paints at all is UNVERIFIED.

## The examples

Each plugin in [examples/](../examples/) has its own `manifest.json`, and each lists the editors chosen for its task (the starter lists Design, FigJam, Slides and Buzz). The kit treats them like any plugin: the handle is on in Design, FigJam and Slides and off in Buzz, and `content-fill`'s `fixed` window never shows it.

| Example | Window mode | `editorType` | Why these editors |
|---|---|---|---|
| [`rename-layers`](../examples/rename-layers/README.md) | `fit-content` | `figma`, `slides` | The one-shot agent chose these two and curation kept them; FigJam and Buzz stay out until someone checks the plugin there. It writes layer names, so not Dev Mode. Its page watch (`nodechange`) is wrapped in `try`, because page events in Slides have not been checked. |
| [`export-selection`](../examples/export-selection/README.md) | `resizable` | `figma`, `figjam`, `slides`, `buzz` | `exportAsync` works in each of them. Exporting is read-only, so it would work in Dev Mode too, but only as a second plugin: `dev` can't share a manifest with `figjam` ([the Dev Mode manifest](#the-dev-mode-manifest)). |
| [`content-fill`](../examples/content-fill/README.md) | `fixed` | `figma`, `figjam`, `slides`, `buzz` | All four have text layers; in FigJam it also fills stickies and shapes with text. It writes text, which Dev Mode forbids. |
| [`variables-sync`](../examples/variables-sync/README.md) | `resizable` | `figma` | Slides has no variables; Dev Mode is read-only and this plugin writes; whether `figma.variables` is available in FigJam is UNVERIFIED, and Buzz has not been checked either. Where the API is missing, the plugin says "this editor has no variables" instead of throwing. |
| [`a11y-contrast`](../examples/a11y-contrast/README.md) | `fit-content` | `figma`, `figjam`, `slides`, `buzz` | All four have text layers. It never edits the document (it only changes the selection and scrolls the view), so a Dev Mode build is possible as a second plugin, as for `export-selection`; whether its selecting and scrolling work there is UNVERIFIED (Figma's guide says Dev Mode selects one layer at a time, but the probe saw three selected there). In FigJam, text on stickies and shapes is not a text layer and isn't checked. |
| [`kit-tour`](../examples/kit-tour/README.md) | `fit-content` | `figma`, `figjam`, `slides`, `buzz` | The starter's list: the tour is what the kit's Community listing runs, so it goes wherever the kit does. Only its Create tab touches the document (`createRectangle`, `createEllipse`, as the starter's demo); like the starter's, they should land on the canvas outside a slide in Slides and outside the asset grid in Buzz (UNVERIFIED for both: not run). Create writes, so not Dev Mode. In Buzz the docked panel sets the size: the tour's Window tab says so and hides the handle's keys. |

- **No example lists `dev`.** Four of them write to the document (`kit-tour` only from its Create tab), which Dev Mode forbids, and the two read-only ones also list FigJam. A Dev Mode build of `export-selection` or `a11y-contrast` would be a copy of the folder with the [Dev Mode manifest](#the-dev-mode-manifest) and its own `id`; none is in the repo.
- **What has been run:** `e2e/examples.spec.mjs` boots each example in every editor its manifest lists, in `preview.html`'s fake host (the stub's `editorType`, not Figma), with no console error or warning. In the real Figma, each of the five archetypes ran once in Figma Design ([results](#results-the-examples)); `kit-tour`, added after that run, has not run in Figma at all. Every other editor, and every tour row, is still open in the examples rows of the [release checklist](release-checklist.md#the-examples).
- **Adding an editor to an example:** check the editor's section above for the APIs the plugin calls, add the value to its `editorType`, and add a row to the release checklist.

### Results: the examples

Measured 2026-10-14 in Figma desktop 126.9.13 (macOS), Figma Design in the dark theme only, in a scratch file. Each example's `ui.html` and `code.js` were copied over the root's and run through the imported starter, then restored with `git checkout`. So the examples ran under the starter's `name`, `id` and `editorType`, and no example's own `manifest.json` was imported.

| Example | Window mode | What it did | How the window behaved |
|---|---|---|---|
| `rename-layers` | `fit-content` | Prefix `Icon/` previewed "5 of 5 will change"; Rename renamed all 5 layers; status "Renamed 5 layers." | Visible before its content painted, for up to about 1 s ([above](#seen-in-the-run-a-window-visible-before-it-fitted)) |
| `export-selection` | `resizable` | Listed the selected layer at 2x (200 x 200). Export opened a native macOS Save dialog for `Icon-Rectangle@2x.png`; it was cancelled, and the status read "Started 1 download", which stays true when the person cancels. Whether two layers mean two dialogs is UNVERIFIED (one layer was tried). | As `rename-layers` |
| `content-fill` | `fixed` | Fonts loaded; 3 text layers filled with names | Kept its size, no handle; visible before it painted, as above |
| `variables-sync` | `resizable` | Listed the collection's colour variables; set `brand/primary` to `FF3366` in Mode 1 (busy spinner, then the new value) | Blank for about 1 s on open |
| `a11y-contrast` | `fit-content` | Grey `#B8B8B8` on `#FFFFFF` flagged at 1.99:1, below AA; black passed at 21:1; danger notice shown | First showed its content overflowing, then refitted with the footer in view |

Not run: the light theme, FigJam, Slides and Buzz, and each example's own manifest. `kit-tour` did not exist yet and was not run at all.

## What is known and what is not

Documented facts come from Figma's developer docs, read on 2026-10-13. Measured facts come from the run on 2026-10-14 in Figma desktop 126.9.13 on macOS ([results](#measure-it-yourself)). "UNVERIFIED" means no doc covers it and it has not been measured in a real Figma client.

| Fact | Status |
|---|---|
| Minimum window 70 x 0 | Documented; measured (`resize(10, 10)` gives 70 x 10) |
| Maximum window size | Measured: none of its own; capped at the space Figma's window has (2508 x 1283 in the run). The kit's default bounds cap it at 960 x 900 |
| `figma.ui.resize` takes whole numbers only; `NaN` throws | Measured, all five editors |
| `themeColors` adds `figma-light`/`figma-dark` and live `--figma-color-*` variables | Documented; measured: the class arrives a few ms after the first script runs, before `load`; exactly the 174 documented names; live switch seen in Design |
| Main to UI messages are queued until the iframe loads | Documented; measured in all five editors |
| Assigning `figma.ui.onmessage` leaves `figma.ui.on('message')` listeners in place, and vice versa | Measured, all five editors ([messages.md](messages.md#use-figmauionmessage-for-your-handlers)) |
| A second assignment of `figma.ui.onmessage` replaces the handler it held | Inferred: it is a property holding one handler. Not measured: the 2026-10-14 probe cleared it with `undefined` between its two assignments. The probe's `assignAgain` step, added after the run, measures it next time |
| Whether UI to main messages sent before main has a handler are buffered | UNVERIFIED (the probe registers its handlers first) |
| FigJam is light-only with a purple brand | Documented; measured: `figma-light` also with Figma dark, `#9747ff` |
| Where the plugin window opens in Slides | Measured: a floating window that honours `figma.ui.resize` |
| `figma.ui.resize` in the Dev Mode panel and the Buzz side panel | Measured: ignored; the panel keeps its size |
| The Buzz pop-out modal: size and `resize` | UNVERIFIED (not tried) |
| The `<html>` class in Slides, Dev Mode and Buzz | Measured with Figma dark: `figma-dark`. With Figma light: UNVERIFIED |
| Brand colours in Slides, Dev Mode and Buzz | Measured with Figma dark: orange `#f65009`, green `#198f51`, pink `#f316b0`. Their light palettes: UNVERIFIED |
| Dev Mode selection holds at most one node | Documented, but the probe got 3 nodes there |
| `prefers-color-scheme` follows the editor's palette | Measured: no (dark in FigJam). What it does follow: UNVERIFIED |
| `popover`, `<dialog>`, `:has()`, anchor positioning, `ResizeObserver` | Measured: supported |
| Clipboard API | Measured: `navigator.clipboard.writeText` is missing; `execCommand('copy')` works |
| Inter renders, with exact 450 and 550 weights | Measured: Inter renders (Figma's static 3.10 faces); 450 draws as 500 and 550 as 600 |
| The plugin UI runs in standards mode | Measured: no, quirks mode (`BackCompat`): Figma's tags come before the plugin's doctype |
| A development plugin's manifest is re-read on every run | Measured with `editorType` and `capabilities` ([install.md](install.md#import-gotchas)) |
| Any of the above on Windows, in Figma in the browser, or (Dev Mode) in Figma for VS Code | UNVERIFIED: nothing was measured outside the macOS desktop app |
| Whether Figma rejects `["figjam", "dev"]` at import | UNVERIFIED |
| Whether `clientStorage` is shared between the desktop app and the browser | UNVERIFIED |
| Whether `"main": "../code.js"` works from a subfolder | UNVERIFIED |

## Measure it yourself

[`tools/probe`](../tools/probe/) is a development-only plugin that measures the host behaviour above on whatever Figma client you run it in. Run it again on a new Figma version, on Windows, in the browser client (once a development plugin can run there) or in Figma for VS Code, to move UNVERIFIED rows. It is plain JavaScript with no build step and no kit code, so it cannot depend on what it measures. It does not change your document. It writes one throwaway `clientStorage` key (`kit-probe`) and deletes it again.

**Manifests**

- [`tools/probe/manifest.json`](../tools/probe/manifest.json): Design, FigJam, Slides and Buzz.
- [`tools/probe/dev-mode/manifest.json`](../tools/probe/dev-mode/manifest.json): Design and Dev Mode (`"capabilities": ["inspect"]`). Its `code.js` and `ui.html` are copies of the ones in `tools/probe/`; keep them identical.

**Run it**

1. Open the Figma desktop app (importing a plugin from a manifest needs it) and open any file you can edit.
2. Figma menu > Plugins > Development > **Import plugin from manifest...**, and pick `tools/probe/manifest.json`. Import `tools/probe/dev-mode/manifest.json` the same way for Dev Mode.
3. Run **kit probe** from Plugins > Development. In Dev Mode, run **kit probe (Dev Mode)** from the Inspect panel's plugins.
4. Wait for the status to read **done** (about 3 seconds). In Design, switch Figma's theme (light/dark) while the probe is open so it captures both palettes. In Slides, Dev Mode and Buzz, switching captures their light palettes, which the 2026-10-14 run is missing.
5. Press **Copy report**, then **Close**.
6. Repeat in each editor: Design, FigJam, Slides, Dev Mode and Buzz (in the side panel, then popped out).

**What it reports** (one JSON object; `main` comes from `code.js`, `ui` from the iframe)

- `main.editorType`, `main.mode`, `main.apiVersion`: where it ran.
- `main.earlyMessage`: whether a message posted right after `showUI`, before the UI loaded, arrived (queued) or was dropped, and whether it arrived before the page's `load` event.
- `main.coexistence`: which listeners fired for each test ping (`on:A`, `assign:B`, ...), in this order: `on()` then assigning `onmessage` (`onThenAssign`), after setting `onmessage = undefined` (`afterAssignUndefined`), assigning then `on()` (`assignThenOn`), after `off()` (`afterOffD`), and `once()` on two pings (`once1`, `once2`), then assigning `onmessage` again with no clear in between (`assignAgain`, added after the 2026-10-14 run, so that run's reports don't have it). If an `on:` listener is missing from `onThenAssign`, assigning `onmessage` does remove `on()` listeners. If `assign:C` shows up in `assignAgain` next to `assign:F`, a second assignment does not replace the first.
- `main.resize`: the size the iframe actually got after no change, `resize(400, 300)`, `(10, 10)`, `(70, 0)`, `(4000, 4000)`, `(NaN, 300)` (with the error, if it threw), `(333.6, 401.4)` and `(360, 520)` to restore. On docked surfaces this shows whether `resize` is honoured at all.
- `main.storage`: a `clientStorage` round trip, its keys, and the value after delete.
- `main.dynamicPage`: the selection length, and whether the synchronous `figma.getNodeById` throws under `"documentAccess": "dynamic-page"`.
- `ui`: the `<html>` class at start and at load, whether `<style id="figma-style">` was present, every palette seen (keyed by `<html>` class, with the full injected CSS), theme switches, and the environment: user agent, origin, `color-scheme`, `prefers-color-scheme`, whether Inter is available, and support for `popover`, `<dialog>`, `:has()`, anchor positioning, the Clipboard API and `ResizeObserver`. The environment is read each time the report is redrawn, so it describes the moment of the last redraw (in Design, after the last theme switch).

**Where the results go**

Fill one row per run in the tables below, with the date and the Figma version, and add the raw reports under [Raw reports](#raw-reports). What the 2026-10-14 results decided:

- **Coexistence:** assigning `onmessage` does not clear the kit's listener, so the audit's `onmessage-assign` rule now warns only when `code.ts` assigns it more than once (a later assignment replaces the earlier handler: inferred, see the table above), and [messages.md](messages.md#use-figmauionmessage-for-your-handlers) says so.
- **Resize:** the docked panels ignore `figma.ui.resize` without an error, so the kit keeps sending its fits in Dev Mode and Buzz. Fractional sizes throw, which the kit's rounding already covers.
- **Palettes:** they feed `tokens.figma-fallback.css` and [tokens.md](tokens.md).
- **`dynamicPage`:** `figma.getNodeById` throws as the audit's `sync-getter` rule assumes.

### Results: messages and theme

Measured 2026-10-14 in Figma desktop 126.9.13 (Electron 43.7.9, Chrome 150.0.7871.250), macOS on Apple silicon, Figma in its dark theme. The two Design rows are one run, with Figma switched from dark to light while the probe was open. "Early message queued": delivered after the page's `load` event, at that many ms after the UI script started.

| Run | Date | Client and version | `editorType` / `mode` | Early message queued | `on()` and `onmessage` both fire | `on()` survives `onmessage = undefined` | `once()` fires once | `<html>` class | `--figma-color-bg-brand` | Inter available |
|---|---|---|---|---|---|---|---|---|---|---|
| Design, light | 2026-10-14 | Figma desktop 126.9.13, macOS | `figma` / `default` | yes, 3 ms | yes | yes | yes | `figma-light` (after the switch) | `#0d99ff` | `check()` false: UNVERIFIED |
| Design, dark | 2026-10-14 | Figma desktop 126.9.13, macOS | `figma` / `default` | yes, 3 ms (same run) | yes | yes | yes | `figma-dark` | `#0c8ce9` | `check()` false: UNVERIFIED |
| FigJam | 2026-10-14 | Figma desktop 126.9.13, macOS | `figjam` / `default` | yes, 3 ms | yes | yes | yes | `figma-light` (Figma dark) | `#9747ff` | `check()` false: UNVERIFIED |
| Slides | 2026-10-14 | Figma desktop 126.9.13, macOS | `slides` / `default` | yes, 307 ms | yes | yes | yes | `figma-dark` | `#f65009` | `check()` false: UNVERIFIED |
| Dev Mode (Inspect panel) | 2026-10-14 | Figma desktop 126.9.13, macOS | `dev` / `inspect` | yes, 4 ms | yes | yes | yes | `figma-dark` | `#198f51` | `check()` false: UNVERIFIED |
| Buzz (side panel) | 2026-10-14 | Figma desktop 126.9.13, macOS | `buzz` / `default` | yes, 5 ms | yes | yes | yes | `figma-dark` | `#f316b0` | `check()` false: UNVERIFIED |
| Buzz (pop-out) | not run | | | | | | | | | |

In every run the listeners fired in the same order: the `on()` listeners first, in the order they were added, then the assigned `onmessage` handler, even when the handler was assigned before an `on()` listener was added. That is one client's behaviour; don't depend on the order. `off()` removed only its listener, and `once()` fired for the first ping and not the second.

### Results: window size

Measured 2026-10-14 in Figma desktop 126.9.13, macOS. Each cell is the inner size the UI measured (`width x height`) after the call. A call that threw left the size as it was. `resize(360, 520)` afterwards restored 360 x 520 in Design, FigJam and Slides.

| Run | Initial (360 x 520) | `resize(400, 300)` | `resize(10, 10)` | `resize(70, 0)` | `resize(4000, 4000)` | `resize(NaN, 300)` | `resize(333.6, 401.4)` |
|---|---|---|---|---|---|---|---|
| Design | 360 x 520 | 400 x 300 | 70 x 10 | 70 x 0 | 2508 x 1283 (Figma's window) | threw: `Expected number, received nan` | threw: `Expected integer, received float` |
| FigJam | 360 x 520 | 400 x 300 | 70 x 10 | 70 x 0 | 2508 x 1283 | threw, as Design | threw, as Design |
| Slides | 360 x 520 | 400 x 300 | 70 x 10 | 70 x 0 | 2508 x 1283 | threw, as Design | threw, as Design |
| Dev Mode (Inspect panel) | 320 x 1179 | 320 x 1179 | 320 x 1179 | 320 x 1179 | 320 x 1179 | threw, as Design | threw, as Design |
| Buzz (side panel) | 280 x 1324 | 280 x 1324 | 280 x 1324 | 280 x 1324 | 280 x 1324 | threw, as Design | threw, as Design |
| Buzz (pop-out) | not run | | | | | | |

### Results: storage, document access and the iframe

Measured 2026-10-14 in Figma desktop 126.9.13, macOS. In every run the origin was `"null"`, the protocol `data:` and `devicePixelRatio` 2.

| Run | `clientStorage` set, get, keys, delete | `selection` (dynamic-page) | `getNodeById` (dynamic-page) | `prefers-color-scheme: dark` | `popover`, `<dialog>`, `:has()`, anchor positioning, `ResizeObserver` | Clipboard API |
|---|---|---|---|---|---|---|
| Design | all work; keys: only `kit-probe` | 0 nodes (nothing selected) | throws | no (read with Figma light) | all supported | missing |
| FigJam | all work | 0 nodes | throws | yes (Figma dark; palette light) | all supported | missing |
| Slides | all work | 0 nodes | throws | yes | all supported | missing |
| Dev Mode (Inspect panel) | all work | 3 nodes | throws | yes | all supported | missing |
| Buzz (side panel) | all work | 0 nodes | throws | yes | all supported | missing |

### Results: palettes

Measured 2026-10-14 in Figma desktop 126.9.13, macOS. All five editors inject the same 174 names. "Differs" counts the values that differ from Design's palette for the same theme, after normalising the format (`#fff` and `rgba(255, 255, 255, 1)` count as equal). The full injected CSS is in each [raw report](#raw-reports) (`ui.palettes.<class>.styleText`).

| Editor, theme | Value format | `bg-brand` | `bg-selected` | `text-brand` | Differs from Design |
|---|---|---|---|---|---|
| Design, light | hex, 3 to 8 digits (alpha as `#rrggbbaa` or `#rgba`); `bg-slot` as `rgba()` | `#0d99ff` | `#e5f4ff` | `#007be5` | (reference) |
| Design, dark | as light | `#0c8ce9` | `#394360` | `#7cc4f8` | (reference) |
| FigJam (light only) | 6-digit hex and `rgba()` | `#9747ff` | `#f1e5ff` | `#8638e5` | 54 of 174 (light) |
| Slides, dark | as Design | `#f65009` | `#864e37` | `#ffa27a` | 34 of 174 (dark) |
| Dev Mode, dark | as Design | `#198f51` | `#517361` | `#7cd797` | the same 34 |
| Buzz, dark | as Design | `#f316b0` | `#724667` | `#fc9ce0` | the same 34 |
| Slides, Dev Mode, Buzz in light | not captured | | | | |

### Results: the starter

Measured 2026-10-14 in Figma desktop 126.9.13, macOS, with the code at the `v0.4.0` tag. The root `manifest.json` was imported from the repo folder and ran with no build step.

| Editor | Offered | Theme seen | Opened | Handle | Saved size | Create |
|---|---|---|---|---|---|---|
| Design, light | yes | matches Figma's panel; blue Create | hidden, then shown already fitted | Shift+Right x2 widened it 64 px; pointer drag not tested | restored on reopen | 5 rectangles, selected and zoomed to; the window refitted |
| Design, dark | yes | matches Figma's panel; blue Create (switched from light while open) | not opened fresh in dark | not tried | not tried | not tried |
| FigJam | yes | light, purple Create | at its starting size, fitted about 1 s later | not tried | the Design size was ignored (per editor, as designed); reopen not tried | not tried |
| Slides | yes | dark, orange Create | at its starting size, fitted about 1 s later | not tried | not tried | not tried |
| Dev Mode | no: no `dev` in its manifest (as designed) | | | | | |
| Buzz (side panel) | yes | dark, pink Create | in the 280 px side panel | none (chrome off) | n/a | not tried |

### Raw reports

The full JSON of each probe run is in the repo, one file per editor. Each holds `main` (from `code.js`) and `ui` (from the iframe), with the complete injected CSS of every palette seen.

**2026-10-14 · Figma desktop 126.9.13 (Electron 43.7.9, Chrome 150.0.7871.250) · macOS, Apple silicon** · [`tools/probe/reports/2026-10-14/`](../tools/probe/reports/2026-10-14/)

| Report | Editor | Figma theme |
|---|---|---|
| [`probe-design.json`](../tools/probe/reports/2026-10-14/probe-design.json) | Design | dark, then light (both palettes) |
| [`probe-figjam.json`](../tools/probe/reports/2026-10-14/probe-figjam.json) | FigJam | dark (FigJam is light) |
| [`probe-slides.json`](../tools/probe/reports/2026-10-14/probe-slides.json) | Slides | dark |
| [`probe-dev.json`](../tools/probe/reports/2026-10-14/probe-dev.json) | Dev Mode (Inspect panel; run as **kit probe** with `tools/probe/manifest.json` edited for Dev Mode, not from `dev-mode/`) | dark |
| [`probe-buzz.json`](../tools/probe/reports/2026-10-14/probe-buzz.json) | Buzz (side panel) | dark |

Add a new run as a folder `tools/probe/reports/YYYY-MM-DD/` with one file per editor, and a heading here with the date, the client and its version.
