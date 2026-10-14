# Figplug UI Kit docs

These pages are the kit's canonical documentation. [README.md](../README.md), [AGENTS.md](../AGENTS.md) and the [`kit-ui` skill](../.claude/skills/kit-ui/SKILL.md) are short summaries that link here; when they disagree with a page below, the page wins.

## Start

| Page | Read it when |
|---|---|
| [install.md](install.md) | You want the starter running in Figma: the 60-second start with no terminal, the optional terminal setup, and the import gotchas. |
| [loop.md](loop.md) | You are changing the plugin: rerun with Cmd+Opt+P, rebuild `code.ts`, the console, the browser preview. |
| [prompts.md](prompts.md) | You build a plugin with Claude Code or Cursor: the one entry prompt, five archetype tasks, and the one-shot log. |

## Build

| Page | Read it when |
|---|---|
| [components.md](components.md) | You write markup: every class, its states and its do's and don'ts, plus the layout primitives and the rules for your own CSS. |
| [tokens.md](tokens.md) | You need a colour, a spacing or a type size: how Figma's `--figma-color-*` tokens work, the kit's `--kit-*` tokens, the measured UI3 values and the role → token cheat sheet. |
| [window-chrome.md](window-chrome.md) | You pick a window mode or change how the window sizes: fit to content, the resize handle, keys, snapping, what is remembered. |
| [messages.md](messages.md) | You send data between `ui.html` and `code.ts`: the two sides' `postMessage` shapes, the `kit:*` protocol, and your own messages next to it. |
| [surfaces.md](surfaces.md) | Your plugin runs outside Figma Design: FigJam, Slides, Dev Mode (its own manifest), Buzz; what is documented and what is still unverified; the probe plugin. |
| [pitfalls.md](pitfalls.md) | Something fails, or the audit reports a rule: each pitfall's symptom, cause, fix and which check catches it. |
| [accessibility.md](accessibility.md) | You need the contrast decision (Figma's own token pairs, reported rather than enforced), keyboard and focus behaviour, labels and states for screen readers, or what the axe runs cover. |

## Release and maintenance

| Page | Read it when |
|---|---|
| [release-checklist.md](release-checklist.md) | You cut a release: the manual surface matrix, the Phase 1 status table, the owner's outward actions and the monthly maintenance. |
| [community-listing.md](community-listing.md) | You update the Figma Community listing: the listing copy and the republish steps. |
| [../CHANGELOG.md](../CHANGELOG.md) | You upgrade, or need the public surface of a release and the renames from the 2025 version. |

## Coming later

Planned pages, not written yet (see [PLAN.md](../PLAN.md)): a UI3-to-kit mapping table, publishing, upgrading, a first-plugin walkthrough (Phase 2); the PropsKit bridge, watched roadmap items and the v1.0 stability list (Phase 3).

## Outside docs/

- [`kit.d.ts`](../kit.d.ts): the `kit:*` message and option types.
- [`tools/probe/`](../tools/probe/): a development-only plugin that measures host behaviour; how to run it is in [surfaces.md](surfaces.md#measure-it-yourself).
- [`scripts/audit.mjs`](../scripts/audit.mjs) and [`scripts/check-ui.mjs`](../scripts/check-ui.mjs): the checks behind `npm run audit` and `npm run check:ui`.
