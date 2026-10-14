# Kit tour (kit example)

The kit's own demo: the plugin that the **Figplug** listing on the Figma Community runs ([plugin 1545605168743471916](https://www.figma.com/community/plugin/1545605168743471916)). It shows the whole kit working inside a real plugin window, so a designer can try every part before they clone the repo.

It is curated, not a one-shot run: no agent built it from a prompt, it has no `agent.diff`, and it is kept by hand alongside the kit. The archetypes next to it each solve one task the way a fresh agent would; the tour solves none, and shows everything.

## What it shows

Three CSS-only kit tabs (a radio group, no script) are the window's first row and stay stuck to the top while a tab scrolls. The page's `<h1>` ("Kit tour") is visually hidden, because Figma's title bar already names the plugin. The tour opens on Components. Each section with something to try starts with a one-line hint.

| Tab | What is in it |
|---|---|
| **Components** | A lead line, then every component, live, under kit section headers. **Buttons:** the four variants, large, disabled, a Save button that is busy for 1.5 s, a pressed "Snap to grid" toggle, and icon buttons with tooltips that add to their names (Add layer: "Adds an empty frame"; Lock ratio, a toggle: "Keeps width and height in proportion"; Delete, `aria-disabled`: "Nothing to delete"). **Overlays**, right after the buttons, so a toast at the bottom of the window doesn't cover the buttons that show it: a menu whose items show a toast, a "Rename frame…" button that opens a modal dialog with a field (Rename, Cancel, Escape and the close button each give `kit.dialog()` a different value, and the toast says which: "Renamed to “Hero”", "Cancelled", "Closed without renaming"), a toast for each tone, one with an Undo action, and "Two in a row", which queues two. **Fields:** a text input with help, a search input with an icon, number fields with W and H prefixes next to a native select, a colour field whose swatch and hex code stay in step (three digits expand, as in Figma's own hex field; anything but three or six digits is an error, with or without `#`), a textarea, and a Prefix field that starts in its error state. **Choices:** checkboxes with an indeterminate "All", radios with a disabled one. **Feedback:** the four notice tones (the info one can be dismissed; the header's eye button, with a tooltip, brings it back, and focus moves between the two), and an empty state whose button goes to the Create tab. **List:** ten frame rows with one current row, in a `.kit-scroll` region. |
| **Create** | The starter's demo, unchanged in spirit: a Count field with help and error states, a Shape select, and a sticky footer (`kit-footer`, the twentieth component) with the status line, Close, and Create, busy until main answers. Main places the shapes in a row at the centre of the view, selects them and zooms to them; the status line shows the selection count and the result. This is the only tab that touches the document. |
| **Window** | How the window behaves: the three modes in one sentence each (the one in use is marked "In use"; `kit.fit()` is named under `resizable`, the mode it is for), the live `W × H` of this window, an "Add a line" button that adds a line of content so the window grows to fit it (and "Remove the line" shrinks it back), the resize handle's keys, and where to get the files. In Buzz, where Figma docks the plugin in a panel it sizes itself, no mode is marked, the button and the keys are hidden, and the note says why. |

Switching tabs is part of the demo: each tab has its own height, and the window refits to it.

The tour only shows what a real plugin would do: its toasts and notices use plugin copy ("Renamed 3 layers", "2 layers are locked"), not descriptions of the kit. The other things worth knowing about how it is built:

- **Keyboard.** A held Enter acts once: the tour ignores repeated Enter keydowns on its buttons, the Count field and the dialog's field, so a long press on Create makes one batch of shapes and a long press on "Rename frame…" doesn't also press Rename. The page's `scroll-padding-top` keeps whatever the browser scrolls into view (focus moving back up, find in page) below the sticky tab bar.
- **The Undo toast has no timer** (`duration: 0`, as [components.md](../../docs/components.md#toast) asks for a toast whose action the person needs). The kit shows one toast at a time, so the tour dismisses it before it shows any other toast, and when the person leaves the Components tab.
- **Live regions only where something changes.** The success, warning and danger notices are static samples with no role; only the dismissible info notice has `role="status"`. The "In use" pill uses the selected list row's token pair (`text-onselected` on `bg-selected`).

## Window mode: `fit-content`

`installKitWindow({ mode: 'fit-content', size: { width: 360 }, bounds: { maxHeight: 720 } })`. The tour exists to show the window following its content, so it uses the default mode and lets the tabs change the height. At 360px wide, measured in the preview: Create is 254px tall (262px once a result line shows), Window 642px (666px with the added line), and Components (about 1,810px of content) stops at the 720px maximum and scrolls, so the tour opens at 720px. The tab bar sticks to the top while it scrolls, and the list keeps its own `.kit-scroll` region. 360px wide fits the four button variants on one row; at 240px, the narrowest the bounds allow, everything wraps, nothing is cut off, and the Window tab reaches the maximum and scrolls too. Content fits are never saved; only a width the person drags to is ([window-chrome.md](../../docs/window-chrome.md#what-is-saved-and-when)).

## Editors

`editorType` is `["figma", "figjam", "slides", "buzz"]`, the starter's list. The UI is the same everywhere and only Create calls the document API (`createRectangle`, `createEllipse`). In Slides and Buzz the shapes are added to the page, not to a slide or the asset grid, as the starter's are; where they show up there is UNVERIFIED ([surfaces.md](../../docs/surfaces.md#the-examples)). If creating fails, Figma's error notice says why and the status says "Nothing created"; if the shapes are made but selecting or zooming to them fails, the notice says so and the status still counts them. Buzz shows the UI in a docked panel without the resize handle. Dev Mode is out: Create writes to the document, and `dev` can't share a manifest with `figjam`.

## How to import it

No build is needed: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file you can edit.
2. **Plugins > Development > Import plugin from manifest…** and pick `examples/kit-tour/manifest.json`.
3. Run **Plugins > Development > Kit tour (kit example)**.

If nothing happens, see the [import gotchas](../../docs/install.md#import-gotchas). After editing `code.ts`, rebuild with `npx tsc -p examples/kit-tour` from the repo root (`npm run build:examples` rebuilds every example).

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/kit-tour (or pick it under *Plugin*). It runs against the preview's `figma` stub, which is a stand-in, not Figma ([loop.md](../../docs/loop.md#preview-in-a-browser)).

## The published copy

This folder's manifest keeps the example's name and the id `kit-example-kit-tour`, so importing the repo never shares an identity or `figma.clientStorage` with the installed Community plugin. The listing is published from a **publish folder outside the repo**: a copy of this folder's `manifest.json`, `code.js` and `ui.html` whose `manifest.json` has the name `Figplug` and the published id `1545605168743471916`; nothing else changes. The owner's steps, the listing copy and the version note are in [community-listing.md](../../docs/community-listing.md#the-kits-own-listing), and the id rules in [publishing.md](../../docs/publishing.md#the-plugin-id). The tour has not been run in the real Figma yet: UNVERIFIED until the [release checklist](../../docs/release-checklist.md#the-examples) run.

## Tests

- [example.test.mjs](example.test.mjs) runs the compiled `code.js` whole in `node:vm` against a `figma` stub: the window (fit-content, 360 wide, at most 720 tall; no handle in Buzz), the selection count, created replies for both shapes, the 1 to 50 clamp, failure replies (none or some shapes made, a viewport that can't be read, a selection or zoom that fails after the shapes exist, each with exactly one reply), close, and the malformed and unknown messages main ignores.
- `e2e/examples.spec.mjs` boots it in each of its editors in `preview.html`'s fake host and, in its own describe, checks: it opens on Components with the tab bar as the first row; switching tabs refits the window (and saves nothing); Shift+Tab back up Components never leaves focus under the sticky bar; the menu, the dialog (every return value, Enter in its field, a held Enter on its opener) and every kind of toast work, the Undo toast outlasts the default 4 s and goes when another toast shows or the tab changes; the components react (the colour field both ways and its three- and eight-digit cases, the focus hand-off between the notice and the eye button, only the info notice a live region); Create (the selection line, 0 and 51 sending nothing, Enter once, a held Enter once, a second press while busy sending nothing, a failed create reading "Nothing created"); the Window tab's added line in `fit-content` and, through the preview's mode switch, `resizable`; the Window tab in Buzz; and axe on every tab and with each overlay open, in light, dark and FigJam.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Name "Kit tour (kit example)", id `kit-example-kit-tour`, `editorType` figma, figjam, slides and buzz, `dynamic-page`, no network |
| `code.ts` | The root's `kit:window` block unchanged, then the tour's main thread below `// ---- Your plugin starts here ----`: typed messages (one interface each, a union per direction), type guards, the Create-shapes handler |
| `code.js` | Compiled from `code.ts` with `tsc -p examples/kit-tour` (committed, so the folder imports as is) |
| `ui.html` | The root's three kit blocks unchanged, then the tour's host CSS, markup and script |
| `kit.d.ts` | A byte copy of the root's |
| `tsconfig.json` | The root's compiler options; `files` is `code.ts` and `kit.d.ts` |
| `example.test.mjs` | The main thread's unit tests (above) |
| `README.md` | This page |
