# Your first plugin

From the starter to a plugin of your own, in six steps: name it, replace the demo markup with your UI, wire one message each way with typed interfaces, run the checks, import it, iterate. The example is **Prefix layers**: type a prefix, press **Add prefix**, and every selected layer's name starts with it.

The code on this page was checked in a copy of the 0.3.0 repo: `npm run build`, `npm run audit`, `npm run check:ui`, `npm test` and `npm run test:e2e` all pass, and in the browser preview's fake host the plugin shows its error state, renames three layers and fits a 320 × 161 window. Running it in the Figma app is UNVERIFIED.

## With an agent

With an AI agent you don't type any of this. Give the agent the [entry prompt](prompts.md#the-entry-prompt) with your task in one sentence. It reads [AGENTS.md](../AGENTS.md), does the steps below, runs the checks itself and ends with the import steps. Use this page to check what it did and to steer it in plain words ("use a resizable window", "put the list in a kit-scroll"). The five [examples](../examples/) are curated agent runs, each with the agent's diff and what a review still found.

## Before you start

- The starter imported and running once ([install.md](install.md)).
- For `code.ts` and the checks: Node.js 24 or later and `npm install` once ([install.md](install.md#the-terminal-path-optional)).
- Edit only outside the kit's marked blocks: the three `data-kit` elements in `ui.html`'s `<head>` and the `kit:window` block at the top of `code.ts` stay exactly as they are, so an upgrade is a re-paste ([pitfall 16](pitfalls.md#16-kit-blocks-from-two-releases)).

## 1. Name it

In `manifest.json`, change three fields and keep the rest (`"main": "code.js"`, `"ui"`, `"documentAccess": "dynamic-page"`, `networkAccess`):

```json
"name": "Prefix layers",
"id": "prefix-layers-yourname",
"editorType": ["figma"],
```

The `id` must be your own: `figma.clientStorage` is keyed by it, so every copy that keeps the starter's id shares one store ([pitfall 10](pitfalls.md#10-a-unique-plugin-id)). Figma assigns the final id when you publish ([publishing.md](publishing.md#the-plugin-id)). `["figma"]` is Figma Design only; other editors are in [surfaces.md](surfaces.md).

## 2. Replace the demo markup

In `ui.html`, replace the whole `<main class="kit-app" data-kit-root>` element (down to `</main>`) with your UI. Keep `data-kit-root` on it and leave the resize handle (`<button class="kit-resize-handle" ...>`) right after it.

```html
<main class="kit-app" data-kit-root>
  <div class="kit-section kit-stack">
    <h1 class="kit-heading">Prefix layers</h1>
    <div class="kit-field">
      <label class="kit-label" for="prefix">Prefix</label>
      <input class="kit-input" id="prefix" type="text" autocomplete="off" aria-describedby="prefix-help">
      <p class="kit-help" id="prefix-help">Added before the name of every selected layer.</p>
    </div>
  </div>
  <footer class="kit-footer">
    <p class="kit-text-secondary" id="status" role="status">Select layers, type a prefix, press Add.</p>
    <button class="kit-button kit-button-primary" id="add" type="button">Add prefix</button>
  </footer>
</main>
```

Every class is the kit's ([components.md](components.md)): a padded section stacking its children, a real `<h1>` heading, a field whose help text the input points at with `aria-describedby` (that is also where its error will show), and a [sticky footer](components.md#sticky-footer) with a status line and the one primary action. Then delete the demo's `.demo-status` rule from the plain `<style>` after the kit blocks (it starts `/* Your styles. ... */`): the footer lays out its status line itself, so this plugin needs no CSS of its own. Never write HTML comments in `ui.html` ([pitfall 7](pitfalls.md#7-text-the-sandbox-rejects)).

## 3. Wire one message each way

| Direction | Message | When |
|---|---|---|
| UI → main | `{ type: 'prefix-add', prefix }` | The person presses Add prefix or Enter |
| main → UI | `{ type: 'prefix-done', renamed }` | Always, in reply; `renamed` is 0 when nothing was selected |

**Main thread.** In `code.ts`, replace everything from the line `// ---- Your plugin starts here ----` to the end of the file with:

```ts
// ---- Your plugin starts here ----

installKitWindow({ mode: 'fit-content' });

/** UI -> main: put `prefix` in front of every selected layer's name. */
interface PrefixAddMessage {
  type: 'prefix-add';
  prefix: string;
}

/** Main -> UI: how many layers were renamed; 0 when nothing was selected. */
interface PrefixDoneMessage {
  type: 'prefix-done';
  renamed: number;
}

// One union per direction; add the next message with `|`.
type PrefixUiToMain = PrefixAddMessage;
type PrefixMainToUi = PrefixDoneMessage;

// Messages arrive untyped from another window: check every field before trusting it.
function isPrefixUiToMain(msg: unknown): msg is PrefixUiToMain {
  if (typeof msg !== 'object' || msg === null) return false;
  const { type, prefix } = msg as Record<string, unknown>;
  return type === 'prefix-add' && typeof prefix === 'string' && prefix.trim() !== '';
}

function postToUi(msg: PrefixMainToUi): void {
  figma.ui.postMessage(msg);
}

figma.ui.on('message', (msg: unknown) => {
  if (!isPrefixUiToMain(msg)) return; // kit:* and anything else falls through
  let renamed = 0;
  for (const node of figma.currentPage.selection) {
    try {
      node.name = msg.prefix + node.name;
      renamed += 1;
    } catch {
      // A layer that can't be renamed is skipped; the count says how many were.
    }
  }
  postToUi({ type: 'prefix-done', renamed }); // always answer, so the busy button clears
});
```

- `installKitWindow()` comes first: it opens the window, so it must exist before anything posts to it. `fit-content` lets the height follow the UI ([window-chrome.md](window-chrome.md#pick-a-mode)).
- The type names start with `Prefix` because `code.ts` shares one global namespace with Figma's typings (`Action`, `Rect`, `Paint` are taken), and names like `kitClampSize`, `KitSize` and `KIT_PROTOCOL` are reserved for the kit ([pitfall 17](pitfalls.md#17-smaller-traps)).
- The guard checks the `type` and every field; anything else, including the kit's own `kit:*` messages, falls through. Register with `figma.ui.on('message', ...)` rather than `figma.ui.onmessage =`, which holds one handler, so a second assignment replaces the first ([messages.md](messages.md#use-figmauionmessage-for-your-handlers)).
- Renaming is synchronous. When you call an `*Async` API, `await` it inside `try`/`catch` and still answer on failure ([pitfall 4](pitfalls.md#4-await-every-async-call)).

**UI.** Replace the demo's plain `<script>` at the end of `<body>` (after the resize handle) with:

```html
<script>
'use strict';
(() => {
/** @typedef {{ type: 'prefix-add', prefix: string }} PrefixAddMessage */

const HELP = 'Added before the name of every selected layer.';
const prefix = /** @type {HTMLInputElement} */ (document.getElementById('prefix'));
const help = document.getElementById('prefix-help');
const add = document.getElementById('add');
const status = document.getElementById('status');

/** @param {PrefixAddMessage} message */
const post = (message) => parent.postMessage({ pluginMessage: message }, '*');

function addPrefix() {
  if (add.getAttribute('aria-busy') === 'true') return; // still waiting for main's answer
  if (prefix.value.trim() === '') {
    prefix.setAttribute('aria-invalid', 'true');
    help.textContent = 'Type a prefix first.';
    prefix.focus();
    return;
  }
  add.setAttribute('aria-busy', 'true');
  post({ type: 'prefix-add', prefix: prefix.value });
}

prefix.addEventListener('input', () => {
  prefix.removeAttribute('aria-invalid');
  help.textContent = HELP;
});
add.addEventListener('click', addPrefix);
prefix.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  addPrefix();
});

window.addEventListener('message', (event) => {
  const msg = event.data && event.data.pluginMessage;
  if (!msg || msg.type !== 'prefix-done' || typeof msg.renamed !== 'number') return;
  add.removeAttribute('aria-busy');
  status.textContent = msg.renamed === 0
    ? 'Nothing renamed. Select some layers first.'
    : `Renamed ${msg.renamed} layer${msg.renamed === 1 ? '' : 's'}`;
});
})();
</script>
```

- The `@typedef` repeats the `PrefixAddMessage` interface for the UI, so `npm run check:ui` rejects a `post()` with a wrong shape. The two files can't share a type (`code.ts` is a script, `ui.html` a page), so keep both in step.
- The UI wraps the message in `{ pluginMessage }` and passes `'*'`; main's side doesn't ([pitfall 13](pitfalls.md#13-postmessage-shapes-differ-on-each-side)).
- States are attributes: `aria-invalid` turns the field and its help text red, `aria-busy` shows the button's spinner while main works ([components.md](components.md#states-are-attributes)).
- The `role="status"` line changes only when a result arrives, so a screen reader announces results, never typing. Enter works without a `<form>`, which a sandboxed iframe may block.

## 4. Build and check

```sh
npm run build
npm run audit && npm run check:ui
```

Expect `audit: no problems in ... plugin folder(s)` and `check-ui: no type errors in ...`. Fix every finding and run them again: each audit line names a rule, explained in [pitfalls.md](pitfalls.md#audit-rules). `npm run check` runs both builds (`build`, then `build:examples` for any examples you kept), both checks and the unit tests in one go; the starter demo's own tests skip themselves now that the demo is gone ([loop.md](loop.md#check-before-you-rerun)).

To try it before Figma: `npm run preview`, open http://localhost:4173/preview.html, pick **3 layers** under *Set the selection* in the live panel, type `Icon/` and press Add prefix ([loop.md](loop.md#preview-in-a-browser)). The stub is a stand-in, not Figma.

## 5. Import it

The `name` and `id` changed, so import the manifest again: in the **Figma desktop app**, Figma menu > **Plugins > Development > Import plugin from manifest...**, pick `manifest.json`, then run **Plugins > Development > Prefix layers**. Select a few layers, type a prefix, press Add prefix: their names change and the status line says how many. If nothing happens, see the [import gotchas](install.md#import-gotchas); errors show under Plugins > Development > Show/Hide console.

## 6. Iterate

- **Changed `ui.html`?** Rerun with Cmd+Opt+P (Ctrl+Alt+P), no build.
- **Changed `code.ts`?** `npm run build` (or keep `npm run watch` running), then rerun. Commit the rebuilt `code.js` with it.
- Run the checks again after each change ([loop.md](loop.md)).

Good next steps, one at a time:

- Disable Add prefix while nothing is selected: post a second main → UI message from `figma.on('selectionchange', ...)`, add it to `PrefixMainToUi` with `|`, and set `disabled` on the button.
- List the new names before renaming: a `kit-list` in a `kit-scroll` region ([components.md](components.md#long-lists-kit-scroll)); [examples/rename-layers](../examples/rename-layers/README.md) is a fuller version of this plugin, with find and replace and numbering.
- Run in more editors ([surfaces.md](surfaces.md)), then [publish it](publishing.md). When a new kit release comes out, [upgrade](upgrade.md) by re-pasting its blocks.
- Delete `examples/` if you don't want it: the build and the tests skip what is gone.
