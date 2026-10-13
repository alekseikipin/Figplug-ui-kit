# Figplug UI Kit roadmap: the classic-plugin starting point for designers using Claude Code or Cursor

_Prepared 2026-10-13. Sources and verification notes are in section 11. Line numbers refer to the files as they are today._

## 1. Where the project is today

Figplug is a 693-line `ui.html` (four components, a 262-line resize script) plus an 84-line `code.ts`: 3 stars, no `LICENSE`, no `package.json`, a Community listing untouched for ~395 days. Its real asset is the window chrome; no other kit ships drag-resize, persisted size, snap widths and keyboard resizing. The rest is a demo: 15 of Figma's 174 `--figma-color-*` tokens used, zero disabled/error/selected states, 32px controls where Figma's panels appear to use 24px, a resize script with real bugs. Two npm packages from 2025-09-13 (`figplug-ui-kit@1.0.1`, `create-figplug-ui-kit@1.0.0`) promise a `manifest.json`, `tsconfig.json` and ESLint setup that their tarballs do not contain (checked 2026-10-13: the kit tarball holds only README, `bin/cli.js`, `code.js`, `code.ts`, `package.json`, `ui.html`).

## 2. The bet

Designers in 2026 build plugins by talking to Claude Code, Cursor or Figma's agent, and every published first-hand account found (a staff designer at iFood, a designer at Very Good Ventures, one at Centric, and a self-described zero-coder) failed on *context*, not components: wrong manifest, missing `await`, sync getters under `dynamic-page`, invented hex colours. Figma's agent is the right first stop for a quick internal tool; Figplug is for designers who then need network access, monetization, FigJam, Dev Mode or custom UI. It becomes the starting context a designer and an agent share: files that import from a manifest with no terminal, a native-UI contract an agent follows and a script verifies, runnable archetypes, and the only window chrome in the ecosystem. All files; a solo designer can finish it.

**Principles**

1. **Hand-editable files; no bundler, no framework, nothing beyond the quickstart's `tsc`.** Compiled `code.js` is committed, so a clone or release zip runs with no terminal.
2. **Figma's tokens or nothing.** Every colour is a `--figma-color-*` token; shadow and scrim kit tokens inside the token block are the only rgba allowed.
3. **Conventions over components.** Cap: 20 components, three stateful ones under 100 lines each, every item in one phase.
4. **Every rule is checkable.** If an agent can break it, `scripts/audit.mjs` catches it; the agent runs it after generating.
5. **One source, no generators.** `docs/` is canonical; README, `AGENTS.md` and the skill link into it by hand.
6. **Brand in the README, not the code.** Neutral `kit` identifiers everywhere, so a rename never breaks a pasted copy.

## 3. Fix-first list

**`ui.html`**
- `activePointerId` (590, 617) never declared; dies under `'use strict'`.
- Escape (608-621) leaves the `{once:true}` listeners (641-642) alive, so the next drag never persists and a later Escape snaps the window back; the pending rAF (452-467) overrides the revert (616); direct `sendResize` (553, 616) desyncs `lastSent`.
- `pointerdown` (579) has no `e.button`/`isPrimary` check; the 300ms click guard (581-583) drops real drags and persists on a plain click (634).
- Bounds duplicated with `code.ts` (444); `computeContentHeight` (499-510) measures kit-only selectors, runs once, ignores a missing `init`; `body { min-height: 100vh }` (75) blocks shrinking.
- `color-scheme: light dark` (7) follows the OS, not `.figma-light/.figma-dark`; Inter named (45) but never loaded.
- Zero `disabled`, selected, error or danger rules; hover borrows `border-selected` (207, 287); 32px controls (38), 6px radius (23), letter-spacing (103, 111), 12px icons (35).
- Resizer: `role="separator"` (423), 20px target (44), ~1.4:1 grip (315-324), no live feedback; `aria-label` overrides the visible label (395); no `lang` (2); `div` headings and dividers (350, 373).
- Density presets (49-59) and four tokens unused; no fallback palette for browser preview.

