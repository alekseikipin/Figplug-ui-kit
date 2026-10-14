# Messages

A Figma plugin runs in two places that cannot touch each other: the **main thread** (`code.ts`, compiled to `code.js`), which can read and change the document but has no DOM, and the **UI** (`ui.html`), an iframe with a DOM but no `figma` object. They talk only by posting messages. This page covers the kit's own `kit:*` messages, how your plugin's messages run next to them, and the rules both kinds follow.

The protocol types live in [`kit.d.ts`](../kit.d.ts). How the window behaves (modes, the handle, snapping, keyboard) is in [window-chrome.md](window-chrome.md).

## Sending and receiving

The two directions are not symmetric. In the UI you wrap the payload in `{ pluginMessage }` and unwrap it again on arrival; in the main thread you send and receive the bare value.

| | Send | Receive |
|---|---|---|
| UI (`ui.html`) | `parent.postMessage({ pluginMessage: msg }, '*')` | `window.addEventListener('message', (event) => { const msg = event.data && event.data.pluginMessage; ... })` |
| Main (`code.ts`) | `figma.ui.postMessage(msg)` | `figma.ui.on('message', (msg, props) => { ... })` |

- The `'*'` target origin is required: the plugin iframe has a `null` origin, so no other value matches. ([creating-ui](https://developers.figma.com/docs/plugins/creating-ui/)) Measured on 2026-10-14 in Figma desktop 126.9.13: `location.origin` is `"null"` and the page is a `data:` URL, in all five editors ([surfaces.md](surfaces.md#in-every-editor)).
- Only a UI that navigates to its own URL (a non-null origin) must also send `pluginId` (the manifest id, or `'*'`) next to `pluginMessage`. The kit's inline `ui.html` never needs it.
- The second argument on the main side, `props.origin`, is the sender's origin. You only need it for OAuth-style flows.

## The kit protocol (protocol 1)

`KIT_PROTOCOL = 1` is declared in both `code.ts` and the `ui.html` runtime. The UI sends its number in `kit:ready`, and main echoes its own number in `kit:init`. A mismatch means the two files came from different kit releases: each side warns once (two `console.warn` lines, one from main and one from the runtime), naming both protocol numbers, and both carry on. `npm run audit` reports it as `protocol-mismatch`. Fix it by re-pasting the kit blocks of both files from the same release.

The protocol number changes only when a message changes shape. A new message that the other side may safely ignore is added within the same protocol: kit 0.3.0 added `kit:fit` (main to UI) to protocol 1, and a 0.2.0 runtime ignores it like any other `kit:*` type it does not know. Each side ignores unknown `kit:*` types, so a newer half never breaks an older one; it just loses the new feature.

### `kit:ready` (UI to main)

| Field | Type | Meaning |
|---|---|---|
| `type` | `'kit:ready'` | |
| `protocol` | `number` | The runtime's `KIT_PROTOCOL`. |

- **When:** once, on `DOMContentLoaded`. A UI reloaded during development sends it again.
- **Main does:** waits for the saved-size read that `installKitWindow` started right after `showUI` (at most 300 ms after `installKitWindow`, see [What main stores](#what-main-stores)), then replies with `kit:init`. It replies to every `kit:ready`, and still replies when the protocol does not match (after one warning). A window that is still hidden is shown 800 ms after `kit:ready`, unless a `kit:resize` shows it first ([`kit:resize`](#kitresize-ui-to-main), step 4).

### `kit:init` (main to UI)

| Field | Type | Meaning |
|---|---|---|
| `type` | `'kit:init'` | |
| `protocol` | `number` | Main's `KIT_PROTOCOL`. |
| `mode` | `'fit-content' \| 'resizable' \| 'fixed'` | The mode passed to `installKitWindow`. The UI takes it from here; `CONFIG.fallbackMode` in the runtime only applies when `kit:init` never arrives. |
| `chrome` | `boolean` | `false` on surfaces where the resize handle is turned off (Dev Mode and Buzz, whose panels ignore `figma.ui.resize`, and any `editorType` the kit does not know yet). See [surfaces.md](surfaces.md). |
| `editorType` | `string` | `figma.editorType`: `figma`, `figjam`, `slides`, `dev` or `buzz` (or an editor newer than the kit). |
| `bounds` | `{ minWidth, maxWidth, minHeight, maxHeight }` | The bounds main clamps to, after merging your `bounds` option over the editor defaults. The UI clamps to the same numbers so its drag never overshoots. |
| `size` | `{ width, height }` | The window size right now, after any restore. |
| `defaultSize` | `{ width, height }` | The size `installKitWindow` was asked for (clamped). Home on the handle returns to its width. |
| `restored` | `boolean` | `true` when a saved size was applied. |

- **When:** in reply to each `kit:ready`, once the saved size has been read (or the read failed, or took longer than 300 ms). Waiting means the UI gets the final starting size and fits its content once instead of twice.
- **UI does:** stores the mode, bounds and default size, sets `html[data-kit-chrome="on"|"off"]` (on only when `chrome` is true and the mode is not `fixed`), shows or hides the handle, then fits the window to its content once fonts are ready (in `fit-content` mode). If no `kit:init` arrives within 500 ms (for example, `ui.html` opened in a plain browser), the runtime falls back to `CONFIG.fallbackMode`, chrome off and generous bounds. A `kit:init` that arrives after that still takes over, and the runtime asks again for its `size` (`resizable`, chrome on) or refits (`fit-content`), because main may have applied the fallback's fit after sending `kit:init`.

### `kit:resize` (UI to main)

| Field | Type | Meaning |
|---|---|---|
| `type` | `'kit:resize'` | |
| `width`, `height` | `number` | The size the UI wants, in CSS pixels. |
| `user` | `boolean`, optional | `true` when the person chose the size (drag, keyboard, double-click snap, Home), `false` for content fits. The kit runtime always sends it; main treats a missing field as `false`. |
| `final` | `boolean`, optional | `true` when the gesture is over (pointer up, a key press, Escape after moving), `false` for mid-drag sizes and content fits. The runtime always sends it; main treats a missing field as `false`. |

- **When:** on every content fit (`fit-content` mode, and Home, `kit.fit()` or a `kit:fit` from main in `resizable` mode), on each animation frame of a drag (deduplicated), and once more with `final: true` when the gesture ends.
- **Main does**, in this order:
  1. **Ignores it in `fixed` mode.** A `fixed` window keeps `options.size`. The runtime never asks for a size in that mode; the only way one arrives is a UI that gave up waiting for `kit:init` (main busy for more than 500 ms) and fell back to fitting its content.
  2. **Validates.** `width` and `height` must be finite numbers of 0 or more; anything else (a string, `NaN`, `Infinity`, a negative number, a missing field) drops the whole message. Main never throws on a malformed kit message and never passes a non-finite number to `figma.ui.resize`.
  3. **Clamps and rounds** to `bounds`, then calls `figma.ui.resize`. The rounding is required: Figma throws on a size that is not a whole number (`Property "resize width" failed validation: Expected integer, received float`) and on `NaN`, in every editor (measured on 2026-10-14 in Figma desktop 126.9.13, [surfaces.md](surfaces.md#results-window-size)). If Figma throws anyway (a closed plugin, for example), main logs one `console.warn`, keeps the old size and does not save it. In the Dev Mode and Buzz panels the call succeeds and changes nothing: the panel keeps its own size.
  4. **Shows the window** if it is still hidden. The window opens hidden in every mode, so the person never sees it blank or jumping from the default size to the fitted one. It is shown on the first valid `kit:resize`. A UI that has sent `kit:ready` but asks for no size is shown 800 ms after `kit:ready` (longer than the runtime's 500 ms font and `kit:init` wait, so its first fit normally comes first); a `fixed` window, which never asks, right after main has posted its `kit:init`; and a page that never sends `kit:ready` (no kit runtime, or one that threw) 3 s after `installKitWindow`. Before the 2026-10-14 Figma run, the cap was 500 ms from `installKitWindow` and a `fixed` window was visible from the start; in Figma, pages that took longer to load showed a blank or unfitted window for up to about 1 s ([surfaces.md](surfaces.md#seen-in-the-run-a-window-visible-before-it-fitted)).
  5. **Saves**, only when `user === true` and `persist` is not `false`. With `final: true` it writes at once and cancels any pending write; without it, it waits until 400 ms pass without another resize by the person, then writes the latest one. A size equal to the one already stored is not written again. In `fit-content` mode only the width counts: it is what gets restored, and the stored height is just the height at the time. Sizes from content fits (`user` false or missing) are never saved: they are recomputed on every run.

`user` and `final` must be the boolean `true`. A string `'true'` or the number `1` counts as absent.

### `kit:fit` (main to UI)

Kit 0.3.0. Ask the UI to measure `[data-kit-root]` again and fit the window height to it, keeping the width: the same fit as `kit.fit()` in the UI.

| Field | Type | Meaning |
|---|---|---|
| `type` | `'kit:fit'` | Nothing else; extra fields are ignored. |

- **When:** whenever main calls `fit()` on the window `installKitWindow()` returned (`KitWindow.fit()` in `kit.d.ts`). Don't post it yourself; call `fit()`, which posts nothing in `fixed` mode or once a later `installKitWindow()` call has replaced the window, and never throws (on a closing plugin it does nothing).
- **UI does:** in `fit-content` and `resizable` mode, measures the content and sends one `kit:resize` with the current width, the content's height, `user: false` and `final: false` (so main never saves it), unless that is already the size it last asked for. In `fixed` mode it does nothing. A `kit:fit` that arrives before the UI's first size request is applied by that request: Figma queues main's messages until the page has loaded, so `installKitWindow(...).fit()` straight away works, and in `resizable` mode the first size then has the content's height instead of the saved one. In `resizable` mode, a `kit:fit` that arrives while the person is dragging the handle is dropped (since 0.4.0), so the window never jumps under the pointer: the drag's size stands and the fit is not queued for later. The next fit (your next `fit()`, or Home on the handle) applies as usual.
- **Main does** nothing more: the `kit:resize` that follows is handled like any other. A `kit:fit` sent from the UI to main is ignored.
- **Order:** the UI handles messages in the order main posted them, so a fit posted right after a message that changes the UI's content measures what that message's handler rendered, as long as the handler renders synchronously. Details and a mode table: [window-chrome.md](window-chrome.md#fit-on-request-kitfit-and-kitwindowfit).

```ts
const win = installKitWindow({ mode: 'resizable' });
figma.ui.postMessage({ type: 'layers', names }); // the UI renders the list
win.fit();                                       // kit:fit: the window takes the list's height
```

### What main stores

Key `kit:window` in `figma.clientStorage`, value `{ v: 1, editorType, width, height }`. On the next run the record is used only when it has exactly that shape (`v === 1`, a string `editorType`, finite positive numbers) and its `editorType` matches the current editor. Anything else is ignored, never trusted. `resizable` restores both sides; `fit-content` restores the width only; `fixed` and `persist: false` skip storage entirely. A read or write failure costs the remembered size, nothing else: main logs at most one `console.warn` and continues. A read that takes longer than 300 ms costs the same, without a warning: `kit:init` goes out with the default size, and the late answer is ignored for this run (moving the window after it has started would be a jump). It still counts as stored, so the same size is not written again.

`clientStorage` is scoped to the plugin id in `manifest.json`, so give every plugin you build from the kit its own id. Plugins that share the placeholder id share one storage bucket on your machine. ([clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage/))

Nothing is saved when the plugin closes: Figma's `close` event cannot wait for an async write, so the kit saves when the size changes instead. ([figma.on](https://developers.figma.com/docs/plugins/api/properties/figma-on/))

### A typical run

```
main (code.ts)                                    UI (ui.html)
installKitWindow()
  figma.showUI(hidden) ─────────────────────────► page starts loading
  clientStorage.getAsync('kit:window')
                       ◄───────────────────────── kit:ready { protocol: 1 }     on DOMContentLoaded
  (saved size read and applied; 300 ms at most)
  kit:init { mode, chrome, bounds, size, ... } ─► apply mode and bounds, show the handle
                                                  fonts ready: measure [data-kit-root]
                       ◄───────────────────────── kit:resize { width, height, user: false, final: false }  content fit
  clamp, figma.ui.resize, show the window
                       ◄───────────────────────── kit:resize { ..., user: true, final: false }  each frame of a drag
  clamp, resize, save after 400 ms of quiet
                       ◄───────────────────────── kit:resize { ..., user: true, final: true }   pointer up
  clamp, resize, save now (if changed)
  win.fit()
  kit:fit ─────────────────────────────────────► measure [data-kit-root]
                       ◄───────────────────────── kit:resize { width, height, user: false, final: false }
  clamp, resize (not saved)
```

## Your own messages next to the kit's

The kit and your plugin share one message channel in each direction. They stay out of each other's way by type:

- **Kit messages are objects whose `type` starts with `kit:`.** Main's kit listener returns immediately for anything else (strings, numbers, `null`, objects without a string `type`, any other `type`), so your messages reach your handler untouched. The UI runtime does the same and never stops the event.
- **Give your messages any other `type`**, such as `'create-shapes'` or `'export-done'`, and never start one with `kit:`. In TypeScript, name your types without colliding with Figma's globals (`Action`, `Variable`, `RGB`, `Paint`, `Effect`, `Vector`, `Rect` and `Transform` are taken): `code.ts` is a script, so everything shares one global namespace.
- **Filter by `type` in your own handlers**, and ignore what you don't recognise, including `kit:*`.

The demo at the bottom of `code.ts` is the pattern:

```ts
// code.ts (main)
installKitWindow({ mode: 'fit-content' });

figma.ui.on('message', (msg: unknown) => {
  if (!isCreateShapesMessage(msg)) return; // kit:* and anything else falls through
  createShapes(msg.count, msg.shape);      // posts { type: 'created', count } when done
});
```

```js
// ui.html (your own <script>, after the three data-kit blocks)
parent.postMessage({ pluginMessage: { type: 'create-shapes', count: 5, shape: 'rectangle' } }, '*');

window.addEventListener('message', (event) => {
  const msg = event.data && event.data.pluginMessage;
  if (!msg || msg.type !== 'created') return;
  // update the UI
});
```

The demo speaks four messages of its own. UI to main: `{ type: 'create-shapes', count, shape }` (count 1-50, shape `'rectangle'` or `'ellipse'`) and `{ type: 'close' }` (main calls `figma.closePlugin()`). Main to UI: `{ type: 'selection', count }`, at startup and on every selection change, and `{ type: 'created', count }`, where `count` is 0 when creating failed.

### Use `figma.ui.on('message')` for your handlers

Figma documents both `figma.ui.onmessage` (a property holding one handler) and `figma.ui.on('message', handler)` (one of many listeners), but not how they interact. [`tools/probe`](../tools/probe/) measured it on 2026-10-14 in Figma desktop 126.9.13 (macOS), with the same result in Design, FigJam, Slides, Dev Mode and Buzz ([surfaces.md](surfaces.md#results-messages-and-theme)):

- **Assigning `figma.ui.onmessage` does not remove listeners added with `figma.ui.on('message')`**, such as the kit's, and adding one with `on()` does not remove the assigned handler: both fire. (In that run the `on()` listeners fired first; don't depend on the order.)
- `figma.ui.onmessage = undefined` removes only the assigned handler.
- `figma.ui.off('message', handler)` removes one listener, and `figma.ui.once('message', handler)` fires for one message, as documented.

Not measured, but inferred from what a property is: assigning `figma.ui.onmessage` again replaces the handler it held, so the earlier handler silently stops receiving messages. The 2026-10-14 probe cleared the property with `undefined` between its two assignments, so it never tested this directly (UNVERIFIED in Figma); its `assignAgain` step, added after the run, measures it next time.

So a plugin that assigns `figma.ui.onmessage` once keeps working when you add the kit. In any plugin that contains the kit block, still:

- **Register your handlers with `figma.ui.on('message', ...)`.** The callback has the same signature as `onmessage`, and every handler registered this way runs, so a handler added later never replaces an earlier one.
- **Never assign `figma.ui.onmessage` more than once.** The second assignment replaces the first handler without any error. The audit's `onmessage-assign` rule warns when `code.ts` does it ([pitfalls.md](pitfalls.md#13-postmessage-shapes-differ-on-each-side)). Figma's own plugin template and most official samples assign it once; when you paste the kit into such a plugin, that line can stay, but converting it is a one-line change: `figma.ui.onmessage = (msg) => {...}` becomes `figma.ui.on('message', (msg) => {...})`.
- To remove a handler later, keep a reference and call `figma.ui.off('message', handler)`. `figma.ui.once('message', handler)` runs a handler for the first message only.

In the UI, `window.onmessage = ...` cannot remove the kit runtime's listener (in the DOM, the `onmessage` property and `addEventListener` listeners are independent and both fire), but use `addEventListener` anyway so several scripts can listen.

## Adding the kit to an existing plugin

For a plugin that already has its own `code.ts` (or `code.js`) and `ui.html`, such as one made with Figma's **Plugins > Development > New plugin...** template. Take every block from the same kit release.

**Main thread**

1. **TypeScript: copy [`kit.d.ts`](../kit.d.ts) next to your `code.ts`.** The kit block uses its types (`KitWindowOptions`, `KitInitMessage` and the rest), so it does not compile without them. A `tsconfig.json` without `files` or `include`, like the template's, picks the file up by itself; otherwise add it to the list, as the kit's own `tsconfig.json` does. The block compiles from `"target": "es6"` up, under `strict`.
2. **Paste the `kit:window` block** at the top of `code.ts`, above your own code: everything from the `// ==== kit:window:start` line to the `// ==== kit:window:end` line, unchanged. A plain-JavaScript plugin copies the same block from `code.js` instead, and skips step 1.
3. **Replace your `figma.showUI(...)` call with `installKitWindow(...)`**, and call it before your code posts anything to the UI. The size and title move into the options: `figma.showUI(__html__, { width: 300, height: 400, title: 'Export' })` becomes `installKitWindow({ size: { width: 300, height: 400 }, title: 'Export' })`. Keep only one: a second `showUI` call closes the kit's window. `themeColors` is always on.
4. **Convert `figma.ui.onmessage = (msg) => {...}`** to `figma.ui.on('message', (msg) => {...})` with the same callback, and let messages whose `type` starts with `kit:` fall through. A handler that checks for its own types already does. One existing assignment would keep working next to the kit (measured, see [above](#use-figmauionmessage-for-your-handlers)), but with `on()` a handler you add later can never replace it.
5. **Remove your own window sizing**: `figma.ui.resize` calls, any resize message of your own, and a size you keep in `clientStorage` for it. The kit does all three, and in `fit-content` mode the next content change would undo your resize anyway. Where your code resized the window to fit new content, call `fit()` on the window `installKitWindow()` returns instead ([`kit:fit`](#kitfit-main-to-ui)). If your code must set the size itself, use `installKitWindow({ mode: 'fixed' })`.

**UI (`ui.html`)**

6. **Paste the three `data-kit` blocks** from the kit's `ui.html` into your `<head>`, in this order and unchanged: `<style data-kit="tokens">`, `<style data-kit="components">`, `<script data-kit="runtime">`. Your own `<style>` and `<script>` elements go after them. If your UI is built (a bundler or a framework), paste them into the HTML template the build starts from.
7. **Put `data-kit-root` on the element whose height the window should fit**: your top-level wrapper, or a framework's mount node. It must be as tall as its content, not `height: 100%`. Without it the runtime measures `<body>`.
8. **Add the resize handle** as the last element in `<body>`, after the root: `<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>`. Without it there is no grip, and the rest still works.

**Check it**

- Build as before (`npm run build`, or your own `tsc` command), then run the plugin from Plugins > Development; your `manifest.json` needs no change. The window should open at its fitted size, the grip should resize it, a second run should reopen at the width you chose, and your own messages should still reach both sides.
- From a clone of the kit, `node scripts/audit.mjs path/to/your-plugin` and `node scripts/check-ui.mjs path/to/your-plugin` run the kit's checks on your folder. The audit also reports the manifest settings the kit recommends (`"documentAccess": "dynamic-page"`, `networkAccess`); see [pitfalls.md](pitfalls.md).

## Timing

- **Main to UI messages are queued until the UI has loaded.** You can call `figma.ui.postMessage` straight after `figma.showUI`; Figma holds the messages until the iframe finishes loading. ([creating-ui](https://developers.figma.com/docs/plugins/creating-ui/)) Measured on 2026-10-14 in Figma desktop 126.9.13: a message posted right after a hidden `showUI` was delivered after the page's `load` event, 3 to 5 ms after the UI script started (307 ms in Slides), in all five editors ([surfaces.md](surfaces.md#in-every-editor)). That is why `installKitWindow` calls `showUI` synchronously: the demo posts the selection count on the very next line. The UI must have its `message` listener in place by the time the page loads, so register it at the top level of your script, not after an `await`.
- **Whether UI to main messages sent before main has a handler are buffered is UNVERIFIED.** The docs only promise queuing in the other direction, and the probe does not measure it (it registers its handlers first). Register your `figma.ui.on('message', ...)` handlers in the first synchronous run of `code.ts`, not after an `await`. `installKitWindow` registers the kit's listener before it returns.
- Neither side gets a reply automatically. If the UI waits for an answer (a busy button, say), have main always answer, including on failure; the demo posts `{ type: 'created', count: 0 }` when creating shapes throws.

## What a message can carry

Payloads are copied with structured-clone-like rules, not shared. ([creating-ui](https://developers.figma.com/docs/plugins/creating-ui/), and the `postMessage` JSDoc in `@figma/plugin-typings`)

- **Allowed:** objects, arrays, numbers, strings, booleans, `null`, `undefined`, `Date` and `Uint8Array`.
- **Not allowed:** `Blob`, `ArrayBuffer`, and typed arrays other than `Uint8Array`. Functions are not carried over, and class instances arrive as plain objects with no prototype.
- **Files and images:** send bytes as a `Uint8Array` (for example the result of `node.exportAsync()`), and build the `Blob` in the UI. `Blob` does not exist in the main thread.
- Changing an object after posting it does not change what the other side received.

Keep messages small and flat; a message per meaningful event beats a stream of state dumps.
