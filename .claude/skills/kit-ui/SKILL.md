---
name: kit-ui
description: Builds or edits the UI of a Figma classic plugin in this repo (manifest.json, code.ts compiled to code.js, ui.html) with the kit's CSS classes, Figma's --figma-color-* tokens and the kit window chrome, then verifies it with npm run audit and npm run check:ui and tells the person how to import it into the Figma desktop app. Use when asked to make a plugin, add or change a screen, form, button, field or dropdown in ui.html, wire UI messages to code.ts, restyle the plugin to look native to Figma, or fix audit or check:ui findings. Not for FigJam widgets, Dev Mode codegen plugins, generative plugins made with Figma's agent, or editing the kit's own marked blocks.
license: MIT
---

# Build a kit plugin UI

A procedure for agents working in this repo. The rules themselves live in `AGENTS.md` at the repo root and in `references/` (the repo's `docs/`); this file says what to read and in which order.

> `references/` is a symlink to `../../../docs`. If it is missing or empty (a zip download or a Windows clone without symlink support), read the same files from `../../../docs/` (the `docs/` folder at the repo root).

## When to use

- "Build a plugin that ..." in a clone of this repo (the entry prompt in `references/prompts.md`).
- Adding or changing UI in `ui.html`: a form, a list of results, buttons, fields, a select, help or error text, a busy state.
- Sending data between `ui.html` and `code.ts`, or changing what the main thread does with it.
- Making a plugin look like Figma's own panels, in light, dark and FigJam.
- Fixing findings from `npm run audit` or `npm run check:ui`.

## When not to use

- Widgets (`figma.widget`), Dev Mode codegen plugins (`figma.codegen`) and generative plugins: the kit does not cover them.
- Upgrading the kit itself: re-paste the marked blocks from a release instead of editing them.
- A quick internal tool the person could make with Figma's agent: say so, then follow their choice.

## Instructions

1. **Read `AGENTS.md`** at the repo root, all of it. It is short and every rule there is checked.
2. **Look at the files you will change**: `manifest.json`, `code.ts` (below `// ---- Your plugin starts here ----`) and `ui.html` (the markup inside `<main class="kit-app" data-kit-root>`, the plain `<style>` after the three `data-kit` blocks, and the plain `<script>` at the end of `<body>`). Leave `kit.d.ts`, `tsconfig.json`, the three `data-kit` blocks and the `kit:window` block in `code.ts` exactly as they are.
3. **Plan the markup from `references/components.md`.** Use only the classes listed there: layout (`kit-app`, `kit-section`, `kit-divider`, `kit-stack`, `kit-row`, `kit-field`, `kit-label`, `kit-help`, `kit-heading`, `kit-text-secondary`, `kit-visually-hidden`, `kit-icon`, `kit-icon-small`, `kit-scroll`) and the 18 components: `kit-button` with one variant, `kit-icon-button`, `kit-input`, `kit-input-icon`, `kit-textarea`, `kit-number`, `kit-color`, `kit-select`, `kit-checkbox`, `kit-radio`, `kit-tabs`, `kit-tooltip`, `kit-menu` (a popover the runtime drives), `kit-list`, `kit-empty`, `kit-notice`, `kit-section-header`, `kit-footer`, `kit-resize-handle`. States are attributes: `disabled`, `aria-pressed`, `aria-invalid` + `aria-describedby`, `aria-busy`, `aria-current`. `.kit-help` is only for text a control's `aria-describedby` points at; status lines are `.kit-text-secondary`. Put long lists in a `.kit-scroll` region.
4. **Pick colours from `references/tokens.md`** (the role → token cheat sheet). Every colour in your CSS is `var(--figma-color-*)`; spacing, radii and type use `--kit-*` tokens; controls stay 24px or 32px. Add host CSS only for what the classes don't cover, with your own class names.
5. **Write the main-thread code** in `code.ts` below the marker: keep `installKitWindow(...)` as the first call and pick its `mode` (`references/window-chrome.md`); register handlers with `figma.ui.on('message', ...)`; give your messages a `type` that does not start with `kit:`; `await` every `*Async` call inside `try`/`catch` and always post an answer back, also on failure (`references/messages.md`). Check `references/pitfalls.md` for each API you use under `dynamic-page`.
6. **Update `manifest.json`**: a new `name` and a new unique `id`; keep `"main": "code.js"`, `"documentAccess": "dynamic-page"` and `networkAccess` (`["none"]` unless the plugin calls an API, then list its domains). Dev Mode needs its own manifest (`references/surfaces.md`).
7. **Run the checks with the shell** and fix every finding, then run them again until all three are clean:

   ```sh
   npm run build && npm run audit && npm run check:ui
   ```

   Run `npm install` first if `node_modules` is missing. Each audit line is `path:line  rule-id  message`; `references/pitfalls.md` explains every rule id and its fix. Read the warnings too (`orphan-help`, `budget`, `onmessage-assign`): they don't fail the audit but usually point at something to change.
8. **Report** in plain words: what the plugin does, which files changed, the three check results, and how to import it:
   1. Open the Figma desktop app and any file you can edit.
   2. Plugins > Development > Import plugin from manifest... and pick `manifest.json` in this folder.
   3. Run it from Plugins > Development > the plugin's name. After editing `ui.html`, Cmd+Opt+P (Ctrl+Alt+P) reruns it; after editing `code.ts`, run `npm run build` first.

   Point to `references/install.md` if nothing happens on import or macOS asks for access to Documents.

## Examples

A field in its error state, with an action row, tokens only. Remove `aria-invalid` and restore the help text once the value is valid (`references/components.md`, Text input):

```html
<main class="kit-app" data-kit-root>
  <section class="kit-section kit-stack">
    <h1 class="kit-heading">Rename layers</h1>
    <div class="kit-field">
      <label class="kit-label" for="prefix">Prefix</label>
      <input class="kit-input" id="prefix" type="text" aria-invalid="true" aria-describedby="prefix-help">
      <p class="kit-help" id="prefix-help">Enter a prefix to add before every selected layer's name.</p>
    </div>
  </section>
  <hr class="kit-divider">
  <section class="kit-section kit-row">
    <p class="kit-text-secondary status" id="status" role="status">Nothing selected</p>
    <button class="kit-button kit-button-primary" id="apply" type="button">Rename</button>
  </section>
</main>
<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>
```

```html
<style>
  /* Host CSS, after the three data-kit blocks. */
  .status { flex: 1 1 0; min-width: 0; }
</style>
```

The matching main-thread handler:

```ts
installKitWindow({ mode: 'fit-content' });

figma.ui.on('message', (msg: unknown) => {
  if (typeof msg !== 'object' || msg === null || (msg as { type?: unknown }).type !== 'rename') return;
  const { prefix } = msg as { prefix?: unknown };
  if (typeof prefix !== 'string') return;
  let renamed = 0;
  try {
    for (const node of figma.currentPage.selection) {
      node.name = prefix + node.name;
      renamed++;
    }
  } catch (error) {
    console.warn('rename failed', error); // answer anyway, so the UI never waits forever
  }
  figma.ui.postMessage({ type: 'renamed', count: renamed });
});
```

## Common edge cases

- **The window never shrinks**: something gives `[data-kit-root]` or `body` a viewport height (`height: 100%`, `min-height: 100vh`). Remove it (`references/window-chrome.md`).
- **"Cannot find name 'document'" in `code.ts`**: that code belongs in `ui.html`. Don't add `"dom"` to `tsconfig.json`.
- **A colour the cheat sheet lacks**: pick the closest role (all 174 names are in `tokens.figma-fallback.css` at the repo root); never a literal.
- **A component the kit lacks** (a slider, a tree, a dialog before Phase 3 ...): use plain HTML with your own class names and tokens, keep controls 24px tall, and give every `:hover` rule a `:disabled` rule. Check `references/components.md` first: checkboxes, radios, lists, tabs, tooltips and menus are in the kit.
- **A long list pushes the footer out of view**: wrap the list in a `.kit-scroll` region (`references/components.md`, Long lists).
- **A status line**: update its `role="status"` text with results, not on every keystroke, and for downloads say "Started N downloads" (a page can't tell whether a download was saved).
- **Swatches of document colours**: `el.style.setProperty('--swatch', hex)` and `background-color: var(--swatch)` in your CSS; never a colour literal in a script.
- **Text edits throw**: load the font first, `await figma.loadFontAsync(node.fontName as FontName)`, and handle `figma.mixed`.
- **Exports**: main sends `await node.exportAsync(...)` bytes as a `Uint8Array`; the UI builds the `Blob` and the download link.
- **The audit flags a kit block**: the block was edited or pasted from another release. Restore it from the release; don't change the audit.
- **No terminal for the person**: they don't need one. `code.js` is committed; you run the build and the checks.
