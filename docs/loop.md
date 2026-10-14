# Your loop

How to change the plugin and see the change: which file needs a build, how to rerun, where errors show up. It assumes the plugin is already imported ([install.md](install.md)).

| You changed | Build | See it |
|---|---|---|
| `ui.html` (markup, CSS, UI scripts) | none | Rerun the plugin: **Cmd+Opt+P** (Windows: **Ctrl+Alt+P**) |
| `code.ts` (main thread) | `npm run build`, or a running `npm run watch` | Rerun the plugin |
| `manifest.json` | none | Rerun; a new `name`, `id` or `editorType` may need Import plugin from manifest... again |

## Rerun with Cmd+Opt+P

Cmd+Opt+P (Ctrl+Alt+P) runs the last plugin you ran again. Figma reads `ui.html` and `code.js` from disk on every run, so an edit to `ui.html` shows up on the next run with no build step. Running it from **Plugins > Development > your plugin** does the same. A rerun also replays the kit's startup, so it is the quickest way to check that the window fits its new content and reopens at the width you chose.

## `code.ts` needs `tsc`

Figma runs `code.js`, never `code.ts`. After editing `code.ts`, compile it:

```sh
npm run build    # once: tsc -p tsconfig.json
npm run watch    # or keep it running: rebuilds on every save
```

Both need `npm install` once ([install.md](install.md#the-terminal-path-optional)). Commit the rebuilt `code.js` with your change: the folder must keep running without a terminal, and CI fails when `code.js` does not match `code.ts`. If you work with an agent, it runs the build for you.

**The VS Code watch task stops when you reopen VS Code.** A watch started from VS Code (Terminal > Run Build Task..., Cmd+Shift+B / Ctrl+Shift+B, then `npm: watch` or `tsc: watch - tsconfig.json`) lives only as long as that window. After restarting VS Code, or reopening the folder, start it again the same way, or run `npm run watch` in a terminal. Until you do, edits to `code.ts` silently do nothing, which looks exactly like "my change didn't work".

Don't run `tsc code.ts`: with a file name on the command line `tsc` ignores `tsconfig.json` and fails ([pitfalls.md](pitfalls.md#11-run-tsc-through-the-project)).

## Check before you rerun

```sh
npm run audit && npm run check:ui
```

`npm run audit` checks colours, control heights, the manifest and the kit protocol; `npm run check:ui` type-checks the scripts in `ui.html`. Both print `file:line` for each problem, and [pitfalls.md](pitfalls.md) explains every rule. `npm run check` runs the build, both checks and the unit tests in one go.

## The console

**Plugins > Development > Show/Hide console** opens Figma's developer console. It shows `console.log`/`console.warn` output and errors from both halves of the plugin: `code.js` and the `ui.html` iframe. The kit itself stays quiet: it logs nothing in normal use and warns at most once per problem (for example a `kit:` protocol mismatch, or window-size storage that cannot be read or written). Read the first error first: later ones are often follow-ons.

## Preview in a browser

```sh
npm run preview
```

It serves the repo on your machine only (127.0.0.1) and prints the address: open http://localhost:4173/preview.html (`node scripts/serve.mjs --port 5000` picks another port; Ctrl+C stops it). Opened with a double-click (`file://`), the gallery still renders, but the live plugin frame needs the server, because browsers block the fetches it makes from `file://` pages; the page says so in place of the frame. The preview shows every component in every state in light and dark, with a "simulate no Inter" toggle, and runs `ui.html` in a fake plugin frame that loads `code.js` against a stub of the `figma` API, so the window chrome (fit, drag, keys) works without Figma. Outside Figma nothing injects `--figma-color-*`, so the preview uses `tokens.figma-fallback.css` for colours; those values are provisional ([tokens.md](tokens.md#browser-preview-fallback)). Always confirm in Figma itself.

Opening `ui.html` directly from the file system also works for a quick look at the markup, nothing more: with no `code.ts` answering, the runtime stops waiting after 500 ms and keeps the resize handle hidden, and colours are missing because nothing injects the tokens.

## When a change doesn't show up

- **Edited `code.ts`, nothing changed**: `code.js` was not rebuilt. Run `npm run build` (or restart the watch task), then rerun.
- **Edited `ui.html`, nothing changed**: the plugin you reran is a different copy. Check which folder Figma imported (each import of a different folder is a separate development plugin; give copies different `name`s).
- **The window is the wrong size after a change**: in `fit-content` mode the height follows `[data-kit-root]`; the width you dragged is remembered per editor. See the troubleshooting list in [window-chrome.md](window-chrome.md#troubleshooting).
- **Colours look wrong in one theme**: a literal colour slipped in. `npm run audit` finds it (`color-literal`).

Sources: [plugin quickstart](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/) (the watch task and its restart after reopening VS Code).
