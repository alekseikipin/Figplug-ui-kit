# Surfaces

One plugin can run in several Figma editors, and each one hosts the UI differently. This page says where the UI appears in each editor, what the kit does there, and which of these facts are documented, measured or still assumptions. Branch on `figma.editorType` in `code.ts` when your plugin needs to behave differently; `installKitWindow()` returns it, and `kit:init` carries it to the UI ([messages.md](messages.md)).

The starter `manifest.json` lists `"editorType": ["figma", "figjam", "slides", "buzz"]`. Dev Mode needs a manifest of its own; see [Dev Mode](#dev-mode).

## At a glance

| Editor | `editorType` | Where the UI appears | Resize handle | Default bounds (W x H) | Theme |
|---|---|---|---|---|---|
| Figma Design | `figma` | Floating window over the canvas | On | 240-960 x 120-900 | Light or dark, follows Figma |
| FigJam | `figjam` | Floating window over the board | On | 240-960 x 120-900 | Light only, purple brand |
| Slides | `slides` | Floating window (assumed, UNVERIFIED) | On | 240-960 x 120-900 | Undocumented |
| Dev Mode | `dev` | Fills the Inspect panel | Off | **300**-960 x 120-900 | Undocumented |
| Buzz | `buzz` | Left side panel, full height; can pop out into a modal | Off | 240-960 x 120-900 | Undocumented |
| Any other (an editor newer than the kit) | its own value | Unknown | Off | 240-960 x 120-900 | Unknown |

"Resize handle off" means `kit:init` sends `chrome: false`: the runtime hides the handle and stops reserving its corner. The window still fits its height to the content in `fit-content` mode, but whether a docked panel obeys `figma.ui.resize` at all is UNVERIFIED. Nothing is saved on these surfaces in practice: without a handle the person never resizes through the kit, and only their resizes are stored. Your `bounds` option is merged over these defaults on every surface.

An `editorType` the kit does not list gets the handle off and the default bounds, so a plugin opened in a new editor works but loses its grip there. The fix belongs in the kit, not in your plugin: once Figma documents the new editor's window type, a kit release adds it to `kitSurface()` in the `kit:window` block, with its own handle and bounds, and a row in this table.

## Figma Design

The reference surface: everything in the kit is designed and checked here first.

- A floating window. `showUI` sizes it, and `figma.ui.resize` changes it later. The documented minimum is 70 x 0; no maximum is documented, so the kit's default bounds cap it at 960 x 900. ([showUI](https://developers.figma.com/docs/plugins/api/properties/figma-showui/))
- With `themeColors: true` (which `installKitWindow` always sets), Figma adds `figma-light` or `figma-dark` to `<html>`, injects the `--figma-color-*` variables, and updates them live when the person switches theme. ([CSS variables](https://developers.figma.com/docs/plugins/css-variables/))
- The full plugin API is available. With `"documentAccess": "dynamic-page"`, only the current page is loaded; use the `*Async` APIs for everything else ([pitfalls.md](pitfalls.md)).

## FigJam

- **Light only.** FigJam has no dark mode. Plugins get a FigJam-specific light palette under the same variable names, with a **purple brand** colour where Design uses blue (`--figma-color-bg-brand` is `#9747ff` in Figma's docs table). Kit components only use tokens, so they turn purple on their own; never hard-code "brand = blue" in your own CSS. ([CSS variables](https://developers.figma.com/docs/plugins/css-variables/), [working in FigJam](https://developers.figma.com/docs/plugins/working-in-figjam/))
- Which class FigJam puts on `<html>` (`figma-light` or something else) is UNVERIFIED. Don't detect FigJam from a CSS class; use `figma.editorType === 'figjam'` in `code.ts`.
- Not available: `createComponent()`, `combineAsVariants()`, every `create*Style()` and the `moveLocal*After()` functions.
- FigJam's own node APIs (`createSticky`, `createShapeWithText`, `createConnector`, `createCodeBlock`, `createTable`, `createGif`, `figma.timer`) are missing in Figma Design; Figma's FigJam guide says they need `figjam` in `editorType`. Slides also supports `createShapeWithText()`, `createTable()` and `createGif()` ([working in Slides](https://developers.figma.com/docs/plugins/working-in-slides/)). Check `figma.editorType` before calling any of them.
- **The kit:** same window and handle as Design.

## Slides

- Slides has no **components, styles, variables or libraries**; calls that depend on them are unavailable, as are `createConnector()`, `createCodeBlock()`, `createSection()`, `createLinkPreviewAsync()` and `setFileThumbnailNodeAsync()`. ([working in Slides](https://developers.figma.com/docs/plugins/working-in-slides/))
- Slides has three node APIs that Figma Design lacks: `createShapeWithText()`, `createTable()` and `createGif()`.
- The content model is `SLIDE` nodes (always 1920 x 1080) inside `SLIDE_ROW`s inside the slide grid. When you check for `node.type === 'FRAME'`, also check `'SLIDE'`. The focused slide is `figma.currentPage.focusedSlide`.
- A Slides file has a single page.
- Where the plugin window opens and how it is themed are not documented (UNVERIFIED). The kit assumes a floating window like Design's.
- **The demo:** "Create shapes" adds the shapes to the page, not into a slide; where they show up in Slides is UNVERIFIED. A real Slides plugin appends to `focusedSlide` or a slide it creates.
- **The kit:** same window and handle as Design.

## Dev Mode

Dev Mode plugins are for developers inspecting a design. They live in the **Inspect panel**, and they are **read-only**. ([working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode/))

- **The UI fills the Inspect panel**, its full width and height. The person resizes the panel, not the window, and in Figma for VS Code the panel is horizontal. Figma's guidance: make the UI responsive, design it tall with scrolling overflow, and optimise for a **minimum width of 300px** (a guideline, not an enforced limit).
- **Read-only:** creating, deleting or editing nodes throws (`figma.createRectangle()`, `node.remove()`, `node.name = ...`). Reading the document, events, network requests, `showUI`, `pluginData`, `relaunchData` and `exportAsync()` all work.
- The selection holds at most one node, and pages are always loaded dynamically.
- **The kit:** `chrome: false` (no handle) and a minimum width of 300. Whether `showUI`'s size and `figma.ui.resize` do anything inside the panel is UNVERIFIED (very likely ignored, since the iframe fills the panel).
- **The demo:** "Create shapes" throws here, so the demo shows a Figma error toast and answers the UI with `{ type: 'created', count: 0 }`.
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
- Some community manifests combine `dev` and `figjam` anyway; whether Figma accepts them is UNVERIFIED. Follow the docs.

## Buzz

Buzz is Figma's editor for producing marketing assets at scale. ([working in Buzz](https://developers.figma.com/docs/plugins/working-in-buzz/))

- **The UI opens in the left side panel at full height.** The person can resize the panel and pop the plugin out into a modal. Figma's guidance: make the UI responsive and design it vertically, with scrolling overflow.
- Add content to the asset grid with `figma.buzz.createFrame(row, col)` rather than `figma.createFrame()` or `currentPage.appendChild()`; put image fills on a child rectangle, not the top-level frame. A Buzz file has a single page.
- Not available: `createPage`, `createConnector`, `createCodeBlock`, `createTable`, `createSticky`, `createSlide`, `createSlideRow`, `createPageDivider`, `createLinkPreviewAsync`, `setFileThumbnailNodeAsync`.
- **The kit:** `chrome: false` (no handle; the panel has its own sizing). Whether `showUI`'s size and `figma.ui.resize` apply in the panel or the pop-out modal is UNVERIFIED.
- **The demo:** "Create shapes" adds loose shapes to the canvas outside the asset grid. A real Buzz plugin uses `figma.buzz.createFrame`.

## What is known and what is not

Documented facts come from Figma's developer docs, read on 2026-10-13. "UNVERIFIED" means no doc covers it and it has not yet been measured in a real Figma client.

| Fact | Status |
|---|---|
| Minimum window 70 x 0; `themeColors` adds `figma-light`/`figma-dark` and live `--figma-color-*` variables | Documented |
| Main to UI messages are queued until the iframe loads | Documented |
| FigJam is light-only with a purple brand | Documented |
| Slides has no components, styles, variables or libraries | Documented |
| Dev Mode is read-only; its UI fills the Inspect panel; 300px minimum-width guideline | Documented |
| `"dev"` cannot be combined with `"figjam"` | Documented |
| Buzz UI opens in the left panel at full height and can pop out | Documented |
| Maximum window size | UNVERIFIED (none documented; the kit's default bounds cap it at 960 x 900) |
| Whether assigning `figma.ui.onmessage` removes `figma.ui.on('message')` listeners | UNVERIFIED |
| Whether UI to main messages sent before a handler exists are buffered | UNVERIFIED |
| Whether `showUI` size and `figma.ui.resize` apply in the Dev Mode panel and the Buzz panel | UNVERIFIED |
| Where the plugin window opens in Slides | UNVERIFIED |
| The `<html>` class in FigJam, Slides, Dev Mode and Buzz | UNVERIFIED |
| Theme in Slides, Dev Mode and Buzz. Figma's app CSS has per-editor brand colours (green for Dev Mode; orange and pink, likely Slides and Buzz); whether plugins receive them is unknown | UNVERIFIED |
| Whether Figma rejects `["figjam", "dev"]` at import | UNVERIFIED |
| Whether `clientStorage` is shared between the desktop app and the browser | UNVERIFIED |

## Measure it yourself

[`tools/probe`](../tools/probe/) is a development-only plugin that measures the UNVERIFIED rows above on whatever Figma client you run it in. It is plain JavaScript with no build step and no kit code, so it cannot depend on what it measures. It does not change your document. It writes one throwaway `clientStorage` key (`kit-probe`) and deletes it again.

**Manifests**

- [`tools/probe/manifest.json`](../tools/probe/manifest.json): Design, FigJam, Slides and Buzz.
- [`tools/probe/dev-mode/manifest.json`](../tools/probe/dev-mode/manifest.json): Design and Dev Mode (`"capabilities": ["inspect"]`). Its `code.js` and `ui.html` are copies of the ones in `tools/probe/`; keep them identical.

**Run it**

1. Open the Figma desktop app (importing a plugin from a manifest needs it) and open any file you can edit.
2. Figma menu > Plugins > Development > **Import plugin from manifest...**, and pick `tools/probe/manifest.json`. Import `tools/probe/dev-mode/manifest.json` the same way for Dev Mode.
3. Run **kit probe** from Plugins > Development. In Dev Mode, run **kit probe (Dev Mode)** from the Inspect panel's plugins.
4. Wait for the status to read **done** (a few seconds). In Design, switch Figma's theme (light/dark) while the probe is open so it captures both palettes.
5. Press **Copy report**, then **Close**.
6. Repeat in each editor: Design, FigJam, Slides, Dev Mode and Buzz (in the side panel, then popped out).

**What it reports** (one JSON object; `main` comes from `code.js`, `ui` from the iframe)

- `main.editorType`, `main.mode`, `main.apiVersion`: where it ran.
- `main.earlyMessage`: whether a message posted right after `showUI`, before the UI loaded, arrived (queued) or was dropped.
- `main.coexistence`: which listeners fired for each test ping (`on:A`, `assign:B`, ...), in this order: `on()` then assigning `onmessage` (`onThenAssign`), after setting `onmessage = undefined` (`afterAssignUndefined`), assigning then `on()` (`assignThenOn`), after `off()` (`afterOffD`), and `once()` on two pings (`once1`, `once2`). If an `on:` listener is missing from `onThenAssign`, assigning `onmessage` does remove `on()` listeners.
- `main.resize`: the size the iframe actually got after no change, `resize(400, 300)`, `(10, 10)`, `(70, 0)`, `(4000, 4000)`, `(NaN, 300)` (with the error, if it threw) and `(333.6, 401.4)`. On docked surfaces this shows whether `resize` is honoured at all.
- `main.storage`: a `clientStorage` round trip, its keys, and the value after delete.
- `main.dynamicPage`: which synchronous getters throw under `"documentAccess": "dynamic-page"`.
- `ui`: the `<html>` class at start and at load, whether `<style id="figma-style">` was present, every palette seen (keyed by `<html>` class, with the full injected CSS), theme switches, and the environment: user agent, origin, `color-scheme`, `prefers-color-scheme`, whether Inter is available, and support for `popover`, `<dialog>`, `:has()`, anchor positioning, the Clipboard API and `ResizeObserver`.

**Where the results go**

Fill one row per run in the tables below, then paste the full JSON under [Raw reports](#raw-reports) with the date and the Figma version. The results decide follow-up work: the coexistence row sets the severity of the audit's `onmessage-assign` rule and the wording in [messages.md](messages.md); the resize rows decide whether the kit keeps sending fits in Dev Mode and Buzz; the palettes feed `tokens.figma-fallback.css` and [tokens.md](tokens.md); `dynamicPage` feeds the audit's `sync-getter` list.

### Results: messages and theme

| Run | Date | Client and version | `editorType` / `mode` | Early message queued | `on()` and `onmessage` both fire | `on()` survives `onmessage = undefined` | `once()` fires once | `<html>` class | `--figma-color-bg-brand` | Inter available |
|---|---|---|---|---|---|---|---|---|---|---|
| Design, light | | | | | | | | | | |
| Design, dark | | | | | | | | | | |
| FigJam | | | | | | | | | | |
| Slides | | | | | | | | | | |
| Dev Mode (Inspect panel) | | | | | | | | | | |
| Buzz (side panel) | | | | | | | | | | |
| Buzz (pop-out) | | | | | | | | | | |

### Results: window size

Each cell is the inner size the UI measured (`width x height`) after the call.

| Run | Initial (360 x 520) | `resize(400, 300)` | `resize(10, 10)` | `resize(70, 0)` | `resize(4000, 4000)` | `resize(NaN, 300)` | `resize(333.6, 401.4)` |
|---|---|---|---|---|---|---|---|
| Design | | | | | | | |
| FigJam | | | | | | | |
| Slides | | | | | | | |
| Dev Mode (Inspect panel) | | | | | | | |
| Buzz (side panel) | | | | | | | |
| Buzz (pop-out) | | | | | | | |

### Raw reports

None recorded yet. Paste each report as a fenced `json` block under a heading such as `#### Design, light · Figma desktop VERSION · YYYY-MM-DD`.
