# kit probe

A development-only Figma plugin that measures the plugin-host behaviour the kit relies on and Figma's docs leave open: whether `figma.ui.onmessage` and `figma.ui.on('message')` coexist, whether main's early messages are queued, what `figma.ui.resize` does in each editor, the theme class and the injected palette, `clientStorage`, the `dynamic-page` getters, and which browser features the plugin iframe has. It is plain JavaScript with no build step and no kit code, so it cannot depend on what it measures, and it does not change the document.

How to run it, what each field of its report means, and the results: [docs/surfaces.md](../../docs/surfaces.md#measure-it-yourself).

- `manifest.json`, `code.js`, `ui.html`: the probe for Figma Design, FigJam, Slides and Buzz.
- [`dev-mode/`](dev-mode/README.md): the same probe with a Dev Mode manifest. Its `code.js` and `ui.html` are byte copies of the ones here (`test/tools.test.mjs` fails if they drift), so edit these and copy them over.
- [`reports/`](reports/): the raw reports, one folder per run.

## Runs

| Date | Client | Editors | Reports |
|---|---|---|---|
| 2026-10-14 | Figma desktop 126.9.13 (Electron 43.7.9, Chrome 150.0.7871.250), macOS, Apple silicon | Design (Figma dark, then switched to light while open); FigJam, Slides, Dev Mode (Inspect panel) and Buzz (side panel) with Figma dark. Dev Mode ran this folder's probe with `manifest.json` edited in place to `["figma", "dev"]` and `["inspect"]` (restored afterwards), not `dev-mode/`, which was not imported | [`reports/2026-10-14/`](reports/2026-10-14/) |

Not run yet: the Buzz pop-out, the light theme in Slides, Dev Mode and Buzz, Windows, Figma in the browser and Figma for VS Code.

## How messages are paired

The coexistence test registers several listeners on purpose (`on()` listeners and an assigned `onmessage` handler at the same time), so one message from the UI can reach `code.js` several times. Every listener records which test ping it saw, and then hands the message to `route()`, which acts on each message once, keyed by its `type` and `seq`. The UI's `post()` gives every message a new `seq`, counting from 1.

After the 2026-10-14 run the coexistence test gained one step, `assignAgain`: it assigns `figma.ui.onmessage` a second time with no clear in between, the one case the run did not measure (whether the new handler replaces the old one). Its reports don't have that field.

Before the 2026-10-14 run the UI sent no `seq`. Every message of one type then had the same key, so `route()` acted on the first message of each type and dropped the rest: the second `probe:size` reply never arrived and the resize step hung. The run fixed `ui.html` (in both copies) during the session; `code.js` already keyed by `type` and `seq`.
