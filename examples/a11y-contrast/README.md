# Contrast check (kit example)

Checks the contrast between each selected text layer (or each text layer in a selected frame, group or component) and what Figma paints behind it, and flags anything below WCAG 2 AA, in Figma Design, FigJam, Slides and Buzz.

## Window mode: `fit-content`

`installKitWindow({ mode: 'fit-content', size: { width: 320, height: 360 } })`. The window's content changes with every check: an empty state when nothing is selected, then a summary, a results list and a details panel for the chosen row. `fit-content` lets the height follow it, so an empty selection gives a short window and a long result never leaves blank space. The list sits in a `.kit-scroll` region (240px at most) so the window stays short however many layers are checked, and the `kit-footer` with **Select failing** stays in view. In this mode the grip changes only the width.

## The prompt

The [entry prompt](../../docs/prompts.md#the-entry-prompt) with the `a11y-contrast` task, pasted into a fresh session in a fresh clone:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that checks the contrast between each selected text layer and the fill behind it and flags anything below WCAG AA with kit classes only, then tell me how to import it.
```

## One-shot result

Graded in the agent's clone as it left it, before any curation.

| Date | Tool | Model | Kit | Build | Audit | check:ui | Unit tests | E2E | Fake-host boot | Imports into Figma? |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | Claude Code (Agent SDK subagent) | claude-opus-5-5 | 0.3.0 | pass | pass, no findings | pass | pass (358 passed, 3 skipped: the replaced demo's cases; 19 of the passes are the agent's own contrast tests) | pass (88 passed, 9 skipped: demo and screenshot specs) | boots in `fit-content` in light, dark and FigJam with no console errors; the header, empty state and footer render, and a selection without text shows "No text layers in the selection" | pending (real Figma not run) |

Automated one-shot: **yes** (build, audit, check:ui, unit tests and e2e all pass; the kit's three `ui.html` blocks, the `kit:window` block and `kit.d.ts` are byte-identical to the release). The defects below are ones no check could catch: they are in the contrast maths, which only golden scenes can pin.

## What the agent built

`code.js`, `code.ts`, `manifest.json` and `ui.html` changed: 1,678 insertions, 171 deletions, plus a new 19-case test file ([agent.diff](agent.diff)).

- A small renderer in `code.ts`: it copies the page into plain layers once per check and renders 15 points over each text's glyph bounds twice, with the text's fill and without it, keeping the lowest ratio. Fills paint bottom to top, children back to front, and a frame's or group's opacity fades the flattened group as a whole (the Phase 1 run faded each child on its own). Clipping frames, masks, rounded corners, ellipses and arcs, gradients sampled at the exact point, and Display P3 luminance are all handled.
- Other text layers are left out of the backdrop (the Phase 1 run painted their whole boxes); images, videos and shader fills make a result "check by eye"; vectors count as their bounding box and blend modes as Normal, and the result says so.
- AA rules: 4.5:1, or 3:1 for large text (24px, or 18.67px bold); a layer with several styles reports its worst; ratios are rounded down for display, so 4.499 never shows as 4.50.
- Re-checks on every selection change and, debounced, after edits on the page (`page.on('nodechange')`); clicking a row selects that layer and scrolls to it without zooming; **Select failing** selects every failing layer; neither replaces the list. At most 250 text layers per check.
- The UI: a summary notice (success, warning or danger) in the one `role="status"` region, a list of button rows (status icon, an "Aa" chip in the document's colours set through custom properties, name, ratio), and a details panel with the colours and notes. Typed messages (one interface each, a union per direction, a guard).
- `ui.html` came out at 64,990 bytes, just under the 64 KB budget: the agent moved all wording into `code.ts` to get there.

## What curation changed, and why

- **Text covered by a layer above it is no longer a 1:1 failure.** The agent rendered "with the text" and "without it" and compared them; where an opaque layer sits over the text the two renders are the same colour, so a covered layer was reported as failing at 1.00:1 ("Text #000000 on #000000"), and a layer covered on one side failed although its visible part passed. Each point is now probed with opaque black and opaque white text: where they render alike, the text can't show there (covered, or at 0% opacity) and the point is left out like a clipped one. Only the visible part is measured, with a note; a layer with no visible part is "not visible", not a failure. A semi-transparent layer over the text still lowers its contrast, as it should.
- **Text on a path is not a backdrop.** `TEXT_PATH` layers were painted as solid boxes of their text colour, the Phase 1 overlapping-text bug in another node type. They are now left out like other text.
- **Unreadable layers are "check by eye".** Media, embeds, link previews and widgets were skipped as if transparent, and code blocks and slide polls have no fills to read, so text on a video embed was measured against whatever lay under the embed (21:1 in a test scene). They are now opaque boxes of unknown colour: text on one is "check by eye", text under one is covered.
- **Samples stay on the glyphs.** The samples were spread over `absoluteRenderBounds`, which a drop shadow, blur or stroke grows past the glyphs, so points could land on the page beside the text. With a visible effect or stroke, the render bounds are now kept inside the layer's box (without one they are the glyphs' ink, overflow included).
- **The summary tells "not visible" from "could not be measured".** Hidden, clipped and covered layers were counted with unmeasurable ones and the person was told to "check them by eye"; they are now counted apart ("1 could not be measured. Check it by eye. 2 are not visible.").
- **A big selection no longer stalls the file.** Every sample was rendered through the whole snapshot, so the time grew with the square of the selection: in `node:vm`, a list of 250 rows (a group of a rectangle and a label each), all selected, took 1.9 s of main-thread work, and every edit on the page ran it again. Each copied layer now carries the box it can paint in (its own, its children's when it doesn't clip, and a checked text's sample area). A render skips any layer whose box misses the point, and each text renders through only the part of the snapshot that reaches its own samples. The same 250 rows take about 45 ms. The snapshot also skips a subtree whose render bounds miss every sample area, such as a far-off board of groups, but always walks the layers that hold a checked text. Results are unchanged: on 6,000 random scenes the message matched the earlier code byte for byte.
- **A row click never loses the list.** If scrolling to the layer threw after the selection was made, the plugin forgot it had made that selection and replaced the list with it; the scroll now has its own `try`. (Real Figma always has `viewport.bounds`; the preview's stub does not.)
- Manifest: name "Contrast check (kit example)", id `kit-example-a11y-contrast`; `editorType` keeps Design, FigJam, Slides and Buzz, which all have text layers. Dev Mode is left out: the plugin is read-only, but Dev Mode can't share a manifest with FigJam and needs `"capabilities": ["inspect"]` ([surfaces.md](../../docs/surfaces.md#the-dev-mode-manifest)), so it would be a second plugin. In FigJam, text on stickies and shapes is not a text layer and isn't checked.
- `ui.html` is the agent's, unchanged apart from the kit blocks pasted again from the root (byte-identical); below the kit block, `code.ts` changed in 194 lines added and 34 removed (90 and 23 before the speed fix).

[examples/a11y-contrast/example.test.mjs](example.test.mjs) runs this folder's compiled `code.js` whole in `node:vm` on stub pages and checks every ratio against an independent WCAG implementation. Its 38 cases pin a group's and a frame's opacity fading the whole group, nested opacities, overlapping sibling text above and below (selected or not), text on a path, covered, partly covered, veiled and 0% opacity text, clipping (whole layers, and text half outside a frame's box or its rounded corner), masks, ellipses, gradients, images (bare, covered, and under a translucent veil) and unreadable layers, mixed styles with `figma.mixed` fills and sizes, large text and its edges (23px and 18.67px semibold are not large), rotated text, drop-shadow bounds, glyphs overhanging the text box, Display P3, the 250-layer cap with a time budget at it, a far-off board left unread on checks and edits, the summary wording, the selection round trip, edits, junk messages and the results message's shape. Ten of them fail against the agent's original `code.js`: the eight fixed above, plus the time budget (1.95 s) and the far-off board.

## How to import

No terminal and no build: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file you can edit.
2. **Plugins > Development > Import plugin from manifest…** and pick `examples/a11y-contrast/manifest.json`.
3. Run it from **Plugins > Development > Contrast check (kit example)**, then select text layers, or a frame that holds some.

If nothing happens, see the [import gotchas](../../docs/install.md#import-gotchas). After editing `code.ts`, rebuild with `node_modules/.bin/tsc -p examples/a11y-contrast`.

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/a11y-contrast (or pick it under *Plugin*): it runs in its own window mode against the preview's `figma` stub, a stand-in with a few fake layers ([loop.md](../../docs/loop.md#preview-in-a-browser)). `npm run build:examples` at the root rebuilds every example (`npm run check` runs it too); `npm run build` compiles only the root plugin.

## Limits

Strokes and effects (shadows, blurs) are ignored; blend modes count as Normal; vectors, stars, polygons and boolean shapes count as their bounding box; images, videos, shader fills and unreadable layers can't be measured. Each result says when one of these applied. Fifteen points per layer can miss a backdrop shape smaller than the gaps between them. The plugin reads colours and never changes the document; it only selects layers and scrolls the canvas.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The example's manifest: `dynamic-page`, no network, Design, FigJam, Slides and Buzz |
| `code.ts` | The kit's `kit:window` block (byte copy of the root's) and the plugin: the page snapshot, the renderer, the AA rules and the messages |
| `code.js` | `code.ts` compiled with `tsc -p examples/a11y-contrast` |
| `ui.html` | The kit's three marked blocks (byte copies of the root's) and the plugin's summary, results list, details panel and script |
| `kit.d.ts` | Byte copy of the root's protocol types |
| `tsconfig.json` | The root's compiler options; files `code.ts` and `kit.d.ts` |
| `agent.diff` | The one-shot agent's original change, before curation |
| `README.md` | This page |
