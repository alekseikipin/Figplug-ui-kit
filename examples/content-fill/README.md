# Content fill (kit example)

Fills the selected text layers with realistic names, emails, dates or numbers picked from a dropdown, in Figma Design, FigJam, Slides and Buzz.

## Window mode: `fixed`

`installKitWindow({ mode: 'fixed', size: { width: 320, height: 249 } })`. The UI is one small form (a select, a checkbox, a result line, two buttons) and nothing in it grows: no list, no preview. A fixed window never jumps while the person works, and there is nothing to resize, so the grip stays hidden. The layout is built so the height really is constant:

- every help text fits one line at 320px (checked with Inter and with the system font);
- the fill result has its own line in the form (`.cf-result`, the only host CSS: room for two lines, in `--kit-line-height` units), so a result never changes the height;
- the footer holds only a short selection line and the buttons.

249px is the form's measured height in the preview. If a font makes it taller, the page scrolls under the sticky footer, which keeps Fill in view ([window-chrome.md](../../docs/window-chrome.md)).

## The prompt

The [entry prompt](../../docs/prompts.md#the-entry-prompt) with the `content-fill` task, pasted into a fresh session in a fresh clone:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that fills the selected text layers with realistic names, emails, dates or numbers that I pick from a dropdown with kit classes only, then tell me how to import it.
```

## One-shot result

Graded in the agent's clone as it left it, before any curation.

| Date | Tool | Model | Kit | Build | Audit | check:ui | Unit tests | E2E | Fake-host boot | Imports into Figma? |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | Claude Code (Agent SDK subagent) | claude-opus-5-5 | 0.3.0 | pass | pass, no findings | pass | pass (339 passed, 3 skipped: the replaced demo's cases) | pass (88 passed, 9 skipped: demo and screenshot specs) | boots in light, dark and FigJam with no console errors; filled fake text layers in a patched stub | pending (real Figma not run) |

Automated one-shot: **yes** (build, audit, check:ui, unit tests and e2e all pass; the kit's marked blocks and `kit:window` block are byte-identical to the release). The defects below are ones no check could catch.

## What the agent built

`code.js`, `code.ts`, `manifest.json` and `ui.html` changed: 773 insertions, 157 deletions ([agent.diff](agent.diff)).

- A "Fill with" select with ten kinds in four optgroups (full, first and last names; email; three date formats; whole numbers, prices, percentages) and a help line per kind.
- Values different per layer while the kind has enough of them; emails only at the reserved `example.com`, `.org` and `.net` domains; dates within a year of today; numbers spread over orders of magnitude.
- Every font a layer uses loaded once per fill with `Promise.allSettled`; layers with `hasMissingFont` or a font that fails to load skipped and counted; one `figma.commitUndo()` per fill.
- A checkbox to include text inside selected frames and groups; FigJam stickies and shapes with text.
- Typed messages (one interface each, a union per direction, a guard), a busy Fill button that always gets an answer, and the last kind and scope kept in `clientStorage`.
- The window in `fit-content` mode, with the selection count and the result sharing one status line in a `kit-footer`.

## What curation changed, and why

- **Hidden and locked layers inside the selection are skipped.** `findAllWithCriteria` also returns layers inside hidden or locked groups, and the agent checked only each text layer's own `visible` (its comment said "the visible ones"), so a nested fill rewrote hidden variants and locked text. `cfReachable` now checks every layer between the text and the selected layer; a help line under the checkbox says so. Layers the person selected directly are still filled.
- **Mixed styles: the rule is explicit.** The agent's reply said mixed fonts "are kept"; they are not. It set `characters`, which Figma documents as resetting every range style without saying which style survives. `cfReplaceText` inserts the value before the first character with that character's style and deletes the old text, so the new text always takes the style of the layer's first character, and every font in the layer is loaded first.
- **`fixed` window.** The archetype's mode. The agent's footer line held the selection and the result together and grew the window from 193 to 265px when a result wrapped; in a fixed window that would have scrolled. The result now has its own reserved line in the form, the footer keeps a short selection line, and help texts were shortened to one line each.
- **Live regions.** The agent's one status line was rebuilt (`replaceChildren`) on every update, also when its text had not changed (the saved settings arriving, for example). The selection line and the result line are now separate `role="status"` regions, each rewritten only when its text changes, so a fill announces its result and a selection change the new count, nothing else.
- **Testable dates.** `cfValues` and `cfFill` take `today` as a parameter (default: today), so the golden tests can pin it.
- Manifest: name "Content fill (kit example)", id `kit-example-content-fill`; `editorType` keeps Design, FigJam, Slides and Buzz (all have text layers) and leaves out Dev Mode, which is read-only.

`examples/content-fill/example.test.mjs` runs this folder's compiled `code.js` whole in `node:vm` against a figma stub that enforces Figma's text rules (fonts loaded before any edit, `loadFontAsync` never given `figma.mixed`). Its 20 cases pin mixed fonts and `figma.mixed`, font loading once per font, missing and unloadable fonts, read-only layers, the direct and nested scopes with hidden and locked groups, golden values for every kind, formats and ranges over many draws, uniqueness, undo, settings and the message contract. Six of them fail against the agent's original `code.js`.

## How to import

No terminal and no build: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file you can edit.
2. **Plugins > Development > Import plugin from manifest…** and pick `examples/content-fill/manifest.json`.
3. Run it from **Plugins > Development > Content fill (kit example)**, select some text layers, pick a kind and press **Fill**.

If nothing happens, see the [import gotchas](../../docs/install.md#import-gotchas). After editing `code.ts`, rebuild with `node_modules/.bin/tsc -p examples/content-fill`.

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/content-fill (or pick it under *Plugin*): it runs in its own window mode against the preview's `figma` stub, a stand-in with a few fake layers ([loop.md](../../docs/loop.md#preview-in-a-browser)). `npm run build` at the root rebuilds every example too.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The example's manifest: `dynamic-page`, no network, Design, FigJam, Slides and Buzz |
| `code.ts` | The kit's `kit:window` block (byte copy of the root's) and the plugin |
| `code.js` | `code.ts` compiled with `tsc -p examples/content-fill` |
| `ui.html` | The kit's three marked blocks (byte copies of the root's) and the plugin's form and script |
| `kit.d.ts` | Byte copy of the root's protocol types |
| `tsconfig.json` | The root's compiler options; files `code.ts` and `kit.d.ts` |
| `agent.diff` | The one-shot agent's original change, before curation |
| `README.md` | This page |
