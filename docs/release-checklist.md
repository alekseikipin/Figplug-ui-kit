# Release checklist

What has to be true before a release is tagged, what only a person with the Figma app can check, and what only the owner can do outside the repo. Automated checks (build, audit, check:ui, unit and browser tests) are in the CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)), which has not run on GitHub yet, and run locally with `npm run check` and `npm run test:e2e`; everything on this page is what they can't cover.

Status words used below:

- **Done**: in the repo and checked by running it (the evidence column says how).
- **Pending (human or Figma app)**: needs a person, a designer session or a run in the real Figma desktop app. Nothing here may be marked done from a browser or a test stub.
- **Pending (outward action)**: needs the owner to act outside the repo (npm, GitHub settings, Figma Community, tags).
- **Not met**: a Phase 1 target the repo does not reach; the row says why and what is proposed.

## Manual surface matrix

Run once per release in the Figma desktop app, on a file you can edit. Fill each cell with **pass**, **fail** (with a note below the table) or **n/a**. Record the Figma version (About Figma), the date and who ran it.

Release: `0.2.0` · Figma version: · Date: · Tester:

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
- **Drag / Escape / keys**: dragging the corner grip changes the width (the height keeps following the content); Escape during a drag snaps back; right-click does nothing; double-click snaps 320 → 480 → 640 → 320; with the handle focused (Tab), Left/Right move 8 px, Shift+Left/Right 32 px, Enter and Space snap, Home returns to 320. Where the chrome is off (Dev Mode, Buzz) the handle must be hidden: that is the pass.
- **Reopen restores**: drag to a new width, close, rerun with Cmd+Opt+P: the window opens at that width, with no jump. In another editor it opens at the default width (sizes are per editor). In Dev Mode and Buzz, note whether the panel honours the size at all.
- **Host demo works**: with a count of 3, Create adds 3 shapes in a row at the centre of the view, selects them and zooms to them, and the status line updates; selecting layers updates the "n layers selected" line; a count of 0 or 51 shows the error text and red ring; Close closes the plugin. In Dev Mode, Create shows Figma's error toast and "Nothing created" (Dev Mode is read-only: that is the pass). In Slides and Buzz, note where the shapes land.