**`code.ts`**
- `msg.width/height` (64-66) and `savedSize` (31) unvalidated; NaN reaches `figma.ui.resize` and throws unhandled.
- `figma.ui.onmessage =` (51) and top-level `showUI` (42-49) cannot drop into an existing plugin.
- Saved size is never re-fitted (30, 76); no `.catch` on `showUI` (42); noisy log and notify (36, 79).

**Repo**
- No `LICENSE` (the npm tarball claims MIT), `package.json`, typings, manifest or `code.js`; stale docs link; PII line in `.gitignore`; off-repo screenshots; no issues link.

## 4. Phase 1 — Now

S ≈ 1 focused day, M ≈ 1 week, L ≈ 2-3 weeks; evenings-and-weekends doubles every range. Items 1-5 are the floor (weeks 1-4); 6-7 may slip to weeks 5-8.

**1. Repo basics and a runnable folder (S).** MIT `LICENSE`; `package.json`; `manifest.json` with `"main": "code.js"`, `"documentAccess": "dynamic-page"`, `"networkAccess": { "allowedDomains": ["none"] }`; `code.js` committed, CI runs `tsc && git diff --exit-code`; `CHANGELOG.md` listing the public surface; all breaking renames (message types, storage key, class names) land in v0.2.0 and none later before v1.0. Name first: brand in README and listing with a "not rsms/figplug" line, a Figma-free fallback reserved everywhere; `npm deprecate` both packages. *Done when:* the zip imports from manifest and runs with no terminal.

**2. Resize script rewrite and modes (M).** One `requestSize(w, h, {immediate, final})` clamping once, cancelling the pending rAF, updating `lastSent`; per-drag `AbortController` cleanup, `e.button`/`isPrimary` guard, `lostpointercapture`; persist only on change. `CONFIG.mode`: `fit-content` (default: `ResizeObserver` on `[data-kit-root]` drives height, width persisted), `resizable` (both persisted, Home re-fits), `fixed`. 500ms fallback to fit-to-content if `init` never arrives; first fit after `document.fonts.ready`; `body` reserves the grip corner and drops `min-height: 100vh`. Clamp, snap and dedupe as pure functions under `node:test`. *Done when:* drag, Escape mid-drag, right-click, double-click, Shift+arrows, reopen leak zero listeners under `'use strict'`; replacing the demo markup still fits.

**3. Installable `code.ts` (M).** No `import`/`export`. A fenced block exposes `installKitWindow({bounds, persist, mode})`, registered via `figma.ui.on('message')`. `kit:` types in an export-free `kit.d.ts`, mirrored as JSDoc in `ui.html`, CI-checked; `isSizeRecord` guard; `KIT_PROTOCOL` in both files, sent in `kit:ready`, echoed in `kit:init`. Persist immediately on `final: true`, debounce only mid-drag; no close hook (Figma cannot await it). `showUI` hidden until the first fit (500ms cap). Gate the chrome on `figma.editorType` in `figma | figjam | slides`; store `{v:1, editorType, width, height}`; per-surface bounds (min width 300 for Dev Mode). *Done when:* pasted next to a host's own handler, both work; Dev Mode and Buzz runs recorded.

**4. README first screen and Community listing (S).** Top of both: "Is this for you? Quick internal tool: use Figma's agent. Network access, monetization, FigJam, Dev Mode or full UI control: start here." Then a light/dark side-by-side with Figma's panel, a 60-second start, and one prompt: "Clone <repo>, read AGENTS.md, build a plugin that <task> with kit classes only, then tell me how to import it." A "Your loop" section: Cmd+Opt+P reruns `ui.html` edits with no build; the watch task stops after reopening VS Code; the import gotchas (Documents permission, silent picker, widget import, example `id`). Say plainly: native `<select>` popup, FigJam light-only, Slides without variables, system-ui without Inter; republish the listing with a plugin-shaped demo. *Done when:* two designers with only Figma desktop and Claude Code installed reach a running plugin; record where each stops.

