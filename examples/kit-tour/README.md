# Kit tour (kit example)

The kit's own demo: the plugin that the **Figplug** listing on the Figma Community runs ([plugin 1545605168743471916](https://www.figma.com/community/plugin/1545605168743471916)). It shows the kit's 20 parts working in a real plugin window, so a designer can try them before they get the files.

It is curated, not a one-shot run: it wasn't built from a single prompt, it has no `agent.diff`, and it is kept alongside the kit. The archetypes next to it each solve one task the way a fresh agent would; the tour solves none, and shows all 20 parts.

## What it shows

It opens on **Home**: "20 parts for your Figma plugin", the parts in six groups, each row with a ring per part, and **Create shapes** set apart under its own divider, because it is the only row that changes the file. The footer says how many parts you have tried and has **Get the files**. The `<h1>` ("Figplug") is visually hidden, because Figma's title bar already names the plugin.

Each row opens a small page that works like a little plugin. Every page has the same bar: Back (always to Home, with focus on the row you came from), the page's title, and **Next**, which walks the pages in order. Next is tertiary, and turns secondary once you have tried every part on the page (on Create shapes, after a Create that worked). Under the bar, one line says what to do, and a legend lists the page's parts.

| Page | What you do there | Its parts |
|---|---|---|
| **Buttons** | Change the Variant, Size, State and Label of one live button on a scrap of canvas; its badge shows the size it really is. As a toggle, a press flips State between Toggled on and Toggled off. Reset is off with a reason ("Nothing to reset") until you change something. | Button, icon button, tooltip |
| **Fields** | Edit a frame: its name (clear it for the error), W and H with a ratio lock (whole numbers from 1 to 10,000), its fill as a swatch and a hex code (six digits apply as you type, without moving the caret; three expand), notes. | Text input, number field, colour field, textarea |
| **Choices** | Tabs for Layers, Styles and Variables. Tick Hidden and All is ticked too; untick a type and All goes mixed; a line says what it would find. "Selection" is off, with its reason, until something is selected in Figma. | Select, checkbox, radio, tabs |
| **Pop-ups** | Five sample frames, each with its own menu: Rename… opens a dialog, Duplicate adds a row (up to eight; then it is off and says the list is full), Delete removes it and shows a toast with Undo. Delete them all for an empty state. Nothing here touches the file. | Menu, dialog, toast |
| **Feedback** | Pick a tone for the notice, show the same message as a toast, dismiss the notice for the empty state. | Notice, empty state |
| **Window** | Add frames and the window grows, until the list stops at 5.5 rows and scrolls (a line under its header shows it has scrolled). The footer shows the live size, "Opens at 412 px wide next time" after a drag, and the keys ("← → 8 px · Shift 32 px · Enter: next width") while the corner has keyboard focus. | Section header, list, sticky footer, resize handle |
| **Create shapes** | Count and Shape, a preview of the row main will add (with its real size), and Create, busy until main answers. A notice gives the result. | |
| **Get the files** | Three steps (the second says to open the folder in an AI agent that can edit files), Copy link, Open GitHub, and "Colours from Figma": five swatches whose hex codes are read from Figma's colours as they are now. | |

