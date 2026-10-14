# Variables sync (kit example)

Lists the file's local color variables, per collection and mode, and sets a variable's value in one mode from a hex code you type, in Figma Design.

## Window mode: `resizable`

`installKitWindow({ mode: 'resizable', size: { width: 360, height: 540 }, bounds: { minWidth: 280, minHeight: 420 } })`. The list is the part that wants space: a design system has dozens to hundreds of color variables, so the person drags the window as tall as they like. Under the list sit the hex field and a sticky footer with Apply, which must stay in view however long the list is. So the list lives in a `.kit-scroll` region, and in a `resizable` window a few lines of script (`fitList`) set its `--kit-scroll-max-height` to the height the rest of the UI leaves: drag the window 160px taller and the list shows 160px more rows, with the field and Apply still on screen. It runs on window resize, after each render, and when the runtime sets `html[data-kit-mode]` (kit:init can arrive after the first list). In the other modes the region keeps the kit's 240px.

Home on the resize handle resets the width and fits the height around the list at its current share, so it doesn't stretch a long list to the 900px maximum. `minHeight: 420` keeps everything but the list on screen at 360px wide: the rest of the UI measured 318px in the preview, plus the list's 96px minimum, is 414px.

## The prompt

The [entry prompt](../../docs/prompts.md#the-entry-prompt) with the `variables-sync` task, pasted into a fresh session in a fresh clone:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that lists the local color variables of this file and lets me change a variable's value by typing a hex code with kit classes only, then tell me how to import it.
```

## One-shot result

Graded in the agent's clone as it left it, before any curation.

| Date | Tool | Model | Kit | Build | Audit | check:ui | Unit tests | E2E | Fake-host boot | Imports into Figma? |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | Claude Code (Agent SDK subagent) | claude-opus-5-5 | 0.3.0 | pass | pass, no findings | pass | pass (339 passed, 3 skipped: the replaced demo's cases) | pass (88 passed, 9 skipped: demo and screenshot specs) | boots in light and dark with no console errors (the preview's stub has no `figma.variables`, so it shows its error state); with a patched `figma.variables` it listed 46 variables in two collections and wrote three values in the right modes, one undo step each | pending (real Figma not run) |

Automated one-shot: **yes** (build, audit, check:ui, unit tests and e2e all pass; the kit's three marked blocks, the `kit:window` block and `kit.d.ts` are byte-identical to the release). `ui.html` was 65,396 bytes, 140 under the `budget` warning: the agent trimmed its first version to get there. The defects below are ones no check could catch.

## What the agent built

`code.js`, `code.ts`, `manifest.json` and `ui.html` changed: 849 insertions, 171 deletions ([agent.diff](agent.diff)).

- A list of the local color variables of one collection at a time, with Collection and Mode selects and a search field, in a `.kit-scroll` region. Each row has a swatch (the document colour through a `--swatch` custom property, over a token checkerboard so opacity shows), the name, and the hex with an opacity % or "→ target" for an alias.
- Aliases resolved per mode: a target in the same collection in the same mode, one in another collection in that collection's default mode, chains capped at 16 steps so a cycle ends. Extended collections read through `valuesByModeForCollectionAsync`; linked colours (`VariableComposedColor`) recognised.
- A `kit-color` hex field (3, 6 or 8 digits; 6 keep the current opacity, 8 set it), validated in the UI with `aria-invalid` and the field's `.kit-help`, and again in main. Enter applies, Escape restores, one `figma.commitUndo()` per change, and re-typing a fixed colour's own code writes nothing.
- Typed messages (one interface each, a union per direction, a guard), a write that always answers with Figma's error text, a full re-read after each write so aliases update, and a reload icon button with a tooltip.
- `editorType` Design only, and a `fit-content` window.

## What curation changed, and why

- **An alias is kept when Apply would replace it with its own colour.** Picking an alias fills the field with the colour it resolves to, and the agent's "nothing changed" check only looked at fixed colours, so an Enter or Apply without typing replaced the alias with a fixed copy of the same colour: the link to the token was gone and nothing on screen changed. Main now compares the typed colour with the colour the value shows; when they match it writes nothing, the reply carries `kind`, and the status says "text/link is already 0D99FF in Light (alias kept)". The help line says "a different code replaces it with a fixed color". A broken alias (target deleted) is still replaced by any code.
- **One read, not one per variable.** The agent seeded its lookup with `getLocalVariablesAsync('COLOR')` but walked `collection.variableIds`, which lists every type, so each number, string or boolean variable cost a `getVariableByIdAsync` round trip on startup, on Reload and after every Apply (54 calls instead of 2 in the test file with 51 number variables). `getLocalVariablesAsync()` with no type now seeds it.
- **A readable error where there are no variables.** Without `figma.variables` (the preview's stub, or any host without the API) the agent's empty state showed "Cannot read properties of undefined (reading 'getLocalVariableCollectionsAsync')". `varsApi()` now fails with "this editor has no variables", on reads and writes.
- **Picking a variable moves to its hex field** and selects the code, so the next keys type the new value. Before, the person had to click the field after the row, and a keyboard user had to Tab through the rest of the list to reach it.
- **`resizable` window** (the archetype's mode), with the list sized to the room left, as described above.
- **Formatting in main.** Each value now arrives as `code` (what the field shows: RRGGBB, plus AA when not opaque, also the swatch) and `opacity` (%), so the UI's own formatting helpers are gone. That, shorter comments and unindented markup keep `ui.html` under the 64 KB budget (65,338 bytes) with the layout code added.
- Manifest: name "Variables sync (kit example)", id `kit-example-variables-sync`; `editorType` stays Design only: Slides has no variables, Dev Mode is read-only and this plugin writes, and whether `figma.variables` is available in FigJam is unverified (the agent left it out for the same reason).

Known limits, kept on purpose: a linked colour shows its colour part, because the unit of a bound opacity is not documented; an alias to another collection shows that collection's default mode; changes made in Figma's Variables panel while the plugin is open appear after Reload (the plugin API has no event for them); and whether the swatch's system colour picker opens from a plugin window is unverified ([components.md](../../docs/components.md#colour-field)). Typing a code works either way.

`examples/variables-sync/example.test.mjs` runs this folder's compiled `code.js` whole in `node:vm` against a figma stub whose `figma.variables` models collections, modes, aliases, extended collections and Figma's write rules (the mode must belong to the collection, a COLOR takes RGB or RGBA, a read-only file refuses). Its 16 cases pin the window mode, hex parsing (golden table of valid and invalid codes), the values each mode shows (fixed colours with and without alpha, aliases in the same and other collections, chains, remote targets, deleted targets, cycles, linked colours), writes per mode with one undo step, opacity kept or set, aliases kept or replaced, extended collections, every failure path, malformed messages and the missing API. 12 of them fail against the agent's original `code.js`: four on behaviour (the window mode, the alias replaced by its own colour, the by-id lookups, the raw TypeError), the rest because the value and reply shapes changed.

## How to import

No terminal and no build: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and a Design file you can edit that has local color variables.
2. **Plugins > Development > Import plugin from manifest…** and pick `examples/variables-sync/manifest.json`.
3. Run it from **Plugins > Development > Variables sync (kit example)**, pick a collection and mode, click a variable, type a hex code and press **Apply** (or Enter). Cmd+Z in Figma undoes one change at a time.

If nothing happens, see the [import gotchas](../../docs/install.md#import-gotchas). After editing `code.ts`, rebuild with `node_modules/.bin/tsc -p examples/variables-sync`.

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/variables-sync (or pick it under *Plugin*): it runs in its own window mode against the preview's `figma` stub, a stand-in with a few fake layers ([loop.md](../../docs/loop.md#preview-in-a-browser)). `npm run build:examples` at the root rebuilds every example (`npm run check` runs it too); `npm run build` compiles only the root plugin.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The example's manifest: `dynamic-page`, no network, Figma Design only |
| `code.ts` | The kit's `kit:window` block (byte copy of the root's) and the plugin |
| `code.js` | `code.ts` compiled with `tsc -p examples/variables-sync` |
| `ui.html` | The kit's three marked blocks (byte copies of the root's) and the plugin's list, editor and script |
| `kit.d.ts` | Byte copy of the root's protocol types |
| `tsconfig.json` | The root's compiler options; files `code.ts` and `kit.d.ts` |
| `agent.diff` | The one-shot agent's original change, before curation |
| `README.md` | This page |