**5. Agent context and a first audit (M).** Hand-written `AGENTS.md` under 150 lines: two threads, messages, tokens-only colours, layout, the loop, the pitfalls (no bundling, no `dom` lib, no top-level `export`, `await` every `*Async`, manifest shape). `CLAUDE.md` is `@AGENTS.md` plus Claude notes. `.claude/skills/kit-ui/SKILL.md` per the Agent Skills spec, with `references/` as the canonical `docs/`. `scripts/audit.mjs`, ~40 lines, zero dependencies: hex/rgb outside the token block, control heights not 24/32, missing `dynamic-page` or `networkAccess`, protocol mismatch; CI gate and the agent's post-step. `docs/prompts.md` pins the harness. *Done when:* one archetype prompt in a fresh clone passes the audit.

**6. Native fidelity pass (M).** First measure the official UI3 kit file via MCP into `docs/tokens.md`; 24px, 5px/13px and 11-on-16 are hypotheses until then. Then the icon, hover, focus-ring and `color-scheme` fixes, every state in the inventory table, dead tokens deleted, tokens isolated in `<style data-kit="tokens">`, marked sections, a version header with the issues URL. Fonts: `Inter, system-ui`; opt-in `<link>` or data-URI `fonts.css` outside the budget. *Done when:* every component shows all six states and matches the measured values.

**7. `preview.html`, fallback palette, tests (M).** Capture `document.getElementById('figma-style').textContent` from the running plugin in light and dark into `tokens.figma-fallback.css`. `preview.html`: full gallery in all states, theme toggle, "simulate no Inter" toggle, a fake frame loading `code.js` against a `figma` stub. `scripts/check-ui.mjs` extracts the `<script>` body and runs `tsc --allowJs --checkJs --noEmit` with `kit.d.ts`. One Playwright job drives the item 2 sequences plus reload-with-saved-size, asserts messages and listener counts, runs axe-core per theme. GitHub Pages; `docs/release-checklist.md` for the manual surface matrix; tag `v0.2.0`. *Done when:* both themes render in Chrome, the resizer works on the fake frame, CI is green.

## 5. Phase 2 — Next (months 3-4)

The phase is done at items 1-3 plus whichever of the first eight components the archetypes pulled in; the rest is stretch.

**1. Archetypes (L).** `examples/rename-layers`, `export-selection`, `content-fill` first; `variables-sync` and `a11y-contrast` wait for the number and colour fields. Each ships the three files using only kit classes, a different chrome mode, and a README with its entry-prompt variant and the agent's diff. The audit byte-compares marked sections across root, preview and examples; cap at two until it does. *Done when:* two pass `tsc` and the audit in CI; the one-shot rate is logged.

**2. Audit v2 (M).** Add missing `:disabled`, sync getters, `aria-label` overriding a visible label, missing `lang`, tooltip or `[aria-invalid]` without `aria-describedby`, section drift, a budget warning (shell under 1,600 lines / 64 KB). *Done when:* it catches every failure logged in Phase 1.

**3. README as docs (M).** Install, First plugin, Your loop, Tokens, Components, Window chrome, Messages, Accessibility, Surfaces, a UI3 mapping table (official kit component to kit class, CC BY attribution) that a frame-to-markup skill consumes via MCP `get_design_context`, Publishing checklist (icon 128, thumbnail 1920x1080, support contact, network label, privacy policy, AI-overlap rule, 10-day to 6-week reviews), upgrade by re-pasting the three marked sections. Ten-line `CONTRIBUTING.md`; `bug_report.yml` asking `editorType`, theme, kit header. *Done when:* two new volunteers reach a running plugin in under 30 minutes.

**4. Components the archetypes pull in (L).** First eight: empty state, list row, sticky footer, inline notice, checkbox, textarea, section header, icon button. Stretch: number field, colour swatch + hex field, radio, tooltip (`aria-describedby`, `:focus-visible`), tabs, and menu (first stateful). *Done when:* each appears in `preview.html` in all states.

**5. Chrome v2 (M).** Handle becomes a `<button>` with an `aria-describedby` hint and one `aria-live` announcement debounced 150ms after the last keystroke; Home/End; a `kit:fit` request. *Done when:* axe is clean and every mode has a demo.

