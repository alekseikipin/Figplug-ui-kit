# Figplug UI Kit docs

These pages are the kit's canonical documentation. [README.md](../README.md), [AGENTS.md](../AGENTS.md) and the [`kit-ui`](../.claude/skills/kit-ui/SKILL.md) and [`kit-frame-to-markup`](../.claude/skills/kit-frame-to-markup/SKILL.md) skills are short summaries that link here; when they disagree with a page below, the page wins.

## Start

| Page | Read it when |
|---|---|
| [install.md](install.md) | You want the starter running in Figma: the 60-second start with no terminal, the optional terminal setup, and the import gotchas. |
| [loop.md](loop.md) | You are changing the plugin: rerun with Cmd+Opt+P, rebuild `code.ts`, the console, the browser preview. |
| [first-plugin.md](first-plugin.md) | You make the starter your own plugin: name it, replace the demo markup, one typed message each way, the checks, the import; and the entry-prompt path for agents. |
| [prompts.md](prompts.md) | You build a plugin with Claude Code or Cursor: the one entry prompt, five archetype tasks, and the one-shot log. |

## Build

| Page | Read it when |
|---|---|
| [components.md](components.md) | You write markup: every class, its states and its do's and don'ts, plus the layout primitives and the rules for your own CSS. |
| [ui3-mapping.md](ui3-mapping.md) | You turn a Figma frame into markup: each component of Figma's UI3 kit (names still to verify against the Community file) mapped to kit classes and attributes, the UI3 parts the kit lacks, plain-layer cues, text styles and colour variables, and how to finish the verification. |
| [tokens.md](tokens.md) | You need a colour, a spacing or a type size: how Figma's `--figma-color-*` tokens work, the kit's `--kit-*` tokens, the measured UI3 values and the role → token cheat sheet. |
| [window-chrome.md](window-chrome.md) | You pick a window mode or change how the window sizes: fit to content, the resize handle, keys, snapping, what is remembered. |
| [messages.md](messages.md) | You send data between `ui.html` and `code.ts`: the two sides' `postMessage` shapes, the `kit:*` protocol, and your own messages next to it. |
| [surfaces.md](surfaces.md) | Your plugin runs outside Figma Design: FigJam, Slides, Dev Mode (its own manifest), Buzz; what is documented and what is still unverified; the probe plugin. |
| [pitfalls.md](pitfalls.md) | Something fails, or the audit reports a rule: each pitfall's symptom, cause, fix and which check catches it. |
| [accessibility.md](accessibility.md) | You need the contrast decision (Figma's own token pairs, reported rather than enforced), keyboard and focus behaviour, labels and states for screen readers, or what the axe runs cover. |

## Ship and upgrade

| Page | Read it when |
|---|---|
| [publishing.md](publishing.md) | You publish your plugin to the Figma Community: prerequisites, every field of the publish modal (icon, thumbnail, support contact, network access label, privacy policy), the naming and AI rules, the plugin id, review times and updates. |
| [upgrade.md](upgrade.md) | A new kit release is out: which five pieces to re-paste, what the audit can and can't compare, protocol bumps, and what never changes before 1.0. |

## Release and maintenance

| Page | Read it when |
|---|---|
| [release-checklist.md](release-checklist.md) | You cut a release: the manual surface matrix, the Phase 1 status table, the owner's outward actions and the monthly maintenance. |
| [community-listing.md](community-listing.md) | You update the Figma Community listing: the listing copy and the republish steps. |
| [../CHANGELOG.md](../CHANGELOG.md) | You need what changed in a release before upgrading, its public surface, or the renames from the 2025 version. |

## Examples

Five finished plugins in [`examples/`](../examples/), one per archetype task in [prompts.md](prompts.md#the-five-archetype-tasks), each with its own `manifest.json` to import. Each README has the prompt, the one-shot result, the agent's diff and what curation changed. `npm run preview` runs any of them in the browser ([loop.md](loop.md#preview-in-a-browser)).

| Example | Window mode | Shows |
|---|---|---|
| [rename-layers](../examples/rename-layers/README.md) | `fit-content` | A form that grows, a live preview list in `kit-scroll`, preview equals apply |
| [export-selection](../examples/export-selection/README.md) | `resizable` | `exportAsync` bytes to a `Blob` in the UI, one download per layer |
| [content-fill](../examples/content-fill/README.md) | `fixed` | Fonts loaded before text edits, `figma.mixed`, the native select |
| [variables-sync](../examples/variables-sync/README.md) | `resizable` | `dynamic-page` variable getters, hex input with validation, aliases |
| [a11y-contrast](../examples/a11y-contrast/README.md) | `fit-content` | Contrast maths in main, a results list, error and success states |

## Coming later

Planned pages, not written yet (see [PLAN.md](../PLAN.md)): the PropsKit bridge, watched roadmap items and the v1.0 stability list (Phase 3).

## Outside docs/

- [`kit.d.ts`](../kit.d.ts): the `kit:*` message and option types.
- [CONTRIBUTING.md](../CONTRIBUTING.md) and the [bug report form](../.github/ISSUE_TEMPLATE/bug_report.yml): how to propose a change, and what a bug report needs (editor, theme, kit header).
- [`tools/probe/`](../tools/probe/): a development-only plugin that measures host behaviour; how to run it is in [surfaces.md](surfaces.md#measure-it-yourself).
- [`scripts/audit.mjs`](../scripts/audit.mjs) and [`scripts/check-ui.mjs`](../scripts/check-ui.mjs): the checks behind `npm run audit` and `npm run check:ui`.
