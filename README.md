**Is this for you?** Quick internal tool: use Figma's agent. Network access, monetization, FigJam, Dev Mode or full UI control: start here.

# Figplug UI Kit

Starter files for Figma classic plugins with native-looking UI and a resizable window, made to be built on with Claude Code or Cursor. Not [rsms/figplug](https://github.com/rsms/figplug) (the plugin build tool). Fallback name: TBD.

| Light | Dark |
|---|---|
| ![The starter plugin window, light theme](docs/img/starter-light.png) | ![The starter plugin window, dark theme](docs/img/starter-dark.png) |

_Rendered by the browser preview (`npm run preview`): a stand-in window frame and the fallback palette, not Figma itself. A side-by-side with Figma's own panel is pending a capture in the real Figma app ([steps](docs/release-checklist.md#a-side-by-side-with-figmas-own-panel-item-4))._

Three hand-editable files and nothing to install: `manifest.json`, `code.ts` (compiled `code.js` included) and `ui.html`. Colours are Figma's own `--figma-color-*` tokens, so the UI follows light, dark and FigJam; controls are 24px like Figma's panels; the window fits its content, resizes from a corner grip and remembers the width. [`AGENTS.md`](AGENTS.md) tells your agent the rules, and `npm run audit` checks what it wrote.

## 60-second start

1. **Code > Download ZIP** on this page and unzip it (or `git clone https://github.com/alekseikipin/Figplug-ui-kit.git`).
2. In the **Figma desktop app**, open any file, then Figma menu > **Plugins > Development > Import plugin from manifest...** and pick `manifest.json`.
3. Run **Plugins > Development > Kit starter**.

No terminal, no build. If nothing happens or macOS asks about Documents, see the [import gotchas](docs/install.md#import-gotchas).

## The one prompt

Give Claude Code or Cursor this, with `<task>` filled in:

```text
Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that <task> with kit classes only, then tell me how to import it.
```

For example, `<task>` = "exports the selected layers as PNG at 1x, 2x or 3x and downloads the files". Five pinned tasks and the one-shot log are in [docs/prompts.md](docs/prompts.md).

## Your loop

- **Changed `ui.html`?** No build: rerun the plugin with **Cmd+Opt+P** (Ctrl+Alt+P).
- **Changed `code.ts`?** `npm run build` (or `npm run watch`), then rerun. A watch task started in VS Code stops when you reopen VS Code: start it again (Terminal > Run Build Task..., or `npm run watch`).
- **Then check:** `npm run audit && npm run check:ui`. Your agent runs these for you.
- **Errors:** Plugins > Development > Show/Hide console.
- **Import gotchas:** the macOS Documents permission prompt, a file picker that does nothing, the Widgets menu's look-alike import item, and the example `id` that every copy shares until you change it. All in [docs/install.md](docs/install.md#import-gotchas); the loop in full is [docs/loop.md](docs/loop.md).

## Limits, plainly

- **Dropdowns are the native `<select>`.** The open list is your operating system's popup, not Figma's dark menu.
- **FigJam is light only**, with a purple brand colour; FigJam has no dark mode.
- **Slides has no variables** (nor components or styles), so plugins built on them don't work there.
- **Inter, or system-ui.** The kit names Inter first and loads no font; where the plugin window lacks Inter, text falls back to the system font. To embed Inter yourself, see "Opt-in Inter" under [Kit tokens](docs/tokens.md#kit-tokens).
- Dev Mode needs a second manifest, and Dev Mode and Buzz dock the plugin in a panel with no resize grip ([docs/surfaces.md](docs/surfaces.md)). What has not been measured in a real Figma client yet is marked UNVERIFIED in the docs.

## The docs, topic by topic

Each topic in a few lines; the linked page in [docs/](docs/index.md) is the full, canonical version.

### Install

The Figma desktop app is all you need for the first run: `code.js` is committed, and importing from a manifest doesn't work in the browser. Node.js 24 and `npm install` are only for changing `code.ts` or running the checks yourself. Already have a plugin? Paste the kit's marked blocks into it instead ([adding the kit](docs/messages.md#adding-the-kit-to-an-existing-plugin)). Everything, gotchas included: [docs/install.md](docs/install.md).

### First plugin

Six steps from the starter to a plugin of your own: give it its own name and `id`, replace the demo markup with kit classes, wire one typed message each way, run the checks, import it, iterate. The worked example, "Prefix layers", passes every automated check. With an agent, the one prompt above covers the same steps and ends with how to import. [docs/first-plugin.md](docs/first-plugin.md)

### Your loop

The short version is [above](#your-loop). The watch task, the console, the browser preview and what to do when a change doesn't show up: [docs/loop.md](docs/loop.md).

### Tokens

Every colour is one of Figma's `--figma-color-*` tokens, which Figma injects and switches with the theme; `npm run audit` fails on a hex, `rgb()` or named colour in your CSS, your markup or a style your script sets. Spacing, radii and type are `--kit-*` tokens measured from UI3: 24px controls, 5px radius, 11px text on a 16px line. The role → token cheat sheet and the measurements: [docs/tokens.md](docs/tokens.md).

### Components

18 components as CSS classes on plain HTML: buttons and icon buttons; text, textarea, number and colour fields; select, checkbox and radio; tabs, tooltip and menu; list, empty state, notice, section header, sticky footer and the resize handle. Layout primitives and `kit-scroll` arrange them. States are attributes (`disabled`, `aria-invalid`, `aria-busy` ...), never classes, and `preview.html` shows every component in every state. [docs/components.md](docs/components.md)

### Window chrome

`installKitWindow({ mode })` in `code.ts` opens the window: `fit-content` (the default; the height follows the content), `resizable` or `fixed`. The corner grip drags, snaps on double-click and works from the keyboard, with a screen-reader announcement; what the person chose is remembered per editor (the width, in `fit-content`). [docs/window-chrome.md](docs/window-chrome.md)

### Messages

`ui.html` and `code.ts` share nothing but messages, and each side sends them differently. The kit's own messages are `kit:*`; give yours any other `type`, an interface each, a guard before trusting them, and register with `figma.ui.on('message')`, never `figma.ui.onmessage =`. [docs/messages.md](docs/messages.md)

### Accessibility

Native elements, visible labels, help and error text wired with `aria-describedby`, a focus ring for keyboard focus, keyboard resizing with one announcement, and no animation but a spinner that stops under reduced motion. axe-core checks the gallery and the plugin window in light, dark and FigJam. Contrast follows Figma's own token pairs: reported, not enforced. The known gaps, forced colours among them, are listed too: [docs/accessibility.md](docs/accessibility.md).

### Surfaces

One manifest covers Figma Design, FigJam, Slides and Buzz; Dev Mode needs its own. Dev Mode and Buzz dock the plugin in a panel, so the grip is off there. What hasn't been measured in a real Figma client is marked UNVERIFIED, and `tools/probe` measures it. [docs/surfaces.md](docs/surfaces.md)

### UI3 mapping

A table from each component of Figma's official UI3 kit to the kit markup that replaces it, plus text styles and colour variables, so a Figma frame becomes `ui.html` without guessing. The `kit-frame-to-markup` skill reads a frame through the Figma MCP server (`get_design_context`) and applies the table; you can use it by hand too. The UI3 component names in it are still UNVERIFIED against the Community file. [docs/ui3-mapping.md](docs/ui3-mapping.md)

The mapping names components of [UI3: Figma's UI Kit](https://www.figma.com/community/file/1486123838948777078/ui3-figmas-ui-kit) by Figma, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The kit copies no artwork, icons or components from it.

### Publishing

Before you submit to the Community: a name without "Fig" in it, a 128 × 128 icon, a 1920 × 1080 thumbnail, a support contact, the network access label your `networkAccess` gives, a privacy policy if the plugin processes user data, and no overlap with Figma's own AI features. Review times vary (anecdotal reports run from about 10 days to 6 weeks); after approval, updates publish at once. [docs/publishing.md](docs/publishing.md)

### Upgrade

There is no package to bump: re-paste the three `data-kit` blocks in `ui.html`, the `kit:window` block in `code.ts` and `kit.d.ts` from one release, then build and check. No public name is renamed before 1.0. The version strings in those files tell you which release you have; the audit can't compare your plugin with a release. [docs/upgrade.md](docs/upgrade.md)

## Examples

Five finished plugins in [`examples/`](examples/), one per [archetype task](docs/prompts.md#the-five-archetype-tasks). Each began as the one prompt in a fresh clone and was then reviewed and fixed; its README has the prompt, the agent's diff and what the review changed. Each has its own `manifest.json` to import (none has been run in the Figma app yet).

- [rename-layers](examples/rename-layers/README.md) (`fit-content`): prefix, find and replace, numbering, with a preview of every new name.
- [export-selection](examples/export-selection/README.md) (`resizable`): the selected layers as PNG at 1x, 2x or 3x, one download each.
- [content-fill](examples/content-fill/README.md) (`fixed`): realistic names, emails, dates or numbers in the selected text layers.
- [variables-sync](examples/variables-sync/README.md) (`resizable`): the file's local colour variables per mode, edited by hex.
- [a11y-contrast](examples/a11y-contrast/README.md) (`fit-content`): WCAG contrast of each selected text layer against what is behind it.

`npm run preview` runs any of them in the browser: pick it under *Plugin*, or open `preview.html?plugin=examples/<name>`. Delete `examples/` when you start your own plugin; your build and the checks don't depend on it.

## More

[All docs](docs/index.md) · [Pitfalls](docs/pitfalls.md) · [Prompts](docs/prompts.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

Official Figma docs: [plugin quickstart](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/), [CSS variables](https://developers.figma.com/docs/plugins/css-variables/).

Bugs and questions: [issues](https://github.com/alekseikipin/Figplug-ui-kit/issues) (the bug form asks for the editor, the theme and the kit header from `ui.html`). MIT licence ([LICENSE](LICENSE)).