## 6. Phase 3 — Later (months 5-7+)

1. **Publish two archetypes to Community (M).** "Built with Figplug" in the description. *Done when:* both are live.
2. **`figma/plugin-samples` PR (S).** A `themeColors` + resizable-window sample. *Done when:* opened, response recorded.
3. **Dialog and toast (L).** `<dialog>` with focus return, toast queue; under 100 lines each. *Done when:* in `preview.html`, Playwright-covered, within budget.
4. **PropsKit bridge (S, conditional).** PropsKit is Figma's official web-component UI kit, today limited to generative plugins. The week it reaches classic plugins, publish a `fig-*` to kit-class mapping and demo.
5. **Hosted upload path (watched).** The week Figma ships classic-code upload, push one archetype through and record the result.
6. **Distribution (S).** One CSS-only npm package under the fallback name, only if three issues ask.
7. **v1.0 (S).** Freeze class names. *Done when:* all Phase 1-2 done-whens green, one-shot 4/5, two consecutive releases without renames.

## 7. Component and token inventory target

| Component | Now | Target (phase) |
|---|---|---|
| Button (primary, secondary) | default, hover, active | + tertiary, danger, disabled, selected, loading; 24px + large (P1) |
| Input, input with icon | default, hover, focus | + disabled, error with `aria-describedby`, help text (P1) |
| Dropdown (`<select>`) | default | + disabled, error; stays native, documented (P1) |
| Resize handle | div, separator role, 20px | modes, 24px, 3:1 grip (P1); `<button>`, aria-live, Home/End (P2) |
| Empty state, list row, sticky footer, inline notice, checkbox, textarea, section header, icon button | none | P2, first eight |
| Number field, colour field, radio, tooltip, tabs, menu | none | P2 stretch |
| Dialog, toast | none | P3, under 100 lines each |
| Layout primitives | ad-hoc divs | real elements and classes (P1, not counted) |
| Figma tokens referenced | 15 of 174 | 60+; all 174 captured in the fallback palette (P1) |
| Kit tokens | spacing, 3 radii, 2 sizes, density | measured radii, line-heights, durations, shadow/scrim; density removed (P1) |

Twenty components at the cap, three stateful.

## 8. Explicit non-goals and rejected ideas

- **`npm create`, scoped packages, `src/` + esbuild.** The 2025 experiment got 10 downloads a month in the crowded tier.
- **`@font-face` Inter by default.** Conflicts with `networkAccess: none`; opt-in only.
- **Generators, `components.json`, `CONVENTIONS.md`, `.cursor/rules`, marketplace manifests, upgrade diffs, contribution programs, in-plugin wizard.** Release engineering for two files; `AGENTS.md` already serves every agent.
- **A code-paired Community design file.** The mapping table and frame-to-markup skill replace it.
- **Telemetry in the plugin, ever.** It would trigger Figma's privacy-policy requirement.
- **RTL and localisation.** Figma's own UI has none; strings live in `CONFIG`.
- **Framework ports, CLI, bundler, HMR, icon library, state management, runtime dependencies, web components, LLM or MCP inside the plugin, hosted UI, density presets, switch, property row.** No.

## 9. Success metrics and risks

**Metrics**
- Designer gate per release: two designers with Figma desktop and Claude Code reach a running plugin; stop points logged.
- One-shot rate over the pinned prompts (4/5 by end of Phase 2); audit findings 0; context under 15k tokens; budgets logged as author notes.
- Adoption: "Built with" Community plugins, release downloads, repo views and clones, non-author issues; a release every 4-6 weeks.

**Risks**
- *PropsKit reaches classic plugins (promised 2026-07-02, unshipped).* Chrome, conventions, archetypes and context survive it; ship the mapping the same week.
- *Solo bandwidth.* Explicit floors per phase.
- *Naming rule ("Figdesigns" is disallowed).* Neutral identifiers from v0.2.0; fallback name reserved in week 1.
- *Undocumented behaviour (`onmessage` coexistence, origins, Dev Mode and Buzz).* Measured in Phase 1 before any done-when depends on it.
- *Copy equals fork; palette drift; platform churn.* Version header and protocol constant; the monthly typings bump recaptures the palette and runs `tsc` on every example.

