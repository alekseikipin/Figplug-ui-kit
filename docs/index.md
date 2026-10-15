# Figplug UI Kit docs

These pages are the kit's canonical documentation. [README.md](../README.md), [AGENTS.md](../AGENTS.md) and the [`kit-ui`](../.claude/skills/kit-ui/SKILL.md) and [`kit-frame-to-markup`](../.claude/skills/kit-frame-to-markup/SKILL.md) skills are short summaries that link here; when they disagree with a page below, the page wins.

## Start

| Page | Read it when |
|---|---|
| [install.md](install.md) | You want the starter running in Figma: the 60-second start with no terminal, the optional terminal setup, and the import gotchas. |
| [loop.md](loop.md) | You are changing the plugin: rerun with Cmd+Opt+P, rebuild `code.ts`, the console, the browser preview. |
| [first-plugin.md](first-plugin.md) | You make the starter your own plugin: name it, replace the demo markup, one typed message each way, the checks, the import; and the entry-prompt path for agents. |
| [prompts.md](prompts.md) | You build a plugin with an AI agent: the one entry prompt, five archetype tasks, and the one-shot log, with the import into the Figma app (check 4) for the 0.4.0 runs. |

## Build

| Page | Read it when |
|---|---|
| [components.md](components.md) | You write markup: all 20 components (the dialog and `kit.dialog()`, the toast and `kit.toast()` among them), their states and their do's and don'ts, plus the layout primitives and the rules for your own CSS. |
| [ui3-mapping.md](ui3-mapping.md) | You turn a Figma frame into markup: each component of Figma's UI3 kit (names still to verify against the Community file) mapped to kit classes and attributes, dialogs and toasts included, the UI3 parts the kit lacks, plain-layer cues, text styles and colour variables, and how to finish the verification. |
| [tokens.md](tokens.md) | You need a colour, a spacing or a type size: how Figma's `--figma-color-*` tokens work (as measured in the Figma app, with each editor's brand colour), the kit's `--kit-*` tokens, the measured UI3 values, the browser palette captured from Figma and the role → token cheat sheet. |
| [window-chrome.md](window-chrome.md) | You pick a window mode or change how the window sizes: fit to content, the resize handle, keys, snapping, what is remembered. |
| [messages.md](messages.md) | You send data between `ui.html` and `code.ts`: the two sides' `postMessage` shapes, the `kit:*` protocol, and your own messages next to it (measured: an assigned `figma.ui.onmessage` and the kit's listener both fire). |
| [surfaces.md](surfaces.md) | Your plugin runs outside Figma Design: FigJam, Slides, Dev Mode (its own manifest), Buzz; what is documented, what the probe measured in each editor in the Figma app (theme, brand colour, panel and window sizes, messages) and what is still unverified; the probe plugin and its reports. |
| [pitfalls.md](pitfalls.md) | Something fails, or the audit reports a rule: each pitfall's symptom, cause, fix and which check catches it. |
| [accessibility.md](accessibility.md) | You need the contrast decision (Figma's own token pairs, reported rather than enforced, on the palette captured in Figma), keyboard and focus behaviour (dialog focus and toast announcements too), labels and states for screen readers, or what the axe runs cover. |

## Ship and upgrade

| Page | Read it when |
|---|---|
| [publishing.md](publishing.md) | You publish your plugin to the Figma Community: prerequisites, every field of the publish modal (icon, thumbnail, support contact, network access label, privacy policy), the naming and AI rules, the plugin id, review times and updates. |
| [upgrade.md](upgrade.md) | A new kit release is out: which five pieces to re-paste, what the audit can and can't compare, protocol bumps, what never changes before 1.0, and the notes for each release (0.2.0 to 0.3.0, 0.3.0 to 0.4.0). |
| [stability.md](stability.md) | You need to know which names are public and will not be renamed: every class, attribute, token, `CONFIG` key, message, type and audit rule id with the release that added it, what v1.0 freezes, the change policy before and after 1.0, and how to report a break. |

## Release and maintenance

| Page | Read it when |
|---|---|
| [release-checklist.md](release-checklist.md) | You cut a release: the manual surface matrix, with the first run in the Figma app and what it left open (the components to look at in Figma, dialog and toast included), the status tables for Phases 1, 2 and 3 with their evidence, PLAN.md's success metrics and the adoption log, the pending captures, the version bump, the owner's outward actions and the monthly maintenance. |
| [roadmap-status.md](roadmap-status.md) | You want where each Phase 3 item stands: the two Community listings, the `figma/plugin-samples` PR, the dialog and toast, the watched items (PropsKit, hosted upload, an npm package) with their triggers, and the v1.0 criteria. |
| [propskit.md](propskit.md) | Figma's PropsKit (`fig-*` web components, generative plugins only today) comes up: whether it has reached classic plugins, how to re-check, the draft `fig-*` → kit mapping and demo plan for the week it does, and the licence caveats. |
| [community-listing.md](community-listing.md) | You publish or update a Community listing: the kit's own listing, **Figplug**, which runs the kit tour (copy, the version note, carousel media, republish steps from a publish folder outside the repo) and the two archetype listings, "Rename in Order" and "Text Contrast Check" (copy, data-security answers, the publish folder's manifest changes, images, the owner's checklist). |
| [../CHANGELOG.md](../CHANGELOG.md) | You need what changed in a release before upgrading, its public surface, or the renames from the 2025 version. |

## Examples

Six plugins in [`examples/`](../examples/), each with its own `manifest.json` to import: five archetypes from one-shot runs, one per archetype task in [prompts.md](prompts.md#the-five-archetype-tasks), whose READMEs have the prompt, the one-shot result, the agent's diff and what curation changed; and the kit tour, built by hand, the demo the kit's Community listing runs ([community-listing.md](community-listing.md#the-kits-own-listing)). `npm run preview` runs any of them in the browser ([loop.md](loop.md#preview-in-a-browser)).

| Example | Window mode | Shows |
|---|---|---|
| [rename-layers](../examples/rename-layers/README.md) | `fit-content` | A form that grows, a live preview list in `kit-scroll`, preview equals apply |
| [export-selection](../examples/export-selection/README.md) | `resizable` | `exportAsync` bytes to a `Blob` in the UI, one download per layer |
| [content-fill](../examples/content-fill/README.md) | `fixed` | Fonts loaded before text edits, `figma.mixed`, the native select |
| [variables-sync](../examples/variables-sync/README.md) | `resizable` | `dynamic-page` variable getters, hex input with validation, aliases |
| [a11y-contrast](../examples/a11y-contrast/README.md) | `fit-content` | Contrast maths in main, a results list, error and success states |
| [kit-tour](../examples/kit-tour/README.md) | `fit-content` | All 20 components working on a Home screen and eight small pages, the window refitting to each screen, `kit.dialog()` and `kit.toast()` (an Undo toast with `duration: 0`), the starter's Create demo, `figma.openExternal` |

## Outside docs/

- [`kit.d.ts`](../kit.d.ts): the `kit:*` message and option types, and the `window.kit` API (`fit()`, `dialog()`, `toast()`).
- [`contrib/`](../contrib/README.md): work prepared for other projects, not part of the kit: today a themed, resizable-window sample for `figma/plugin-samples` and the text of its pull request, which the owner opens ([roadmap-status.md](roadmap-status.md#2-figmaplugin-samples-pr)).
- [CONTRIBUTING.md](../CONTRIBUTING.md) and the [bug report form](../.github/ISSUE_TEMPLATE/bug_report.yml): how to propose a change, and what a bug report needs (editor, theme, kit header).
- [`tools/probe/`](../tools/probe/): a development-only plugin that measures host behaviour; how to run it is in [surfaces.md](surfaces.md#measure-it-yourself).
- [`scripts/audit.mjs`](../scripts/audit.mjs) and [`scripts/check-ui.mjs`](../scripts/check-ui.mjs): the checks behind `npm run audit` and `npm run check:ui`.
