# Changelog

All notable changes to the kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/) as far as a set of pasted files can: the names under "Public surface" are the API.

**Renames stop here.** Every breaking rename (message types, storage key, class names, token names) lands in 0.2.0. No public name listed below is renamed or removed before 1.0; later releases only add.

## [Unreleased]

**Published to GitHub.** On 2026-10-14 the repo was pushed to https://github.com/alekseikipin/Figplug-ui-kit (`main` at `84b2ee4`, a merge that joins GitHub's history up to `e0d1acf`, the 2025-09-13 version, with the local one; nothing on GitHub was overwritten), and CI passed there on its first run ([run 38593622113](https://github.com/alekseikipin/Figplug-ui-kit/actions/runs/38593622113)): the build with its `code.js` diff check, the audit, `check:ui`, 498 unit tests, and the browser tests (169 passed, 22 skipped). The tags are not pushed yet, so no release exists and the version links at the end of this file don't resolve ([release checklist](docs/release-checklist.md#outward-actions-waiting-for-the-owner)).

### Added

- **The README shows the kit at work.** Animations recorded in the kit's browser preview (`preview.html`'s stand-in for Figma, in Chromium), each in light and dark and captioned on every frame as not Figma: `docs/media/hero-*.gif`, `window-*.gif`, `components-*.gif` and `examples-*.gif`. Also `docs/media/components-sheet-*.png` (the 20 components at a glance) and three animated illustrations, `agent.svg`, `audit.svg` and `how-it-works.svg`, each with a `-narrow.svg` for phones. The real Figma evidence is still the captures in `docs/img/figma-*.png`, now also joined into `docs/img/figma-side-by-side-*.png` (cropped, not edited).
- **`e2e/readme-media.spec.mjs`** remakes the GIFs, the components sheet and the side-by-side images: `UPDATE_MEDIA=1 npx playwright test e2e/readme-media.spec.mjs` (needs ffmpeg). Without `UPDATE_MEDIA` it is skipped. The SVGs come from `tools/readme-svg/` (`node tools/readme-svg/build.mjs`, no dependencies).
- **`test/docs-links.test.mjs`** also checks the `src`, `srcset` and `href` attributes of the HTML in the Markdown files, and that an `.svg#id` link names an id the SVG has.
- **`test/version.test.mjs`** also reads the README's "kit" badge and the version in its Status section, which joined the [version bump](docs/release-checklist.md#version-bump) list.
- **The kit tour, [`examples/kit-tour`](examples/kit-tour/README.md)**: the demo the kit's own Community listing (**Figplug**, plugin 1545605168743471916) will run in its next version, in place of the 2025 version. Built by hand, not a one-shot run. Three CSS-only tabs in a `fit-content` window (360 wide, at most 720 tall) that refits to each tab: **Components** (all 20 components working, overlays near the top, with an Undo toast that has `duration: 0` and goes when another toast shows or the tab changes), **Create** (the starter's demo, in a sticky footer) and **Window** (the three modes, the live size, a line of content that grows the window, the handle's keys; in Buzz, a note that Figma sizes the panel). A held Enter acts once, focus never hides under the sticky tab bar, and only what changes is a live region. Its kit blocks, `kit.d.ts` and `tsconfig.json` are byte copies of the root's. Covered by 13 unit tests (`examples/kit-tour/example.test.mjs`, the main thread, including a viewport, selection or zoom that throws) and in `e2e/examples.spec.mjs` by the 5 tests every example gets and a describe of its own (13 more); it is in `preview.html`'s Plugin picker. It has not run in the Figma app yet ([release checklist](docs/release-checklist.md#the-examples)).

### Fixed

- **Plugin UIs run in quirks mode in Figma, and now the preview does too.** Figma writes its own `<script>` and `<style>` tags ahead of the plugin's HTML, so `<!doctype html>` is ignored and `document.compatMode` is `BackCompat` (measured in Figma desktop 126.9.13; [docs/surfaces.md](docs/surfaces.md#in-every-editor)). Two kit fixes follow. The base rule now gives `table` `font: inherit`: the kit tour's keys table drew its text at 16px in Figma. The menu measures the viewport on `document.scrollingElement`, because in quirks mode `document.documentElement.clientHeight` is the page's height, which could flip a menu or let it run off a short or scrolled window. `preview.html` now loads the plugin from a `data:` URL with its host tags first, as Figma does. A `srcdoc` frame is always in standards mode, so the tests had never seen quirks mode. `e2e/preview.spec.mjs` and `e2e/examples.spec.mjs` check that the frame is in quirks mode and that the keys table inherits the body size.
- **`tools/probe` records what Figma injects:** `compatMode`, the doctype, the first tags in `<head>`, the host script's text, a summary of every injected `@font-face`, and canvas widths of Inter at 400 to 600. Measured: Figma's Inter is static 3.10, so weight 450 draws as 500 and 550 as 600 ([docs/tokens.md](docs/tokens.md#kit-tokens)).

### Changed

- **The kit's own Community listing runs the kit tour** ([docs/community-listing.md](docs/community-listing.md#the-kits-own-listing)): the published name **Figplug** stays (the trademark note and the fallback name stay too), and so do the owner's illustrated icon and cover and the support email already on the listing. New: the tagline and description for the tour, a "What's new in version 3" note for Figma's version notes field, a carousel to capture in the Figma app (replacing the 2025 demo video), and republish steps from a publish folder outside the repo whose manifest has the published id and the name `Figplug`. The release checklist's capture (d) is now the carousel, its action 2 the republish, and its examples matrix, components table and screen-reader table point at the tour; [roadmap-status.md](docs/roadmap-status.md#3-dialog-and-toast) names the tour as the place to check the dialog and toast in Figma.
- **Six examples.** The README's examples section is now five archetypes from one-shot runs plus the kit tour, and [docs/index.md](docs/index.md#examples) and [docs/surfaces.md](docs/surfaces.md#the-examples) list the tour. In `e2e/examples.spec.mjs` the generic `fit-content` test checks that the sample selection changes the height only for the examples whose content grows with it (`a11y-contrast`, `rename-layers`), and `e2e/preview.spec.mjs`'s narrowest-width test includes the tour.
- **Pages deploys only once it is enabled.** `.github/workflows/pages.yml` skips the deploy after CI until the repository variable `PAGES_ENABLED` is `true`, instead of failing on a site that isn't there ([release checklist](docs/release-checklist.md#outward-actions-waiting-for-the-owner), action 3).

## [0.4.0] - Unreleased

The date is set when the `v0.4.0` tag is pushed (pending, like those of `v0.2.0` and `v0.3.0`, which are tagged in the local repo but not pushed; see [docs/release-checklist.md](docs/release-checklist.md#outward-actions-waiting-for-the-owner)). Phase 3 of [PLAN.md](PLAN.md#6-phase-3--later-months-5-7): the last two of the 20 components, the dialog and the toast (stateful components #2 and #3), a size budget that measures the kit instead of your plugin, a sample for `figma/plugin-samples`, and the pages that track the rest of the roadmap and list the names 1.0 will freeze. What Phase 3 leaves to the owner or the Figma app (the two Community listings, opening the plugin-samples pull request, the watched items) is recorded as pending in [docs/roadmap-status.md](docs/roadmap-status.md). The first run in the real Figma app is the "Verified in Figma" paragraph below; what it found is fixed in this release, which keeps its version. The `AGENTS.md` and skill changes below had the one-shot run that [CONTRIBUTING.md](CONTRIBUTING.md) asks for: five runs in fresh clones (with `examples/` removed), all passing the automated checks ([docs/prompts.md](docs/prompts.md#one-shot-log)).

**No renames.** No public name from 0.2.0 or 0.3.0 is renamed or removed, `KIT_PROTOCOL` stays `1` (dialogs and toasts live in the UI; no message was added), and the storage key and record are unchanged, so saved window sizes carry over. Upgrading from 0.3.0 is a re-paste of the kit blocks and `kit.d.ts` ([docs/upgrade.md](docs/upgrade.md#from-030-to-040)). After 0.3.0, this is the second release in a row that only adds, which PLAN.md asks for before 1.0 ([docs/stability.md](docs/stability.md)).

**Verified in Figma.** On 2026-10-14 the kit ran in the Figma desktop app for the first time (126.9.13, macOS), driven by Claude through computer use in the owner's account, in scratch files only; no person has run it yet. Confirmed there: the root `manifest.json` imports from the repo folder and runs with no terminal or build step (the release zip itself was not tested). In Figma Design, with Figma in its light theme, the starter opens hidden and fits, Shift+Right on the handle widens it, a rerun restores the width, and Create makes and selects the shapes; switched to dark while open, it recolours without a reopen, and in both themes it matches Figma's own Design panel beside it (24px fields, 5px radius, the label and heading styles). In the other editors it takes their colours: FigJam light with a purple primary button, and, with Figma dark, Slides orange and Buzz pink in its 280px left panel with no handle (their light themes were not run). All five examples ran their main action in Figma Design (dark) through the starter's manifest, covering the three window modes; parts of each one's check (undo, a multi-layer export, the alias case, Select failing) are still open. Three of the five 0.4.0 one-shot plugins passed check 4 ([docs/prompts.md](docs/prompts.md#one-shot-log)). `tools/probe` measured in Design, FigJam, Slides, Dev Mode and Buzz that assigning `figma.ui.onmessage` does not remove the kit's `figma.ui.on('message')` listener (both fire), that a message posted right after a hidden `showUI` is queued, that the docked Dev Mode and Buzz panels ignore `figma.ui.resize`, that a fractional size throws, and that the plugin iframe supports `popover` and `<dialog>`; it also captured all 174 colour tokens ([docs/surfaces.md](docs/surfaces.md)). The run found two problems, both fixed below: the window could be visible before its page had painted, and the preview palette differed from the live one. The captured palette also put the toast's success and danger icons below 3:1 in Design dark, fixed below too (computed on the captured values; no toast has been looked at in Figma yet). None of the fixes has been re-run in Figma. Not exercised in Figma, so still pending: pointer drags, the native colour picker, the menu, tooltips, the dialog and the toast, screen readers, Windows and forced colours, the browser client, and the examples in the other editors and in light ([docs/release-checklist.md](docs/release-checklist.md#manual-surface-matrix)).

### Public surface added

Everything listed under 0.2.0 and 0.3.0 still holds; these names join it. Every public name, with the release that added it, is in [docs/stability.md](docs/stability.md#the-public-surface-today).

**CSS classes** ([docs/components.md](docs/components.md#dialog)):

- Dialog: `kit-dialog` with `kit-dialog-header`, `kit-dialog-body` and `kit-dialog-footer`; the sizes `kit-dialog-small` (288px) and `kit-dialog-large` (448px), 352px without either.
- Toast: `kit-toast-region`, `kit-toast`, `kit-toast-text`. The runtime builds them: they are public so your CSS and tests can find them, not markup to write.

**Attributes.** `data-kit-dialog-open="ID"` on any element whose click opens the dialog with that id; `data-kit-dialog-close` on a button inside a dialog, whose `value` attribute becomes the dialog's return value; `data-kit-dialog-light-dismiss` on a dialog that a click on the backdrop may close; `data-kit-tone` on a `.kit-toast`, set by the runtime from the `tone` option; `data-kit-tooltip-dismissed` on a `.kit-tooltip-host`, set and cleared by the runtime while Escape keeps its tooltip hidden (never write it yourself).

**UI API.** `window.kit.version` is `'0.4.0'`. New: `kit.dialog(idOrElement)` opens a `<dialog class="kit-dialog">` with `showModal()` and returns a `Promise<string>` of its return value (`''` after Escape, the close button or a light-dismiss click); it rejects with a `TypeError` when there is no such `<dialog>`. `kit.toast(message, { tone, duration, action })` queues a toast and returns `{ dismiss() }`.

**CONFIG override.** `strings.dismiss` (default `'Dismiss'`), the name of every toast's close button; like the other strings it must not be blank ([docs/window-chrome.md](docs/window-chrome.md#customising-config)).

**Types** (global, in `kit.d.ts`): `KitToastOptions`, `KitToastHandle`, `KitDialogLike` (the DOM-free part of a `<dialog>` that `kit.dialog()` accepts, so `kit.d.ts` still compiles in `code.ts`), and the `dialog()` and `toast()` members of `KitUiApi`. An object of your own typed `KitUiApi`, such as a test stub, now needs both members.

**Tokens.** None added. The kit's blocks reference two more of Figma's colour tokens, `--figma-color-icon-oninverse` and `--figma-color-bg-success` (both for the toast's icons), for 60 of the 174.

**Owned by the runtime.** The toast region, created at the first `kit.toast()` at the end of `<body>` (inside the open modal dialog while there is one); don't create or move it yourself.

### Added

- **Dialog**, stateful component #2 ([docs/components.md](docs/components.md#dialog)): `dialog.kit-dialog[aria-labelledby]` with a 40px header (its `<h2>` and a close icon button), a body and a footer of buttons. Openers are `data-kit-dialog-open` or `kit.dialog()`; `[data-kit-dialog-close]` buttons close it with their `value`. Both act after your own click handlers, so `event.preventDefault()` in one cancels the opening or keeps the dialog open. The browser's `showModal()` puts it in the top layer, makes the page behind inert (Tab never reaches it, though past the dialog's last control focus can leave the plugin's frame for Figma's own UI, as from any iframe), closes it on Escape (`''`) and returns focus to the opener. First focus goes to `[autofocus]`, else to the first body element that takes focus (hidden ones are passed over; links and `tabindex` count), else to the close button. A promise settles only once its dialog has closed, so a `close` event still queued from an earlier close never settles a dialog that was opened again in the same task. Opened from a menu item's click handler, the dialog closes the menu first, so focus goes back to the menu's button when the dialog closes. Backdrop clicks are ignored unless the dialog has `data-kit-dialog-light-dismiss`; dialogs opened from a dialog stack. The look is UI3's: radius 13px, `--kit-shadow-dialog`, a `--kit-scrim` backdrop, 16px body padding. A dialog taller than the window scrolls inside itself with its header and footer in view; the window is not resized for it. 33 lines of runtime, under the 100 PLAN.md allows.
- **Toast**, stateful component #3 ([docs/components.md](docs/components.md#toast)): `kit.toast()` with a first-in, first-out queue that shows one toast at a time; `duration` in milliseconds (default 4000, `0` until dismissed), paused under the pointer and while focus is inside; dismissed by its close button, by Escape while focus is inside it, by its one optional action (whose `onClick` runs first) or by `dismiss()`, which also takes a queued toast out and is safe to call twice; when focus was inside the toast, it goes back to where it came from. It lives in a `div.kit-toast-region` with `aria-live="polite"`, made at the first toast and fixed at the bottom centre above the resize handle, at most the window width minus 16px (minus 64px while the window chrome is on, so a wide toast stays clear of the handle); a `danger` toast has `role="alert"`; while a modal dialog is open the region moves into it (into the top one when dialogs are nested), and back out when it closes. With a [sticky footer](docs/components.md#sticky-footer) on the page the region sits 48px up instead of 8px, so a toast never covers the footer's buttons (found by a 0.4.0 one-shot run; `e2e/toast.spec.mjs`). `bg-inverse` and `text-oninverse` like the tooltip, and a tone icon that keeps 3:1 on that surface in every captured palette: `icon-oninverse` for `info` and `warning`, and the solid fills `bg-success` and `bg-danger` for `success` and `danger` ([docs/accessibility.md](docs/accessibility.md#toast-icons-on-the-inverse-surface)). It slides in over 200ms, and not at all under `prefers-reduced-motion: reduce`. 73 lines of runtime.
- **Escape dismisses tooltips** (WCAG 1.4.13 "dismissible", a known gap in 0.3.0): it hides every tooltip shown by hover or keyboard focus until both the pointer and focus have left its host, without moving focus and without taking the key, so your own Escape handlers still run and a dialog around the tooltip still closes. The workaround script that 0.3.0's accessibility page suggested is no longer needed ([docs/components.md](docs/components.md#tooltip), [docs/accessibility.md](docs/accessibility.md#tooltip)).
- Contrast report rows for every Phase 2 and Phase 3 part (tabs, the number prefix, checkboxes and radios, selected icon buttons and list rows, notices, the tooltip and the toast), 39 rows in all ([docs/accessibility.md](docs/accessibility.md#measured-ratios)).
- Neither the dialog nor the toast adds a listener to `document`, `window` or the handle: dialog openers and close buttons run in the menu's capture `click` listener, tooltip Escape in its capture `keydown` listener, and each toast's own listeners, like the two a dismissed tooltip's host gets, leave with it (one `AbortController` each). The listeners at startup are the same as in 0.3.0 ([docs/window-chrome.md](docs/window-chrome.md#implementation-notes)). In a browser without the popover API the runtime adds only those two capture listeners (two instead of five), so dialog openers, close buttons, `kit.dialog()` and tooltip Escape still work there; only menus need popovers ([docs/accessibility.md](docs/accessibility.md#known-gaps)).
- `preview.html`: Dialog and Toast rows in all six states, a row of toast tones, and a live dialog and live toasts run by the page's own runtime block.
- Browser tests: `e2e/dialog.spec.mjs` (16 tests) and `e2e/toast.spec.mjs` (16), with axe runs on an open dialog, a nested one and a toast inside an open dialog; `e2e/components.spec.mjs` checks the tooltip's Escape (for hover, for focus, and inside a dialog); `e2e/preview.spec.mjs` checks the two new gallery rows (27 in all) and that every interactive control in the gallery's default cells has a size and is on top at its centre. The suite now has 179 tests, of which 10 (the docs screenshots and the listing images) run only on request, so 169 run by default (175 and 165 at the `v0.4.0` tag; the fixes after the Figma run below added three to `e2e/chrome.spec.mjs` and one to `e2e/preview.spec.mjs`).
- Community listings for two archetypes, `rename-layers` ("Rename in Order") and `a11y-contrast` ("Text Contrast Check"), each description ending with "Built with Figplug UI Kit", in [docs/community-listing.md](docs/community-listing.md#the-two-archetypes-built-with-figplug), with an icon (128 × 128) and covers (1920 × 1080, light and dark) for each in `docs/listing/<name>/`. The images are browser renders of the real examples in the preview's fake host, made by `e2e/listing-assets.spec.mjs` with `UPDATE_LISTING=1`, not Figma captures. Publishing them is the owner's outward action.
- `test/budget.test.mjs`: the kit's own budget. The starter `ui.html` (kit blocks and the Create-shapes demo) stays under 65,536 bytes and 1,600 lines, skipped once the demo is replaced, and the three blocks stay within the audit's 60 KB. It also prints PLAN.md's context metric on every run (`AGENTS.md`, the `kit-ui` skill and `ui.html`, in bytes and in tokens estimated at four bytes each), fails if `AGENTS.md` and the skill pass about 15k tokens, and fails if `AGENTS.md` reaches 150 lines ([docs/release-checklist.md](docs/release-checklist.md#success-metrics-planmd-section-9)).
- `test/version.test.mjs`: every place outside the docs and the history that names the kit version (the `ui.html` copies' `<meta name="kit">`, the blocks' version strings, `code.ts`, `kit.d.ts`, the lock file, the script headers, the bug-report form) says `package.json`'s version, so a bump can't miss one ([docs/release-checklist.md](docs/release-checklist.md#version-bump)).
- `contrib/plugin-samples/themed-resizable-window/`: a standalone sample in the style of `figma/plugin-samples` (`themeColors: true`, a window resizable by pointer and keyboard, its size saved with `figma.clientStorage`; no kit names), with the pull request's title, body and checklist in `contrib/plugin-samples/PR.md`, and `contrib/README.md`. The kit's npm scripts don't build or check `contrib/`, but CI's build step compiles every `contrib/*/*/` folder with a `tsconfig.json` and fails if a committed `code.js` differs, and `test/workflows.test.mjs` fails when a folder with a `code.ts` is one that step doesn't build (CI first ran on GitHub on 2026-10-14, and passed); opening the PR is the owner's outward action.
- The results of the first run in Figma (desktop 126.9.13, 2026-10-14): [docs/surfaces.md](docs/surfaces.md) records what `tools/probe` measured in each editor (theme class, brand colour, window and panel sizes, `figma.ui.resize` limits, message coexistence and queuing, storage, document access, the iframe's features) and how the starter and the examples behaved, with the five raw reports in `tools/probe/reports/2026-10-14/`; [docs/tokens.md](docs/tokens.md) and [docs/accessibility.md](docs/accessibility.md) give the measured values; the surface matrix, the examples matrix and the status tables in [docs/release-checklist.md](docs/release-checklist.md#manual-surface-matrix) and the one-shot log's check 4 in [docs/prompts.md](docs/prompts.md#one-shot-log) have their first entries.
- Docs: [propskit.md](docs/propskit.md) (whether PropsKit has reached classic plugins, how to re-check, a draft `fig-*` → kit mapping and the demo plan), [roadmap-status.md](docs/roadmap-status.md) (each Phase 3 item: what is ready, what waits for the owner or a trigger), [stability.md](docs/stability.md) (the public surface by release, what 1.0 freezes, the change policy); the Dialog and Toast sections of [components.md](docs/components.md); dialog and toast rows in [ui3-mapping.md](docs/ui3-mapping.md) and the `kit-frame-to-markup` skill; dialog focus and toast announcements in [accessibility.md](docs/accessibility.md); in `AGENTS.md` and the `kit-ui` skill, the dialog, toast and tooltip markup, `strings.dismiss`, the 20-component list and when to use `kit.toast()` or `figma.notify()`; the [Phase 3 status](docs/release-checklist.md#phase-3-status) table in the release checklist.

### Changed

- **The audit's `budget` rule now measures the kit, not your plugin.** It keeps its id and stays a warning, but no longer fires at 64 KB or 1,600 lines, which a plugin's own code reaches quickly (each example's `ui.html` is 66.5 to 70.9 KB in 0.4.0). It warns when the three `data-kit` blocks together pass 60 KB (a block pasted twice, edited, or holding code of your own) and when the whole ui file passes 128 KB or 3,200 lines, each with its own message; fonts in `data:` URLs count in neither ([docs/pitfalls.md](docs/pitfalls.md#20-the-size-budget)). The 64 KB and 1,600-line limit is now the starter's own, checked by `test/budget.test.mjs`.
- **Compacted kit blocks.** To fit the dialog and toast inside the starter's budget, the components block has one rule per line, and the blocks keep only JSDoc types and one-line pointers into the docs; the rationale is in the "Implementation notes" of [components.md](docs/components.md#implementation-notes) and [window-chrome.md](docs/window-chrome.md#implementation-notes). Every 0.3.0 declaration is still there with its value (one selector now shares its rule with the dialog header through `:is()`), and every 0.3.0 browser test is still in the suite and passes. Apart from the version strings, their only edits follow the gallery (two more rows, 27 in all, and tab panels without `kit-tabpanel`) and let examples be deleted (the next bullet). `ui.html` is 65,383 bytes and 1,032 lines (57,314 and 1,020 in 0.3.0); the kit blocks are 60,874 bytes of it (52,549 in 0.3.0).
- Deleting an example, or all of `examples/`, no longer breaks the preview or the browser tests: the preview's *Plugin* picker leaves out examples the server doesn't have (one expected 404 per missing example in the console), an address naming a missing one runs the starter, and `e2e/examples.spec.mjs` skips a missing example with a reason.
- **Tab panels need no class.** The Tabs docs and the gallery show panels as plain elements after the `.kit-tablist`, without the `kit-tabpanel` class the 0.3.0 docs put on them; the CSS has always picked panels by position, so markup that keeps the class works the same, and `kit-tabpanel` stays a public name ([docs/components.md](docs/components.md#tabs)).
- Version markers say `kit v0.4.0`: `<meta name="kit">`, the tokens block header, the `kit:window:start` line, `kit.d.ts`'s first line and `kit.version`; `package.json` is `0.4.0`, and so is the bug-report form's example kit header. Every place the version appears is listed in [docs/release-checklist.md](docs/release-checklist.md#version-bump).
- **The browser-preview palette is captured from Figma** (from the run in Figma desktop 126.9.13). `tokens.figma-fallback.css` now holds, for Design light, Design dark and FigJam, the 174 values Figma injected into a running plugin (`tools/probe`, 2026-10-14), written as Figma writes them (hex, with alpha, in Design; FigJam mixes 6-digit hex and `rgba()`), instead of the provisional values transcribed from Figma's docs table. 24 light and 45 dark values changed, not counting alpha that only rounds differently (light `bg-pressed` is `#e6e6e6`, not `#f5f5f5`); FigJam's came out identical. Its header records the Slides, Dev Mode and Buzz brand colours, which it doesn't ship as palettes, and how to recapture. Inside Figma nothing changes, since Figma injects its own values; the preview, its renders in `docs/img/` (`gallery-*.png` and `starter-*.png`), the listing covers in `docs/listing/` and the contrast report now use the captured ones ([docs/accessibility.md](docs/accessibility.md#measured-ratios); `test/fallback.test.mjs`). The new ratios showed one problem, fixed below: the toast's success and danger icons.
- **The README's screenshots are Figma captures.** The first screen shows the starter's window next to Figma's own Design panel, captured at the same moment in Figma desktop 126.9.13, light and dark (`docs/img/figma-starter-light.png`, `-dark.png`, `docs/img/figma-panel-light.png`, `-dark.png`), instead of the browser preview's renders, which stay in `docs/img/`.
- **`onmessage-assign` warns only about a second assignment.** The probe showed that `figma.ui.onmessage = ...` leaves the kit's `figma.ui.on('message')` listener in place, in all five editors, so a single assignment (Figma's template style) no longer warns. The rule keeps its id and stays a warning; it now reports each later assignment in `code.ts`, which replaces the handler before it (inferred from the property; the probe cleared it between its assignments, so that part is not measured), and names the line of the first. Clearing the property (`= undefined`, `= null`, `= void 0`, also in parentheses or with `as T`) doesn't count and starts the pairing over, and assignments through a name for `figma.ui` (`const ui = figma.ui`, `const { ui } = figma`) count (`test/audit.test.mjs`, the `onmessage-assign` fixture and cases).

### Fixed

In behaviour and tooling that 0.3.0 shipped with; the test that covers each fix is named after it.

- **Menus without `ToggleEvent.source`** (older engines): a menu opened from its second button sat under the first one, and Escape focused the first. The runtime now remembers the `[popovertarget]` that was clicked ([docs/window-chrome.md](docs/window-chrome.md#implementation-notes); `e2e/menu.spec.mjs`).
- **A fit during a `resizable` drag** (`kit:fit` from main, or `kit.fit()`) is dropped: sent with the pointer still down, it made the window jump to the content height, and the drag's final size then put it back. Fits go on as before during a `fit-content` drag ([docs/window-chrome.md](docs/window-chrome.md#fit-on-request-kitfit-and-kitwindowfit), [docs/messages.md](docs/messages.md#kitfit-main-to-ui); `e2e/chrome-v2.spec.mjs`).
- **Icons in forced colours** (Windows High Contrast): every `.kit-icon` now takes the forced colour of what it sits in. List-row, field and empty-state icons were faint black on a black page, and the toast's tone icons would have vanished ([docs/accessibility.md](docs/accessibility.md#forced-colours-windows-high-contrast); `e2e/components.spec.mjs`, light and dark forced palettes).
- **`preview.html` at its narrowest**: a long window title made the preview window wider than the plugin frame inside it; the title is now cut at the frame's width (`e2e/preview.spec.mjs`, the kit fixture and each example at 240px).
- **`npm run test:e2e` reused any server on its port**, even one serving another checkout, and then failed tests for no reason in the code. `scripts/serve.mjs` now answers a development-only `/__kit-root?id=…` with 200 for the folder it serves and 409 for any other (it exports `rootId()` for the config, and never sends the path), and `playwright.config.mjs` reuses a server only when it serves this checkout. A foreign server on the port stops the run with "port N is in use", which now names `KIT_PREVIEW_PORT`; a `KIT_PREVIEW_PORT` that is not a port number is refused instead of quietly becoming 4173 ([docs/loop.md](docs/loop.md#preview-in-a-browser); `test/serve.test.mjs`).
- **`npm run build:examples` without a local TypeScript** ran a global `tsc` through the shell with the paths unquoted, so an example folder whose name has a space or a quote failed to build, and a `;` in a name could run the rest of it as a command. It now runs `tsc` without a shell on macOS and Linux and quotes the path on Windows, and a missing `tsc` says to run `npm install` (`test/build-examples.test.mjs`).
- **Browser-test flakes:** the routed files in `e2e/helpers.mjs` (and the example manifest in `e2e/listing-assets.spec.mjs`) are answered from disk instead of with `route.fetch()`, which could fail with `ECONNRESET` on a keep-alive socket the server had just closed; the tooltip's hover delay is timed inside the page, not by the test's clock.
- **A window visible before its page had painted** (found in Figma desktop 126.9.13). In FigJam and Slides the starter appeared at its starting size and fitted about 1 s later, and heavier pages, such as the examples, showed a blank window for up to about 1 s: `installKitWindow()`'s 500 ms show cap counted from the call, and loading a page in Figma can take longer. The window now opens hidden in every mode, `fixed` included, and is shown on the UI's first `kit:resize`, 800 ms after `kit:ready` for a UI that asks for no size (longer than the runtime's 500 ms wait for fonts and `kit:init`, so the first fit comes first: with 500 ms the two timers tied, and in the fake host the window sometimes showed at its starting size a moment before it fitted), right after the `kit:init` reply in `fixed` mode, or 3 s after `installKitWindow()` for a page that never sends `kit:ready` (no kit runtime). A `figma.ui.show()` that throws because the plugin closed first is swallowed. Tests now also pin that every size reaching `figma.ui.resize` and `showUI` is whole pixels, at least 70 × 0, which Figma requires (a fractional size throws). Not yet re-run in Figma ([docs/window-chrome.md](docs/window-chrome.md#when-the-window-appears-and-the-fallbacks); `test/code.test.mjs`, the "visibility:" tests and "figma.ui.resize and showUI only ever get whole pixels"; `e2e/chrome.spec.mjs`, "when main shows the window"). The `kit:window` block's comment now says what the probe measured about `figma.ui.onmessage`.
- **Toast icons below 3:1 in Design dark** (found on the palette captured in Figma desktop 126.9.13). The success and danger icons used `icon-success` and `icon-danger`, picked on the docs-table palette; Figma's injected dark values are light tints, which measure 1.75:1 and 1.94:1 on the white toast. They now use the solid fills `bg-success` and `bg-danger`: 4.81:1, 4.13:1 and 4.81:1, and 3.81:1, 4.31:1 and 3.81:1, in Design light, Design dark and FigJam, computed from the captured palette and not yet looked at in Figma ([docs/accessibility.md](docs/accessibility.md#toast-icons-on-the-inverse-surface); the contrast report in `e2e/a11y.spec.mjs`, and `e2e/toast.spec.mjs`, "look").
- **`preview.html`'s `figma` stub** let two things pass that Figma does not. An assigned `figma.ui.onmessage` was never called, so a plugin in Figma's template style, which works next to the kit in Figma, looked dead in the preview with no error; it is now called after the `figma.ui.on('message')` listeners, Figma's order in the probe runs, and `= undefined` removes it. `figma.ui.resize` accepted a fractional size; it now throws Figma's own "Expected integer, received float" (`e2e/preview.spec.mjs`, "an assigned figma.ui.onmessage fires after the on() listeners").
- **`tools/probe`** (development only) hung at its resize step in Figma: its `code.js` de-duplicates messages by type and `seq` (the coexistence test sends one message to several listeners on purpose), and the UI sent no `seq`, so every message after the first of each type was dropped. The UI now numbers every message (both copies, the Dev Mode one too); fixed during the run. After the run it gained an `assignAgain` step, which assigns `figma.ui.onmessage` twice with no clear between, the one coexistence case the run did not measure. A new `tools/probe/README.md` says what the probe measures and lists its runs, with the raw reports in `tools/probe/reports/`.

## [0.3.0] - Unreleased

The date is set when the `v0.3.0` tag is pushed (pending, like `v0.2.0`'s; see [docs/release-checklist.md](docs/release-checklist.md)). Phase 2 of [PLAN.md](PLAN.md#5-phase-2--next-months-3-4): the components the archetypes needed, chrome v2, audit v2, five curated examples and the docs a designer needs from a first plugin to a published one. Nothing here has been run in the real Figma app yet; what that leaves open is marked UNVERIFIED in the docs.

**No renames.** No public name from 0.2.0 is renamed or removed, `KIT_PROTOCOL` stays `1`, and the storage key and record are unchanged, so saved window sizes carry over. Upgrading from 0.2.0 is a re-paste of the kit blocks and `kit.d.ts` ([docs/upgrade.md](docs/upgrade.md#from-020-to-030)).

### Public surface added

Everything listed under 0.2.0 still holds; these names join it.

**CSS classes** ([docs/components.md](docs/components.md)):

- Fields: `kit-textarea`, `kit-number` (with `kit-number-prefix`), `kit-color` (with `kit-color-swatch`), `kit-checkbox`, `kit-radio`.
- Buttons: `kit-icon-button`.
- Content: `kit-section-header`; `kit-list` with `kit-list-row`, `kit-list-row-icon`, `kit-list-row-label`, `kit-list-row-meta`; `kit-empty` with `kit-empty-title`, `kit-empty-text`; `kit-notice` with `kit-notice-text`; `kit-footer` (the sticky footer).
- Switching and overlays: `kit-tabs` with `kit-tablist` and `kit-tab` (CSS-only, up to six panels); `kit-tooltip` with `kit-tooltip-host` and the placements `kit-tooltip-above`, `kit-tooltip-start`, `kit-tooltip-end` (CSS-only); `kit-menu` with `kit-menu-item` and `kit-menu-separator` (the first stateful component: a native popover the runtime places and drives from the keyboard).
- Layout: `kit-scroll`, a region with its own scroll for long lists in a `fit-content` window; its height is `--kit-scroll-max-height` (default 240px).

**Attributes and states.** `data-kit-tone="info|success|warning|danger"` on a notice; `aria-current="true"` (button rows) or `aria-selected="true"` (`role="option"` rows) on a list row; `checked` on checkboxes, radios and tabs, and the `indeterminate` property on a checkbox; `aria-expanded`, kept in sync by the runtime on every button that opens a menu (`popovertarget` + `aria-haspopup="menu"`).

**Tokens.** `--kit-z-tooltip`.

**Messages and types.** Main → UI `kit:fit`, within protocol 1: a 0.2.0 runtime ignores it like any `kit:*` type it doesn't know ([docs/messages.md](docs/messages.md#kitfit-main-to-ui)). `installKitWindow()` now returns `{ mode, chrome, editorType, fit() }`. New global types `KitFitMessage` and `KitWindow.fit()`; `KitMainToUiMessage` is `KitInitMessage | KitFitMessage`.

**UI API.** `window.kit.version` is `'0.3.0'`; `protocol` and `fit()` as before.

**CONFIG override.** Two new keys for translations: `strings.resizeHint` (the handle's description) and `strings.announce` (said after a keyboard resize; `{width}` and `{height}` are filled in). Both must be non-blank strings ([docs/window-chrome.md](docs/window-chrome.md#customising-config)).

**Owned by the runtime.** The id `kit-resize-hint` and the attribute `data-kit-announce` (the hint and the live region it adds at the end of `<body>`); don't use them for anything else.

**Pure helpers** between `/* kit:pure:start */` and `/* kit:pure:end */`: `widestSnap`, `announceText` and `placeMenu` join `clampSize`, `nextSnap` and `sameSize` (tested in `test/pure.test.mjs`; not an API for host code).

**npm scripts.** `build:examples`; `check` now runs it too, and `test` also runs `examples/*/*.test.mjs`.

**Audit rule ids** (13 new; [docs/pitfalls.md](docs/pitfalls.md#audit-rules)): `missing-disabled`, `sync-getter`, `unawaited-async`, `aria-label-override`, `missing-lang`, `missing-describedby`, `orphan-help`, `section-drift`, `budget`, `ses-forbidden`, `top-level-module`, `onmessage-assign`, `js-color-literal`.

### Added

- Fourteen components, each in `preview.html` in every state, in light, dark and FigJam: textarea, checkbox, radio, number field, colour field, icon button, section header, list and row, empty state, inline notice, sticky footer, tabs, tooltip and menu. The menu adds five capture listeners on `document` at startup and none per open ([docs/window-chrome.md](docs/window-chrome.md#gestures-and-keys)).
- `.kit-scroll` for long lists, so a `fit-content` window stays short and its `kit-footer` stays in view.
- Chrome v2: the handle gets a screen-reader hint through `aria-describedby`, one `aria-live` announcement 150 ms after the last resize key (pointer resizes stay silent), End for the widest snap width, and fit on request with `kit:fit` / `KitWindow.fit()` from `code.ts` ([docs/window-chrome.md](docs/window-chrome.md#screen-readers-the-hint-and-the-announcement)).
- Audit v2: the 13 rules above, which cover every failure class in the Phase 1 one-shot log, each with a regression fixture in `test/fixtures/`, plus the five Phase 1 one-shot plugins kept as fixtures. `section-drift` compares the copies of the kit inside one repo (`preview.html` against `ui.html`, each `examples/*` against the root), not your plugin against a release ([docs/upgrade.md](docs/upgrade.md#what-the-checks-compare)).
- Five curated examples in `examples/`, one per archetype and covering all three window modes: `rename-layers` (`fit-content`), `export-selection` (`resizable`), `content-fill` (`fixed`), `variables-sync` (`resizable`) and `a11y-contrast` (`fit-content`). Each began as a one-shot agent run in a fresh clone (automated one-shot rate 5 of 5; the import into Figma is still pending for every run) and ships its README with the prompt, the agent's diff and what curation changed, plus golden tests that fail on the agent's original code ([docs/prompts.md](docs/prompts.md#one-shot-log)).
- `npm run build:examples` (`scripts/build-examples.mjs`) compiles whichever examples exist, separately from `npm run build`, so deleting `examples/` never breaks your plugin's build. CI checks every committed example `code.js` too, and the Pages workflow stages the examples for the preview.
- `preview.html`: a *Plugin* picker (or `?plugin=examples/<name>`) runs any example in its own window mode; the *Window mode* switch works with any `installKitWindow({ ... })` call. Its `figma` stub now has the current page's `on('nodechange')`, `getNodeByIdAsync`, `commitUndo`, text layers whose characters need `figma.loadFontAsync`, `exportAsync`, `figma.mixed`, a small `figma.variables` and sample selections ([docs/loop.md](docs/loop.md#preview-in-a-browser)).
- Docs: [first-plugin.md](docs/first-plugin.md) (a guided first plugin from the starter), [upgrade.md](docs/upgrade.md), [publishing.md](docs/publishing.md) (the Community checklist), [ui3-mapping.md](docs/ui3-mapping.md) (official UI3 kit component to kit class) and the `kit-frame-to-markup` skill (`.claude/skills/kit-frame-to-markup/`, which reads a frame through the Figma MCP server and applies ui3-mapping.md), "Implementation notes" in [components.md](docs/components.md#implementation-notes) and [window-chrome.md](docs/window-chrome.md#implementation-notes); a README section per topic; `CONTRIBUTING.md`; a GitHub bug-report form that asks for the editor, the theme and the kit header.

### Changed

- The tests no longer depend on the starter demo: the kit's browser tests run against a small fixture page (`e2e/fixtures/`) whose kit blocks are byte copies of `ui.html`'s, and the demo's own unit and browser tests skip themselves once the demo is replaced, so `npm run check` and `npm run test:e2e` stay green with your plugin in place.
- The kit blocks keep only short comments, so `ui.html` stays near 56 KB (57,314 bytes) under the 64 KB `budget`; the rationale they held moved to the "Implementation notes" sections of the docs. The kit blocks are about 51.3 KB (52,549 bytes) of that.
- `kit-text-secondary` resets margins, like `kit-help`, so a `<p class="kit-text-secondary">` lines up with other text. Add spacing in your own CSS if you relied on the browser's paragraph margins.
- Version markers say `kit v0.3.0`: `<meta name="kit">`, the tokens block header, the `kit:window:start` line, `kit.d.ts`'s first line and `kit.version`; `package.json` is `0.3.0`.
- `.gitignore` ignores `node_modules` as a file or symlink too, not only as a folder.

## [0.2.0] - Unreleased

The date is set when the `v0.2.0` tag is pushed (pending, see [docs/release-checklist.md](docs/release-checklist.md)). This release turns the 2025 demo into a runnable, installable starter. Upgrading from the 2025 files is a replacement, not a patch: see [Breaking renames](#breaking-renames-from-the-2025-09-13-version).

### Public surface

**Files.** `manifest.json`, `code.ts` and the committed `code.js`, `kit.d.ts`, `ui.html`, `tsconfig.json`, `package.json` + `package-lock.json`, `LICENSE` (MIT); `preview.html` and `tokens.figma-fallback.css` (browser preview only); `scripts/audit.mjs`, `scripts/check-ui.mjs`, `scripts/serve.mjs`, `scripts/make-fonts-css.mjs`; tests in `test/` (`node:test`) and `e2e/` with `playwright.config.mjs`; `.github/workflows/ci.yml` and `pages.yml`; `AGENTS.md`, `CLAUDE.md`, `.claude/skills/kit-ui/`; `docs/`; `tools/probe/` (development-only measuring plugin).

**Marked blocks** (paste unchanged; upgrade by re-pasting all of them from one release):

- `ui.html`, in `<head>`, in this order: `<style data-kit="tokens">`, `<style data-kit="components">`, `<script data-kit="runtime">` (with the pure helpers `clampSize`, `nextSnap`, `sameSize` between `/* kit:pure:start */` and `/* kit:pure:end */`).
- `code.ts`: from `// ==== kit:window:start · ... ====` to `// ==== kit:window:end ====`.
- Version markers: `<meta name="kit" content="kit v0.2.0 · protocol 1 · ...">` and the first comment of the tokens block.

**CSS classes.**

- Layout: `kit-app`, `kit-section`, `kit-divider`, `kit-stack`, `kit-row`, `kit-field`, `kit-label`, `kit-help`, `kit-heading`, `kit-text-secondary`, `kit-visually-hidden`, `kit-icon`, `kit-icon-small`.
- Button: `kit-button` with `kit-button-primary`, `kit-button-secondary`, `kit-button-tertiary`, `kit-button-danger`, and `kit-button-large`.
- Fields: `kit-input`, `kit-input-icon`, `kit-select` (a wrapper around a native `<select>`).
- Window: `kit-resize-handle`.
- States are attributes, not classes: `disabled` / `aria-disabled="true"`, `aria-pressed="true"`, `aria-invalid="true"` with `aria-describedby`, `aria-busy="true"`. The `--kit-button-*` custom properties inside the button rules are private.

**Attributes.** `data-kit-root` (the element the window fits to), `data-kit-resize` (the handle), `data-kit-config` (on a `<script type="application/json">`), and on `<html>`, set by the runtime: `data-kit-chrome="on|off"`, `data-kit-mode="fit-content|resizable|fixed"`.

**Tokens** (in `<style data-kit="tokens">`; colours always come from Figma's `--figma-color-*`):

- Spacing: `--kit-spacer-0-5`, `-1`, `-1-5`, `-2`, `-2-5`, `-3`, `-4`, `-5`, `-6` (2 to 40 px).
- Radius: `--kit-radius-small`, `--kit-radius-medium`, `--kit-radius-large`, `--kit-radius-full`.
- Controls: `--kit-control-height` (24px), `--kit-control-height-large` (32px), `--kit-icon-size`, `--kit-icon-size-small`, `--kit-border-width`, `--kit-focus-width`.
- Type: `--kit-font-family`, `--kit-font-size`, `--kit-line-height`, `--kit-letter-spacing`, `--kit-font-weight`, `--kit-font-weight-strong`, and the `-large`, `-heading` and `-small` sets of `--kit-font-size-*`, `--kit-line-height-*`, `--kit-letter-spacing-*`.
- Motion: `--kit-duration-small`, `--kit-duration-medium`, `--kit-duration-large`, `--kit-easing`.
- Layers: `--kit-z-handle`, `--kit-z-toast`, `--kit-z-menu`.
- Elevation: `--kit-shadow-tooltip`, `--kit-shadow-menu`, `--kit-shadow-dialog`, `--kit-scrim` (the only literal colours in the kit, with dark values under `:root.figma-dark`).

**Messages** (`KIT_PROTOCOL = 1` in both files; types in `kit.d.ts`):

- UI → main: `kit:ready { protocol }`, `kit:resize { width, height, user?, final? }`.
- Main → UI: `kit:init { protocol, mode, chrome, editorType, bounds, size, defaultSize, restored }`.
- Every other `type` is the host's; the kit ignores it.

**Storage.** `figma.clientStorage` key `kit:window`, value `{ v: 1, editorType, width, height }`.

**Main-thread API.** `installKitWindow(options?)` with `html`, `title`, `mode` (`'fit-content'` default, `'resizable'`, `'fixed'`), `size`, `bounds` (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`) and `persist` (default `true`); returns `{ mode, chrome, editorType }`. Unknown options and values of the wrong type are ignored with one `console.warn` naming them. `KIT_PROTOCOL` (the number `1`) is readable from host code. Every other top-level name in the `kit:window` block (`kitIsSizeRecord`, `kitClampSize`, `KIT_STORAGE_KEY`, ...) is internal and may change in any release. Top-level names that start with `kit` or `Kit` plus a capital letter, or with `KIT_`, are reserved for the kit: a later release may add more, so host code must not declare its own (`code.ts` is one script scope: a clashing `const` or `function` fails `tsc`, a clashing `interface` silently merges).

**UI API.** `window.kit`: `version` (`'0.2.0'`), `protocol` (`1`), `fit()`.

**CONFIG override.** `<script type="application/json" data-kit-config>` with any of `snapWidths`, `step`, `bigStep`, `initTimeoutMs`, `fallbackMode`, `strings.resizeLabel`; read once at startup; unknown keys and wrong types or ranges (`step` and `bigStep` are whole numbers of 1 or more, `strings.resizeLabel` is not blank) are ignored with one warning, and text that is not a JSON object is ignored whole with one warning. `CONFIG` in the runtime block itself is never edited.

**Types** (global, in `kit.d.ts`): `KitMode`, `KitSize`, `KitBounds`, `KitSizeRecord`, `KitReadyMessage`, `KitResizeMessage`, `KitUiToMainMessage`, `KitInitMessage`, `KitMainToUiMessage`, `KitWindowOptions`, `KitWindow`, `KitUiApi`.

**npm scripts.** `build`, `watch`, `audit`, `check:ui`, `test`, `test:e2e`, `preview`, `check`.

**Audit rule ids.** `color-literal`, `control-height`, `manifest-fields`, `manifest-document-access`, `manifest-network-access`, `protocol-mismatch`.

### Added

- A runnable folder: `manifest.json` (`"main": "code.js"`, `"documentAccess": "dynamic-page"`, `"networkAccess": { "allowedDomains": ["none"] }`, editors Design, FigJam, Slides and Buzz), committed `code.js`, `package.json`, `tsconfig.json` for TypeScript 6, MIT `LICENSE`.
- Window modes `fit-content` (height follows `[data-kit-root]` through a `ResizeObserver`), `resizable` and `fixed`; per-editor bounds (Dev Mode minimum width 300); the resize handle only in Design, FigJam and Slides.
- The window opens hidden and shows on the first fit (500 ms cap), so it never jumps from the default size.
- Keyboard resizing on the handle (arrows, Shift + arrows, Enter/Space to snap, Home to reset), double-click snapping, Escape to cancel a drag.
- Button tertiary and danger variants, the large size, a leading icon, selected (`aria-pressed`), loading (`aria-busy`) and disabled states; input and select disabled and error states with help text, where the focus ring still shows over the error and disabled rings; `type="search"` inputs without Chromium's own clear button; field, label and help layout.
- Measured UI3 tokens (24px controls, 5px/13px radii, 11px on 16px type, elevation shadows) and a browser fallback palette for all 174 Figma colour tokens.
- `npm run audit`, `npm run check:ui`, unit tests (`npm test`), browser tests (`npm run test:e2e`), the `preview.html` gallery (`npm run preview`), a CI workflow and a GitHub Pages workflow for the preview (Pages must first be enabled by the owner, which is still pending; CI first ran on GitHub on 2026-10-14, and passed; see [docs/release-checklist.md](docs/release-checklist.md)).
- Agent context: `AGENTS.md`, `CLAUDE.md`, the `kit-ui` skill, and docs in `docs/`.
- `tools/probe/`, a development plugin that measures what the docs leave open.
- Window chrome edge cases, each with a browser test: only the pointer that started a drag ends it; the second press of a double-click that drags is not snapped; in `fit-content` mode the height is measured again when a drag ends; fast key presses add up; the first size request uses `kit:init`'s size, so a restore is not undone when Figma resizes the iframe late; replacing the markup or the `[data-kit-root]` element keeps fitting, with no ResizeObserver loop error; the first fit waits for web fonts for at most `CONFIG.initTimeoutMs`; a `kit:init` that arrives after the UI's own 500 ms fallback still ends at the right size.
- Main thread: `fixed` mode ignores `kit:resize`; the saved-size read is capped at 300 ms (a slower read opens at the default size rather than jumping later); a `figma.ui.resize` that throws is caught and warned about once; a second `installKitWindow()` call also drops the first one's pending storage read.
- Checks: `protocol-mismatch` also reports a `code.js` that is older than `code.ts`; `manifest-fields` checks the types of `main`, `ui` and each `editorType` value and warns about a byte-order mark; `color-literal` finds hex after a word (`solid#000`) and entity-encoded `#`; `control-height` also covers `block-size`, `max-height` and rem, pt and `calc()` lengths, and `--kit-control-height` overrides; `check:ui` reports syntax newer than ES2020, fails on a missing folder, ui file or runtime block, and skips `type="module"` scripts with a warning; the preview server answers only requests addressed to this machine (`Host` check) and survives malformed requests; the Pages workflow deploys only after CI has passed on `main`.

### Changed

- Colours follow Figma's theme class (`figma-light` / `figma-dark`), never the operating system: `color-scheme` is no longer `light dark`.
- Controls are 24px (32px large), not 32px; icons use a 24px frame, not 12px; radii are 2/5/13px, not 1/4/6px; body text is 11px on 16px with UI3's letter-spacing.
- Default window 320 × 360 (was 320 × 345); default bounds 240-960 × 120-900 (were 280-900 × 200-800), set only in `code.ts` and sent to the UI.
- Arrow keys move 8px, 32px with Shift (were 16px wide / 12px tall, ×4 with Shift).
- Only sizes the person chose are saved, immediately when a gesture ends and debounced mid-drag; content fits are never saved; `fit-content` remembers the width only; sizes are kept per editor.

### Fixed

- The resize script's undeclared `activePointerId` (it threw under `'use strict'`), listeners that outlived an Escape, a pending frame that overrode the Escape revert, and direct sends that bypassed the dedupe.
- Right-click and second pointers started drags; the 300 ms click guard dropped real drags and a plain click persisted a size.
- `NaN` and non-numbers reached `figma.ui.resize`; the saved size was trusted without checking its shape.
- `body { min-height: 100vh }` stopped the window from shrinking; the height fit measured kit-only selectors and ran once.
- Hover borrowed `border-selected`; an `aria-label` overrode a field's visible label; the handle was a `div` with `role="separator"` and a 20px target; no `lang`; `div` headings and dividers.
- Noisy `console.log` and a `figma.notify` on storage failure in the main thread.
- Repo: stale docs link, off-repo screenshots, a personal line in `.gitignore`, no licence or issues link.

### Removed

- Density presets (`[data-density="compact"]`, `[data-density="comfortable"]`).
- Tokens with no 0.2.0 name (replacements in [Breaking renames](#breaking-renames-from-the-2025-09-13-version)): `--field-bg`, `--field-border`, `--field-text`, `--button-padding-x`, `--input-padding-x`, `--caret-size` and `--resizer-size`, which the 2025 components used, and `--size-7`, which nothing used.
- The `persist-size` message (folded into `kit:resize` with `user: true, final: true`).

### Breaking renames from the 2025-09-13 version

The 2025 files (this repo before 0.2.0, and the npm packages `figplug-ui-kit@1.0.1` and `create-figplug-ui-kit@1.0.0`) don't mix with 0.2.0. Replace all three files, then move your own code and markup across with this table.

| 2025 | 0.2.0 |
|---|---|
| UI → main `{ type: 'ready' }` | `kit:ready { protocol: 1 }` |
| UI → main `{ type: 'resize', width, height }` | `kit:resize { width, height, user?, final? }` |
| UI → main `{ type: 'persist-size', width, height }` | removed: `kit:resize` with `user: true, final: true` saves |
| main → UI `{ type: 'init', hasSavedSize, width, height, persistenceEnabled }` | `kit:init { protocol, mode, chrome, editorType, bounds, size, defaultSize, restored }` |
| storage key `plugin-size`, value `{ width, height }` | `kit:window`, value `{ v: 1, editorType, width, height }` (old saved sizes are not read: each person gets the default size once) |
| `const PERSIST_WINDOW_SIZE = true` | `installKitWindow({ persist })` |
| `MIN_WIDTH` ... `MAX_HEIGHT` in `code.ts`, `MIN_W` ... `MAX_H` in `ui.html` | `installKitWindow({ bounds })`, sent to the UI in `kit:init` |
| top-level `figma.showUI(...)` | `installKitWindow()` calls `showUI` |
| `figma.ui.onmessage = ...` | `figma.ui.on('message', ...)`; host code should use it too |
| `.container` | `.kit-section` |
| `div.divider` | `hr.kit-divider` |
| `.category-label` | `.kit-heading` on an `<h1>`/`<h2>` |
| `.group-label` | `label.kit-label` |
| `.button-group` | `.kit-row` |
| `.component-library`, `.component-section` | removed (demo wrappers) |
| `.button`, `.button-primary`, `.button-secondary` | `.kit-button`, `.kit-button-primary`, `.kit-button-secondary` |
| `.button .icon`, `.icon-right` | `svg.kit-icon` first in the button; `.icon-right` removed (wrap the label in a `<span>`) |
| `.input-field` | `.kit-input` |
| `.input-with-icon` > `.input-icon` | `.kit-input-icon` > `svg.kit-icon` |
| `.dropdown` > `select.dropdown-select` | `.kit-select` > `select` (no class) |
| `div.resize-handle#resizeHandle[role=separator]`, `.resizing` | `button.kit-resize-handle[data-kit-resize]`; `:active` while dragging |
| `--size-1` ... `--size-9` (2-32px) | `--kit-spacer-0-5`, `-1`, `-1-5`, `-2`, `-2-5`, `-3`, `-4`, `-5` (`--size-7`, 20px, removed) |
| `--field-bg`, `--field-border`, `--field-text` | removed: use `var(--figma-color-bg-secondary)`, `var(--figma-color-border)`, `var(--figma-color-text)` directly |
| `--button-padding-x` (8px), `--input-padding-x` (12px) | removed: the button, input and select rules set their own padding; in your own CSS use `--kit-spacer-2` (8px) or `--kit-spacer-2-5` (12px) |
| `--caret-size` (5px, the select caret), `--resizer-size` (20px) | removed: the select chevron and the 24px handle are sized inside the components block; not public |
| `--radius-2`, `--radius-4`, `--radius-6` (1/4/6px) | `--kit-radius-small` (2px), `--kit-radius-medium` (5px) |
| `--control-height` (32px) | `--kit-control-height` (24px), `--kit-control-height-large` (32px) |
| `--border-width`, `--focus-ring-width` | `--kit-border-width`, `--kit-focus-width` |
| `--icon-size` (12px) | `--kit-icon-size` (24px), `--kit-icon-size-small` (16px) |
| `--font-family`, `--font-sm` (11px), `--font-md` (12px) | `--kit-font-family`, `--kit-font-size` (11px), `--kit-font-size-large` (13px) |
| `[data-density]` presets | removed |

All kit names now use neutral prefixes (`kit-*` classes, `--kit-*` tokens, `kit:*` messages, `data-kit-*` attributes), so a rename of the brand never breaks a pasted copy.

## 2025-09-13

First public version: `code.ts` and `ui.html` with four components and the resize script, no manifest or build setup. Published to npm as `figplug-ui-kit@1.0.1` and `create-figplug-ui-kit@1.0.0`; both are to be deprecated in favour of this repo.

[Unreleased]: https://github.com/alekseikipin/Figplug-ui-kit/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/alekseikipin/Figplug-ui-kit/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/alekseikipin/Figplug-ui-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/alekseikipin/Figplug-ui-kit/releases/tag/v0.2.0
