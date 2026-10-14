# Prompts

The kit is meant to be the context a designer and an agent share. This page pins one entry prompt and five tasks, so "does an agent get it right first time?" has a repeatable answer, and logs every run. Each failure in the log becomes a candidate audit rule (`scripts/audit.mjs`) or a line in [AGENTS.md](../AGENTS.md).

## The entry prompt

Type this into Claude Code or Cursor, with `<task>` replaced by one sentence about what the plugin should do:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that <task> with kit classes only, then tell me how to import it.
```

Nothing else is needed: [AGENTS.md](../AGENTS.md) (and, in Claude Code, `CLAUDE.md` plus the `kit-ui` skill) tells the agent the rules, the checks to run and how to explain the import.

## The pinned harness

A one-shot result only means something next to the setup that produced it. Record these with every run (the log below has a column for each).

| Field | Value |
|---|---|
| Tool | Claude Code or Cursor (agent mode), with the version it reports |
| Model id | The exact id the tool reports for the session (not a marketing name). Record it per run; it changes more often than the kit. |
| Kit version | `0.3.0` (the `kit vX.Y.Z` in `ui.html`'s `<meta name="kit">` and the tokens block header) |
| Date | The day of the run, `YYYY-MM-DD` |
| Figma | Desktop app version (shown in About Figma) |
| Machine | OS and Node version (`node --version`) |

## The five archetype tasks

Paste the `<task>` text exactly as written: it is what a designer would type, not a spec.

| Archetype | `<task>` | What it exercises |
|---|---|---|
| `rename-layers` | renames the selected layers with a prefix, find and replace, and optional numbering, and shows a preview of the new names before I apply them | Selection, live preview, text fields, the message round trip |
| `export-selection` | exports the selected layers as PNG at 1x, 2x or 3x and downloads the files | `await node.exportAsync()`, `Uint8Array` in the message, `Blob` and download only in the UI |
| `content-fill` | fills the selected text layers with realistic names, emails, dates or numbers that I pick from a dropdown | `await figma.loadFontAsync()`, `figma.mixed`, the native select |
| `variables-sync` | lists the local color variables of this file and lets me change a variable's value by typing a hex code | `await figma.variables.getLocalVariablesAsync()` and other `dynamic-page` getters, hex input and validation; not in Slides (no variables) |
| `a11y-contrast` | checks the contrast between each selected text layer and the fill behind it and flags anything below WCAG AA | Reading fills and colours, maths in main, a results list, error and success states |

All five ship as curated examples in [examples/](../examples/) (Phase 2, [PLAN.md](../PLAN.md)), one per folder, each README with its prompt, its one-shot result and what curation changed. `npm run preview` runs any of them in the browser (*Plugin* in the live panel).

## The one-shot procedure

1. **Fresh clone, fresh session.** An empty folder, a new agent session with no earlier conversation, no extra rules files, MCP servers off unless the run is about them. Note the harness fields above.
2. **One prompt, no help.** Paste the entry prompt with one archetype's `<task>`. Answer only questions the agent asks about the task itself (and allow the commands it wants to run); give no hints, corrections or follow-ups.
3. **Judge the first response**, when the agent says it is done, on four checks, run by you in the clone:
   - `npm run build` exits 0;
   - `npm run audit` is clean (`audit: no problems ...`, exit 0);
   - `npm run check:ui` is clean (`check-ui: no type errors ...`, exit 0);
   - the plugin imports from `manifest.json` in the Figma desktop app, opens, and does the task on a real selection.
4. **One-shot** means all four pass. Anything less is a failure; record which check failed and why.
5. **Log it** below, one row per run, even for passes. For each failure write what went wrong and the audit rule (new or existing) that would have caught it, so Phase 2's audit catches every failure logged here.

The Phase 1 done-when for agent context is one archetype passing in a fresh clone; the target for the end of Phase 2 is 4 of 5.

## One-shot log

Newest first. Every row so far is an agent-only run: a fresh subagent in a fresh `git clone` of the release commit, given only the entry prompt, then graded by a separate agent that ran checks 1-3 (and, for 0.3.0, `npm test` and `npm run test:e2e` too) and booted the result in the preview's fake host. Machine: macOS, Node 24.13.0.

- **Kit 0.3.0 (Phase 2): automated one-shot rate 5 of 5.** Every run passed checks 1-3 with no audit findings, its unit and browser tests passed, and the kit's marked blocks were left untouched. What the checks could not catch is in each row's notes; the curated results are the [examples/](../examples/) folders, each with the agent's diff, what curation changed and why, and golden tests that fail on the agent's original code.
- **Kit 0.2.0 (Phase 1): automated one-shot rate 5 of 5.**
- **Check 4 (import into the Figma desktop app) is pending for every run**, so none counts as a full one-shot yet.

| Date | Tool | Model | Kit | Archetype | Build | Audit | check:ui | Imports? | Notes / new audit rule |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.3.0 | `rename-layers` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass, no audit findings. Behaviour bugs no check caught: Enter right after a keystroke was refused as stale with a misleading message (no request `seq` to match the preview), every keystroke re-read the parent's `children` once per selected layer, the status line was keyed on the selection count, and the `nodechange` registration was unguarded → AGENTS.md candidates below. Curated in [examples/rename-layers](../examples/rename-layers/README.md); 4 of its 17 golden tests fail on the agent's code. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.3.0 | `export-selection` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass, no audit findings. Domain bugs: slices measured by render bounds and exported with the default `contentsOnly`; file names (a line break, a `.png` already in the name, an emoji cut at 100 characters); one unchecked UI message field. The agent chose `fit-content` with a `.kit-scroll` list; the archetype's mode is `resizable`, which the prompt can't say (a curation change, not an agent error). Curated in [examples/export-selection](../examples/export-selection/README.md); 5 of its 11 golden tests fail on the agent's code. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.3.0 | `content-fill` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass, no audit findings. Domain bugs: the nested fill reached text inside hidden or locked groups, and the reply claimed mixed fonts are kept, but setting `characters` resets range styles; a wrapping result line grew the window. Mode changed to the archetype's `fixed`. Curated in [examples/content-fill](../examples/content-fill/README.md); 6 of its 20 golden tests fail on the agent's code. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.3.0 | `variables-sync` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass, no audit findings, `ui.html` 140 bytes under the 64 KB budget. Apply on an untouched alias silently replaced it with a fixed colour; every read fetched each non-colour variable by id; a raw `TypeError` where `figma.variables` is missing; focus stayed on the list row. Mode changed to the archetype's `resizable`, with the list sized to the room left. Curated in [examples/variables-sync](../examples/variables-sync/README.md); 12 of its 16 golden tests fail on the agent's code (4 on behaviour, the rest on changed message shapes). |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.3.0 | `a11y-contrast` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass, no audit findings (the agent hit the `budget` warning and fixed it itself). Phase 1's group-opacity and overlapping-text bugs were avoided; new occlusion bugs: covered or 0% text counted as a 1:1 failure, text on a path drawn as a solid box, embeds and other unreadable layers treated as transparent, effects growing the sample area; summary wording; a failed scroll lost the list. Curated in [examples/a11y-contrast](../examples/a11y-contrast/README.md); 8 of its 34 golden tests fail on the agent's code. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.2.0 | `rename-layers` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass. Tests coupled to the demo fail once the demo is replaced (npm test host-demo cases, 20 e2e specs) → Phase 2: demo-specific tests skip when the demo is gone. `kit-help` used as plain secondary text → new rule `orphan-help`. A `role=status` line rewritten on every keystroke → AGENTS.md guidance. The preview's mode switch missed `installKitWindow({ mode, bounds })` → preview fix. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.2.0 | `export-selection` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass. The status line claimed "Downloaded N" for downloads the sandbox may block silently → AGENTS.md: a page can't confirm a download; say "Started N downloads". |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.2.0 | `content-fill` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass. No findings. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.2.0 | `variables-sync` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass. A long list scrolled the whole fit-content window (footer out of view) → AGENTS.md guidance and a `.kit-scroll` region. Swatch set via `style.color = hex` (document data, legitimate) → new rule `js-color-literal` flags colour *literals* in JS and docs show `setProperty('--swatch', hex)` for data colours. Host-demo tests failed after the demo was replaced → same fix as above. |
| 2026-10-13 | Claude Code (Agent SDK subagent, fresh clone, no human) | claude-opus-5-5 | 0.2.0 | `a11y-contrast` | pass | pass | pass | Pending: real Figma not run; boots in `preview.html`'s fake host | Pass on the checks; domain bugs no check could catch (group opacity applied per child, overlapping text treated as solid boxes) → the Phase 2 example ships golden-scene tests. Untyped host messages → AGENTS.md: declare one interface per host message. The preview stub lacked `PageNode.on`, `commitUndo`, `getNodeByIdAsync` → stub extended. |

### Audit-rule candidates from the 0.3.0 runs

Inputs for the next audit pass, not implemented yet. Each comes from a defect in the rows above.

- `scroll-in-resizable` (warning): a `.kit-scroll` region in a `ui.html` whose `code.ts` calls `installKitWindow({ mode: 'resizable' })`; its 240px cap leaves the extra height unused. Needs an opt-out: `variables-sync` sizes its `.kit-scroll` to the room left on purpose.
- `variables-editor` (warning): `figma.variables` in `code.ts` while the manifest's `editorType` lists `slides` (no variables), or `dev` next to a variable write (`setValueForMode`, `createVariable`).
- `children-in-loop` (heuristic warning): `.children` read, or `parent.children.indexOf`, inside a loop over `figma.currentPage.selection`; each read builds a new array.
- `characters-reset` (heuristic warning): `.characters =` on a layer whose fonts were collected with `getRangeAllFontNames` or a `figma.mixed` check; it resets every range style.
- `busy-non-button` (warning): `aria-busy` on an element that is not a `.kit-button` (an icon button, say), where the kit draws no busy state.
- `budget`: a softer note near 60 KB, or the bytes left above 90%; the kit's blocks take about 52.6 KB of the 64 KB, and two runs had to trim to fit.

Guidance for AGENTS.md or [pitfalls.md](pitfalls.md) rather than rules (not checkable statically): send a request `seq` with each preview and apply only once the matching preview is back; announce selection changes from a selection version sent by main, not a count; wrap `PageNode.on('nodechange')` in `try` where the manifest lists `slides` or `buzz`; `findAll`/`findAllWithCriteria` also return layers inside hidden or locked parents; compare with an alias's resolved colour before writing, so an untouched Apply never detaches it; in a `fixed` window, reserve room for variable-length status text; type received bytes as `Uint8Array<ArrayBuffer>` in UI JSDoc (TypeScript 6's `BlobPart`); export a slice with `contentsOnly: false`.