## 10. First week checklist

- Clone the repo, confirm `npm login`, decide the name by Friday: brand in README and listing, neutral `kit` namespace elsewhere, fallback name reserved; `npm deprecate` both packages.
- Add MIT `LICENSE`, `package.json`, the corrected `manifest.json`; run `tsc`, commit `code.js`, confirm Import plugin from manifest runs with no terminal.
- In `ui.html`: declare `activePointerId`, add the `e.button !== 0 || !e.isPrimary` guard, wrap each drag in an `AbortController`, remove the `aria-label`, add `lang`.
- In `code.ts`: add `isSizeRecord`, switch to `figma.ui.on('message')`, check whether a host `onmessage =` clears it.
- Rewrite the README first screen: "Is this for you?", 60-second start, entry prompt, native-select note; fix the docs link, `.gitignore` and screenshots.
- Draft `AGENTS.md`, run the entry prompt once in a fresh clone, log every failure as a future audit rule; tag `v0.2.0-alpha` and open `CHANGELOG.md`.

## 11. Sources and verification notes

Facts in this document were checked on 2026-10-13 against Figma's developer docs and help centre, the GitHub API and the npm registry. Key sources:

- https://developers.figma.com/docs/plugins/css-variables/
- https://developers.figma.com/docs/plugins/api/properties/figma-showui/
- https://developers.figma.com/docs/plugins/manifest/
- https://developers.figma.com/docs/plugins/plugin-quickstart-guide/
- https://developers.figma.com/docs/plugins/working-in-dev-mode/
- https://developers.figma.com/docs/plugins/working-in-slides/
- https://developers.figma.com/docs/plugins/working-in-buzz/
- https://developers.figma.com/docs/plugins/publishing/
- https://developers.figma.com/docs/plugins/libraries-and-bundling/
- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines
- https://developers.figma.com/docs/figma-mcp-server/create-skills/
- https://help.figma.com/hc/en-us/articles/360042293394-Publish-plugins-to-the-Figma-Community
- https://help.figma.com/hc/en-us/articles/41407987481879-About-building-plugins-in-Figma
- https://help.figma.com/hc/en-us/articles/41306719221143-PropsKit-component-playground
- https://www.figma.com/blog/how-we-built-generative-plugins-and-shaders/
- https://www.figma.com/blog/config-2026-recap/
- https://www.figma.com/release-notes/
- https://raw.githubusercontent.com/yuanqing/create-figma-plugin/main/CHANGELOG.md
- https://github.com/tigranpetrossian/figma-kit
- https://api.github.com/repos/tigranpetrossian/figma-kit/contents/src/components?ref=beta
- https://plugma.dev/
- https://github.com/hyperbrew/bolt-figma
- https://api.github.com/repos/hyperbrew/bolt-figma/issues
- https://raw.githubusercontent.com/figma/plugin-samples/master/README.md
- https://www.figma.com/community/file/1486123838948777078/ui3-figmas-ui-kit

Not verified, treat as assumptions until checked:

- Whether PropsKit and on-canvas handles have shipped for classic plugins. The only official statement is a Figma staff forum reply from 2026-07-02 promising it "in the coming months"; the help article still says generative plugins only.
- The UI3 control metrics quoted in the fix-first list (24px controls, 5px/13px, 11-on-16 type) are hypotheses to measure against Figma's official UI3 kit file before the fidelity pass.
- "Community listing untouched for ~395 days" comes from a search-engine snippet; the listing page itself returned 403.
- Figma documents a minimum plugin window of 70x0 and no maximum; the practical cap being the viewport is forum practice, not docs.
- Whether `--figma-color-*` variables and `figma.ui.resize` behave normally inside the Dev Mode Inspect panel and the Buzz side panel; neither docs page mentions them.
- Whether a host plugin's `figma.ui.onmessage =` assignment clears listeners added with `figma.ui.on('message')`; measure in Phase 1 before relying on coexistence.
