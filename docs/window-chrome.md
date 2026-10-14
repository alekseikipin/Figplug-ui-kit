# Window chrome

Figma gives a plugin a fixed-size iframe and a `figma.ui.resize(width, height)` call. The kit adds the rest: the window fits its content, the person can drag or keyboard-resize it from a grip in the bottom-right corner, double-click snaps between preset widths, a screen reader hears the new size after a keyboard resize, and the chosen size is remembered between runs.

Three pieces work together, and each lives in its own pasted block:

- **`installKitWindow()`** in `code.ts` (between the `kit:window:start` / `kit:window:end` lines). It opens the window, owns the bounds, applies every resize and does all the saving.
- **The runtime** in `ui.html` (`<script data-kit="runtime">`). It measures the content, runs the gestures and asks for sizes. It never saves anything itself.
- **The handle**: `<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>`, placed once, right after the `[data-kit-root]` element (`</main>` in the starter) and before your own `<script>`, so it is the last stop in the Tab order. Its look is in [components.md](components.md#resize-handle).

They talk through four messages, described in [messages.md](messages.md): `kit:ready`, `kit:init` and `kit:resize`, plus `kit:fit` (kit 0.3.0), which `code.ts` sends to ask for a fit.

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

Use `fit-content` for forms and short panels: the window is never taller than it needs to be, and adding a row grows it. Use `resizable` when the content can use any amount of space, like a long list or a preview. In `resizable` mode content changes do not move the window; ask for a fit after a change if you want them to, with `kit.fit()` in the UI or the window's `fit()` in `code.ts` ([Fit on request](#fit-on-request-kitfit-and-kitwindowfit)). Use `fixed` for a small window that must never move.

## How the mode and bounds reach the UI

The mode and the bounds are set in one place, `code.ts`. The runtime keeps no copy of them; it learns them from `kit:init`, so the two files cannot disagree about limits.

1. `installKitWindow()` calls `figma.showUI(__html__, { width, height, themeColors: true, visible: false })` at the default size (320 x 360 unless `options.size` says otherwise). Every mode opens hidden, `fixed` too ([When the window appears](#when-the-window-appears-and-the-fallbacks)).
2. At the same time it reads the saved size from `figma.clientStorage` and applies it with `figma.ui.resize` while the window is still hidden. A read that takes longer than 300 ms is skipped: the window opens at the default size instead of jumping to the saved one later.
3. The runtime posts `kit:ready { protocol: 1 }` on `DOMContentLoaded`.
4. Once storage has answered (or the 300 ms are up), `code.ts` replies with `kit:init`: `mode`, `chrome`, `editorType`, `bounds`, the current `size`, the `defaultSize` and whether a saved size was `restored`.
5. The runtime sets `html[data-kit-chrome]` and `html[data-kit-mode]`, shows the handle if the chrome is on, waits for `document.fonts.ready` (at most `CONFIG.initTimeoutMs`, so a font request that hangs cannot keep the window from fitting), then sends its first `kit:resize`: the width from `kit:init`'s `size`, with the measured content height in `fit-content` mode or `size`'s height unchanged in `resizable` mode. That first request is also the signal that the UI is ready, so `code.ts` resizes and shows the window in one step. A `fixed` window asks for no size: `code.ts` shows it right after posting `kit:init`.

The first request uses `kit:init`'s `size` rather than the iframe's current size because Figma resizes the iframe asynchronously: the restore's `figma.ui.resize` can land after `kit:init` has arrived, and asking for the old viewport size would undo the restore. Where the chrome is off (Dev Mode, Buzz), the docked panel sizes itself, so there the runtime uses the iframe's own width.

The default bounds are 240-960 px wide and 120-900 px tall (Dev Mode: at least 300 wide). `options.bounds` is merged over them, then repaired: non-finite values fall back to the default, everything is rounded to whole pixels, nothing goes below Figma's documented 70 x 0 minimum ([figma.showUI](https://developers.figma.com/docs/plugins/api/properties/figma-showui/)), and when a minimum is larger than its maximum the minimum wins, as in CSS. Figma documents no maximum window size. Before `kit:init` arrives the runtime clamps to a generous 70-4096 range.

What Figma does with a size, measured on 2026-10-14 in Figma desktop 126.9.13 with [`tools/probe`](../tools/probe/) ([surfaces.md](surfaces.md#results-window-size)):

- **Whole numbers only.** `figma.ui.resize(333.6, 401.4)` throws `Property "resize width" failed validation: Expected integer, received float`, and `NaN` throws `Expected number, received nan`, in all five editors. The kit rounds every size it passes on, whichever way it came in: `options.size` (the default size given to `showUI`), `options.bounds`, a restored record (which may hold a fraction from an older or hand-written record) and every `kit:resize`. `test/code.test.mjs` feeds fractions through each of these and checks that `figma.ui.resize` and `showUI` only ever get integers; its `figma` stub throws on a fraction, as Figma does.
- **The 70 x 0 floor is real, and quiet.** In Design, FigJam and Slides `resize(10, 10)` gave a 70 x 10 window and `resize(70, 0)` a 70 x 0 one, without an error. The kit never asks for less than 70 x 0 anyway.
- **The ceiling is Figma's own window.** `resize(4000, 4000)` gave 2508 x 1283 on the test machine: the size of the Figma window there. The kit's default 960 x 900 maximum stays well inside it.
- **The docked panels ignore it** (Dev Mode, Buzz): see [Where the chrome is off](#where-the-chrome-is-off).

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
| End | Widest snap width (the widest that fits the bounds) | Same, height kept |

Details that matter when you test it:

- **Only the primary button of the primary pointer drags.** Right-click, middle-click and a second finger never start a drag and send nothing. A second pointer cannot take over a drag in progress, and only the pointer that started the drag can end it: another finger, a tap or a stylus lifting does not.
- **A click is not a resize.** Pressing and releasing without moving a whole pixel sends no message and saves nothing. There is no time-based click guard, so a quick short drag still counts. When the second press of a double-click turns into a drag, the drag's size is kept and no snap follows it.
- **Escape belongs to the drag.** During a drag the runtime handles Escape in a capture listener on `window` and stops it there, so your own Escape handlers (closing a panel, closing the plugin) on `document`, on any element, or on `window` in the bubbling phase do not fire as well. Only a listener added to `window` with `{ capture: true }` still sees it, so register yours on `document` or in the bubbling phase. Outside a drag Escape is left alone. Pressing the handle focuses it (without drawing the keyboard focus ring), which is what lets Escape reach the plugin window at all.
- **A drag that the browser interrupts keeps its size.** If the pointer is cancelled or capture is lost, the drag ends as if the button were released.
- **The height at the end of a `fit-content` drag is measured when the drag ends**, so text that rewrapped at the new width is counted, even if the pointer held still before the release.
- **Snaps** are `CONFIG.snapWidths` (320, 480, 640): the next one strictly wider than the current width, wrapping to the narrowest after the widest. Snap widths outside the bounds are skipped. With a single usable snap, Enter, Space and double-click only return to it, so at that width they change nothing (they still send a final size). If no snap fits inside the bounds, the next snap is clamped into them.
- **End** goes straight to the widest usable snap (640 by default; with `snapWidths: [300, 1200, 500]` and the default 960 px maximum it is 500, because 1200 is outside the bounds). If no snap fits inside the bounds, the widest snap is clamped into them.
- **Fast keys add up.** Each key starts from the size the runtime last asked for, not from the size the window has reached, so ten quick presses (or a held key) move ten steps even when the window lags behind, and a key pressed right after Home starts from Home's size.
- Arrow keys with Ctrl, Alt or Cmd are ignored, and holding Enter, Space, Home or End does not repeat.
- Every key, every snap and the end of every drag sends `final: true`; mid-drag sizes are sent at most once per animation frame, and never twice in a row with the same size.
- **Zero listeners outlive a gesture.** Each drag gets its own `AbortController`; however the drag ends, aborting it removes every listener the drag added. Between gestures only the listeners installed at startup exist: three on the handle (`pointerdown`, `dblclick`, `keydown`), two on `window` (`message`, `resize`), and, since kit 0.3.0, five capture listeners on `document` for menus (`beforetoggle`, `toggle`, `keydown`, `click`, `scroll`; see [components.md](components.md#menu)); since kit 0.4.0 the same `click` listener also runs dialog openers and close buttons ([components.md](components.md#dialog)), and in a browser without the popover API only `keydown` and `click` are added. Opening and closing a menu adds none; an open dialog holds one `close` listener until it closes, and a toast's own listeners go with it ([components.md](components.md#toast)). The announcement below is a timer, not a listener. `e2e/chrome.spec.mjs`, `e2e/chrome-v2.spec.mjs` and `e2e/menu.spec.mjs` count them.

## Screen readers: the hint and the announcement

Kit 0.3.0. At startup, if the page has a `[data-kit-resize]` handle, the runtime adds two visually hidden elements at the end of `<body>`, once:

```html
<p id="kit-resize-hint" class="kit-visually-hidden">Drag, or use the arrow keys. Shift for bigger steps, Enter to snap, Home to fit, End for the widest size.</p>
<div class="kit-visually-hidden" data-kit-announce aria-live="polite"></div>
```

- **The hint** is the handle's description: the runtime adds `kit-resize-hint` to the handle's `aria-describedby` (after any ids already there), so a screen reader reads "Resize window, button" and then how to use it. The text is `CONFIG.strings.resizeHint`.
- **The live region** speaks the new size after a keyboard resize: `CONFIG.strings.announce`, `Window {width} by {height}` by default, with the size the window ends at. It waits until no key has been pressed for 150 ms, so ten quick arrow presses (or a held key) give one announcement, not ten. A burst that ends at the size spoken last time is spoken again.
- **Pointer resizes are silent.** Drags and double-clicks are not announced (the pointer is the feedback), and a drag that starts within 150 ms of a key drops that key's pending announcement.
- Keys the handle doesn't use are not announced: Up and Down in `fit-content` mode, letters, a held Enter. A key that is used but hits the bounds is: the person hears that the size stayed where it was.
- Both elements are `position: absolute` and 1 x 1 px (`.kit-visually-hidden`), so they never change the fitted height. The id `kit-resize-hint` and the attribute `data-kit-announce` belong to the kit: don't use them for anything else. Without a handle, neither element is made.

Translate both strings with `data-kit-config` ([Customising `CONFIG`](#customising-config)); the hint should name the keys in the person's language.

## Fit on request: `kit.fit()` and `KitWindow.fit()`

Both ask for the same thing: measure `[data-kit-root]` now and fit the window height to it, keeping the width. The fitted size is sent with `user: false`, so it is never saved.

- **From the UI**, call `kit.fit()` after your script changes the content.
- **From `code.ts`** (kit 0.3.0), keep what `installKitWindow()` returns and call its `fit()`. It posts `{ type: 'kit:fit' }` to the UI ([messages.md](messages.md)). Use it when main has just sent the UI new content, right after that message: the UI handles messages in order, so the fit measures the content your handler has rendered (if your handler renders later, after an `await`, call `kit.fit()` in the UI once it has).

```ts
const win = installKitWindow({ mode: 'resizable', size: { width: 360, height: 480 } });

figma.ui.postMessage({ type: 'layers', names }); // the UI renders the list
win.fit();                                       // then the window takes the list's height
```

| Mode | What a fit does |
|---|---|
| `fit-content` | Refits at once. The `ResizeObserver` already follows content changes, so this is only needed for changes it cannot see. |
| `resizable` | Fits the height to the content, keeping the width the person chose. Later content changes don't move the window until the next fit. A fit that arrives while the person is dragging the handle is dropped, so the window never jumps under the pointer; the drag's size stands (fit again after it if you need to). |
| `fixed` | Nothing. `KitWindow.fit()` posts no message, and the runtime ignores a `kit:fit` that arrives anyway. |

A `KitWindow.fit()` called before the UI is ready (straight after `installKitWindow()`, say) is not lost: Figma queues the message until the page has loaded, and the runtime applies it to its first size request. In `resizable` mode that first size then has the content's height instead of the saved or default one; in `fit-content` mode the first size is a fit anyway. After a later `installKitWindow()` call has replaced the window, the old handle's `fit()` does nothing. `kit.fit()` in the UI does nothing before the first fit (there is nothing to redo yet).

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

## When the window appears, and the fallbacks

`installKitWindow()` opens every window hidden (`visible: false`), in every mode, and shows it with `figma.ui.show()` once its UI is ready, at the first of these:

| When | For |
|---|---|
| The first valid `kit:resize`, right after resizing to it | `fit-content` and `resizable`: the UI has measured its content, so the fit and the show are one step |
| Right after main has posted its `kit:init` reply | `fixed`: the runtime never asks for a size in that mode, and its `kit:ready` means the page has loaded |
| 800 ms after `kit:ready` arrives | A page that has loaded but asks for no size: its first fit never comes, or comes late (a larger `initTimeoutMs` with slow web fonts, below) |
| 3 s after `installKitWindow()` | A page that never sends `kit:ready`: no kit runtime, or one that threw before it got there |

A `kit:ready` replaces the 3 s fallback with its own 800 ms, so a page that loads slowly still gets the whole delay, and a UI that handshakes again while the window is still hidden starts the 800 ms over. A later `installKitWindow()` call drops the earlier one's timers, a `kit:resize` in `fixed` mode is ignored (it neither resizes nor shows), and a `figma.ui.show()` that throws (a plugin that closed first) is ignored. `test/code.test.mjs` pins each of these paths; `e2e/chrome.spec.mjs` ("when main shows the window", and the open and `fixed` tests) checks them in the fake host.

**Why the window waits for the UI.** In the Figma desktop app (126.9.13, 2026-10-14) a window shown before its page has painted is visible, and blank. With the code at the `v0.4.0` tag, the cap counted 500 ms from `installKitWindow()`, and a `fixed` window was visible from `showUI` on. In that run the starter in FigJam and Slides first appeared at its starting size and fitted about 1 s later, and the heavier pages (the five examples and the one-shot plugins) showed a visible but blank window for up to about 1 s before their content painted, then fitted ([surfaces.md](surfaces.md#seen-in-the-run-a-window-visible-before-it-fitted)). A page can take longer than 500 ms to load in Figma, so the delay now starts when the page reports that it has loaded. Whether this removes the blank and unfitted flash in Figma is **UNVERIFIED** until the next Figma run; the timings above are verified only by the unit tests and the fake host.

The runtime has its own half-second safety net, for a `kit:init` that never comes:

- **The runtime**: if no `kit:init` arrives within `CONFIG.initTimeoutMs` (500 ms) of `kit:ready`, it carries on alone: `CONFIG.fallbackMode` (`fit-content`), chrome off (the handle stays hidden, since nothing could save a size), the generous bounds, and a content fit. This is what you see when `ui.html` is opened straight in a browser. If `kit:init` does arrive later (a main thread busy for longer than that), its mode, chrome and bounds take over. Main may apply the fallback's fit after it has sent `kit:init`, so the runtime then asks again: for `kit:init`'s `size` in `resizable` mode (when the chrome is on), or for a fresh content fit in `fit-content` mode. A `fixed` window needs nothing, because main ignores `kit:resize` in that mode (`e2e/chrome.spec.mjs`, "a main thread that answers late").

The first fit waits for `document.fonts.ready`, so text measured in the fallback font does not set the height, but no longer than `CONFIG.initTimeoutMs`: a font request that never settles must not keep the window from fitting. In `fit-content` mode a late font swap is caught by the observer anyway. The runtime's font wait starts when it sends `kit:ready` and main's 800 ms when that message arrives, so with the default `initTimeoutMs` of 500 ms the slowest first fit still lands about 300 ms before main would show the window on its own: the window appears once, already fitted. (With main's delay at 500 ms too, the two timers tied, and in the fake host with fonts that never settle the window showed at its starting size a moment before its fit in 2 of 8 runs; `e2e/chrome.spec.mjs` now checks that the fit comes first, and `test/code.test.mjs` that the delay stays at least 250 ms over the runtime's default.) A larger `initTimeoutMs` lets slow fonts hold the first fit back past main's 800 ms: the window then appears at its starting size and fits when the fonts arrive.

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

- **Dev Mode (`dev`)** and **Buzz (`buzz`)**. The UI lives in a docked panel there (the Inspect panel, or Buzz's left side panel), the panel's size belongs to the person, and Figma's guidance is a responsive layout, at least 300 px wide in Dev Mode ([Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode/), [Buzz](https://developers.figma.com/docs/plugins/working-in-buzz/)). Measured on 2026-10-14 (Figma desktop 126.9.13): both panels ignore `showUI`'s size and every `figma.ui.resize`. The UI got the panel's size, 320 x 1179 in Dev Mode and 280 x 1324 in Buzz's side panel, and kept it whatever was asked for; only an invalid size (`NaN`, a fraction) still throws there. So a handle could never resize anything, and turning the chrome off is right. In `fit-content` mode the runtime still sends content fits; main passes them on and the panel ignores them, so lay the page out for whatever width the panel has (check it at 280 px). Buzz's pop-out modal was not tried: whether it honours a resize is UNVERIFIED. See [surfaces.md](surfaces.md) for what is known per editor.
- **`fixed` mode**, in every editor. `code.ts` also ignores any `kit:resize` in this mode, so the window keeps `options.size`.
- **No `kit:init` at all** (the fallback above).

The chrome is on in Figma Design, FigJam and Slides.

## CSS hooks and the UI API

The runtime sets two attributes on `<html>` when `kit:init` (or the fallback) arrives:

- `data-kit-chrome="on" | "off"`: `on` only when the chrome is enabled and the mode is not `fixed`.
- `data-kit-mode="fit-content" | "resizable" | "fixed"`: the handle uses it to pick its cursor.

While the person drags, the handle matches `:active`, so styles for the grip can use it. The runtime adds no classes.

It also defines a frozen `window.kit` (typed as `KitUiApi` in [`kit.d.ts`](../kit.d.ts)):

- `kit.version`: the kit release, `'0.4.0'`.
- `kit.protocol`: `1`.
- `kit.fit()`: measure the root now and fit the window height to it, keeping the width. Use it in `resizable` mode after your content changes; in `fit-content` mode the observer already does this. It does nothing in `fixed` mode or before the first fit, and the size it asks for is not saved. `code.ts` has the same call as `fit()` on the window `installKitWindow()` returns ([Fit on request](#fit-on-request-kitfit-and-kitwindowfit)).
- `kit.dialog(idOrElement)` (kit 0.4.0): open a `<dialog class="kit-dialog">` as a modal; the promise resolves with its `returnValue` when it closes ([components.md](components.md#dialog)).
- `kit.toast(message, options)` (kit 0.4.0): show a short message at the bottom of the window, one at a time; returns `{ dismiss() }` ([components.md](components.md#toast)).

Do not call `figma.ui.resize` yourself while the kit window is installed. The runtime keeps track of the sizes it asked for, and in `fit-content` mode the next content change would undo yours anyway. Change `size` and `bounds` in `installKitWindow()` instead, or use `fixed` mode.

## Customising `CONFIG`

`CONFIG` at the top of the runtime block holds the runtime's defaults. Like the rest of the block, it is **never edited in place**: the three `data-kit` blocks stay byte-identical to the release, so the audit can spot drift and an upgrade is a re-paste. To change a value, add a JSON script anywhere in `ui.html`, for example right after the handle:

```html
<script type="application/json" data-kit-config>{"snapWidths": [300, 400], "strings": {"resizeLabel": "Fenstergröße ändern", "resizeHint": "Ziehen, oder die Pfeiltasten verwenden. Umschalt für größere Schritte, Eingabe zum Einrasten, Pos1 zum Einpassen, Ende für die größte Breite.", "announce": "Fenster {width} mal {height}", "dismiss": "Schließen"}}</script>
```

The runtime reads it once, at `DOMContentLoaded`, before it labels the handle or posts `kit:ready`, and merges it over the defaults key by key. Leave out every key you don't change. Only the first `data-kit-config` script in the page is read.

| Key | Default | Accepted | What it does |
|---|---|---|---|
| `snapWidths` | `[320, 480, 640]` | A non-empty array of positive numbers, in any order | The widths double-click, Enter and Space cycle through; End takes the widest. Widths outside the current bounds are skipped. |
| `step` | `8` | A whole number, 1 or more | Pixels per arrow key. |
| `bigStep` | `32` | A whole number, 1 or more | Pixels per Shift + arrow key. |
| `initTimeoutMs` | `500` | Milliseconds, 0 or more (at most 2147483647, `setTimeout`'s limit) | How long the runtime waits for `kit:init`, and for web fonts, before it carries on alone. It does not change when `code.ts` shows the window: at the latest 800 ms after `kit:ready` ([When the window appears](#when-the-window-appears-and-the-fallbacks)), so a value above about 700 can let a window appear before its first fit. |
| `fallbackMode` | `"fit-content"` | `"fit-content"`, `"resizable"` or `"fixed"` | The mode used only when `kit:init` never arrives, such as when previewing `ui.html` in a browser. In Figma the mode always comes from `installKitWindow({ mode })`. |
| `strings.resizeLabel` | `"Resize window"` | A string that is not blank | The handle's accessible name. The runtime writes it to the handle's `aria-label` at startup, so translate it here rather than in the markup. |
| `strings.resizeHint` | `"Drag, or use the arrow keys. Shift for bigger steps, Enter to snap, Home to fit, End for the widest size."` | A string that is not blank | The handle's description, the text of `#kit-resize-hint` (kit 0.3.0, [Screen readers](#screen-readers-the-hint-and-the-announcement)). |
| `strings.announce` | `"Window {width} by {height}"` | A string that is not blank | What the live region says after a keyboard resize. Every `{width}` and `{height}` is replaced with the window's size in pixels; any other text is kept as written (kit 0.3.0). |
| `strings.dismiss` | `"Dismiss"` | A string that is not blank | The accessible name of the close button in every [toast](components.md#toast) (kit 0.4.0). |

A typo cannot break the window; whatever the runtime cannot use is ignored and its default stays:

- Text that is not valid JSON, or JSON that is not an object (an array, a string, a number, `null`): the whole script is ignored, with one `console.warn`.
- An unknown key (`mode`, a misspelt `snapWidth`) or a value of the wrong type or range (`"step": 0.5`, `"snapWidths": []`, a blank label): that key is ignored and the others are applied. One `console.warn` names every ignored key, for example `[kit] data-kit-config: ignored step, strings.label (unknown key or wrong type).`

`e2e/chrome.spec.mjs` checks a valid override and each kind of bad one. For reference, the defaults as they stand in the runtime block (read them, don't edit them):

```js
const CONFIG = {
  snapWidths: [320, 480, 640],
  step: 8,
  bigStep: 32,
  initTimeoutMs: 500,
  fallbackMode: /** @type {KitMode} */ ('fit-content'),
  strings: {
    resizeLabel: 'Resize window',
    resizeHint: 'Drag, or use the arrow keys. Shift for bigger steps, Enter to snap, Home to fit, End for the widest size.',
    announce: 'Window {width} by {height}',
    dismiss: 'Dismiss',
  },
};
```

The table above says what each key does. The `@type` cast only tells `npm run check:ui` that `fallbackMode` is a `KitMode`, not any string.

## Troubleshooting

- **The window grows but never shrinks.** Something ties the root's height to the window: `height: 100%`, `min-height: 100vh` (on the root or on `body`), or a flex column stretched to the viewport.
- **The bottom of the content is cut off.** The content sits outside `[data-kit-root]`, or it hangs out of the root through absolute positioning or a negative margin.
- **The window appears late, at its starting size.** About 3 s after the plugin starts: the page never sent `kit:ready`, so the runtime block is missing or threw before it ran (check the plugin console). About 0.8 s after the page loaded: the UI sent `kit:ready` but no size, because `kit:init` never reached it (a protocol warning in the console) or a larger `initTimeoutMs` let slow web fonts hold its first fit back. In `fixed` mode the window appears as soon as `kit:init` is posted, at `options.size`, by design.
- **There is no handle.** The chrome is off (Dev Mode, Buzz, `fixed` mode, or no `kit:init`), or the button lacks `data-kit-resize`.
- **The size is not remembered.** `persist: false`, `fixed` mode, a different editor, a storage error (the main thread warns once), or a storage read slower than 300 ms (skipped for that run). In `fit-content` mode only the width is remembered, by design.
- **A `resizable` window keeps its height after new content arrives.** By design: only the person, Home, `kit.fit()` and `KitWindow.fit()` change it ([Fit on request](#fit-on-request-kitfit-and-kitwindowfit)).
- **`KitWindow.fit()` measured the old content.** Your UI renders after an `await` (or a frame) in its message handler, so the fit arrived first. Call `kit.fit()` in the UI once the content is in place instead.
- **A screen reader says nothing after a resize.** Only keyboard resizes are announced, 150 ms after the last key; check that the handle is the `[data-kit-resize]` button and that nothing else in the page uses `data-kit-announce`.

The pure helpers behind all this (`clampSize`, `nextSnap`, `widestSnap`, `sameSize`, `announceText`, and `placeMenu` for menus, between the `/* kit:pure:start */` and `/* kit:pure:end */` lines of the runtime) are tested in `test/pure.test.mjs`, which runs that block alone in `node:vm`, so it must stay DOM-free; `npm test` runs them.

## Implementation notes

The runtime block keeps only its JSDoc types and a few pointers into these docs, so the kit stays cheap to paste and to read. These notes explain the code itself: read them before you change the runtime (in a fork, or in a pull request), and run `npm run test:e2e` afterwards. The e2e specs pin most of these points.

**Requests and the window's size**

- Every size change goes through `requestSize()`. The queued frame, `lastSent` and the dedupe can then never drift apart, which they did in the pre-kit script that sent some sizes directly.
- Mid-gesture sizes are merged into one `kit:resize` per animation frame. An `immediate` or `final` request cancels the queued frame first, so a stale frame can never land after an Escape revert or a final size.
- A non-final size equal to the last one sent is dropped. Finals always go out: `code.ts` saves on them, and an Escape revert must win.
- A content fit merged into a queued drag frame keeps the drag's `user: true`, because the width is still the person's.
- The viewport lags one host round trip behind each request. Until the size last asked for has landed, fits and gestures start from it, axis by axis (`headingWidth` and `headingHeight`, cleared by the `resize` event once the viewport gets there). Without that, a fit measured at an older in-flight size would drag the window back, and fast keys would each add their step to the same stale size. The runtime only tracks them while the chrome is on: a docked panel (Dev Mode, Buzz) is sized by Figma and may never reach the size asked for, so there the viewport is the truth.
- A window shown with `visible: false` may not be laid out yet (0 x 0). Until it is, `kit:init`'s size stands in for the viewport, and the content is not measured.
- A fit (`kit.fit()` or `kit:fit`) during a `resizable` drag is dropped. Sent with the pointer still down, it made the window jump to the content height, and the drag's final size then put it back, so the person saw a flicker and the fit was lost anyway. A `fit-content` drag already follows the content height, so fits go on there.
- Home in `resizable` mode changes the width first. The content only reflows once that width lands, so the height is measured again then (`refitAtWidth`) and sent as a final size.

**Startup**

- The first `kit:resize` doubles as "ready to show": `code.ts` keeps the window hidden until then (or until 800 ms after `kit:ready`, or 3 s without one), so the runtime waits for the fonts and for the real mode before it sends it.
- With the chrome on, the first request uses `kit:init`'s `size`, not the viewport's: the restore's `figma.ui.resize` may not have reached the iframe yet, and asking for the old viewport size would undo it ([How the mode and bounds reach the UI](#how-the-mode-and-bounds-reach-the-ui)).
- `kit:init` is checked field by field, so a malformed one falls back to defaults instead of throwing. The protocol warning quotes a string protocol, so `"1"` and `1` read differently.
- A `kit:fit` that arrives before the first request is kept and applied to it. A `kit:init` that arrives after the fallback has started is covered in [When the window appears](#when-the-window-appears-and-the-fallbacks).
- `CONFIG.fallbackMode` is always a valid mode: the default is one, and `data-kit-config` only replaces it with another (`fallbackMode` in the table above).

**Watching the root (`fit-content`)**

- One `ResizeObserver` watches the root. The root is looked up again on every fit, never cached, so replacing the markup or adding `[data-kit-root]` later keeps fitting.
- A replaced root reports one last 0 x 0 size as it leaves the page, and the fit it triggers already measures the new root. Moving the observer to the new root waits for the next task: calling `observe()` on a shallower element from inside an observer callback makes the browser fire a "ResizeObserver loop completed with undelivered notifications" error event.

**Pointer and keys**

- `setPointerCapture` throws for a pointer that is no longer live (a synthetic event). Without capture a drag could never end, so none starts.
- `preventDefault()` on `pointerdown` stops text selection, but it also cancels the focus a mouse press would give. The runtime focuses the handle itself, with `focusVisible: false` so no keyboard ring appears after a mouse drag (browsers without the option ignore it). That focus is what lets Escape reach the plugin window.
- `clientX` and `clientY` stay put while the window resizes, because it grows from its top-left corner, so the drag's offset is simply the pointer's movement.
- `pressMoved` remembers whether the last press turned into a drag, so the `dblclick` that a double-click's second press produces does not snap on top of it.
- Each drag gets one `AbortController`; aborting it removes every listener the drag added, however the drag ends. The old `{ once: true }` listeners outlived an Escape.
- Escape during a drag is stopped in a capture listener on `window`. `stopPropagation()` there cannot stop other listeners on `window` itself ([Gestures and keys](#gestures-and-keys)).
- At the end of a `fit-content` drag the height is measured again. The drag's own height was measured before its last width landed and the content reflowed; sent as the final, it would overwrite the observer's newer fit, and with the root's size unchanged nothing would correct it.
- Snap widths outside the bounds are skipped, because they would clamp to the current size and look like a dead key. If none fits, all are used and the result is clamped.
- Holding Enter, Space, Home or End does not repeat (it would spin through the snaps). In `fit-content` mode Up and Down are left to the page, so it scrolls. A drag drops a key's pending announcement, which would be stale.

**Menus**

- `menuOpen` is set in `beforetoggle`, before the state changes, so it is never stale; `aria-expanded` is synced in `toggle`, after it.
- The menu's invoker is the toggle event's `source`; failing that (a browser whose `ToggleEvent` has no `source`), the last invoker if it opens this menu; failing that, the first `[popovertarget]` that does. The capture `click` listener records the clicked `[popovertarget]` button as the last invoker, and it runs before the button's own popover activation, so a menu with several buttons opens under the one that was clicked (ArrowDown records it the same way).
- A popover is not laid out until it is open, so the runtime places it in the next animation frame, before the first paint, and again on `toggle`. It measures the menu at 0, 0, where nothing squeezes it.
- Escape in an open menu is stopped in the capture `keydown` listener (`preventDefault()` and `stopPropagation()`), so a host's own Escape handler in the bubble phase (one that closes the plugin, say) does not also run.
- A click on an item closes the menu in a `setTimeout(0)`, after every click listener has run, so a host handler's `preventDefault()` keeps it open.
- Scrolling the page (not the menu) places the open menu under its invoker again. Without the popover API (`showPopover`) the runtime adds no `beforetoggle`, `toggle` or `scroll` listener, and its capture `keydown` and `click` listeners skip their menu parts: the menus could not open anyway. Those two still run dialog openers and close buttons, and Escape for tooltips ([components.md](components.md#implementation-notes)).

**`data-kit-config` values**

- `step` and `bigStep` must be whole pixels, 1 or more: a fractional step rounds back to the same width, a dead key.
- `initTimeoutMs` stops at 2,147,483,647 ms because `setTimeout` treats anything larger as 0.
- Strings must not be blank: a blank `resizeLabel` would leave the handle without an accessible name.

**The pure block**

- Figma documents a 70 x 0 floor for `showUI` and `figma.ui.resize`, and no ceiling. Measured in Figma 126.9: a narrower width becomes 70, a 0 height stays 0, a size larger than the Figma window is capped to the window, and a fraction throws ([How the mode and bounds reach the UI](#how-the-mode-and-bounds-reach-the-ui)). The 4096 px ceiling of the generous bounds is the kit's own, so a runaway number can't ask for an absurd window before `kit:init` arrives.
- `sanitizeBounds` repairs any bounds-like value: finite whole numbers, never under 70 x 0, and when a minimum is larger than its maximum the minimum wins, as in CSS and in `code.ts`. Missing or junk fields take the generous default, so the result is always safe to clamp against.
- `clampSize` rounds to whole pixels and never returns NaN or Infinity: NaN, a non-number and -Infinity land on the minimum, +Infinity on the maximum.
- `nextSnap` and `widestSnap` ignore the order of the snaps and skip non-finite and non-positive ones. With no usable snap the width comes back unchanged (0 if it isn't finite), so the result can always go to `clampSize`.
- `sameSize` is false when either size is missing, so the first request after startup is always sent.
- `placeMenu` puts the menu 4 px under its invoker with the left edges aligned, or above the invoker when it does not fit below and there is more room above, then keeps it 8 px inside every edge; a menu too big for the window is pinned 8 px from the top-left corner.
