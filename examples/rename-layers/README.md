# Rename layers (kit example)

Renames the selected layers with a prefix, find and replace, and optional numbering, and shows every new name in a preview before anything changes.

## Window mode: `fit-content`

`installKitWindow({ mode: 'fit-content', size: { width: 360 } })`. The window is a short form whose height changes with what the person does: ticking "Add numbers" shows five more fields, and the preview list grows with the selection. In `fit-content` mode the window follows that height on its own. The list sits in a `.kit-scroll` region (240px at most), so a selection of 500 layers doesn't push the sticky footer with Rename out of view ([long lists](../../docs/components.md#long-lists-kit-scroll)). The width can still be dragged.

## The prompt

The pinned [entry prompt](../../docs/prompts.md#the-entry-prompt) with the `rename-layers` task:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that renames the selected layers with a prefix, find and replace, and optional numbering, and shows a preview of the new names before I apply them with kit classes only, then tell me how to import it.
```

## One-shot result

A fresh agent in a fresh clone of kit 0.3.0, given only the prompt above. A separate curator agent then ran the checks on the clone as the agent left it.

| Date | Tool | Model | Kit | Build | Audit | check:ui | Unit tests | E2E | Fake-host boot | Kit blocks | Imports into Figma |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | Claude Code (Agent SDK subagent) | claude-opus-5-5 | 0.3.0 | pass | pass (no findings) | pass | pass (339, 3 skipped) | pass (88, 9 skipped) | pass | byte-identical | pending: real Figma not run |

All the automated checks passed, so this counts as an automated one-shot. The fake-host boot opened `preview.html`: the window was 360 × 431 in `fit-content` mode, no console errors, and with 3 layers selected, Rename wrote exactly the 3 previewed names with one `commitUndo`. Importing into the Figma desktop app has not been tried, so it is not yet a full one-shot.

## What the agent built

`code.js | 272`, `code.ts | 346`, `manifest.json | 6`, `ui.html | 300`: 4 files changed, 762 insertions, 162 deletions. The whole diff is in [agent.diff](agent.diff).

- **Options:** a prefix; find and replace with "Match case" and "Regular expression"; "Add numbers", which shows Start at, Digits (1, 01, 001), Separator, Position (before or after the name) and Order (Layers panel, top to bottom, left to right).
- **Preview:** main works out the new names for the current selection and the UI lists them, one row per layer ("Frame 2 → Icon/Frame 2 02", or "No change"). The header says how many will change. The preview updates as you type, when the selection changes, and when a selected layer is renamed or moved on the canvas (`nodechange` on the current page, re-registered when the page changes).
- **Preview = apply:** each preview has a token. Rename sends the token of the preview on screen, and main renames exactly that preview's layers, as one undo step. A layer renamed or deleted since the preview is skipped. A name that would end up empty keeps the old name.
- **Errors:** an invalid regular expression or Start at value shows an error under its field (`aria-invalid` + `.kit-help`) and disables Rename. The `role="status"` line announces results, not typing.
- **The kit:** kit classes and layout primitives only, plus four host CSS rules (spacing and ellipsis, no colours). Typed messages, with one interface per message and a union per direction. The kit blocks are untouched. `editorType` is `["figma", "slides"]`.

## What curation changed, and why

- **Enter right after typing renamed nothing.** If Rename was pressed (Enter in a field, typically) before the preview for the last keystroke had come back, main refused the out-of-date token. The status line then said "The layers changed. Check the preview, then rename again." although only the options had changed. Reproduced in the fake host. Now every `rename-preview` has a `seq` that main echoes in its result. A Rename pressed before the matching preview arrives waits for it, then applies the preview on screen. Main's token check still catches real selection and layer changes, and the message now names them ("The selection or the layers changed…").
- **Each keystroke re-read the layer tree once per selected layer.** The Layers-panel order called `parent.children.indexOf(node)` for every selected layer and every ancestor on every preview, and Figma builds a new array on each `children` read. With 1,000 icons selected in one frame, every keystroke built 1,000 arrays of 1,000 nodes. It also relied on Figma returning the same object for a node each time. Now each parent's children are read once per preview into a map by id, and positions are read only for the row and column orders. The test checks that a 250-layer selection reads its frame's `children` once.
- **The status line kept an old result.** It announced the selection only when the number of selected layers changed. After "Renamed 3 layers.", selecting 3 other layers left that result on screen and unannounced. Main now counts selection and page changes (`selection` in the preview), and the UI announces each one, still never while typing.
- **The page watch is guarded.** `figma.currentPage.on('nodechange', …)` ran at the top level without `try`. In an editor that can't watch a page, the plugin would have thrown at startup with its window already open. Slides' plugin surface is largely unverified ([surfaces.md](../../docs/surfaces.md#slides)). It is now caught and warned once, and the preview still follows the selection and every option.
- **The example's manifest:** name "Rename layers (kit example)", id `kit-example-rename-layers`, `editorType` kept at the agent's `["figma", "slides"]`. Dev Mode is out because the plugin writes names, so it isn't read-only-safe. The agent left FigJam and Buzz out, and they stay out until someone checks them. The kit blocks, `kit.d.ts` and `tsconfig.json` are copied from the repo root.
- **Pinned by tests:** [examples/rename-layers/example.test.mjs](example.test.mjs) runs the compiled `code.js` in `node:vm` against a scene-graph stub. Golden cases cover: names for prefix, find and replace (plain text keeps `$` literal, regular expressions keep `$1`), numbering (start, digits, separator, position); the three orders across frames, with parents before their children; preview = apply (same layers, same names, same order, one undo step); stale, skipped and failed renames; `seq` and `selection` echoes; message validation; and clamps. Four of the 17 fail on the agent's original `code.js`, one for each fix above.

Known limits, not changed:

- A regular expression with catastrophic backtracking (`(a+)+$` on a long name) can stall the main thread. A synchronous `replace` can't be given a timeout.
- Renaming variants inside a component set with a prefix breaks their `Property=Value` names. The preview shows the new names, but nothing warns about it.
- "Top to bottom" sorts by each layer's top edge, rounded to the pixel. For a row of layers whose tops differ (centre-aligned icons of different sizes), use "Left to right".

## How to import it

No build is needed: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file you can edit.
2. **Plugins > Development > Import plugin from manifest…** and pick `examples/rename-layers/manifest.json`.
3. Select some layers and run **Plugins > Development > Rename layers (kit example)**.

If nothing happens, see the [import gotchas](../../docs/install.md#import-gotchas). After editing `code.ts`, rebuild with `npx tsc -p examples/rename-layers` from the repo root.

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/rename-layers (or pick it under *Plugin*): it runs in its own window mode against the preview's `figma` stub, a stand-in with a few fake layers ([loop.md](../../docs/loop.md#preview-in-a-browser)). `npm run build:examples` at the root rebuilds every example (`npm run check` runs it too); `npm run build` compiles only the root plugin.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Name, id `kit-example-rename-layers`, `editorType` figma and slides, `dynamic-page`, no network |
| `code.ts` | The root's `kit:window` block unchanged, then the plugin below `// ---- Your plugin starts here ----` |
| `code.js` | Compiled from `code.ts` with `tsc -p examples/rename-layers` (committed, so the folder imports as is) |
| `ui.html` | The root's three kit blocks unchanged, then the host CSS, markup and script |
| `kit.d.ts` | A byte copy of the root's |
| `tsconfig.json` | The root's compiler options; `files` is `code.ts` and `kit.d.ts` |
| `agent.diff` | The one-shot agent's original changes to a clean kit 0.3.0 clone |
| `README.md` | This page |
