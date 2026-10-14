# Release checklist

What has to be true before a release is tagged, what only a person with the Figma app can check, and what only the owner can do outside the repo. Automated checks (build, audit, check:ui, unit and browser tests) are in the CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)), which has not run on GitHub yet, and run locally with `npm run check` and `npm run test:e2e`; everything on this page is what they can't cover.

Status words used below:

- **Done**: in the repo and checked by running it (the evidence column says how).
- **Pending (human or Figma app)**: needs a person, a designer session or a run in the real Figma desktop app. Nothing here may be marked done from a browser or a test stub.
- **Pending (outward action)**: needs the owner to act outside the repo (npm, GitHub settings, Figma Community, tags).
- **Not done**: repo work the roadmap asks for that is not in the repo yet; the row says what is missing.
- **Not met**: a target the repo does not reach on purpose; the row says why and what is proposed.

## Manual surface matrix

Run once per release in the Figma desktop app, on a file you can edit. Fill each cell with **pass**, **fail** (with a note below the table) or **n/a**. Record the Figma version (About Figma), the date and who ran it. The starter comes first, then [the examples](#the-examples), the [components](#components-in-the-figma-app) that need a look in Figma (the Phase 3 dialog and toast among them), and a [screen-reader pass](#screen-readers).

Release: `0.4.0` · Figma version: · Date: · Tester:

| Surface | Imports from manifest | Opens hidden, then fits | Theme correct | Drag / Escape / keys | Reopen restores | Host demo works |
|---|---|---|---|---|---|---|
| Figma Design, light | | | | | | |
| Figma Design, dark | | | | | | |
| FigJam | | | | | | |
| Slides | | | | | | |
| Dev Mode (with the Dev Mode manifest) | | | | n/a (no handle) | | |
| Buzz | | | | n/a (no handle) | | |

Notes on failures:

-

What each check means:

- **Imports from manifest**: Plugins > Development > Import plugin from manifest... accepts `manifest.json` with no error and the plugin appears in that editor's plugin list. Dev Mode needs its own manifest, which the starter does not ship: make a folder with the Dev Mode manifest from [surfaces.md](surfaces.md#the-dev-mode-manifest) plus copies of `code.js` and `ui.html`, import that, and run it from the Inspect panel.
- **Opens hidden, then fits**: the window appears once, already at its content height. No flash of an empty or 320 × 360 window that then jumps.
- **Theme correct**: colours match the editor (no light panel in dark mode, no unreadable text); switching Figma's theme while the plugin is open recolours it at once; in FigJam the primary button is purple. In Slides, Dev Mode and Buzz, write down what the theme looks like: it is UNVERIFIED ([surfaces.md](surfaces.md)).
- **Drag / Escape / keys**: dragging the corner grip changes the width (the height keeps following the content); Escape during a drag snaps back; right-click does nothing; double-click snaps 320 → 480 → 640 → 320; with the handle focused (Tab), Left/Right move 8 px, Shift+Left/Right 32 px, Enter and Space snap, Home returns to 320, End goes to 640. Where the chrome is off (Dev Mode, Buzz) the handle must be hidden: that is the pass.
- **Reopen restores**: drag to a new width, close, rerun with Cmd+Opt+P: the window opens at that width, with no jump. In another editor it opens at the default width (sizes are per editor). In Dev Mode and Buzz, note whether the panel honours the size at all.
- **Host demo works**: with a count of 3, Create adds 3 shapes in a row at the centre of the view, selects them and zooms to them, and the status line updates; selecting layers updates the "n layers selected" line; a count of 0 or 51 shows the error text and red ring; Close closes the plugin. In Dev Mode, Create shows Figma's error toast and "Nothing created" (Dev Mode is read-only: that is the pass). In Slides and Buzz, note where the shapes land.

**Required before the first release tag: the probe runs.** On the same surfaces, run `tools/probe` ([steps](surfaces.md#measure-it-yourself)) and fill its two result tables and the raw reports in surfaces.md. Phase 1 item 3's done-when ("pasted next to a host's own handler, both work") and the Dev Mode and Buzz rows depend on what it measures: whether assigning `figma.ui.onmessage` removes `figma.ui.on('message')` listeners, whether early messages are queued, and whether `figma.ui.resize` applies in docked panels (PLAN.md sections 9 and 10). Its environment report also says whether the plugin window supports `popover`, which the [menu](#components-in-the-figma-app) needs, and with it the dialog openers and Escape on tooltips (the runtime handles both in the menu's listeners, which it adds only where `popover` exists).

### The examples

Each [examples/](../examples/) folder is its own plugin: import its `manifest.json` the same way ([install.md](install.md#the-examples)) and run it in every editor its manifest lists, and only those ([surfaces.md](surfaces.md#the-examples) says why each lists what it does). In Figma Design, check light and dark. Same cell words as above.

| Example · editor | Window mode | Imports | Opens at its size | Theme correct | Does its task | Window behaves | Notes |
|---|---|---|---|---|---|---|---|
| `rename-layers` · Figma Design (light, dark) | `fit-content` | | | | | | |
| `rename-layers` · Slides | `fit-content` | | | | | | |
| `export-selection` · Figma Design (light, dark) | `resizable` | | | | | | |
| `export-selection` · FigJam | `resizable` | | | | | | |
| `export-selection` · Slides | `resizable` | | | | | | |
| `export-selection` · Buzz | `resizable` (no handle) | | | | | n/a | |
| `content-fill` · Figma Design (light, dark) | `fixed` | | | | | | |
| `content-fill` · FigJam | `fixed` | | | | | | |
| `content-fill` · Slides | `fixed` | | | | | | |
| `content-fill` · Buzz | `fixed` | | | | | | |
| `variables-sync` · Figma Design (light, dark) | `resizable` | | | | | | |
| `a11y-contrast` · Figma Design (light, dark) | `fit-content` | | | | | | |
| `a11y-contrast` · FigJam | `fit-content` | | | | | | |
| `a11y-contrast` · Slides | `fit-content` | | | | | | |
| `a11y-contrast` · Buzz | `fit-content` (no handle) | | | | | n/a | |

What each check means for the examples (the import and theme checks are the starter's):

- **Opens at its size**: the window appears once, with no jump, at its mode's size: the content height for `fit-content`, the saved or default size for `resizable` (`variables-sync` defaults to 360 × 540), 320 × 249 for `content-fill`.
- **Does its task**, per example:
  - `rename-layers`: select three layers, type a prefix: the list previews every new name as you type; Rename renames exactly the previewed layers, and one Cmd+Z undoes it. In Slides, note whether the preview follows the selection (its page watch is guarded, because Slides' plugin surface is unverified).
  - `export-selection`: select two layers, pick 2x, press Export: one PNG per layer starts downloading, named like `Frame 1@2x.png`, and the status says "Started 2 downloads". Where the files land and whether Figma asks per file go in the [downloads row](#components-in-the-figma-app) below.
  - `content-fill`: select some text layers, pick a kind, press Fill: each layer gets a value of that kind, and one Cmd+Z undoes it. A layer with mixed fonts takes its first character's style. In FigJam, stickies and shapes with text are filled too.
  - `variables-sync`: in a file with local colour variables, pick a collection and a mode, click a variable, type a hex code and press Apply: the variable changes in that mode only, one Cmd+Z undoes it, and Apply on an alias without typing keeps the alias.
  - `a11y-contrast`: select text layers, or a frame holding some: each gets a ratio and a pass or fail against AA; **Select failing** selects the failing ones; clicking a row selects that layer. In FigJam, text on stickies and shapes is not checked (it is not a text layer).
- **Window behaves**: `fit-content` (`rename-layers`, `a11y-contrast`): the height follows the content (ticking "Add numbers", a longer result) and the list scrolls inside its 240px region, so the footer stays in view; dragging changes the width, and reopening restores it. `resizable` (`export-selection`, `variables-sync`): dragging changes both sides, content changes never move the window, and reopening restores both; in `variables-sync` a taller window shows more list rows with Apply still in view. `fixed` (`content-fill`): no handle anywhere, and the window never changes size, also when a result line appears. In Buzz the handle is off on every example: note whether the panel honours the plugin's size.

Notes on failures:

-

### Components in the Figma app

Kit 0.3.0 and 0.4.0 components whose behaviour the browser preview can't vouch for inside Figma's plugin iframe. Each row says where to find one. Where no example has the component, paste the markup from [components.md](components.md) into a copy of the starter (or add a button to it), rerun with Cmd+Opt+P, and undo the edit afterwards.

| Component | Where | What to check | Result | Figma version, date |
|---|---|---|---|---|
| Native colour picker | `variables-sync`: the swatch next to the hex field | Clicking the swatch opens the system colour picker from the plugin window (UNVERIFIED); picking a colour writes its code into the hex field; Escape or cancel leaves the field as it was. | | |
| Popover menu | No example uses one: paste the [menu markup](components.md#menu) into the starter's `<main>` for the test, rerun with Cmd+Opt+P, and undo the edit afterwards | It opens above the plugin's content, under its button and inside the window (above it near the bottom edge), and isn't cut off by the window's edge; ArrowDown, ArrowUp, Home and End move between items; Escape closes the menu and returns focus to the button, and does not close the plugin; clicking an item runs it and closes the menu; in light, dark and FigJam the menu is readable. | | |
| Tooltips | `a11y-contrast`: "Check again" in the header; `variables-sync`: "Reload variables" | The tooltip appears about 400 ms after the pointer rests on the button and at once when the button is reached with Tab; it is not cut off at the window's right edge (both use `kit-tooltip-end`); it hides when the pointer and focus leave; it is readable in each theme. Kit 0.4.0: Escape hides it, for hover and for focus, without closing the plugin, and it stays hidden until the pointer and focus have left the button. | | |
| Dialog | No example uses one: paste the [dialog markup](components.md#dialog) (the dialog and its opener button) into the starter's `<main>`, and log the result with `kit.dialog('rename').then(console.log)` from a second button | The opener opens it over a dimmed window (the scrim covers everything, the resize grip too); the first field has focus; Tab and Shift+Tab stay inside; Escape closes it, returns focus to the opener and does not close the plugin; Cancel and Rename close it and the console shows their values (`''` after Escape or the close X); a click on the scrim does nothing; in a window shorter than the dialog it scrolls inside, with its header and footer in view; the window does not resize when it opens; readable in light, dark and FigJam. | | |
| Toast | No example uses one: add a button to the starter whose click calls `kit.toast('Renamed 3 layers', { tone: 'success' })`, a second with `{ tone: 'danger' }` and a third with `{ duration: 0, action: { label: 'Undo', onClick: () => console.log('undo') } }` | It appears at the bottom centre, above the resize grip and inside the window; several queue and show one at a time; it stays while the pointer is on it and is gone about 4 s after it appeared, not counting that time; Escape with focus in it dismisses it without closing the plugin; the close button and Undo work; readable in light, dark and FigJam, and the icons visible on its dark (light, in the dark theme) surface; with Reduce motion on in macOS (System Settings > Accessibility > Display) it appears without sliding; with a dialog open (above), a toast shows inside the dialog, over the scrim, and its buttons work. | | |
| Downloads | `export-selection` with three layers selected | Whether the desktop app saves all three files, asks once per file, or blocks some without a message (UNVERIFIED: no event tells the page); where the files land; the file names; whether each PNG's pixel size matches the size the list showed. | | |

### Screen readers

Run with VoiceOver on macOS and, if available, NVDA on Windows, inside the Figma desktop app on the starter and the examples. Tabs, the menu, the dialog and the toast are in no example: check those on `preview.html`'s gallery in Chrome (`npm run preview`), which is real assistive technology but not Figma, and the dialog and toast again in Figma with the test edits from [the table above](#components-in-the-figma-app). Write what the screen reader says, briefly.

| Item | Where | Expected | VoiceOver | NVDA |
|---|---|---|---|---|
| Resize handle | Starter, Tab to the grip | "Resize window", a button, then the hint ("Drag, or use the arrow keys...") | | |
| Resize announcement | Starter, Right three times quickly | One "Window 344 by …" after a short pause, not three | | |
| Live result | `rename-layers`: rename three layers | "Renamed 3 layers" (or similar) without focus moving; nothing while typing | | |
| Tooltip as description | `a11y-contrast`: Tab to "Check again" | The name, then "Measure the selection again" | | |
| Checkbox and radio | `content-fill` checkbox; `export-selection` scale radios | Checked state; arrow keys move the radio choice | | |
| Tabs | Gallery, Tabs row | Heard as a radio group ("PNG, radio button, 1 of 3"), arrow keys switch | | |
| Menu | Gallery, the live menu | A menu with menu items; Escape returns to its button | | |
| Danger notice | Gallery, or a failed action that shows one | Read at once (`role="alert"`) | | |
| Dialog | Gallery, "Dialog, live": the "Rename layers…" opener | "Rename layers, dialog" (or similar), then the focused Prefix field; nothing of the page behind while it is open; Escape, then the opener is announced again | | |
| Toast | Gallery, "Toast, live": "Queue three toasts" | Each message read once, after what is being said, without focus moving; the danger one ("Export failed...") read at once; with the dialog open, a toast is still read | | |

## Phase 1 status

Phase 1 is PLAN.md section 3 (the fix-first list), section 4 items 1-7, the P1 rows of section 7 and section 10 (the first-week checklist). Last updated 2026-10-14, at kit 0.4.0 (the uncommitted Phase 3 work on top of `v0.3.0`, commit `61e608f`); evidence recorded at 0.2.0 and 0.3.0 stays where it still holds, with the 0.4.0 numbers next to it. The table follows section 4; sections 3, 7 and 10 are checked [below it](#fix-first-list-inventory-and-first-week-plan-sections-3-7-and-10). Phases 2 and 3 have their own tables ([Phase 2](#phase-2-status), [Phase 3](#phase-3-status)).

| # | Item | In the repo (evidence) | Done when (PLAN.md) | Status |
|---|---|---|---|---|
| 1 | Repo basics and a runnable folder | `LICENSE` (MIT), `package.json`, `manifest.json` (`"main": "code.js"`, `dynamic-page`, `allowedDomains: ["none"]`), the built `code.js` kept in the repo; CI rebuilds it (and, since 0.3.0, every example's) and fails on any changed or added file (simulated on a clean export of commit `9a8c948` on 2026-10-14, and again on the 0.4.0 working tree the same day: `npm run build` and `npm run build:examples` leave every `code.js` byte for byte as it was). `CHANGELOG.md` lists the public surface and every rename from 2025. README brand line says "not rsms/figplug" and "Fallback name: TBD". | The zip imports from manifest and runs with no terminal. | Repo work: **Done**. Zip import run: **Pending (human or Figma app)**. `npm deprecate` and reserving the fallback name: **Pending (outward action)**. |
| 2 | Resize script rewrite and modes | `ui.html` runtime: one `requestSize`, a per-drag `AbortController`, the `button`/`isPrimary` guard, `lostpointercapture`, the three modes, the 500 ms fallback, the first fit after `document.fonts.ready`, the grip corner reserved only while the chrome is on. `clampSize`, `nextSnap`, `sameSize` under `node:test` (`test/pure.test.mjs`). `e2e/chrome.spec.mjs` drives the real `ui.html` and `code.js` in `preview.html`'s fake host: drag, Escape mid-drag, right- and middle-click, plain click, double-click, Shift+arrows, Home, reopen with a saved size, `resizable` mode, `fixed` mode, `ui.html` opened with no host, a host that applies resizes late, a main thread that answers after the 500 ms fallback, web fonts that never settle, a bad `data-kit-config`, replaced markup, counting the listeners before and after each gesture; every e2e test fails on any console error or uncaught exception (where a `'use strict'` slip would show). | Drag, Escape mid-drag, right-click, double-click, Shift+arrows and reopen leak zero listeners under `'use strict'`; replacing the demo markup still fits. | Fake frame: **Done** (`npm run test:e2e`: 50 passed and 4 screenshot tests skipped at 0.2.0 on 2026-10-13; 119 passed and 4 skipped at 0.3.0 and 149 passed and 10 skipped at 0.4.0 (the screenshot specs and, new in 0.4.0, the listing images), both on 2026-10-14, Chromium 151.0.7922.34). Replaced markup: **Done** (`e2e/chrome.spec.mjs`, "replacing the markup, or the root itself, still fits": taller and shorter markup, a new `[data-kit-root]` element and no root at all, each fitted with no window error and nothing saved). Same sequences in Figma: **Pending (human or Figma app)** (surface matrix). |
| 3 | Installable `code.ts` | `kit:window` block with `installKitWindow({ bounds, persist, mode, size, title, html })`, `figma.ui.on('message')`, `kitIsSizeRecord`, `KIT_PROTOCOL` sent in `kit:ready` and echoed in `kit:init`, hidden until the first fit (500 ms cap), chrome gated on `editorType`, record `{ v: 1, editorType, width, height }`, Dev Mode min width 300. `kit.d.ts` export-free; `npm run check:ui` checks the runtime's JSDoc mirror. `test/code.test.mjs` runs `code.js` against a `figma` stub, including the kit listener and the demo's host listener side by side. | Pasted next to a host's own handler, both work; Dev Mode and Buzz runs recorded. | Stub test: **Done**. Real Figma run next to a host handler ([paste steps](messages.md#adding-the-kit-to-an-existing-plugin)), and the Dev Mode and Buzz runs: **Pending (human or Figma app)**. The `tools/probe` runs in Design, FigJam, Slides, Dev Mode and Buzz (`onmessage` coexistence, early messages, resize), which this done-when depends on: **Pending (human or Figma app)** ([steps](surfaces.md#measure-it-yourself); the result tables are empty). |
| 4 | README first screen and Community listing | `README.md` first screen: "Is this for you?", brand line, light/dark screenshots, 60-second start, the one prompt, "Your loop", the plain limits. `docs/install.md` (import gotchas), `docs/loop.md`, `docs/community-listing.md` (listing copy). | Two designers with only Figma desktop and Claude Code reach a running plugin; record where each stops. | Copy: **Done**. Designer gate: **Pending (human or Figma app)** (table below). Screenshot side by side with Figma's own panel: **Pending (human or Figma app)** ([capture (a)](#a-side-by-side-with-figmas-own-panel-item-4)). Listing republish: **Pending (outward action)**. |
| 5 | Agent context and a first audit | `AGENTS.md` (under 150 lines), `CLAUDE.md` (`@AGENTS.md` + Claude notes), `.claude/skills/kit-ui/SKILL.md` with `references/` → `docs/`; `scripts/audit.mjs` (zero dependencies; 6 rules in its Phase 1 version, 19 in 0.3.0 and 0.4.0, each with a fixture that triggers it in `test/audit.test.mjs`; 0.4.0 changed what `budget` measures, not the ids); the CI workflow runs it; `docs/prompts.md` pins the harness and logs the runs. | One archetype prompt in a fresh clone passes the audit. | Repo work: **Done**. The one-shot run: **Done** as agent-only runs: all five archetype prompts passed build, audit and check:ui in a fresh clone at 0.2.0 and again at 0.3.0 ([one-shot log](prompts.md#one-shot-log)). A run by a person, and importing the results into Figma (the log's check 4): **Pending (human or Figma app)**. |
| 6 | Native fidelity pass | Tokens and component values measured from Figma's production CSS and two UI3 replicas, with sources and confidence ([tokens.md](tokens.md#measured-metrics)); tokens isolated in `<style data-kit="tokens">`; marked sections; version header with the issues URL; `Inter, system-ui` and the opt-in `scripts/make-fonts-css.mjs`. `preview.html` shows every component, Phases 1 to 3, in six states (25 gallery rows at 0.3.0, 27 at 0.4.0 with the dialog and the toast; `e2e/preview.spec.mjs` checks them; `docs/img/gallery-light.png`, `gallery-dark.png`). | Every component shows all six states and matches the measured values. | Six-state gallery in the browser: **Done**. Measuring the official UI3 kit file through the Figma MCP ([capture (b)](#b-the-official-ui3-kit-through-the-figma-mcp-item-6)) and a designer's comparison with Figma's own panels ([capture (c)](#c-a-designers-comparison-with-figmas-panels-item-6)): **Pending (human or Figma app)**. |
| 7 | `preview.html`, fallback palette, tests | `tokens.figma-fallback.css`: all 174 tokens for Design light, dark and FigJam, provisional values from create-figma-plugin's MIT transcription (`test/fallback.test.mjs`). `preview.html`: gallery, theme switch, "Simulate no Inter", and a fake frame running `code.js` against a `figma` stub (`npm run preview`, `scripts/serve.mjs`). `scripts/check-ui.mjs`. Playwright: `e2e/*.spec.mjs` with axe-core per theme (all WCAG 2.0/2.1 A and AA rules except `color-contrast`, replaced by a token-pair contrast report). CI and the Pages workflow (its staging step was run locally: the staged site redirects to `preview.html` and the live frame boots with no errors). This checklist. | Both themes render in Chrome, the resizer works on the fake frame, CI is green. | Both themes and the resizer on the fake frame: **Done** (local e2e runs above). Live palette capture from a running plugin: **Pending (human or Figma app)**. CI green on GitHub, Pages enabled, the `v0.2.0` tag pushed (it exists in the local repo only): **Pending (outward action)**. |

### Designer gate (item 4)

Two designers with only the Figma desktop app and Claude Code, a fresh clone, the README as the only instructions. Record where each one stops, even if they finish. PLAN.md section 9 asks for this gate **per release**, so each release gets two rows of its own before it is published ([success metrics](#success-metrics-planmd-section-9)). It has not been run for any release: none is published yet (`v0.2.0` and `v0.3.0` are local tags). The rows for 0.4.0, the next to tag, are ready below; if `v0.2.0` or `v0.3.0` is published on its own, add its rows too.

| Release | Date | Designer (initials) | Tools and versions | Reached a running plugin? | Time | Where they stopped or got stuck |
|---|---|---|---|---|---|---|
| 0.4.0 | | | | | | |
| 0.4.0 | | | | | | |

### Fix-first list, inventory and first-week plan (sections 3, 7 and 10)

**Section 3, the fix-first list.** Every bullet is fixed by items 1, 2, 3, 6 and 7 and listed under Fixed and Changed in [CHANGELOG.md](../CHANGELOG.md), with one exception the roadmap itself moved to Phase 2: the resizer's live feedback, the `aria-live` size announcement, which kit 0.3.0 added ([accessibility.md](accessibility.md#the-resize-hint-and-the-announcement)). Status: **Done** in the browser and the `figma` stub; the same behaviour in Figma is the surface matrix.

**Section 7, the P1 rows of the inventory.**

| Row | P1 target | In the repo | Status |
|---|---|---|---|
| Button | + tertiary, danger, disabled, selected, loading; 24px + large | `kit-button-tertiary`, `kit-button-danger`, `kit-button-large`; `disabled` / `aria-disabled`, `aria-pressed`, `aria-busy`; 24px and 32px | **Done** (gallery, `e2e/preview.spec.mjs`) |
| Input, input with icon | + disabled, error with `aria-describedby`, help text | `kit-input`, `kit-input-icon`, `kit-help`; `disabled`, `aria-invalid` + `aria-describedby` | **Done** (same) |
| Dropdown (`<select>`) | + disabled, error; stays native, documented | `kit-select` disabled and `aria-invalid` rules on the native `<select>`; the native popup is in [components.md](components.md#select) and the README's limits | **Done** (same) |
| Resize handle | modes, 24px, 3:1 grip | three modes; a 24px `<button>`; grip `icon-secondary` on `bg`, 3.98:1 light, 7.65:1 dark ([accessibility.md](accessibility.md#measured-ratios)) | **Done** on the fallback palette; the ratio on a captured palette waits for the palette capture |
| Layout primitives | real elements and classes | `<main>`, `<section>`, `<hr>`, `<h1>`, `<label>` with the `kit-*` layout classes | **Done** |
| Figma tokens referenced | 60+ of 174 | 59 distinct `--figma-color-*` names in `ui.html` at 0.4.0, counted on the working tree on 2026-10-14 (58 in 0.3.0, 34 in 0.2.0, 15 in the 2025 file; the toast added `icon-oninverse`). Count: `grep -o -E -- '--figma-color-[a-z0-9-]+' ui.html \| sort -u \| wc -l`. The cheat sheet in [tokens.md](tokens.md#role--token-cheat-sheet) names more for host CSS. | **Not met (59).** The Phase 2 components brought the tone families (tint, ring, icon for brand, success, warning and danger), the checkbox set, the on-selected set and the inverse surface. The Phase 3 dialog and toast were expected to close the gap but needed only one new token: the dialog paints with tokens the kit already used, and the toast's tone icons reuse `icon-success` and `icon-danger`. The kit does not add unused aliases to raise the count: they would be dead tokens ([tokens.md](tokens.md)). Owner decision on the target: pending. The options: retire the 60+ target, move it to a later release, or add one token with a real role inside the starter's room left, such as `--figma-color-text-tertiary-hover` or `--figma-color-icon-tertiary-hover`, only where a state the kit draws calls for it (a change to the components block, copied into every kit copy). |
| Fallback palette | all 174 captured | `tokens.figma-fallback.css` has all 174 names for Design light, dark and FigJam, provisional values from create-figma-plugin's MIT transcription (`test/fallback.test.mjs`) | All 174 names: **Done**. Capturing them from a running plugin: **Pending (human or Figma app)** (monthly step 2) |
| Kit tokens | measured radii, line-heights, durations, shadow and scrim; density removed | `--kit-radius-*`, `--kit-line-height-*`, `--kit-duration-*`, `--kit-shadow-*`, `--kit-scrim` ([tokens.md](tokens.md#measured-metrics)); density presets removed | **Done**; the MCP measurement of the UI3 kit file is item 6 |

The P2 rows of section 7 (the handle's `<button>`, `aria-live` and Home/End; the first eight components; the six stretch components) are items 4 and 5 of the [Phase 2 table](#phase-2-status).

**Section 10, the first-week checklist.**

| Step | In the repo | Status |
|---|---|---|
| Confirm `npm login`; decide the name (brand in README and listing, neutral `kit` namespace elsewhere, fallback name reserved); `npm deprecate` both packages | "Figplug UI Kit" in the README and [community-listing.md](community-listing.md) with the "not rsms/figplug" line; `kit-*`, `--kit-*`, `kit:*` and `data-kit-*` everywhere else | Namespace: **Done**. `npm login`, `npm deprecate` and the fallback name: **Pending (outward action)** (actions 1 and 6) |
| `LICENSE`, `package.json`, the corrected `manifest.json`; `tsc`; commit `code.js`; Import plugin from manifest with no terminal | All files present; `npm run build` regenerates `code.js` and CI's diff check guards it (item 1) | Files and the local commits: **Done**. Pushing them to GitHub: **Pending (outward action)** (this copy has no git remote). The import run: **Pending (human or Figma app)** (item 1) |
| `ui.html`: declare `activePointerId`, the `e.button !== 0 \|\| !e.isPrimary` guard, an `AbortController` per drag, remove the `aria-label`, add `lang` | The rewritten runtime runs under `'use strict'` (item 2); `<html lang="en">`; fields named by their visible `<label>` | **Done** (item 2's e2e runs) |
| `code.ts`: `isSizeRecord`, `figma.ui.on('message')`, check whether a host `onmessage =` clears it | `kitIsSizeRecord` and `figma.ui.on('message', ...)` in the `kit:window` block (item 3) | Guard and listener: **Done**. The `onmessage =` check: **Pending (human or Figma app)** (the probe runs, above) |
| README first screen; docs link, `.gitignore`, screenshots | Item 4; the screenshots are browser renders in `docs/img/` | **Done**. The Figma side by side: capture (a) |
| Draft `AGENTS.md`; run the entry prompt once in a fresh clone and log each failure as a future audit rule; tag `v0.2.0-alpha`; open `CHANGELOG.md` | `AGENTS.md`, `CHANGELOG.md`; the [one-shot log](prompts.md#one-shot-log) with a row per run, the 0.2.0 failures turned into audit rules (`orphan-help`, `js-color-literal`) and AGENTS.md guidance, and the 0.3.0 runs' rule candidates | `AGENTS.md`, `CHANGELOG.md` and the entry-prompt runs (agent-only): **Done**. A run by a person and the Figma import: **Pending (human or Figma app)** (item 5). Tag `v0.2.0-alpha`: **Pending (outward action)** (action 4) |

## Phase 2 status

Phase 2 is PLAN.md section 5, items 1-5. The plan calls the phase done "at items 1-3 plus whichever of the first eight components the archetypes pulled in; the rest is stretch". Last updated 2026-10-14, at kit 0.4.0. **Phase 2's repo work is complete** and tagged in the local repo as `v0.3.0` (commit `61e608f`, which added the last of item 3's pages and files); every item still has steps that wait for a person, the Figma app or the owner, so the phase is not done as PLAN.md defines it.

Evidence numbers at 0.3.0 come from runs on 2026-10-14 on a clean export of commit `9a8c948` (Node 24.13.0, macOS); the [Phase 3 table](#phase-3-status) has the same runs at 0.4.0.

- `npm run check`: exit 0. `build-examples: 5 of 5 example(s) compiled`; `audit: no problems in 6 plugin folders` (the root and the five examples); `check-ui: no type errors in 6 plugin folders`; `npm test`: 450 tests, 450 passed, 0 failed, 0 skipped (352 in `test/`, of them 228 in `test/audit.test.mjs`; 98 golden tests in the examples: `a11y-contrast` 34, `content-fill` 20, `export-selection` 11, `rename-layers` 17, `variables-sync` 16).
- `npm run test:e2e` (Playwright 1.62.1, Chromium 151.0.7922.34): 119 passed, 4 skipped (the screenshot specs, which run only with `UPDATE_SCREENSHOTS=1`). Of them, `e2e/examples.spec.mjs` 25, `e2e/chrome-v2.spec.mjs` 14, `e2e/menu.spec.mjs` 11, `e2e/a11y.spec.mjs` 11, and 27 axe runs across the specs.
- The CI workflow runs the same commands, but it has never run on GitHub: this copy of the repo has no git remote.

| # | Clause (PLAN.md section 5) | In the repo (evidence) | Status |
|---|---|---|---|
| 1 | Archetypes: `examples/rename-layers`, `export-selection`, `content-fill` first | All three folders, in commit `9a8c948` | **Done** |
| 1 | `variables-sync` and `a11y-contrast` wait for the number and colour fields | `kit-number` and `kit-color` shipped in commit `74a834a`, before the examples; `variables-sync` uses the colour field | **Done** |
| 1 | Each ships the three files | `manifest.json`, `code.ts` with its compiled `code.js` committed, `ui.html` in each folder, plus `kit.d.ts` and `tsconfig.json` | **Done** |
| 1 | Using only kit classes | Every control and component in the five `ui.html` files is a kit class. Their own CSS styles a few extras (a contrast chip, a variable swatch, a result line, list spacing) under their own class names (`contrast-*`, `vars-*`, `rename-*`, `cf-result`, `scales`, `layers`), tokens only (`npm run audit`: no problems) | **Done** |
| 1 | A different chrome mode | The first three differ: `rename-layers` `fit-content`, `export-selection` `resizable`, `content-fill` `fixed`; the other two repeat (`variables-sync` `resizable`, `a11y-contrast` `fit-content`). `e2e/examples.spec.mjs`, "the examples cover every window mode, and the preview offers each of them" | **Done** |
| 1 | A README with its entry-prompt variant | "The prompt" in each `examples/<name>/README.md` | **Done** |
| 1 | And the agent's diff | `agent.diff` in each folder, summarised under "What the agent built" and "What curation changed, and why" in its README | **Done** |
| 1 | The audit byte-compares marked sections across root, preview and examples | Audit rule `section-drift` (the `section-drift` fixture and six section-drift cases in `test/audit.test.mjs`, one of them for `preview.html`); `e2e/preview.spec.mjs`, "the three kit blocks are byte-identical to ui.html" | **Done** |
| 1 | Cap at two examples until it does | `section-drift` landed in commit `74a834a`, before any example (`9a8c948`), so the cap never applied | **Done** |
| 1 | *Done when:* two pass `tsc` and the audit in CI | All five pass locally: `build-examples: 5 of 5 example(s) compiled`, `audit: no problems in 6 plugin folders`. The CI workflow runs `npm run build:examples` and the audit | Locally: **Done**. In CI on GitHub: **Pending (outward action)** (push the repo; CI has never run) |
| 1 | *Done when:* the one-shot rate is logged | [prompts.md](prompts.md#one-shot-log): automated one-shot 5 of 5 at 0.3.0 (and 5 of 5 at 0.2.0), agent-only runs in fresh clones; each example README repeats its row | Logged: **Done**. Check 4 of every run (import into the Figma desktop app): **Pending (human or Figma app)** |
| 2 | Audit v2: missing `:disabled` | Rule `missing-disabled` (fixture `missing-disabled`) | **Done** |
| 2 | Sync getters | Rule `sync-getter` (fixture `sync-getter`) | **Done** |
| 2 | `aria-label` overriding a visible label | Rule `aria-label-override` (fixture `aria-label-override`) | **Done** |
| 2 | Missing `lang` | Rule `missing-lang` (fixture `missing-lang`) | **Done** |
| 2 | Tooltip or `[aria-invalid]` without `aria-describedby` | Rule `missing-describedby` (fixtures `missing-describedby` and `missing-describedby-tooltip`) | **Done** |
| 2 | Section drift | Rule `section-drift` (item 1 above) | **Done** |
| 2 | A budget warning (shell under 1,600 lines / 64 KB) | At 0.3.0: rule `budget`, a warning for a ui file of 1,600 lines or more, or 64 KB or more, fonts in `data:` URLs not counted (fixture `budget`). Changed in 0.4.0, because a plugin's own code reached that line quickly (each example's `ui.html` is 66.5 to 70.9 KB now): the shell's limit, the starter `ui.html` under 1,600 lines and 65,536 bytes, is checked by `test/budget.test.mjs`, a failing test rather than a warning (65,387 bytes and 1,032 lines at 0.4.0), and `budget` warns when the kit blocks pass 60 KB or a ui file passes 128 KB or 3,200 lines ([pitfalls.md](pitfalls.md#20-the-size-budget)) | **Done** (the shell's limit as a test since 0.4.0) |
| 2 | *Done when:* it catches every failure logged in Phase 1 | The five Phase 1 one-shot plugins are kept verbatim as `test/fixtures/oneshot-*`, and `test/audit.test.mjs` pins what the audit says about each ("… (a Phase 1 one-shot plugin): N orphan-help warning(s), nothing else"). The Phase 1 failures a static check can see became `orphan-help` and `js-color-literal`; the rest (a status line rewritten per keystroke, "Downloaded N", untyped messages, the demo-coupled tests, the stub's gaps, the contrast maths) are behaviour no static rule sees and went to AGENTS.md guidance, tests and the preview stub ([prompts.md](prompts.md#one-shot-log), the 0.2.0 rows). "every rule has a fixture that triggers it, and docs/pitfalls.md documents it" covers all 19 rules | **Done** for every failure a static check can catch |
| 3 | README as docs: Install | [install.md](install.md), linked from the README's Docs line | **Done** |
| 3 | First plugin | [docs/first-plugin.md](first-plugin.md); its markup, messages and script were run through build, audit, check:ui, the unit tests and e2e in a copy of the 0.3.0 repo | Done in the repo. Importing it into Figma: **Pending (human or Figma app)** |
| 3 | Your loop | [loop.md](loop.md) | **Done** |
| 3 | Tokens | [tokens.md](tokens.md) | **Done** |
| 3 | Components | [components.md](components.md) | **Done** |
| 3 | Window chrome | [window-chrome.md](window-chrome.md) | **Done** |
| 3 | Messages | [messages.md](messages.md) | **Done** |
| 3 | Accessibility | [accessibility.md](accessibility.md), with the Phase 2 notes per component | **Done** |
| 3 | Surfaces | [surfaces.md](surfaces.md), with the editors of each example | **Done** |
| 3 | A UI3 mapping table (official kit component to kit class, CC BY attribution) that a frame-to-markup skill consumes via MCP `get_design_context` | [docs/ui3-mapping.md](ui3-mapping.md) (CC BY 4.0 attribution) and `.claude/skills/kit-frame-to-markup/`. The UI3 component names are UNVERIFIED until the Community file is read through the MCP: [capture (b)](#b-the-official-ui3-kit-through-the-figma-mcp-item-6) | Page and skill: Done. Verifying the names: **Pending (human or Figma app)** |
| 3 | Publishing checklist (icon 128, thumbnail 1920x1080, support contact, network label, privacy policy, AI-overlap rule, 10-day to 6-week reviews) | [docs/publishing.md](publishing.md) for plugin authors; [community-listing.md](community-listing.md) for the kit's own listing | Done |
| 3 | Upgrade by re-pasting the three marked sections | [docs/upgrade.md](upgrade.md), step by step, with a section-drift check against a release clone | Done |
| 3 | Ten-line `CONTRIBUTING.md` | [CONTRIBUTING.md](../CONTRIBUTING.md) | Done |
| 3 | `bug_report.yml` asking `editorType`, theme, kit header | `.github/ISSUE_TEMPLATE/bug_report.yml` and `config.yml` (YAML parses; not yet rendered on GitHub) | Done |
| 3 | *Done when:* two new volunteers reach a running plugin in under 30 minutes | [Volunteer gate](#volunteer-gate-item-3) below, empty | **Pending (human or Figma app)** |
| 4 | Components the archetypes pull in, the first eight: empty state, list row, sticky footer, inline notice, checkbox, textarea, section header, icon button | All eight in 0.3.0's components block and [components.md](components.md). Pulled in by the examples: sticky footer (all five), empty state, list row and section header (four each), checkbox (`content-fill`, `rename-layers`), icon button (`a11y-contrast`, `variables-sync`), inline notice (`a11y-contrast`); textarea by none, shipped anyway | **Done** |
| 4 | Stretch: number field, colour swatch + hex field, radio, tooltip (`aria-describedby`, `:focus-visible`), tabs, menu (first stateful) | All six in 0.3.0. Used by the examples: number field (`rename-layers`), colour field (`variables-sync`), radio (`export-selection`), tooltip (`a11y-contrast`, `variables-sync`); tabs and menu only in the gallery and the e2e fixture | **Done** |
| 4 | *Done when:* each appears in `preview.html` in all states | `e2e/preview.spec.mjs`, "every gallery component is present in all six states": 25 gallery rows at 0.3.0, 14 of them Phase 2 components (27 at 0.4.0, with the dialog and the toast) | In the browser: **Done**. A look inside Figma: **Pending (human or Figma app)** ([components table](#components-in-the-figma-app)) |
| 5 | Chrome v2: the handle becomes a `<button>` | A `<button type="button">` since 0.2.0 | **Done** |
| 5 | With an `aria-describedby` hint | `#kit-resize-hint`, added to the handle's `aria-describedby` at startup; `e2e/chrome-v2.spec.mjs`, "aria-describedby points at #kit-resize-hint; one polite [data-kit-announce]; both visually hidden and outside the fit" | **Done** |
| 5 | One `aria-live` announcement debounced 150 ms after the last keystroke | `[data-kit-announce]`, `aria-live="polite"`; `e2e/chrome-v2.spec.mjs`, "a burst of keys is announced once, 150 ms after the last key, with the size it ends at" and three more | **Done** in the browser. Heard with a screen reader: **Pending (human or Figma app)** ([screen readers](#screen-readers)) |
| 5 | Home/End | Home since 0.2.0, End in 0.3.0; `e2e/chrome-v2.spec.mjs`, "End takes the widest snap, keeps the height in resizable, and does not repeat" | **Done** |
| 5 | A `kit:fit` request | `KitWindow.fit()` in `code.ts`, `kit.fit()` in the UI ([window-chrome.md](window-chrome.md#fit-on-request-kitfit-and-kitwindowfit)); the five "kit:fit from the main thread" tests in `e2e/chrome-v2.spec.mjs` | **Done** |
| 5 | *Done when:* axe is clean | 27 axe runs pass at 0.3.0 (31 at 0.4.0) with the handle, its hint and its live region in the page (the kit fixture's and your `ui.html`'s windows in three themes, each example in its themes) | In Chromium: **Done**. Real assistive technology: **Pending (human or Figma app)** |
| 5 | *Done when:* every mode has a demo | `fit-content`: the starter, `rename-layers`, `a11y-contrast`; `resizable`: `export-selection`, `variables-sync`; `fixed`: `content-fill`; the preview's mode switch forces any mode on any plugin | In the browser: **Done**. The same in Figma: **Pending (human or Figma app)** ([examples matrix](#the-examples)) |

### Volunteer gate (item 3)

Two new volunteers, not the people from the designer gate, with the Figma desktop app and an agent, a fresh clone, the README as the only instructions. The target is a running plugin in under 30 minutes. Record where each one stops, even if they finish.

| Date | Volunteer (initials) | Tools and versions | Reached a running plugin? | Time (target: under 30 min) | Where they stopped or got stuck |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |

## Phase 3 status

Phase 3 is PLAN.md section 6, items 1-7; the clauses below are its words, split one per row. Last updated 2026-10-14, at kit 0.4.0: the Phase 3 work is committed and tagged `v0.4.0` locally (not pushed). The detail of each item, with the tables the owner fills in (submissions, the PR's response, the watched items' triggers), is in [roadmap-status.md](roadmap-status.md). **Phase 3 is not done:** its repo work is (including the one-shot runs on the 0.4.0 agent context, the "Tag" row); items 1 and 2 are outward actions, 4 to 6 wait for triggers that haven't fired, and 7 depends on everything else.

Evidence numbers come from runs on 2026-10-14 on the working tree (Node 24.13.0, macOS):

- `npm run check`: exit 0. `build-examples: 5 of 5 example(s) compiled`; `audit: no problems in 6 plugin folders`; `check-ui: no type errors in 6 plugin folders`; `npm test`: 475 tests, 475 passed, 0 failed, 0 skipped (373 in `test/`, of them 234 in `test/audit.test.mjs`, 5 in `test/budget.test.mjs` and 1 in `test/version.test.mjs`; 102 golden tests in the examples: `a11y-contrast` 38, `content-fill` 20, `export-selection` 11, `rename-layers` 17, `variables-sync` 16). Every `code.js` is byte for byte what `npm run build` and `npm run build:examples` write.
- `npm run test:e2e` (Playwright 1.62.1, Chromium 151.0.7922.34, on a port of its own, `KIT_PREVIEW_PORT=4790`): 175 tests, 165 passed, 10 skipped (the docs screenshots and the listing images, which run only on request), in two full runs in a row, and 328 passed, 20 skipped with `--repeat-each=2`, with no failure or retry. Of them, `e2e/dialog.spec.mjs` 16, `e2e/toast.spec.mjs` 16, `e2e/menu.spec.mjs` 12, `e2e/chrome-v2.spec.mjs` 15, `e2e/components.spec.mjs` 6 (the tooltip's Escape among them), `e2e/preview.spec.mjs` 22, and 31 tests that run axe. An earlier run the same day failed once in `e2e/dialog.spec.mjs`'s listener test, a timing race in the test (it read the dialog's listeners before the asynchronous `close` event had removed the runtime's one-time listener); the test now waits for that event.
- With `examples/` deleted (a copy of the working tree): `npm run check` exit 0 (`audit: no problems in 1 plugin folder`, 363 unit tests passed) and `npm run test:e2e` 135 passed, 16 skipped, 0 failed; the examples' tests skip with a reason.
- Nothing has run on GitHub: this copy of the repo has no git remote.

| # | Clause (PLAN.md section 6) | In the repo (evidence) | Status |
|---|---|---|---|
| 1 | Publish two archetypes to Community | The two are `rename-layers` and `a11y-contrast`. Listing copy for both in [community-listing.md](community-listing.md#the-two-archetypes-built-with-figplug) (name, tagline, description, data-security answers, the manifest changes before publishing, the owner's checklist); an icon (128 × 128) and covers (1920 × 1080, light and dark) for each in `docs/listing/<name>/`, rendered in the browser preview by `e2e/listing-assets.spec.mjs` (`UPDATE_LISTING=1`), not captured in Figma | Prepared: **Done**. Both examples run in the Figma desktop app first ([examples matrix](#the-examples)): **Pending (human or Figma app)**. Submitting them: **Pending (outward action)** (action 7) |
| 1 | "Built with Figplug" in the description | Both descriptions end with "Built with Figplug UI Kit" and the repo URL, then a line saying the plugin is not affiliated with Figma. "Figplug" contains "Fig", which the brand guidelines ask products to avoid: if review objects, the line takes the fallback name (action 6) | In the copy: **Done** |
| 1 | *Done when:* both are live | The table in [roadmap-status.md](roadmap-status.md#1-two-archetypes-on-community), empty | **Pending (outward action)** |
| 2 | `figma/plugin-samples` PR: a `themeColors` + resizable-window sample | [`contrib/plugin-samples/themed-resizable-window/`](../contrib/plugin-samples/themed-resizable-window/): `themeColors: true`, `--figma-color-*` only, a resize handle with pointer capture, Escape and arrow keys, the size clamped in `code.ts` and saved with `figma.clientStorage`; `documentAccess: "dynamic-page"`, `networkAccess` none; no kit names. `npx tsc -p contrib/plugin-samples/themed-resizable-window` compiles it to the committed `code.js` byte for byte (2026-10-14), and CI's build step runs the same command and fails on a difference (not yet run on GitHub). The PR's title, body, test steps and the owner's checklist: `contrib/plugin-samples/PR.md` | In the repo: **Done**. Run in Figma (the checklist's first step): **Pending (human or Figma app)** |
| 2 | *Done when:* opened | Not opened | **Pending (outward action)** (action 8) |
| 2 | *Done when:* response recorded | The table in [roadmap-status.md](roadmap-status.md#2-figmaplugin-samples-pr), empty; record it 30 days after opening, reply or not | **Pending (outward action)** |
| 3 | Dialog and toast: `<dialog>` with focus return | `dialog.kit-dialog` opened with `showModal()`; `e2e/dialog.spec.mjs`, "an opener opens it as a modal in the top layer: the body's first field has focus, Escape closes it with `""` and focus returns to the opener", and the nested-dialog test (focus goes back step by step) | In the browser: **Done** |
| 3 | Toast queue | `kit.toast()`; `e2e/toast.spec.mjs`, "the queue: first in, first out, one shown at a time, each for its own duration; 0 stays until dismissed" | In the browser: **Done** |
| 3 | Under 100 lines each | The runtime's dialog section is 33 lines and the toast's 73 (from the `// ---- Dialogs` and `// ---- Toasts` markers to the next section), JSDoc included; CSS 742 and 1,166 bytes in their `/* == dialog == */` and `/* == toast == */` sections | **Done** |
| 3 | *Done when:* in `preview.html` | Dialog and Toast gallery rows in all six states, a row of toast tones, a live dialog and live toasts; `e2e/preview.spec.mjs`, "every gallery component is present in all six states" (27 rows), and the "gallery demo" tests in both specs | **Done** |
| 3 | *Done when:* Playwright-covered | `e2e/dialog.spec.mjs` (16 tests) and `e2e/toast.spec.mjs` (15): behaviour, keys, focus (focus return after a toast, a dialog opened from a menu item), semantics, stale `close` events, nested dialogs, no popover API, listener counts, the measured look, axe with a dialog, a nested dialog and a toast inside a dialog open | **Done** |
| 3 | *Done when:* within budget | `ui.html` 65,387 bytes and 1,032 lines, under 65,536 and 1,600 (`test/budget.test.mjs` passes); the kit blocks 60,878 bytes, within the audit's 60 KB (61,440 bytes). Room left: 149 bytes in the file, 562 in the blocks | **Done** |
| 3 | The same in Figma | [Components in the Figma app](#components-in-the-figma-app) (dialog and toast rows) and [screen readers](#screen-readers) | **Pending (human or Figma app)** |
| 4 | PropsKit bridge (conditional): the week it reaches classic plugins, publish a `fig-*` to kit-class mapping and demo | [propskit.md](propskit.md): the trigger, the sources read on 2026-10-13 (re-read on 2026-10-14 in [roadmap-status.md](roadmap-status.md#4-propskit-bridge)), a draft mapping of the `fig-*` elements to kit markup, the demo plan and the licence caveats | Trigger: **Watched: not triggered**. Draft mapping and plan: **Done**. Publishing the mapping and the demo waits for the trigger |
| 5 | Hosted upload path (watched): the week Figma ships classic-code upload, push one archetype through and record the result | [roadmap-status.md](roadmap-status.md#5-hosted-upload-path): the sources and what they say, the plan (`rename-layers`, as released) and the table to fill | **Watched: not triggered** |
| 6 | Distribution: one CSS-only npm package under the fallback name, only if three issues ask | [roadmap-status.md](roadmap-status.md#6-distribution): 0 of the 3 issues (one issue in the repo, #1, asks for a licence; `gh issue list` on 2026-10-13 and 2026-10-14); the package spec is ready | **Not triggered**. The fallback name it would use is still TBD (action 6) |
| 7 | v1.0: freeze class names | [stability.md](stability.md): every public name (classes, attributes, tokens, `CONFIG` keys, `window.kit`, messages, storage, the main-thread API, types, npm scripts, audit rule ids) with the release that added it, what 1.0 freezes and the change policy | The list: **Done**. The freeze itself happens at 1.0: **Not yet** |
| 7 | *Done when:* all Phase 1-2 done-whens green | The [Phase 1](#phase-1-status) and [Phase 2](#phase-2-status) tables: the repo half of each is Done; the designer and volunteer gates, the runs in Figma and CI on GitHub are not | **Not met**: **Pending (human or Figma app)** and **Pending (outward action)** |
| 7 | *Done when:* one-shot 4/5 | Automated one-shot 5 of 5 at 0.2.0 and at 0.3.0, agent-only ([prompts.md](prompts.md#one-shot-log)); none at 0.4.0 yet (the row below). Check 4, the import into Figma and the task done there, has not been run for any row | **Not met**: **Pending (human or Figma app)** |
| Tag | The one-shot run [CONTRIBUTING.md](../CONTRIBUTING.md) (rule 7) asks for after a change to `AGENTS.md`, a skill or a prompt | Five runs on 2026-10-14 in fresh clones of the Phase 3 commit (with `examples/` removed so the curated answers can't leak), all passing checks 1-3, the unit tests and e2e; every plugin shows its results with `kit.toast()`; one kit issue found and fixed (a toast covering a sticky footer). Rows in the [one-shot log](prompts.md#one-shot-log). Tagged `v0.4.0` locally | Done (check 4 in Figma: **Pending (human or Figma app)**) |
| 7 | *Done when:* two consecutive releases without renames | 0.3.0 and 0.4.0 add names and rename none (their CHANGELOG sections, "No renames"; [stability.md](stability.md#change-policy)). `v0.3.0` is a local tag; 0.4.0 has no commit or tag yet; nothing is pushed | In the files: **Done**. As released versions: **Pending (outward action)** (action 5) |

## Success metrics (PLAN.md section 9)

PLAN.md section 9 sets the metrics the project tracks per release. This table says where each one is recorded, how to measure it again and where it stands. Measured on 2026-10-14 on the 0.4.0 working tree, except the rows that need the owner's accounts. The gates themselves are above ([designer gate](#designer-gate-item-4)) and in the [one-shot log](prompts.md#one-shot-log).

| Metric (PLAN.md) | How to measure | 0.4.0, on 2026-10-14 | Status |
|---|---|---|---|
| Designer gate per release | The [designer gate](#designer-gate-item-4) table, two rows per release | Not run for any release | **Pending (human or Figma app)** |
| One-shot rate over the pinned prompts (4/5 by the end of Phase 2) | The [one-shot procedure](prompts.md#the-one-shot-procedure), logged in [prompts.md](prompts.md#one-shot-log) | Automated 5 of 5 at 0.2.0 and at 0.3.0; no 0.4.0 runs yet; check 4 (the import into Figma) run for no row | 0.4.0 runs: **Not done** (the "Tag" row of the [Phase 3 table](#phase-3-status)). Full one-shots: **Pending (human or Figma app)** |
| Audit findings 0 | `npm run audit` | `audit: no problems in 6 plugin folders`; all ten logged one-shot runs ended with a clean audit | **Done** |
| Context under 15k tokens | `wc -c AGENTS.md .claude/skills/kit-ui/SKILL.md ui.html`, bytes divided by 4. A rough estimate, not a tokenizer count; code and markup usually take more tokens per byte than prose, so the real number is likely higher. `node --test test/budget.test.mjs` prints the same numbers on every run, fails if `AGENTS.md` and the `kit-ui` skill pass ~15k, and fails if `AGENTS.md` reaches 150 lines (PLAN.md section 4, item 5) | `AGENTS.md` 17,293 bytes (~4.3k), the `kit-ui` skill 9,468 (~2.4k), `ui.html` 65,387 (~16.3k): **~23.0k**. Claude Code also reads `CLAUDE.md` (1,780 bytes, ~0.4k); the `kit-frame-to-markup` skill (13,896 bytes, ~3.5k) loads only for a Figma frame. The fixed instructions alone, `AGENTS.md` and the `kit-ui` skill, are 26,761 bytes, **~6.7k** | **Not met** if the context includes the starter `ui.html` (~23.0k against 15k; `ui.html` alone is over it). Met (~6.7k) if it means the fixed instructions, with `ui.html` as the file the agent works in. **Owner decision: pending**: which of the two PLAN.md means and, for the first, a trim target. For scale: the audit's `budget` warning lets a plugin's ui file reach 128 KB, about 33k by the same estimate |
| Budgets logged as author notes | The "Changed" section of each CHANGELOG release, the "within budget" row of the [Phase 3 table](#phase-3-status), and `test/budget.test.mjs`, which fails a starter over 65,536 bytes or 1,600 lines | Logged for 0.3.0 and 0.4.0 in [CHANGELOG.md](../CHANGELOG.md) | **Done** |
| Adoption: "Built with" Community plugins | A search for "Built with Figplug" on the Figma Community once the two archetypes are live (action 7), plus any other plugin that carries the line | None published yet | **Pending (outward action)** |
| Adoption: release downloads | `gh api repos/alekseikipin/Figplug-ui-kit/releases --jq '.[] \| {tag: .tag_name, downloads: [.assets[] \| {name, download_count}]}'`. GitHub counts downloads only for files uploaded to a release, not for its automatic "Source code" zip, so upload the zip as an asset when publishing (action 5): `git archive --format=zip --prefix=Figplug-ui-kit/ -o Figplug-ui-kit-vX.Y.Z.zip vX.Y.Z`, then `gh release upload vX.Y.Z Figplug-ui-kit-vX.Y.Z.zip` | No release on GitHub (`gh release list` printed none) | **Pending (outward action)** |
| Adoption: repo views and clones | `gh api repos/alekseikipin/Figplug-ui-kit/traffic/views` and `gh api repos/alekseikipin/Figplug-ui-kit/traffic/clones`, from an account with push access. GitHub keeps only the last 14 days, so read them at least every two weeks | Not read: needs the owner's account | **Pending (outward action)** |
| Adoption: non-author issues | `gh issue list -R alekseikipin/Figplug-ui-kit --state all --limit 200 --json number,author --jq '[.[] \| select(.author.login != "alekseikipin")] \| length'` | 1 (#1, "Please add license", 2026-03-31) | **Done** for 2026-10-14; counted again each month |
| A release every 4-6 weeks | The dates in the CHANGELOG headings, set when each tag is pushed | No release is published: 0.2.0, 0.3.0 and 0.4.0 were all built on 2026-10-13 and 2026-10-14, and only the first two are tagged, locally | **Pending (outward action)** (action 5). The 4-6 weeks count from the first published release |

### Adoption log

One row per reading (monthly maintenance, step 7). Views and clones are GitHub's 14-day totals, with the unique count in brackets.

| Date | Views (unique) | Clones (unique) | Release downloads | "Built with" plugins | Non-author issues | Read by |
|---|---|---|---|---|---|---|
| 2026-10-14 | Not read (owner's account) | Not read (owner's account) | No release yet | None published yet | 1 (#1) | Agent, read-only `gh issue list` |

## Pending captures

Steps for the checks that need the Figma desktop app or a designer. None has been run; each ends in a table to fill.

### (a) Side by side with Figma's own panel (item 4)

1. In the Figma desktop app, set Figma to the light theme and open a Design file with a few layers. Select one, so the right sidebar shows the Design panel.
2. Import this repo's `manifest.json` and run **Kit starter** (Plugins > Development). Leave it at the default 320 px width and drag the window next to the right sidebar, both fully visible.
3. Take a screenshot of that region only (on macOS, Cmd+Shift+4 and drag; Retina screens capture at 2x), cropped to the plugin window and the Design panel beside it.
4. Repeat in the dark theme.
5. Save the two images as `docs/img/figma-side-by-side-light.png` and `docs/img/figma-side-by-side-dark.png`.
6. In README.md, show the two images in the Light / Dark table and replace the caption under it ("Rendered by the browser preview ...") with the Figma version and date of the capture, for example "Captured in Figma desktop VERSION on YYYY-MM-DD, next to Figma's own Design panel." Keep `starter-light.png` and `starter-dark.png` for the browser preview.
7. Fill in the table and mark item 4's screenshot as done in the status table.

| Date | Figma version | Theme | File | Notes |
|---|---|---|---|---|
| | | light | `docs/img/figma-side-by-side-light.png` | |
| | | dark | `docs/img/figma-side-by-side-dark.png` | |

### (b) The official UI3 kit through the Figma MCP (item 6)

1. Signed in to Figma, open the Community file [UI3: Figma's UI Kit](https://www.figma.com/community/file/1486123838948777078/ui3-figmas-ui-kit) and choose **Open in Figma**, which duplicates it into your drafts. The MCP tools only open files with a `/design/` link, so the Community link itself does not work.
2. In the duplicate, find the components the kit mirrors: the button (each variant and size), the text input, the select or dropdown, and a property-panel row. Their names in the file may differ; use its pages and the Assets panel. For each, right-click > Copy link to selection.
3. In Claude Code with the Figma MCP server connected, run `get_design_context` on each link (sizes, padding, radius, text styles) and `get_variable_defs` (the colour variables per state); `get_screenshot` helps compare by eye.
4. Fill in the table below. Then, in [tokens.md](tokens.md#measured-metrics), add the file as a source with the date and raise or lower each row's Confidence. Where the file disagrees with a kit token, open an issue with both values before changing it.

| Component and state | Metric | Kit value | UI3 kit file | Agrees? |
|---|---|---|---|---|
| Button | height (large) | 24px (32px) | | |
| Button | horizontal padding (large) | 8px (12px, Medium) | | |
| Button | radius | 5px | | |
| Button | label size / weight | 11px / 450 | | |
| Primary and danger button, hover | fill | `bg-brand-hover`, `bg-danger-hover` (Medium) | | |
| Secondary button, hover | fill | `bg-hover` (Medium) | | |
| Text input | height, padding-left, radius, fill | 24px, 8px, 5px, `bg-secondary` | | |
| Select | height, padding-left, radius, ring | 24px, 8px, 5px, 1px `border` | | |
| Focus ring | width, position | 1px, inset | | |
| Primary button, focus | inner and outer lines | `border-onbrand-strong` + `border-selected-strong` (Medium) | | |
| Body text | size / line height / letter-spacing / weight | 11px / 16px / 0.055px / 450 | | |
| Property row | height, padding left / right | 32px, 16px / 8px | | |

### (c) A designer's comparison with Figma's panels (item 6)

1. A designer runs the starter in the Figma desktop app, as in (a), in light, dark and FigJam. Colours can only be judged there. For the states the starter doesn't show (disabled, selected, loading), open `preview.html` (`npm run preview`): it carries the same kit blocks, so its sizes, spacing and type match, but its colours are the provisional fallback.
2. Compare each component and state with the nearest control in Figma's own UI, for example the property fields and dropdowns in the Design panel and the buttons in Figma's dialogs: height, padding, radius, text size and weight, and the colour of each state (rest, hover, pressed, focus, disabled, error).
3. Log every difference in the table, one metric per row. The comparison passes when every row is fixed in a release or has an issue.

| Date | Designer (initials) | Figma version, theme | Component and state | Metric | Kit | Figma | Issue |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### (d) Listing icon and thumbnail (before outward action 2)

1. **Icon**: a 128 × 128 px PNG with no Figma logo in it ([Using the Figma brand](https://www.figma.com/using-the-figma-brand/)). Save it as `docs/img/listing-icon.png`.
2. **Thumbnail**: a 1920 × 1080 px PNG with the light and dark starter side by side. Use the Figma captures from (a) once they exist; until then `docs/img/starter-light.png` and `starter-dark.png` (browser renders). Save it as `docs/img/listing-thumbnail.png`.
3. In [community-listing.md](community-listing.md#listing-fields), replace "Not made yet" in the Icon and Thumbnail rows with the file names.

## Version bump

Before a release is tagged, every place that names the kit version says the new one. Versions elsewhere are history (the CHANGELOG, the "since" columns in the docs, the one-shot log, the examples' READMEs and agent diffs, the audit fixtures in `test/fixtures/`, which keep the release they were made with) and stay as they are.

- `ui.html`: `<meta name="kit">`, the tokens block's first comment and `KIT_VERSION` in the runtime block (`kit.version`). Then copy the three blocks into `preview.html`, `e2e/fixtures/kit-ui.html` and every `examples/*/ui.html`; `section-drift` and `npm test` list a stale copy. The `<meta name="kit">` of each of those copies sits outside the blocks, so change it too.
- `code.ts`: the `kit:window:start` line, then the block into every `examples/*/code.ts`; `npm run build` and `npm run build:examples` rewrite the `code.js` files.
- `kit.d.ts`: its first line, then the file into every `examples/*/`.
- `package.json` and `package-lock.json`: `npm version X.Y.Z --no-git-tag-version` sets both.
- File headers: `scripts/audit.mjs`, `scripts/check-ui.mjs`, `scripts/serve.mjs`, `scripts/make-fonts-css.mjs`, `tokens.figma-fallback.css` and `playwright.config.mjs`, plus the `vX.Y.Z · protocol 1` line in `preview.html`'s own header.
- Tests that pin it: `kit.version` in `e2e/chrome.spec.mjs`, and the kit headers in `test/audit.test.mjs`.
- `.github/ISSUE_TEMPLATE/bug_report.yml`: the placeholder of the "Kit header" field.
- Docs: the "Kit version" row of the [pinned harness](prompts.md#the-pinned-harness), the `Release:` line of the [surface matrix](#manual-surface-matrix), the version [stability.md](stability.md) calls today's, and a new section in the CHANGELOG.

`test/version.test.mjs` reads the places above, except the tests and the docs, and fails, naming each one, until all of them say `package.json`'s version, so bump `package.json` first and let `npm test` list the rest. It reads the blocks, `code.ts`'s block and `kit.d.ts` at the root only; `section-drift` and `test/blocks.test.mjs` compare the copies with them.

Then look for leftovers of the previous version (here 0.3.0, for the bump to 0.4.0). It should print nothing, and printed nothing on 2026-10-14:

```sh
git grep --untracked -n -I -e 'v0\.3\.0' -e "'0\.3\.0'" -e '"0\.3\.0"' -- . ':!CHANGELOG.md' ':!docs/' ':!examples/*/README.md' ':!examples/*/agent.diff' ':!test/fixtures/'
```

**Also before tagging:** if `AGENTS.md`, `CLAUDE.md`, a skill (`git diff --stat <last tag> -- AGENTS.md CLAUDE.md .claude/` lists them) or a prompt (the [entry prompt](prompts.md#the-entry-prompt) or the [five tasks](prompts.md#the-five-archetype-tasks)) changed since the last tag, the one-shot runs [CONTRIBUTING.md](../CONTRIBUTING.md) asks for are in the [one-shot log](prompts.md#one-shot-log). For 0.4.0 they are (the "Tag" row of the [Phase 3 table](#phase-3-status)).

## Outward actions waiting for the owner

None of these has been done. Each needs the owner's accounts. This copy of the repo has no git remote configured (checked 2026-10-14), so CI and Pages have never run: push the Phase 1 and Phase 2 commits, and the Phase 3 commit once it exists, to the GitHub repo first; actions 3 to 5 and 7 depend on it (the listings and the README links point at the pushed repo). The first CI run is also the first real run of the CI steps added in 0.4.0, such as the rebuild of the `contrib/` sample, which were only simulated locally (the step's script run with `bash -eo pipefail` on a copy of the tree).

Tags on 2026-10-14: `v0.2.0` (annotated, on the Phase 1 commit `ea12fe4`), `v0.3.0` (annotated, on the Phase 2 commit `61e608f`) and `v0.4.0` (annotated, on the commit that logs the 0.4.0 one-shot runs) exist in the local repo only. There is no `v0.2.0-alpha`.

1. **Deprecate both npm packages.** Signed in with `npm login` (add `--otp <code>` to each command if the account uses two-factor authentication):

   ```sh
   npm deprecate figplug-ui-kit@"*" "No longer maintained on npm. Figplug UI Kit lives at https://github.com/alekseikipin/Figplug-ui-kit (download the zip or clone; no package needed)."
   npm deprecate create-figplug-ui-kit@"*" "No longer maintained on npm. Use https://github.com/alekseikipin/Figplug-ui-kit instead (download the zip or clone; no generator needed)."
   npm view figplug-ui-kit deprecated
   npm view create-figplug-ui-kit deprecated
   ```

   The two `npm view` lines should print the messages back.
2. **Republish the Community listing** with the copy and steps in [community-listing.md](community-listing.md#republish-steps-owner-action). Make the icon and thumbnail first ([capture (d)](#d-listing-icon-and-thumbnail-before-outward-action-2)). Record the submission date and the review outcome here.
3. **Enable GitHub Pages.** On GitHub: the repo's **Settings > Pages > Build and deployment > Source: GitHub Actions**. Then **Actions > Pages > Run workflow** on `main` (or push to `main` and wait: Pages deploys only after the CI run for that push has passed) and open the URL the deploy job prints; for this repo it should be https://alekseikipin.github.io/Figplug-ui-kit/ (redirects to `preview.html`).
4. **`v0.2.0-alpha`** (PLAN.md section 10) was never tagged, and `v0.2.0` already exists locally on the same Phase 1 work, so an alpha would only repeat it. Either tag the first Phase 1 commit (`0c0ad84`) as the alpha and push it with a pre-release, or write "skipped" and the reason here:

   ```sh
   git tag -a v0.2.0-alpha 0c0ad84 -m "Figplug UI Kit 0.2.0-alpha"
   git push origin v0.2.0-alpha
   gh release create v0.2.0-alpha --verify-tag --prerelease --title "Figplug UI Kit 0.2.0-alpha" --notes "Pre-release of 0.2.0: runnable, not yet checked in every Figma editor. See docs/release-checklist.md."
   ```

5. **Push the release tags and publish the releases.** The plan's conditions for each: CI green on `main` for that commit, the surface matrix filled for that release (the examples included from 0.3.0, the dialog and toast rows from 0.4.0), and a date in its CHANGELOG heading. The local `v0.2.0` and `v0.3.0` were made before any of these; if a fix lands first, move the tag to the fixed commit (`git tag -f -a v0.3.0 <commit> -m "..."`) before pushing it. Then, for each of `v0.2.0` and `v0.3.0`:

   ```sh
   git push origin v0.2.0
   gh release create v0.2.0 --verify-tag --title "Figplug UI Kit 0.2.0" --notes "See CHANGELOG.md"
   ```

   GitHub attaches the source zip to the release; that zip is what "imports with no terminal" refers to. Kit 0.4.0 (Phase 3) is committed and tagged `v0.4.0` locally, with its one-shot runs logged (the "Tag" row of the [Phase 3 table](#phase-3-status)): push it with the same two commands. The CHANGELOG's compare links (`[0.4.0]`, `[0.3.0]` ...) resolve once the tags are pushed. If a version is never released on its own, write "skipped" and the reason here.
6. **Reserve the fallback name.** Fallback name: TBD. Pick a name without "Fig" in it (Figma's trademark guidelines), check it is free (`npm view <name>` should answer 404; check `https://github.com/<name>` and a Community search), then write it into the README brand line and the marked spot in [community-listing.md](community-listing.md#name), and reserve it where it will be used first (for example a GitHub organisation or repository). Don't publish a placeholder npm package: npm discourages name squatting, and PLAN.md only plans an npm package under the fallback name if three issues ask for one.
7. **Publish the two archetypes** (Phase 3 item 1): `rename-layers` and `a11y-contrast`, each from its own publish folder with an id Figma assigned, with the copy, images and steps in [community-listing.md](community-listing.md#owner-checklist-both-archetypes). Run both in Figma first ([the examples](#the-examples)). Record the dates and outcomes in [roadmap-status.md](roadmap-status.md#1-two-archetypes-on-community).
8. **Open the `figma/plugin-samples` PR** (Phase 3 item 2) as `contrib/plugin-samples/PR.md` describes, after its first checklist step (the sample run in Figma), and record the response 30 days later in [roadmap-status.md](roadmap-status.md#2-figmaplugin-samples-pr).
9. **Answer issue #1** ("Please add license", opened 2026-03-31): `LICENSE` (MIT) is in the repo, so reply and close it once the work is pushed.

## Monthly maintenance

Once a month, and before each release:

1. **Bump Figma's typings** and rebuild:

   ```sh
   npm install -D @figma/plugin-typings@latest
   npm run check
   ```

   New `@deprecated` APIs (struck through in the editor) that throw under `dynamic-page` go into [pitfalls.md](pitfalls.md#5-sync-getters-under-dynamic-page). Keep `typescript` on `~6.0.x` unless a release deliberately moves to 7 ([pitfalls.md](pitfalls.md#12-typescript-6-turned-types-off-by-default)).
2. **Recapture the palette with `tools/probe`.** Import `tools/probe/manifest.json`, run **kit probe** in Figma Design (switch light and dark while it is open) and in FigJam, press **Copy report** ([surfaces.md](surfaces.md#measure-it-yourself)). Paste the reports under Raw reports in surfaces.md, then update `tokens.figma-fallback.css` from the captured `figma-style` text (and its provenance header) and the drift notes in [tokens.md](tokens.md). Until a first capture is recorded, the fallback values stay provisional.
3. **Run `tsc` on every example.** `npm run check` (step 1) already does: it runs `npm run build` for the root and `npm run build:examples` for every `examples/` folder, then the audit and `check:ui` over the root and each example. A failing example names its folder.
4. **Run the browser tests** (`npm run test:e2e`) after the Playwright cache or version changes, and keep `@playwright/test` pinned to an exact version.
5. **Skim Figma's plugin docs and release notes** for changes to `themeColors`, the manifest, `editorType` values and PropsKit for classic plugins; record anything that touches the kit as an issue. A new `editorType` gets the handle off and the default bounds until a kit release adds it: update `kitSurface()` in the `kit:window` block of `code.ts` and the [At a glance](surfaces.md#at-a-glance) table in surfaces.md.
6. **Re-check the Phase 3 watched items**: PropsKit for classic plugins, the hosted upload of classic plugin code, and the count of issues asking for a package ([roadmap-status.md](roadmap-status.md#re-checking-the-watched-items)), and write the date into each item's section there, even when nothing changed.
7. **Log the adoption numbers** in the [adoption log](#adoption-log): repo views and clones (GitHub keeps only the last 14 days, so read them at least every two weeks), release downloads, "Built with" plugins and non-author issues, with the commands in the [success metrics](#success-metrics-planmd-section-9) table.
8. If anything changed, add it to CHANGELOG.md and release. PLAN.md section 9 aims at a release every 4 to 6 weeks.
