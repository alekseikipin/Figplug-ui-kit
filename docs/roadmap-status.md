# Roadmap status (Phase 3)

Where each Phase 3 item of [PLAN.md](../PLAN.md#6-phase-3--later-months-5-7) stands: what is ready in the repo, what only the owner can do, and, for the watched items, what would set them off. Last checked **2026-10-14**: the watched items' sources were read on 2026-10-13 and again on 2026-10-14, with nothing changed between the two. The same day the kit had its first run in the real Figma desktop app (126.9.13, by Claude through computer use, scratch files only): the starter, the five examples, the `tools/probe` runs in all five editors and check 4 of the 0.4.0 one-shot runs ([release-checklist.md](release-checklist.md#manual-surface-matrix)). Phases 1 and 2 are tracked in [release-checklist.md](release-checklist.md#phase-1-status), and so is the [Phase 3 done-when table](release-checklist.md#phase-3-status), clause by clause with its evidence; this page holds the detail and the tables the owner fills in.

The status words match the release checklist: **Done**; **Pending (outward action)** means only the owner can do it, with the owner's accounts; **Pending (human or Figma app)** needs a person or the Figma desktop app; **Watched: not triggered** means the condition the plan waits for hasn't happened yet.

## At a glance

| # | Item (PLAN.md) | Status on 2026-10-14 | Ready in the repo | What the owner does | Trigger |
|---|---|---|---|---|---|
| 1 | Publish two archetypes (`rename-layers`, `a11y-contrast`) to Community with "Built with Figplug" in the description | **Pending (outward action)** | Listing copy for both in [community-listing.md](community-listing.md#the-two-archetypes-built-with-figplug); a 128 × 128 icon and 1920 × 1080 covers (light and dark) for each under `docs/listing/<name>/` | Publish both from the Figma desktop app; record the dates and review outcomes [below](#1-two-archetypes-on-community) | None: owner action. Done when both are live. |
| 2 | `figma/plugin-samples` PR: a `themeColors` + resizable-window sample | **Pending (outward action)** | [`contrib/plugin-samples/themed-resizable-window/`](../contrib/plugin-samples/themed-resizable-window/) and the PR text in `contrib/plugin-samples/PR.md` | Try the sample in Figma, open the PR from the owner's GitHub account, record the response [below](#2-figmaplugin-samples-pr) | None: owner action. Done when opened and the response is recorded. |
| 3 | Dialog and toast | **Done** in the repo (kit 0.4.0); the check in Figma is **Pending (human or Figma app)** (not exercised in the 2026-10-14 run; the probe found `<dialog>` and `popover` supported in the plugin iframe) | `kit-dialog` with `kit.dialog()` and `kit.toast()`, in `preview.html`, covered by `e2e/dialog.spec.mjs` and `e2e/toast.spec.mjs`; [components.md](components.md#dialog) | Run the kit tour (`examples/kit-tour`), which has the dialog, the menu and every kind of toast, in the Figma desktop app, light and dark, with the rest of the surface matrix | None |
| 4 | PropsKit bridge | **Watched: not triggered** | A draft `fig-*` → kit mapping, the demo plan and the licence caveats in [propskit.md](propskit.md) | Re-check monthly; the week it ships, follow [propskit.md](propskit.md#when-it-ships) | Figma makes PropsKit available to classic plugins |
| 5 | Hosted upload path | **Watched: not triggered** | The plan for the week it ships, [below](#5-hosted-upload-path) | Re-check monthly; push one archetype through when it ships | Figma ships a way to upload classic plugin code into its hosted workflow |
| 6 | Distribution: one CSS-only npm package | **Not triggered** (0 issues ask) | The package spec, [below](#6-distribution) | Count the issues monthly; publish only at three | Three issues ask for an npm or CSS package |
| 7 | v1.0: freeze class names | **Not yet** | The frozen surface and change policy in [stability.md](stability.md) | Tag the releases; run the human and Figma checks | All criteria [below](#7-v10) |

## 1. Two archetypes on Community

**Done when** (PLAN.md): both are live. **Status:** Pending (outward action). Nothing has been submitted.

- **Prepared in Phase 3:** the listing copy for `rename-layers` and `a11y-contrast` in [community-listing.md](community-listing.md#the-two-archetypes-built-with-figplug), each description ending with the "Built with Figplug UI Kit" line, and for each an icon (`icon.png`, 128 × 128) and two covers (`cover.png` and `cover-dark.png`, 1920 × 1080) under `docs/listing/<name>/` (sizes checked on 2026-10-14). They are browser renders of the real example in the preview's fake host, made by `UPDATE_LISTING=1 npx playwright test e2e/listing-assets.spec.mjs`, not Figma captures. The review risks, the data-security answers, the manifest changes and the owner's checklist are on the same page.
- **Before publishing:** both examples ran their main action in the Figma desktop app on 2026-10-14 (Figma Design, dark theme, run through the root manifest: `rename-layers` renamed 5 layers as previewed; `a11y-contrast` flagged a 1.99:1 text layer and passed a 21:1 one), which is partial against their checks (Cmd+Z, Select failing and row clicks not tried). Still to run: each from its own `manifest.json`, the light theme, the other editors each lists, and the opening once the visibility fix is in ([examples matrix](release-checklist.md#the-examples)): **Pending (human or Figma app)**.
- **Owner:** in the Figma desktop app, publish each archetype from its own publish folder: a copy of `examples/<name>/` whose `manifest.json` carries an id Figma assigned (Plugins > Development > New plugin, or at publish time), never the repo's placeholder `kit-example-<name>` id. Two-factor authentication must be on.
- **Name risk:** "Figplug" contains "Fig", which Figma's brand guidelines ask products not to use ([community-listing.md](community-listing.md#name)). If review objects, the "Built with" line takes the fallback name, which is still TBD (release-checklist action 6).

| Archetype | Submitted | Review outcome | Live URL |
|---|---|---|---|
| `rename-layers` | | | |
| `a11y-contrast` | | | |

## 2. `figma/plugin-samples` PR

**Done when:** opened, response recorded. **Status:** Pending (outward action). Not opened.

- **Prepared in Phase 3:** a standalone sample in the style of `figma/plugin-samples` under [`contrib/plugin-samples/themed-resizable-window/`](../contrib/plugin-samples/themed-resizable-window/), with no kit branding and no `kit-*` names, and `contrib/plugin-samples/PR.md` with the title, body, checklist and how to open it.
- **Checked here on 2026-10-14:** `npx tsc -p contrib/plugin-samples/themed-resizable-window` compiles it with the repo's TypeScript, and the output is byte for byte the committed `code.js`. The kit's npm scripts don't build or check `contrib/`, but CI's build step runs that same command and fails if the output differs from the committed `code.js` (`test/workflows.test.mjs` keeps the step in place); that step passed in the first CI run on GitHub, on 2026-10-14 ([run 38593622113](https://github.com/alekseikipin/Figplug-ui-kit/actions/runs/38593622113)). It has not run in Figma yet; the first step of the checklist in `PR.md` is that run (**Pending (human or Figma app)**).
- **Owner:** fork `figma/plugin-samples`, copy the folder in, open the PR as `PR.md` describes, and fill in the table below.
- **Expectations:** low. Since mid-2024 Figma hasn't merged an external sample or starter link; open external starter PRs from 2023 to 2026 have no comments (checked on 2026-10-13 through the GitHub API). The plan doesn't depend on it.

| Opened | PR URL | Response (date, who, what) | Outcome |
|---|---|---|---|
| | | | |

## 3. Dialog and toast

**Done when** (PLAN.md): in `preview.html`, Playwright-covered, within budget (`ui.html` under 1,600 lines and 64 KB). **Status on 2026-10-14:** **Done** in the repo, implemented in kit 0.4.0 (committed and tagged `v0.4.0` locally); the same check inside Figma is **Pending (human or Figma app)**: the first run in Figma, on 2026-10-14, did not open a dialog or a toast.

- **What shipped:** the dialog, stateful component #2 (`dialog.kit-dialog` with `kit-dialog-header`, `-body` and `-footer`, sizes `kit-dialog-small` and `kit-dialog-large`, openers `data-kit-dialog-open`, close buttons `data-kit-dialog-close`, `data-kit-dialog-light-dismiss`, and `kit.dialog()`, which resolves with the return value), and the toast, stateful component #3 (`kit.toast(message, { tone, duration, action })` with a queue, one at a time, in a polite live region), plus `CONFIG.strings.dismiss` and the `kit.d.ts` types `KitToastOptions`, `KitToastHandle` and `KitDialogLike`. Markup, behaviour and states: [components.md](components.md#dialog) and [components.md](components.md#toast). Nothing was renamed.
- **Code:** the dialog's runtime section is 33 lines and the toast's 73 (each under the 100 lines planned for it), with 742 and 1,166 bytes of CSS. They add no `document`, `window` or handle listeners: dialogs reuse the menu's capture `click` listener (and Escape for tooltips, also new in 0.4.0, its capture `keydown` listener). Tooltip Escape is a few lines inside those listeners, not a fourth stateful component: the tooltip stays CSS-only. In a browser without the popover API the runtime registers only those two capture listeners (two instead of five), so dialogs, their openers and close buttons, and tooltip Escape still work there; only menus need popovers.
- **In `preview.html`:** a Dialog row and a Toast row in all six states (plus a row of toast tones), and a live dialog and live toasts run by the page's own runtime block.
- **Playwright:** `e2e/dialog.spec.mjs` (16 tests: openers and `kit.dialog()`, first focus (hidden fields passed over) and focus return, Escape and close values, `preventDefault()`, Tab never reaching the page behind, light dismiss, nested dialogs, a stale `close` event, opening from a menu item, no popover API, listener counts, the measured look, scrolling in a short window, axe, the gallery demo) and `e2e/toast.spec.mjs` (16 tests: the region, the queue and durations, the paused timer, Escape, the action and `dismiss()`, focus return, the semantics and `strings.dismiss`, motion, the look, staying clear of the resize handle and of a sticky footer, the move into an open dialog (the top one when nested) with axe, listener cleanup, the gallery demo); `e2e/preview.spec.mjs` checks the two gallery rows. The full suite on 2026-10-14: 165 passed and 10 skipped (the docs screenshots and the listing images, made only on request), of 175, in two runs in a row and again with `--repeat-each=2`; with the fixes from the Figma run the same day, 169 passed and 10 skipped, of 179, in two runs in a row.
- **Budget:** `ui.html` is 65,383 bytes and 1,032 lines in 0.4.0 (57,314 bytes and 1,020 lines in 0.3.0), under 64 KB (65,536 bytes) and 1,600 lines; `test/budget.test.mjs` keeps it there. To make room, the components block now has one rule per line and the blocks drop the comments whose rationale is in the docs' implementation notes ([components.md](components.md#implementation-notes), [window-chrome.md](window-chrome.md#implementation-notes)). Every 0.3.0 CSS declaration is still there with its value (compared declaration by declaration on 2026-10-14), and every 0.3.0 browser test is still in the suite and passes; apart from the version strings, their only edits follow the gallery (27 rows, tab panels without `kit-tabpanel`) and let examples be deleted. The audit's `budget` warning no longer fires on a plugin's own code below 128 KB and 3,200 lines ([pitfalls.md](pitfalls.md#20-the-size-budget)).
- **Owner:** run the kit tour ([examples/kit-tour](../examples/kit-tour/README.md), added after the 0.4.0 tag: a dialog, a menu, a toast per tone and an Undo toast with `duration: 0`) in the Figma desktop app, in light and dark, and note whether the scrim, the focus return and the announcements behave as in the browser ([components table](release-checklist.md#components-in-the-figma-app)). The same tour is what the kit's own Community listing will run ([community-listing.md](community-listing.md#the-kits-own-listing); release-checklist action 2), so this run also checks the listing's next version.

## 4. PropsKit bridge

**Watched: not triggered** on 2026-10-14. PropsKit is still generative-plugins-only. The sources checked on 2026-10-13, the draft mapping, the demo plan and the licence caveats (FigUI3's core is MIT, its editor and lab bundles PolyForm Shield) are in [propskit.md](propskit.md). **Re-checked on 2026-10-14, nothing changed:** the playground article's body was last edited on 2026-07-01 (`edited_at` in its [article API](https://help.figma.com/api/v2/help_center/en-us/articles/41306719221143.json)), the forum thread's newest reply is still the staff reply of 2026-07-02, the release notes' newest entry is from 2026-10-13 and none mentions PropsKit, and the Plugin API updates still end at Update 140 without it.

**Trigger:** an official Figma statement that classic plugins can use PropsKit. **The week it fires:** [propskit.md](propskit.md#when-it-ships).

## 5. Hosted upload path

**Watched: not triggered** on 2026-10-14. Figma has said it will let classic plugin authors upload their existing code into its hosted workflow, but has not shipped it. The table is the reading of 2026-10-13. **Re-checked on 2026-10-14, nothing changed:** the FAQ article's body edit date is still 2026-10-06, the forum thread has no reply after 2026-07-02, no release-note entry mentions uploading or migrating plugin code (newest entry 2026-10-13), and the Plugin API updates end at Update 140 with nothing about hosting.

| Source | What it says on 2026-10-13 | Date |
|---|---|---|
| Help centre: [Generate plugins with the Figma agent](https://help.figma.com/hc/en-us/articles/43028920030743-Generate-plugins-with-the-Figma-agent), FAQ "What does this mean for creators of classic plugins?" | Nothing needs to change today; Figma keeps investing in locally developed plugins; moving a plugin to Figma hosting, maintained through the agent, will be offered "soon". | Body last edited 2026-10-06 |
| Forum: [the classic plugins and PropsKit thread](https://forum.figma.com/ask-the-community-7/will-classic-plugins-be-able-to-use-propkit-and-the-new-generative-plugin-apis-55286) | A Figma staff reply plans an optional upload of existing plugin code into the hosted workflow later in 2026. Classic plugins stay supported. | 2026-07-02, still the newest reply |
| [Figma release notes](https://www.figma.com/release-notes/) | No entry about uploading or migrating plugin code, or plugin hosting. The 2026-09-01 generative-plugin update added a code viewer that goes the other way: download your own generative plugin's code. | Newest entry 2026-10-13 |
| [Plugin API updates](https://developers.figma.com/docs/plugins/updates/) | Nothing about hosting, up to Update 140. | Read 2026-10-13 |
| Developer docs: [Generative plugins and shaders](https://developers.figma.com/docs/figma-mcp-server/generative-plugins-and-shaders/) | The closest path today, and not the trigger: an agent can create a generative plugin through the Figma MCP server and replace its `code.ts` and `ui.html`, but not its `manifest.json`; it cannot add files, imports or build config. | Read 2026-10-13 |

**Trigger:** Figma ships the upload or migration of classic plugin code (a help article, release note or developer-docs page describing it).

**The week it ships:**

1. Push one archetype through: `rename-layers` (fit-content, no network access, in Community from item 1 by then). Use a copy of `examples/rename-layers/` exactly as released, kit blocks untouched.
2. Record in the table below: what the upload accepted and rejected (`manifest.json` fields, `code.js` or `code.ts`, `ui.html`), whether `npm run audit` still passes on what Figma keeps, whether the window chrome survives (`figma.ui.resize`, `themeColors`, `figma.clientStorage`, the resize handle and keys), whether it can be published, and what had to change.
3. If the kit needs a change to survive hosting, open an issue and note it in the CHANGELOG of the release that fixes it. If hosting can't keep the chrome, say so in the README's "Is this for you?" block.

| Date | Archetype | Accepted / rejected | Audit | Window chrome | Published? | Changes needed |
|---|---|---|---|---|---|---|
| | | | | | | |

## 6. Distribution

**Not triggered** on 2026-10-14. The plan: one CSS-only npm package under the fallback name, only if three issues ask for it.

**Count on 2026-10-14: 0 issues ask for an npm or CSS package** (0 on 2026-10-13 too). The repo has one issue in total, [#1 "Please add license"](https://github.com/alekseikipin/Figplug-ui-kit/issues/1) (opened 2026-03-31; answered with a link to `LICENSE` (MIT) and closed as completed on 2026-10-14). It asked for a licence, not a package. The count came from a read-only query:

```sh
gh issue list -R alekseikipin/Figplug-ui-kit --state all --limit 200 --json number,title,body
```

**Decision: not triggered.** No package is published. Count it again each month; it counts as triggered at three separate issues from people other than the owner asking for an npm or CSS package (a +1 comment on an existing issue doesn't count). Record each issue number here as it comes:

| Issue | Opened | Asks for |
|---|---|---|
| | | |

**The package, ready for when it triggers:**

- **Name:** the fallback name, unscoped and without "Fig" (still TBD: release-checklist action 6). Not `figplug-ui-kit`: that package is the 2025 one, which is to be deprecated.
- **Contents:** CSS only. `tokens.css` is the inner text of `<style data-kit="tokens">` and `components.css` that of `<style data-kit="components">`, both byte for byte from the same release's `ui.html`. Then `README.md`, `LICENSE` (MIT) and `package.json` with a `files` list and the kit version as its version. No JavaScript: the runtime block and the `code.ts` block stay paste-only, so package users get the look but not the window chrome (the resize handle needs both halves).
- **No generator:** the two files are copied by hand at release time, and a `node:test` check byte-compares them with `ui.html`'s blocks, the way `test/blocks.test.mjs` compares `preview.html`.
- **Who it's for:** plugins built with a bundler (create-figma-plugin, Plugma, Vite), whose build can inline the CSS into `ui.html`. A plain `<link href>` to the package doesn't work in a plugin: Figma loads `ui.html` as a string, and `networkAccess` blocks remote files. The zero-build starter doesn't need the package.
- **Publishing** is an outward action: `npm publish` from the owner's account with two-factor authentication, then `npm view <name>` to check it.

## 7. v1.0

**Done when** (PLAN.md): all Phase 1-2 done-whens green, one-shot 4/5, two consecutive releases without renames. **Decision on 2026-10-14: not yet.** What 1.0 freezes is in [stability.md](stability.md).

| Criterion | Status on 2026-10-14 |
|---|---|
| **Phase 1 done-whens** (item by item in [release-checklist.md](release-checklist.md#phase-1-status)) | Repo side: **Done** for all seven items (the evidence is in the checklist). **Done in Figma on 2026-10-14** (Figma 126.9.13): 1. the import from the manifest with no terminal, from the repo folder; 3. the `tools/probe` runs in all five editors (an `onmessage =` handler and the kit's `on('message')` listener both fire) and the Dev Mode and Buzz runs; 4. the README screenshot side by side with Figma's own panel; 7. the live palette capture. Still to do: **Pending (human or Figma app)**: 1. the release zip itself (not tested separately); 2. the pointer gestures in real Figma (drag, Escape mid-drag, right-click, double-click; the keyboard resize and the reopen passed); 3. pasting the kit into an existing plugin by the steps in messages.md; 4. the designer gate (two designers reach a running plugin); 6. the measurement of the official UI3 kit file through the Figma MCP and a designer's comparison. **Done on GitHub on 2026-10-14**: 7. CI green (the first run, [38593622113](https://github.com/alekseikipin/Figplug-ui-kit/actions/runs/38593622113), at `84b2ee4`). Item 5 (one archetype passes the audit in a fresh clone) is met by the automated runs in [prompts.md](prompts.md#one-shot-log). |
| **Phase 2 done-whens** | 1. Archetypes (two pass `tsc` and the audit in CI; one-shot rate logged): the five `examples/` folders are compiled by `npm run build:examples` and checked by `npm run audit`, both part of `npm run check`, which passes locally; CI on GitHub: **Done** (2026-10-14, [run 38593622113](https://github.com/alekseikipin/Figplug-ui-kit/actions/runs/38593622113)). 2. Audit v2 (catches every failure logged in Phase 1): **Done** (the Phase 1 log's findings became `orphan-help` and `js-color-literal`, covered in `test/audit.test.mjs`). 3. README as docs (two new volunteers reach a running plugin in under 30 minutes): **Pending (human or Figma app)**. 4. Components (each in `preview.html` in all states): **Done** in the browser (`e2e/preview.spec.mjs` checks every gallery component in its six states). 5. Chrome v2 (axe clean, every mode has a demo): axe runs per theme in `e2e/a11y.spec.mjs`; the examples use `fit-content` (`rename-layers`, `a11y-contrast`), `resizable` (`export-selection`, `variables-sync`) and `fixed` (`content-fill`), and each mode ran in Figma Design on 2026-10-14. The rest in Figma (the other editors, the light theme, the opening once the visibility fix is in, real assistive technology): **Pending (human or Figma app)** (surface matrix). |
| **One-shot 4/5** | Not met yet: **3 of 5 confirmed at 0.4.0 in real Figma, 2 pending**. The automated runs passed 5 of 5 at 0.2.0, 5 of 5 at 0.3.0 and 5 of 5 at 0.4.0 (build, audit and `check:ui`, plus the unit and browser tests from 0.3.0 on, then booted in the preview's fake host; [prompts.md](prompts.md#one-shot-log)). Check 4, importing into the Figma desktop app and doing the task, was run for the 0.4.0 rows on 2026-10-14 (Figma 126.9.13, by Claude through computer use, the swap method in a scratch file): `rename-layers`, `export-selection` and `content-fill` passed; `variables-sync` is incomplete (it listed the variables, the write was not exercised) and `a11y-contrast` was not run: **Pending (human or Figma app)**. One more pass of those two reaches 4 of 5. The 0.2.0 and 0.3.0 rows were not run in Figma. |
| **Two consecutive releases without renames** | In the files: **met**. 0.3.0 and 0.4.0 add to 0.2.0's surface and rename nothing (no breaking renames since 0.2.0; [CHANGELOG.md](../CHANGELOG.md)). As releases: not yet. `v0.2.0`, `v0.3.0` and `v0.4.0` are annotated tags in the local repo only (`v0.2.0` on `ea12fe4`, `v0.3.0` on `61e608f`, `v0.4.0` on the commit that logs the 0.4.0 one-shot runs); `v0.2.0-alpha` was never tagged. Pushing the tags and publishing the releases: **Pending (outward action)** ([release-checklist.md](release-checklist.md#outward-actions-waiting-for-the-owner)). |

Not a v1.0 criterion, from the Phase 1 inventory: the target of 60+ distinct `--figma-color-*` tokens stood at 58 in 0.3.0 and is met at 60 in 0.4.0 (the toast added `icon-oninverse`, and `bg-success` for its success icon once the palette captured in Figma put `icon-success` below 3:1 on it; [release-checklist.md](release-checklist.md#fix-first-list-inventory-and-first-week-plan-sections-3-7-and-10)).

Also outside the v1.0 criteria: PLAN.md section 9's success metrics (the designer gate per release, the one-shot rate, zero audit findings, context under 15k tokens, adoption and a release every 4-6 weeks) are measured and logged in [release-checklist.md](release-checklist.md#success-metrics-planmd-section-9). On 2026-10-14 the context-size metric is not met if it counts the starter `ui.html` (about 23k tokens by a rough estimate; about 6.7k for `AGENTS.md` and the `kit-ui` skill alone), and which reading PLAN.md means is the owner's decision.

## Re-checking the watched items

Once a month, with the [monthly maintenance](release-checklist.md#monthly-maintenance), and before each release:

1. **PropsKit** (item 4): the steps in [propskit.md](propskit.md#how-to-re-check).
2. **Hosted upload** (item 5): read the FAQ of [Generate plugins with the Figma agent](https://help.figma.com/hc/en-us/articles/43028920030743-Generate-plugins-with-the-Figma-agent) (its edit date is `edited_at` in the [article API](https://help.figma.com/api/v2/help_center/en-us/articles/43028920030743.json)), the newest replies in the forum thread, the release notes and the Plugin API updates.
3. **Distribution** (item 6): run the `gh issue list` query above and count the package requests.

Write the date and what changed into the item's section here, even when nothing changed.