**Required for 0.2.0: the probe runs.** On the same surfaces, run `tools/probe` ([steps](surfaces.md#measure-it-yourself)) and fill its two result tables and the raw reports in surfaces.md. Item 3's done-when ("pasted next to a host's own handler, both work") and the Dev Mode and Buzz rows depend on what it measures: whether assigning `figma.ui.onmessage` removes `figma.ui.on('message')` listeners, whether early messages are queued, and whether `figma.ui.resize` applies in docked panels (PLAN.md sections 9 and 10).

## Phase 1 status

Phase 1 is PLAN.md section 3 (the fix-first list), section 4 items 1-7, the P1 rows of section 7 and section 10 (the first-week checklist). Last updated 2026-10-13. The table follows section 4; sections 3, 7 and 10 are checked [below it](#fix-first-list-inventory-and-first-week-plan-sections-3-7-and-10).

| # | Item | In the repo (evidence) | Done when (PLAN.md) | Status |
|---|---|---|---|---|
| 1 | Repo basics and a runnable folder | `LICENSE` (MIT), `package.json`, `manifest.json` (`"main": "code.js"`, `dynamic-page`, `allowedDomains: ["none"]`), the built `code.js` kept in the repo; CI rebuilds it and fails on any diff (simulated locally: clean tree passes, an edit to `code.ts` without a rebuild fails). `CHANGELOG.md` lists the public surface and every rename from 2025. README brand line says "not rsms/figplug" and "Fallback name: TBD". | The zip imports from manifest and runs with no terminal. | Repo work: **Done**. Zip import run: **Pending (human or Figma app)**. `npm deprecate` and reserving the fallback name: **Pending (outward action)**. |
| 2 | Resize script rewrite and modes | `ui.html` runtime: one `requestSize`, a per-drag `AbortController`, the `button`/`isPrimary` guard, `lostpointercapture`, the three modes, the 500 ms fallback, the first fit after `document.fonts.ready`, the grip corner reserved only while the chrome is on. `clampSize`, `nextSnap`, `sameSize` under `node:test` (`test/pure.test.mjs`). `e2e/chrome.spec.mjs` drives the real `ui.html` and `code.js` in `preview.html`'s fake host: drag, Escape mid-drag, right- and middle-click, plain click, double-click, Shift+arrows, Home, reopen with a saved size, `resizable` mode, `fixed` mode, `ui.html` opened with no host, a host that applies resizes late, a main thread that answers after the 500 ms fallback, web fonts that never settle, a bad `data-kit-config`, replaced markup, counting the listeners before and after each gesture; every e2e test fails on any console error or uncaught exception (where a `'use strict'` slip would show). | Drag, Escape mid-drag, right-click, double-click, Shift+arrows and reopen leak zero listeners under `'use strict'`; replacing the demo markup still fits. | Fake frame: **Done** (`npm run test:e2e`: 50 passed, 4 screenshot tests skipped, Chromium 151, 2026-10-13). Replaced markup: **Done** (`e2e/chrome.spec.mjs`, "replacing the markup, or the root itself, still fits": taller and shorter markup, a new `[data-kit-root]` element and no root at all, each fitted with no window error and nothing saved). Same sequences in Figma: **Pending (human or Figma app)** (surface matrix). |
| 3 | Installable `code.ts` | `kit:window` block with `installKitWindow({ bounds, persist, mode, size, title, html })`, `figma.ui.on('message')`, `kitIsSizeRecord`, `KIT_PROTOCOL` sent in `kit:ready` and echoed in `kit:init`, hidden until the first fit (500 ms cap), chrome gated on `editorType`, record `{ v: 1, editorType, width, height }`, Dev Mode min width 300. `kit.d.ts` export-free; `npm run check:ui` checks the runtime's JSDoc mirror. `test/code.test.mjs` runs `code.js` against a `figma` stub, including the kit listener and the demo's host listener side by side. | Pasted next to a host's own handler, both work; Dev Mode and Buzz runs recorded. | Stub test: **Done**. Real Figma run next to a host handler ([paste steps](messages.md#adding-the-kit-to-an-existing-plugin)), and the Dev Mode and Buzz runs: **Pending (human or Figma app)**. The `tools/probe` runs in Design, FigJam, Slides, Dev Mode and Buzz (`onmessage` coexistence, early messages, resize), which this done-when depends on: **Pending (human or Figma app)** ([steps](surfaces.md#measure-it-yourself); the result tables are empty). |
| 4 | README first screen and Community listing | `README.md` first screen: "Is this for you?", brand line, light/dark screenshots, 60-second start, the one prompt, "Your loop", the plain limits. `docs/install.md` (import gotchas), `docs/loop.md`, `docs/community-listing.md` (listing copy). | Two designers with only Figma desktop and Claude Code reach a running plugin; record where each stops. | Copy: **Done**. Designer gate: **Pending (human or Figma app)** (table below). Screenshot side by side with Figma's own panel: **Pending (human or Figma app)** ([capture (a)](#a-side-by-side-with-figmas-own-panel-item-4)). Listing republish: **Pending (outward action)**. |
| 5 | Agent context and a first audit | `AGENTS.md` (under 150 lines), `CLAUDE.md` (`@AGENTS.md` + Claude notes), `.claude/skills/kit-ui/SKILL.md` with `references/` → `docs/`; `scripts/audit.mjs` (zero dependencies; rules `color-literal`, `control-height`, `manifest-fields`, `manifest-document-access`, `manifest-network-access`, `protocol-mismatch`; tests in `test/audit.test.mjs`); the CI workflow runs it; `docs/prompts.md` pins the harness. | One archetype prompt in a fresh clone passes the audit. | Repo work: **Done**. The one-shot run: **Pending (human or Figma app)** (the log in prompts.md is empty). |
| 6 | Native fidelity pass | Tokens and component values measured from Figma's production CSS and two UI3 replicas, with sources and confidence ([tokens.md](tokens.md#measured-metrics)); tokens isolated in `<style data-kit="tokens">`; marked sections; version header with the issues URL; `Inter, system-ui` and the opt-in `scripts/make-fonts-css.mjs`. `preview.html` shows every Phase 1 component in six states (`e2e/preview.spec.mjs` checks it; `docs/img/gallery-light.png`, `gallery-dark.png`). | Every component shows all six states and matches the measured values. | Six-state gallery in the browser: **Done**. Measuring the official UI3 kit file through the Figma MCP ([capture (b)](#b-the-official-ui3-kit-through-the-figma-mcp-item-6)) and a designer's comparison with Figma's own panels ([capture (c)](#c-a-designers-comparison-with-figmas-panels-item-6)): **Pending (human or Figma app)**. |
| 7 | `preview.html`, fallback palette, tests | `tokens.figma-fallback.css`: all 174 tokens for Design light, dark and FigJam, provisional values from create-figma-plugin's MIT transcription (`test/fallback.test.mjs`). `preview.html`: gallery, theme switch, "Simulate no Inter", and a fake frame running `code.js` against a `figma` stub (`npm run preview`, `scripts/serve.mjs`). `scripts/check-ui.mjs`. Playwright: `e2e/*.spec.mjs` with axe-core per theme (all WCAG 2.0/2.1 A and AA rules except `color-contrast`, replaced by a token-pair contrast report). CI and the Pages workflow (its staging step was run locally: the staged site redirects to `preview.html` and the live frame boots with no errors). This checklist. | Both themes render in Chrome, the resizer works on the fake frame, CI is green. | Both themes and the resizer on the fake frame: **Done** (local e2e run above). Live palette capture from a running plugin: **Pending (human or Figma app)**. CI green on GitHub, Pages enabled, tag `v0.2.0`: **Pending (outward action)**. |

### Designer gate (item 4)

Two designers with only the Figma desktop app and Claude Code, a fresh clone, the README as the only instructions. Record where each one stops, even if they finish.

| Date | Designer (initials) | Tools and versions | Reached a running plugin? | Time | Where they stopped or got stuck |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |

### Fix-first list, inventory and first-week plan (sections 3, 7 and 10)

**Section 3, the fix-first list.** Every bullet is fixed by items 1, 2, 3, 6 and 7 and listed under Fixed and Changed in [CHANGELOG.md](../CHANGELOG.md), with one exception the roadmap itself moves: the resizer's missing live feedback (an `aria-live` size announcement) is a Phase 2 row in section 7 ([accessibility.md](accessibility.md#known-gaps-for-phase-2)). Status: **Done** in the browser and the `figma` stub; the same behaviour in Figma is the surface matrix.

**Section 7, the P1 rows of the inventory.**

| Row | P1 target | In the repo | Status |
|---|---|---|---|
| Button | + tertiary, danger, disabled, selected, loading; 24px + large | `kit-button-tertiary`, `kit-button-danger`, `kit-button-large`; `disabled` / `aria-disabled`, `aria-pressed`, `aria-busy`; 24px and 32px | **Done** (gallery, `e2e/preview.spec.mjs`) |
| Input, input with icon | + disabled, error with `aria-describedby`, help text | `kit-input`, `kit-input-icon`, `kit-help`; `disabled`, `aria-invalid` + `aria-describedby` | **Done** (same) |
| Dropdown (`<select>`) | + disabled, error; stays native, documented | `kit-select` disabled and `aria-invalid` rules on the native `<select>`; the native popup is in [components.md](components.md#select) and the README's limits | **Done** (same) |
| Resize handle | modes, 24px, 3:1 grip | three modes; a 24px `<button>`; grip `icon-secondary` on `bg`, 3.98:1 light, 7.65:1 dark ([accessibility.md](accessibility.md#measured-ratios)) | **Done** on the fallback palette; the ratio on a captured palette waits for the palette capture |
| Layout primitives | real elements and classes | `<main>`, `<section>`, `<hr>`, `<h1>`, `<label>` with the `kit-*` layout classes | **Done** |
| Figma tokens referenced | 60+ of 174 | 34 distinct `--figma-color-*` names in `ui.html` (15 in the 2025 file). Count: `grep -o -E -- '--figma-color-[a-z0-9-]+' ui.html \| sort -u \| wc -l`. The cheat sheet in [tokens.md](tokens.md#role--token-cheat-sheet) names more for host CSS. | **Not met.** The Phase 1 components and the chrome use 34, and the kit does not add unused aliases to raise the count: they would be dead tokens. The roles still unused (success and warning tones for the notice, `border-strong` for the checkbox, `bg-inverse` + `text-oninverse` for the tooltip and toast, the component purple, `bg-tertiary`, `icon-brand`) arrive with the Phase 2 components; whether that reaches 60 is not known yet. Proposed: move the 60+ target to Phase 2. Owner decision: pending. |
| Fallback palette | all 174 captured | `tokens.figma-fallback.css` has all 174 names for Design light, dark and FigJam, provisional values from create-figma-plugin's MIT transcription (`test/fallback.test.mjs`) | All 174 names: **Done**. Capturing them from a running plugin: **Pending (human or Figma app)** (monthly step 2) |
| Kit tokens | measured radii, line-heights, durations, shadow and scrim; density removed | `--kit-radius-*`, `--kit-line-height-*`, `--kit-duration-*`, `--kit-shadow-*`, `--kit-scrim` ([tokens.md](tokens.md#measured-metrics)); density presets removed | **Done**; the MCP measurement of the UI3 kit file is item 6 |

**Section 10, the first-week checklist.**

| Step | In the repo | Status |
|---|---|---|
| Confirm `npm login`; decide the name (brand in README and listing, neutral `kit` namespace elsewhere, fallback name reserved); `npm deprecate` both packages | "Figplug UI Kit" in the README and [community-listing.md](community-listing.md) with the "not rsms/figplug" line; `kit-*`, `--kit-*`, `kit:*` and `data-kit-*` everywhere else | Namespace: **Done**. `npm login`, `npm deprecate` and the fallback name: **Pending (outward action)** (actions 1 and 6) |
| `LICENSE`, `package.json`, the corrected `manifest.json`; `tsc`; commit `code.js`; Import plugin from manifest with no terminal | All files present; `npm run build` regenerates `code.js` and CI's diff check guards it (item 1) | Files: **Done**. Committing and pushing the Phase 1 work: **Pending (outward action)**. The import run: **Pending (human or Figma app)** (item 1) |
| `ui.html`: declare `activePointerId`, the `e.button !== 0 \|\| !e.isPrimary` guard, an `AbortController` per drag, remove the `aria-label`, add `lang` | The rewritten runtime runs under `'use strict'` (item 2); `<html lang="en">`; fields named by their visible `<label>` | **Done** (item 2's e2e run) |
| `code.ts`: `isSizeRecord`, `figma.ui.on('message')`, check whether a host `onmessage =` clears it | `kitIsSizeRecord` and `figma.ui.on('message', ...)` in the `kit:window` block (item 3) | Guard and listener: **Done**. The `onmessage =` check: **Pending (human or Figma app)** (the probe runs, above) |
| README first screen; docs link, `.gitignore`, screenshots | Item 4; the screenshots are browser renders in `docs/img/` | **Done**. The Figma side by side: capture (a) |
| Draft `AGENTS.md`; run the entry prompt once in a fresh clone and log each failure as a future audit rule; tag `v0.2.0-alpha`; open `CHANGELOG.md` | `AGENTS.md`, `CHANGELOG.md` | `AGENTS.md` and `CHANGELOG.md`: **Done**. The entry-prompt run: **Pending (human or Figma app)** (item 5; the one-shot log in prompts.md is empty). Tag `v0.2.0-alpha`: **Pending (outward action)** (action 4) |

## Pending captures

Steps for the Phase 1 checks that need the Figma desktop app or a designer. None has been run; each ends in a table to fill.

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

## Outward actions waiting for the owner

None of these has been done. Each needs the owner's accounts.

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
4. **Push the tag `v0.2.0-alpha`** (PLAN.md section 10), once the Phase 1 work is committed and pushed to `main` and CI is green there. It marks the first runnable version before the surface matrix is filled; the files inside still say 0.2.0.

   ```sh
   git switch main && git pull
   git tag -a v0.2.0-alpha -m "Figplug UI Kit 0.2.0-alpha"
   git push origin v0.2.0-alpha
   gh release create v0.2.0-alpha --verify-tag --prerelease --title "Figplug UI Kit 0.2.0-alpha" --notes "Pre-release of 0.2.0: runnable, not yet checked in every Figma editor. See docs/release-checklist.md."
   ```

   If the owner skips the alpha and tags `v0.2.0` directly, write "skipped" and the reason here.
5. **Push the tag `v0.2.0`**, once CI is green on `main`, the surface matrix is filled and the `[0.2.0]` heading in CHANGELOG.md has its date:

   ```sh
   git switch main && git pull
   git tag -a v0.2.0 -m "Figplug UI Kit 0.2.0"
   git push origin v0.2.0
   gh release create v0.2.0 --verify-tag --title "Figplug UI Kit 0.2.0" --notes "See CHANGELOG.md"
   ```

   GitHub attaches the source zip to the release; that zip is what "imports with no terminal" refers to.
6. **Reserve the fallback name.** Fallback name: TBD. Pick a name without "Fig" in it (Figma's trademark guidelines), check it is free (`npm view <name>` should answer 404; check `https://github.com/<name>` and a Community search), then write it into the README brand line and the marked spot in [community-listing.md](community-listing.md#name), and reserve it where it will be used first (for example a GitHub organisation or repository). Don't publish a placeholder npm package: npm discourages name squatting, and PLAN.md only plans an npm package under the fallback name if three issues ask for one.

## Monthly maintenance

Once a month, and before each release:

1. **Bump Figma's typings** and rebuild:

   ```sh
   npm install -D @figma/plugin-typings@latest
   npm run check
   ```

   New `@deprecated` APIs (struck through in the editor) that throw under `dynamic-page` go into [pitfalls.md](pitfalls.md#5-sync-getters-under-dynamic-page). Keep `typescript` on `~6.0.x` unless a release deliberately moves to 7 ([pitfalls.md](pitfalls.md#12-typescript-6-turned-types-off-by-default)).
2. **Recapture the palette with `tools/probe`.** Import `tools/probe/manifest.json`, run **kit probe** in Figma Design (switch light and dark while it is open) and in FigJam, press **Copy report** ([surfaces.md](surfaces.md#measure-it-yourself)). Paste the reports under Raw reports in surfaces.md, then update `tokens.figma-fallback.css` from the captured `figma-style` text (and its provenance header) and the drift notes in [tokens.md](tokens.md). Until a first capture is recorded, the fallback values stay provisional.
3. **Run `tsc` on every example.** `npm run build` covers the root. The `examples/` folders arrive in Phase 2; once they exist:

   ```sh
   for d in examples/*/; do npx tsc -p "${d}tsconfig.json" || echo "FAIL: $d"; done
   npm run audit && npm run check:ui
   ```
4. **Run the browser tests** (`npm run test:e2e`) after the Playwright cache or version changes, and keep `@playwright/test` pinned to an exact version.
5. **Skim Figma's plugin docs and release notes** for changes to `themeColors`, the manifest, `editorType` values and PropsKit for classic plugins; record anything that touches the kit as an issue. A new `editorType` gets the handle off and the default bounds until a kit release adds it: update `kitSurface()` in the `kit:window` block of `code.ts` and the [At a glance](surfaces.md#at-a-glance) table in surfaces.md.
6. If anything changed, add it to CHANGELOG.md and release.