**Progress.** A part counts the first time it does its job in front of you, on any page. Its ring in the legend fills, Home's footer counts ("You’ve tried 6 of 20 parts"), and one polite live region says "Tried: Dialog. 7 of 20." Moving around never counts. On Home, a finished group's tile is tinted, and at 20 a success notice points at Get the files. Progress lasts until the plugin closes; nothing is stored. The legend items are buttons too (the group's name says so: "Parts on this page. Press one to see where it is."): each one shows where its part is on the page (it rings and focuses it, and says where), and never counts, also when you close a menu it opened with Escape. A tried part's name ends in ", tried".

The other things worth knowing about how it is built:

- **One screen at a time.** Nine `section.tour-screen` elements, all but one `hidden`. A screen slides in 8px and fades (not with reduced motion); the root clips sideways, so the slide never shows a scrollbar.
- **Hidden footers.** Hidden screens keep their footers in the DOM, so two kit rules (the bottom padding, and the toast's place above a footer) are rewritten in the host CSS for the screen on show.
- **The toast lane.** While a toast shows, the screen on show makes 40px of room for it, so it never covers a row: a screen with a footer gives the footer a top margin, and one without gets an empty box under its content. It is a box, not padding, because the kit refits when the root's content box changes.
- **One toast at a time, at once.** A new toast replaces the one on show instead of waiting in the kit's queue, and leaving a page takes its toast away. The Undo toast has no timer (`duration: 0`, as [components.md](../../docs/components.md#toast) asks for a toast whose action the person needs); Undo puts the row back and focuses its ⋯.
- **Menus and tooltips.** While a ⋯ menu is open, that button's tooltip stays hidden, as in Figma. The last frame row's tooltip opens above, so it never leaves the window in Buzz's panel.
- **Keyboard.** A held Enter acts once: on Create, in the Count field, on the live button and in the rename dialog. Focus never lands under the sticky bar (`scroll-padding-top`).
- **The theme.** When Figma switches between light and dark while the tour is open, the swatches change on the spot and a toast says so, once.
- **Size.** `ui.html` stays under 127 KB, a budget the unit tests keep so a change that grows it fails there before the audit's 128 KB warning: the bars, the legends, Home's rows, the Choices panels, the frame rows and their menus, the Window rows and the swatches are built from data and `<template>`s, and the icons come from one SVG sprite.

## Window mode: `fit-content`

`installKitWindow({ mode: 'fit-content', size: { width: 360 }, bounds: { maxHeight: 720 } })`. The tour shows the window following its content, so every screen change is a refit. Measured in the preview at 360px wide: Home 473px, Buttons 401, Fields 476, Choices 360, Pop-ups 296, Feedback 232, Window 290, Create shapes 309 and Get the files 478. At 280px (Buzz's panel) the tallest is Get the files, 558px, so no screen reaches the 720px maximum. The e2e test checks each screen against these heights, at 360 and at 280. Content fits are never saved; only a width the person drags to is ([window-chrome.md](../../docs/window-chrome.md#what-is-saved-and-when)).

## Editors

`editorType` is `["figma", "figjam", "slides", "buzz"]`, the starter's list. Only Create shapes calls the document API (`createRectangle`, `createEllipse`). In Slides and Buzz the shapes are added to the page, not to a slide or the asset grid, as the starter's are; where they show up there is UNVERIFIED ([surfaces.md](../../docs/surfaces.md#the-examples)). If creating fails, Figma's error notice says why ("Couldn’t add shapes: …") and the page says "Couldn’t add shapes here." After a Create that worked, the page says "Added 5 rectangles to this page." and the footer how many layers are selected.

Open GitHub calls `figma.openExternal`, which opens the browser and fetches nothing, so the manifest keeps `networkAccess: none`. Whether it works in Slides and Buzz is UNVERIFIED; where it fails, Figma's notice says "Couldn’t open your browser. Use Copy link instead.", and the address is on the page, selectable, with Copy link. Copy link puts the full address on the clipboard through the copy event, so focus stays on the button; if the clipboard is blocked, the address is left selected to copy by hand.

Buzz shows the UI in a 280px docked panel that keeps its size (Figma ignores `figma.ui.resize` there, [surfaces.md](../../docs/surfaces.md#buzz)) and has no resize handle. The Window page says so in a notice, its lead says only "Add frames to the list.", and the handle counts once that page has been shown, so the count is always out of 20. Dev Mode is out: Create writes to the document, and `dev` can't share a manifest with `figjam`.

## Messages

- UI → main: `{ type: 'create-shapes', count, shape }`, and `{ type: 'open-github' }`. The address is `TOUR_GITHUB_URL` in `code.ts`, never part of the message.
- Main → UI: `{ type: 'selection', count }` at startup and on every selection change (Create's status line and the Choices "Selection" radio read it), and `{ type: 'created', count, shape }` after every create, with `count` 0 when nothing could be made.

The shapes' fill, `{ r: 1, g: 0.5, b: 0 }`, is in both files (`TOUR_SHAPE_FILL` in `code.ts`, `SHAPE_FILL` in `ui.html`), so the preview draws them in the same orange: keep the two in step.

## How to import it

No build is needed: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file you can edit.
2. **Plugins > Development > Import plugin from manifest…** and pick `examples/kit-tour/manifest.json`.
3. Run **Plugins > Development > Kit tour (kit example)**.

If nothing happens, see the [import gotchas](../../docs/install.md#import-gotchas). After editing `code.ts`, rebuild with `npx tsc -p examples/kit-tour` from the repo root (`npm run build:examples` rebuilds every example).

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/kit-tour (or pick it under *Plugin*). It runs against the preview's `figma` stub, which is a stand-in, not Figma ([loop.md](../../docs/loop.md#preview-in-a-browser)): there Open GitHub logs the address instead of opening it.

## The published copy

This folder's manifest keeps the example's name and the id `kit-example-kit-tour`, so importing the repo never shares an identity or `figma.clientStorage` with the installed Community plugin. The listing is published from a **publish folder outside the repo**: a copy of this folder's `manifest.json`, `code.js` and `ui.html` whose `manifest.json` has the name `Figplug` and the published id `1545605168743471916`; nothing else changes. The owner's steps, the listing copy and the version note are in [community-listing.md](../../docs/community-listing.md#the-kits-own-listing), and the id rules in [publishing.md](../../docs/publishing.md#the-plugin-id). The tour has not been run in the real Figma yet: UNVERIFIED until the [release checklist](../../docs/release-checklist.md#the-examples) run.

## Tests

- [example.test.mjs](example.test.mjs) runs the compiled `code.js` whole in `node:vm` against a `figma` stub: the window (fit-content, 360 wide, at most 720 tall; no handle in Buzz), the selection count, created replies for both shapes, the 1 to 50 clamp, failure replies (none or some shapes made, a viewport that can't be read, a selection or zoom that fails after the shapes exist, each with exactly one reply), `open-github` (the fixed address, also when the message carries another one, and a plain notice that points at Copy link when the browser can't open), and the malformed and unknown messages main ignores (the old `close` among them). It also checks what a static read can: the manifest, `code.ts` (the root's `kit:window` block, one `figma.ui.on` listener, no Close), and `ui.html` (the nine screens and which end in a footer, the address and the fill the two threads share, one strict classic script, no comments or storage, unique ids, under its 127 KB budget, the approved copy and no AI tool names).
- `e2e/examples.spec.mjs` boots it in each of its editors in `preview.html`'s fake host and, in its own describe, checks: Home (six groups, a ring per part, Create apart, 0 of 20, quirks mode); every page opening from its row with focus on its title, the window refitting to every screen (each near its height in the table above at 360 and at 280, never scrolling sideways, nothing saved), and Back returning focus to the row, marked current; Next's order and its emphasis; a walk that tries all 20 parts and checks the rings, the count, the announcement, Next and Home after each; Show me never counting; the live button, the fields' errors, the Choices summary and Selection, the menus, dialog, Duplicate, Delete and Undo in the toast lane, the notices and empty states, the Window list up to its cap, the drag and the keys; Create (the label and preview, create-shapes with the count and shape, the result, a held Enter, busy until main answers, a failed create); Copy link and Open GitHub; the swatches in light, dark and FigJam and on a live theme switch; 280px in Buzz; the preview's resizable mode (kit.fit() on every screen, focus never under the sticky bar) and fixed mode; and axe on every screen and overlay in light, dark and FigJam.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Name "Kit tour (kit example)", id `kit-example-kit-tour`, `editorType` figma, figjam, slides and buzz, `dynamic-page`, no network |
| `code.ts` | The root's `kit:window` block unchanged, then the tour's main thread below `// ---- Your plugin starts here ----`: typed messages (one interface each, a union per direction), type guards, Create shapes and Open GitHub |
| `code.js` | Compiled from `code.ts` with `tsc -p examples/kit-tour` (committed, so the folder imports as is) |
| `ui.html` | The root's three kit blocks unchanged, then the tour's host CSS, markup and script |
| `kit.d.ts` | A byte copy of the root's |
| `tsconfig.json` | The root's compiler options; `files` is `code.ts` and `kit.d.ts` |
| `example.test.mjs` | The unit tests (above) |
| `README.md` | This page |
