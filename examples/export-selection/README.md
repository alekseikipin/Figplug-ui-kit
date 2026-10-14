# Export selection (kit example)

Exports the selected layers as PNG files at 1x, 2x or 3x and starts one download per layer, built with kit classes only.

## Window mode: `resizable`

`installKitWindow({ mode: 'resizable' })` in `code.ts`. The layer list can be any length, from one row to 100, so the person sizes the window to show as many rows as they want, and the kit remembers that size between runs. Content changes never move the window: the list grows in the page, which scrolls under the sticky footer, so Export stays in reach. Home on the resize grip fits the height to the list once ([window-chrome.md](../../docs/window-chrome.md#pick-a-mode)). For the same reason the list is not in a `.kit-scroll` region: that is for `fit-content` windows, and in a resizable one the whole page already scrolls ([components.md](../../docs/components.md#long-lists-kit-scroll)).

## The prompt

The [entry prompt](../../docs/prompts.md#the-entry-prompt) with the `export-selection` task, given to a fresh agent in a fresh clone of kit 0.3.0, with nothing else:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that exports the selected layers as PNG at 1x, 2x or 3x and downloads the files with kit classes only, then tell me how to import it.
```

## One-shot result

Graded on the agent's clone as it left it, before any curation.

| Field | Result |
|---|---|
| Date | 2026-10-13 |
| Tool | Claude Code (Agent SDK subagent) |
| Model | claude-opus-5-5 |
| Kit | 0.3.0 |
| `npm run build` | pass (`code.js` was already current) |
| `npm run audit` | pass, no findings |
| `npm run check:ui` | pass, no type errors |
| `npm test` | pass: 339 passed, 0 failed, 3 skipped (the starter demo's tests, which skip once the demo is replaced) |
| `npm run test:e2e` | pass: 88 passed, 9 skipped (5 demo specs, 4 screenshot specs) |
| Fake-host boot (`preview.html`) | pass: the live frame boots in light and dark, every control renders, no console errors; export reports the stub's failures, and posted `png-file` messages start downloads named `Frame 1@3x.png` ... |
| Kit blocks | untouched: the three `ui.html` blocks, the `kit:window` block and `kit.d.ts` match the release byte for byte |
| One-shot (automated checks) | yes |
| Import into real Figma | pending |

**In Figma (2026-10-14).** The curated plugin in this folder, not the one-shot output above, ran once in Figma Design (dark theme, Figma desktop 126.9.13) through the starter's imported manifest, with its `ui.html` and `code.js` swapped in for the run: it listed one layer at 2x and Export opened the native macOS Save dialog for `Icon-Rectangle@2x.png`, which was cancelled, so no file was saved (two or more layers not tried). Its own `manifest.json` has not been imported, and the light theme and its other editors have not been run ([release checklist](../../docs/release-checklist.md#the-examples)).

## What the agent built

[`agent.diff`](agent.diff): 4 files changed, 445 insertions(+), 158 deletions(-) (`code.ts`, `code.js`, `manifest.json`, `ui.html`; no new files).

- A scale picker (three `kit-radio`s, 2x first) and a list of the selected layers (`kit-list` rows) with the pixel size each PNG will have, updated on every selection and scale change; a `kit-empty` state for nothing selected and for more than 100 layers.
- Main thread: `exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value } })` per layer, looked up again with `getNodeByIdAsync`, one `png-file` message per file with the bytes as a `Uint8Array`, then `png-done` with the names that failed, always sent (in a `finally`).
- UI: a `Blob` and an `<a download>` click per file, 200 ms apart, the object URL revoked later; the status says "Started N downloads", never "Downloaded".
- File names from layer names: refused characters become `-`, `@2x` / `@3x` suffixes, repeated names numbered " 2", " 3" (compared without case).
- The last scale is saved in `figma.clientStorage`; typed messages (one interface per type, a union per direction, type guards); the busy Export button guards against a second click.

## What curation changed, and why

- **Window mode `resizable`** (the agent chose `fit-content` with a `.kit-scroll` list): the kit's examples pin export-selection to `resizable`, and a long list is what that mode is for. The `.kit-scroll` wrapper went with it, since a resizable page scrolls as a whole.
- **Slices**: the size shown for a slice came from `absoluteRenderBounds`, which the typings say is `null` for anything invisible (a slice draws nothing), and the export used the default `contentsOnly: true`, which exports only a layer's own contents. A slice now shows its bounding box and exports with `contentsOnly: false`, so it captures what lies under it. Whether Figma special-cases slices anyway is not verified.
- **File names**: a line break in a text layer's name became `-` (control characters were replaced before whitespace was collapsed); now it is a space. A layer already named `logo.png` gave `logo.png@2x.png`; now `logo@2x.png`. The 100-character cut counted UTF-16 units and could split an emoji into half a surrogate pair; it now cuts by code points.
- **UI checks** on `png-selection`: `count` and `max` must be whole numbers before the list trusts them.
- **Types**: the queued files are typed `Uint8Array<ArrayBuffer>` (structured-cloned bytes always have a plain buffer), which is what `new Blob([...])` accepts under TypeScript 6.
- **Packaging**: the example's own `manifest.json` (name, id `kit-example-export-selection`), `tsconfig.json`, `kit.d.ts` copy and committed `code.js`; the kit blocks are pasted from the repo root.
- **`editorType`** stays `["figma", "figjam", "slides", "buzz"]`: exporting works in each of them. Exporting is read-only, so Dev Mode would work too, but Figma does not allow `dev` next to `figjam`; a Dev Mode build needs its own manifest (`["figma", "dev"]` plus `"capabilities": ["inspect"]`, see [surfaces.md](../../docs/surfaces.md#the-dev-mode-manifest)).
- Tests: [`examples/export-selection/example.test.mjs`](example.test.mjs) runs the compiled `code.js` against a figma stub and pins the window mode, the selection sizes, the `png-file` shape (exportAsync's own `Uint8Array`, no copy or conversion), file names, failures and the saved scale.

Not changed, and not verified: whether the Figma desktop app saves several downloads from a plugin window without asking once per file, and whether a PNG's size matches the listed one to the pixel (the list shows the render bounds times the scale, rounded).

## How to import

No build needed: `code.js` is committed.

1. Open the **Figma desktop app** (importing from a manifest does not work in the browser) and any file you can edit.
2. Figma menu > **Plugins > Development > Import plugin from manifest...**, and pick `examples/export-selection/manifest.json`. Some versions label it "Import new plugin from manifest...".
3. Run it from **Plugins > Development > Export selection (kit example)**. Select layers, pick a scale, press Export.

After editing `code.ts`, rebuild with `npx tsc -p examples/export-selection` from the repo root. Import gotchas: [docs/install.md](../../docs/install.md#import-gotchas).

To try it without Figma, run `npm run preview` in the repo and open http://localhost:4173/preview.html?plugin=examples/export-selection (or pick it under *Plugin*): it runs in its own window mode against the preview's `figma` stub, a stand-in with a few fake layers ([loop.md](../../docs/loop.md#preview-in-a-browser)). `npm run build:examples` at the root rebuilds every example (`npm run check` runs it too); `npm run build` compiles only the root plugin.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Name, id `kit-example-export-selection`, `dynamic-page`, no network |
| `code.ts` | The kit's `kit:window` block (unchanged) and the plugin below `// ---- Your plugin starts here ----` |
| `code.js` | `code.ts` compiled by `tsc -p examples/export-selection`; what Figma runs |
| `ui.html` | The kit's three blocks (unchanged), a few lines of host CSS, the markup and the script |
| `kit.d.ts` | Byte copy of the root's protocol types |
| `tsconfig.json` | The root's compiler options; files `code.ts` and `kit.d.ts` |
| `agent.diff` | The one-shot agent's original changes to the starter |
| `README.md` | This page |
