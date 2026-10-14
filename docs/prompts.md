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
| Kit version | `0.2.0` (the `kit vX.Y.Z` in `ui.html`'s `<meta name="kit">` and the tokens block header) |
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

The first three come first in Phase 2's `examples/`; `variables-sync` and `a11y-contrast` follow once the kit has number and colour fields ([PLAN.md](../PLAN.md)). The tasks are useful as prompts before the examples exist.

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

No runs recorded yet. Add one row per run, newest first.

| Date | Tool | Model | Archetype | Build | Audit | check:ui | Imports? | Notes / new audit rule |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
