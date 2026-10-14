# Window chrome

Figma gives a plugin a fixed-size iframe and a `figma.ui.resize(width, height)` call. The kit adds the rest: the window fits its content, the person can drag or keyboard-resize it from a grip in the bottom-right corner, double-click snaps between preset widths, and the chosen size is remembered between runs.

Three pieces work together, and each lives in its own pasted block:

- **`installKitWindow()`** in `code.ts` (between the `kit:window:start` / `kit:window:end` lines). It opens the window, owns the bounds, applies every resize and does all the saving.
- **The runtime** in `ui.html` (`<script data-kit="runtime">`). It measures the content, runs the gestures and asks for sizes. It never saves anything itself.
- **The handle**: `<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>`, placed once, right after the `[data-kit-root]` element (`</main>` in the starter) and before your own `<script>`, so it is the last stop in the Tab order. Its look is in [components.md](components.md#resize-handle).

They talk through three messages, `kit:ready`, `kit:init` and `kit:resize`, described in [messages.md](messages.md).

## Pick a mode

```ts
installKitWindow({ mode: 'fit-content' }); // the default
installKitWindow({ mode: 'resizable', size: { width: 400, height: 480 }, bounds: { maxWidth: 720 } });
installKitWindow({ mode: 'fixed', size: { width: 300, height: 200 } });
```

| Mode | Height | Width | What is remembered | Handle |
|---|---|---|---|---|
| `fit-content` (default) | Follows the content: a `ResizeObserver` on `[data-kit-root]` refits it whenever the content changes size | The person drags it | Width only | Drags horizontally (`ew-resize` cursor) |
| `resizable` | The person drags it; Home re-fits it to the content once | The person drags it | Width and height | Drags both ways (`nwse-resize` cursor) |
| `fixed` | `options.size`, never changed by the kit | `options.size` | Nothing | Hidden |

Use `fit-content` for forms and short panels: the window is never taller than it needs to be, and adding a row grows it. Use `resizable` when the content can use any amount of space, like a long list or a preview. In `resizable` mode content changes do not move the window; call `kit.fit()` after a change if you want them to. Use `fixed` for a small window that must never move.

## How the mode and bounds reach the UI

The mode and the bounds are set in one place, `code.ts`. The runtime keeps no copy of them; it learns them from `kit:init`, so the two files cannot disagree about limits.

1. `installKitWindow()` calls `figma.showUI(__html__, { width, height, themeColors: true, visible: false })` at the default size (320 x 360 unless `options.size` says otherwise). A `fixed` window is visible from the start.
2. At the same time it reads the saved size from `figma.clientStorage` and applies it with `figma.ui.resize` while the window is still hidden. A read that takes longer than 300 ms is skipped: the window opens at the default size instead of jumping to the saved one later.
3. The runtime posts `kit:ready { protocol: 1 }` on `DOMContentLoaded`.
4. Once storage has answered (or the 300 ms are up), `code.ts` replies with `kit:init`: `mode`, `chrome`, `editorType`, `bounds`, the current `size`, the `defaultSize` and whether a saved size was `restored`.
5. The runtime sets `html[data-kit-chrome]` and `html[data-kit-mode]`, shows the handle if the chrome is on, waits for `document.fonts.ready` (at most `CONFIG.initTimeoutMs`, so a font request that hangs cannot keep the window from fitting), then sends its first `kit:resize`: the width from `kit:init`'s `size`, with the measured content height in `fit-content` mode or `size`'s height unchanged in `resizable` mode. That first request is also the signal that the UI is ready, so `code.ts` resizes and shows the window in one step.

The first request uses `kit:init`'s `size` rather than the iframe's current size because Figma resizes the iframe asynchronously: the restore's `figma.ui.resize` can land after `kit:init` has arrived, and asking for the old viewport size would undo the restore. Where the chrome is off (Dev Mode, Buzz), the docked panel sizes itself, so there the runtime uses the iframe's own width.

The default bounds are 240-960 px wide and 120-900 px tall (Dev Mode: at least 300 wide). `options.bounds` is merged over them, then repaired: non-finite values fall back to the default, nothing goes below Figma's documented 70 x 0 minimum ([figma.showUI](https://developers.figma.com/docs/plugins/api/properties/figma-showui/)), and when a minimum is larger than its maximum the minimum wins, as in CSS. Figma documents no maximum window size. Before `kit:init` arrives the runtime clamps to a generous 70-4096 range.

## Gestures and keys

The handle is a real `<button>`, so it is in the tab order and keys work once it has focus.

| Input | `fit-content` | `resizable` |
|---|---|---|
| Drag with the primary button | Width (height keeps following the content) | Width and height |
| Escape while dragging | Back to the size the drag started from | Same |
| Double-click | Next snap width | Next snap width, height kept |
| Left / Right | Width -8 / +8 px | Same |
| Shift + Left / Right | Width -32 / +32 px | Same |
| Up / Down | Nothing; the key is left to the page (it scrolls) | Height -8 / +8 px |
| Shift + Up / Down | Nothing | Height -32 / +32 px |
| Enter or Space | Next snap width | Next snap width, height kept |
| Home | Default width; the height follows the content | Default width, then the height is re-fitted to the content at that width |

Details that matter when you test it:

- **Only the primary button of the primary pointer drags.** Right-click, middle-click and a second finger never start a drag and send nothing. A second pointer cannot take over a drag in progress, and only the pointer that started the drag can end it: another finger, a tap or a stylus lifting does not.
- **A click is not a resize.** Pressing and releasing without moving a whole pixel sends no message and saves nothing. There is no time-based click guard, so a quick short drag still counts. When the second press of a double-click turns into a drag, the drag's size is kept and no snap follows it.
- **Escape belongs to the drag.** During a drag the runtime handles Escape in a capture listener on `window` and stops it there, so your own Escape handlers (closing a panel, closing the plugin) on `document`, on any element, or on `window` in the bubbling phase do not fire as well. Only a listener added to `window` with `{ capture: true }` still sees it, so register yours on `document` or in the bubbling phase. Outside a drag Escape is left alone. Pressing the handle focuses it (without drawing the keyboard focus ring), which is what lets Escape reach the plugin window at all.
- **A drag that the browser interrupts keeps its size.** If the pointer is cancelled or capture is lost, the drag ends as if the button were released.
- **The height at the end of a `fit-content` drag is measured when the drag ends**, so text that rewrapped at the new width is counted, even if the pointer held still before the release.
- **Snaps** are `CONFIG.snapWidths` (320, 480, 640): the next one strictly wider than the current width, wrapping to the narrowest after the widest. Snap widths outside the bounds are skipped. With a single usable snap, Enter, Space and double-click only return to it, so at that width they change nothing (they still send a final size). If no snap fits inside the bounds, the next snap is clamped into them.
- **Fast keys add up.** Each key starts from the size the runtime last asked for, not from the size the window has reached, so ten quick presses (or a held key) move ten steps even when the window lags behind, and a key pressed right after Home starts from Home's size.
- Arrow keys with Ctrl, Alt or Cmd are ignored, and holding Enter, Space or Home does not repeat.
- Every key, every snap and the end of every drag sends `final: true`; mid-drag sizes are sent at most once per animation frame, and never twice in a row with the same size.
- **Zero listeners outlive a gesture.** Each drag gets its own `AbortController`; however the drag ends, aborting it removes every listener the drag added. Between gestures only the five listeners installed at startup exist (three on the handle, two on `window`).

## What is saved, and when

`code.ts` does all the saving, under the `figma.clientStorage` key `kit:window`, as `{ v: 1, editorType, width, height }`.

- **Only sizes the person chose.** A `kit:resize` is saved only when it carries `user: true`: drags, keys and snaps. Content fits, `kit.fit()` and the first size are never saved, so a long list today does not make tomorrow's window tall.
- **Final sizes are written at once.** The end of a drag, each key press and each snap send `final: true` and are written immediately, unless they equal what was last written.
- **Mid-drag sizes are debounced.** They are written 400 ms after the last one, and a later final size cancels that pending write. An Escape sends the starting size as a final size, so a half-finished drag is never what gets remembered.
- **`fit-content` remembers the width only.** The height is stored as whatever it was but ignored when comparing and restoring; the content decides it on every run. `resizable` remembers both.
- **Per editor.** A size saved in FigJam is ignored in Figma Design and the other way round.
- **Restored before the window shows.** If the person resizes before storage has answered, their new size wins over the stored one. A read slower than 300 ms is skipped for this run, so the window never jumps after it has appeared.
- **Nothing is saved on close.** Figma cannot wait for an async write while the plugin closes, so the kit writes as soon as a gesture ends instead.
- `persist: false` turns all of this off; `fixed` mode never saves.

## Timing and the two 500 ms fallbacks

Each side has its own half-second safety net, so a broken half never leaves a blank or invisible window:

- **`code.ts`**: the window stays hidden until the first `kit:resize`, or 500 ms after `installKitWindow()`, whichever comes first. A UI whose runtime is missing or crashed still appears, at the default or restored size.
- **The runtime**: if no `kit:init` arrives within `CONFIG.initTimeoutMs` (500 ms) of `kit:ready`, it carries on alone: `CONFIG.fallbackMode` (`fit-content`), chrome off (the handle stays hidden, since nothing could save a size), the generous bounds, and a content fit. This is what you see when `ui.html` is opened straight in a browser. If `kit:init` does arrive later (a main thread busy for longer than that), its mode, chrome and bounds take over. Main may apply the fallback's fit after it has sent `kit:init`, so the runtime then asks again: for `kit:init`'s `size` in `resizable` mode (when the chrome is on), or for a fresh content fit in `fit-content` mode. A `fixed` window needs nothing, because main ignores `kit:resize` in that mode (`e2e/chrome.spec.mjs`, "a main thread that answers late").

The first fit waits for `document.fonts.ready`, so text measured in the fallback font does not set the height, but no longer than `CONFIG.initTimeoutMs`: a font request that never settles must not keep the window from fitting. In `fit-content` mode a late font swap is caught by the observer anyway.

If `code.ts` and `ui.html` come from different kit releases, each side warns once (two `console.warn` lines, one from main and one from the runtime), naming both protocol numbers, and both carry on. Re-paste the kit blocks of both files from the same release ([pitfalls.md](pitfalls.md)).

## The content root: `[data-kit-root]`

The window's height is measured from one element: the first `[data-kit-root]` in the page, which in the starter is `<main class="kit-app" data-kit-root>`. The measured height is the root's bottom edge in page coordinates (`getBoundingClientRect().bottom + scrollY`), plus the root's bottom margin and the body's bottom padding, border and margin, rounded up. It does not depend on the window's current height, which is what lets the window shrink as well as grow.

The root **must**:

- contain everything you want visible. Content outside it is not measured and ends up below the fold. Fixed-position layers (the handle, menus, toasts) are fine outside it.
- get its height from its content: normal block flow, with no height of its own.

The root **must not**:

- have `height: 100%`, `min-height: 100vh`, `flex: 1` in a full-height body, or any other height tied to the viewport. The root then reports the window's height back, and the window can never shrink. The same goes for `body { min-height: 100vh }`.
- rely on absolutely positioned children that hang below it. Overflow is not part of the root's box, so it is not measured.

If there is no `[data-kit-root]`, `<body>` is measured instead. The root is looked up again on every fit, so replacing the markup, re-rendering it, swapping the root element or adding the attribute later keeps working (`e2e/chrome.spec.mjs` does each of these). When the content is taller than `maxHeight` the window stops at `maxHeight` and the page scrolls. For a long list in `fit-content` mode, give the list its own `max-height` and `overflow: auto` rather than letting the whole window grow to the cap.

## Where the chrome is off

`kit:init` carries `chrome: false` in these cases. The runtime then hides the handle, sets `html[data-kit-chrome="off"]` (so the 24 px kept clear below the content for the grip are given back), and ignores every gesture:

- **Dev Mode (`dev`)** and **Buzz (`buzz`)**. The UI lives in a docked panel there (the Inspect panel, or Buzz's left side panel), the panel's size belongs to the person, and Figma's guidance is a responsive layout, at least 300 px wide in Dev Mode ([Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode/), [Buzz](https://developers.figma.com/docs/plugins/working-in-buzz/)). In `fit-content` mode the runtime still sends content fits; whether a docked panel obeys them is not verified. See [surfaces.md](surfaces.md) for what is known per editor.
- **`fixed` mode**, in every editor. `code.ts` also ignores any `kit:resize` in this mode, so the window keeps `options.size`.
- **No `kit:init` at all** (the fallback above).

The chrome is on in Figma Design, FigJam and Slides.

## CSS hooks and the UI API

The runtime sets two attributes on `<html>` when `kit:init` (or the fallback) arrives:

- `data-kit-chrome="on" | "off"`: `on` only when the chrome is enabled and the mode is not `fixed`.
- `data-kit-mode="fit-content" | "resizable" | "fixed"`: the handle uses it to pick its cursor.

While the person drags, the handle matches `:active`, so styles for the grip can use it. The runtime adds no classes.

It also defines a frozen `window.kit` (typed as `KitUiApi` in [`kit.d.ts`](../kit.d.ts)):

- `kit.version`: the kit release, `'0.2.0'`.
- `kit.protocol`: `1`.
- `kit.fit()`: measure the root now and fit the window height to it, keeping the width. Use it in `resizable` mode after your content changes; in `fit-content` mode the observer already does this. It does nothing in `fixed` mode or before the first fit, and the size it asks for is not saved.

Do not call `figma.ui.resize` yourself while the kit window is installed. The runtime keeps track of the sizes it asked for, and in `fit-content` mode the next content change would undo yours anyway. Change `size` and `bounds` in `installKitWindow()` instead, or use `fixed` mode.

## Customising `CONFIG`

`CONFIG` at the top of the runtime block holds the runtime's defaults. Like the rest of the block, it is **never edited in place**: the three `data-kit` blocks stay byte-identical to the release, so the audit can spot drift and an upgrade is a re-paste. To change a value, add a JSON script anywhere in `ui.html`, for example right after the handle:

```html
<script type="application/json" data-kit-config>{"snapWidths": [300, 400], "strings": {"resizeLabel": "Fenstergröße ändern"}}</script>
```

The runtime reads it once, at `DOMContentLoaded`, before it labels the handle or posts `kit:ready`, and merges it over the defaults key by key. Leave out every key you don't change. Only the first `data-kit-config` script in the page is read.

| Key | Default | Accepted | What it does |
|---|---|---|---|
| `snapWidths` | `[320, 480, 640]` | A non-empty array of positive numbers, in any order | The widths double-click, Enter and Space cycle through. Widths outside the current bounds are skipped. |
| `step` | `8` | A whole number, 1 or more | Pixels per arrow key. |
| `bigStep` | `32` | A whole number, 1 or more | Pixels per Shift + arrow key. |
| `initTimeoutMs` | `500` | Milliseconds, 0 or more (at most 2147483647, `setTimeout`'s limit) | How long the runtime waits for `kit:init`, and for web fonts, before it carries on alone. It does not change when `code.ts` shows the window; that cap is its own 500 ms. |
| `fallbackMode` | `"fit-content"` | `"fit-content"`, `"resizable"` or `"fixed"` | The mode used only when `kit:init` never arrives, such as when previewing `ui.html` in a browser. In Figma the mode always comes from `installKitWindow({ mode })`. |
| `strings.resizeLabel` | `"Resize window"` | A string that is not blank | The handle's accessible name. The runtime writes it to the handle's `aria-label` at startup, so translate it here rather than in the markup. |

A typo cannot break the window; whatever the runtime cannot use is ignored and its default stays:

- Text that is not valid JSON, or JSON that is not an object (an array, a string, a number, `null`): the whole script is ignored, with one `console.warn`.
- An unknown key (`mode`, a misspelt `snapWidth`) or a value of the wrong type or range (`"step": 0.5`, `"snapWidths": []`, a blank label): that key is ignored and the others are applied. One `console.warn` names every ignored key, for example `[kit] data-kit-config: ignored step, strings.label (unknown key or wrong type).`

`e2e/chrome.spec.mjs` checks a valid override and each kind of bad one. For reference, the defaults as they stand in the runtime block (read them, don't edit them):

```js
const CONFIG = {
  snapWidths: [320, 480, 640], // double-click, Enter and Space cycle through these widths
  step: 8,                     // px per arrow key...
  bigStep: 32,                 // ...and per Shift+arrow
  initTimeoutMs: 500,          // stop waiting for code.ts after this (e.g. ui.html opened in a browser)
  fallbackMode: 'fit-content', // used only when kit:init never arrives; the real mode comes from code.ts
  strings: { resizeLabel: 'Resize window' },
};
```

## Troubleshooting

- **The window grows but never shrinks.** Something ties the root's height to the window: `height: 100%`, `min-height: 100vh` (on the root or on `body`), or a flex column stretched to the viewport.
- **The bottom of the content is cut off.** The content sits outside `[data-kit-root]`, or it hangs out of the root through absolute positioning or a negative margin.
- **The window appears after half a second, at the wrong size.** The UI never sent its first `kit:resize`: the runtime block is missing or threw (check the plugin console), or `kit:init` never arrived (a protocol warning, or `installKitWindow()` was not called). In `fixed` mode the window is visible at once by design.
- **There is no handle.** The chrome is off (Dev Mode, Buzz, `fixed` mode, or no `kit:init`), or the button lacks `data-kit-resize`.
- **The size is not remembered.** `persist: false`, `fixed` mode, a different editor, a storage error (the main thread warns once), or a storage read slower than 300 ms (skipped for that run). In `fit-content` mode only the width is remembered, by design.

The pure helpers behind all this (`clampSize`, `nextSnap`, `sameSize`, between the `/* kit:pure:start */` and `/* kit:pure:end */` lines of the runtime) are tested in `test/pure.test.mjs`; `npm test` runs them.
