# Install

The starter runs in Figma straight from the folder: `code.js` is already compiled and committed, so the first run needs no terminal, no Node and no build. You need the **Figma desktop app** (macOS or Windows); importing a plugin from a manifest does not work in the browser.

## The 60-second start (no terminal)

1. **Get the files.** On [the repo page](https://github.com/alekseikipin/Figplug-ui-kit), choose **Code > Download ZIP** and unzip it, or clone it:

   ```sh
   git clone https://github.com/alekseikipin/Figplug-ui-kit.git
   ```

   Put the folder somewhere you will keep it. Figma runs the plugin from that folder rather than from a copy, so after moving or renaming it, import the manifest again.
2. **Import it.** Open the Figma desktop app and any design file you can edit. In the Figma menu choose **Plugins > Development > Import plugin from manifest...** (some versions say "Import new plugin from manifest..."), then pick `manifest.json` in the folder.
3. **Run it.** **Plugins > Development > Kit starter**. A small "Create shapes" window opens: set a count, pick a shape, press **Create**. Drag the grip in the bottom-right corner to change the width; double-click it to snap between 320, 480 and 640 px. Close the plugin and run it again: it reopens at the width you chose.

The same plugin also appears under Plugins > Development in FigJam, Slides and Buzz. Dev Mode needs a second manifest ([surfaces.md](surfaces.md#dev-mode)).

Next: [loop.md](loop.md) for how to change it, or [prompts.md](prompts.md) to have Claude Code or Cursor build your plugin from it.

Already have a plugin, for example one made with Figma's **Plugins > Development > New plugin...** template? Add the kit to it instead: [messages.md](messages.md#adding-the-kit-to-an-existing-plugin).

## The examples

The download also holds [examples/](../examples/): five finished plugins built on the kit. An agent wrote each one from the entry prompt and one of the [five pinned tasks](prompts.md#the-five-archetype-tasks); each was then curated: the defects no check caught were fixed and pinned with tests. Import any of them the same way as the starter: **Plugins > Development > Import plugin from manifest...**, then pick `examples/<name>/manifest.json`. Each folder has its compiled `code.js` committed, so it runs with no terminal. Each also has its own name ("Rename layers (kit example)" and so on) and its own id (`kit-example-<name>`), so it appears as a separate entry under Plugins > Development and keeps its own `clientStorage`.

| Folder | What it does | Window mode |
|---|---|---|
| [`rename-layers`](../examples/rename-layers/README.md) | Renames the selected layers with a prefix, find and replace and numbering, with a preview first | `fit-content` |
| [`export-selection`](../examples/export-selection/README.md) | Exports the selected layers as PNG at 1x, 2x or 3x, one download per layer | `resizable` |
| [`content-fill`](../examples/content-fill/README.md) | Fills the selected text layers with names, emails, dates or numbers | `fixed` |
| [`variables-sync`](../examples/variables-sync/README.md) | Lists the file's local colour variables and sets one from a hex code | `resizable` |
| [`a11y-contrast`](../examples/a11y-contrast/README.md) | Checks the contrast of the selected text layers and flags anything below WCAG AA | `fit-content` |

Each README has the prompt, the agent's first result and what was changed after it. The editors each example runs in differ: [surfaces.md](surfaces.md#the-examples).

**Delete them freely.** Your plugin uses nothing in `examples/`. When you start your own plugin, delete the whole folder or any one example: `npm run build` compiles only the root's `code.ts`. The examples have their own `npm run build:examples`, which compiles whichever are left, and the checks, the tests and the preview's *Plugin* picker follow what is left ([loop.md](loop.md#codets-needs-tsc)). After editing one example's `code.ts`, `npx tsc -p examples/<name>` rebuilds just that one ([loop.md](loop.md#codets-needs-tsc)).

## The terminal path (optional)

You need this only to change `code.ts`, or to run the checks yourself (an agent runs them for you). It takes [Node.js](https://nodejs.org/) 24 or later.

```sh
cd Figplug-ui-kit
npm install          # TypeScript, Figma's typings, the test tools; nothing ships in the plugin
npm run build        # code.ts -> code.js, once
npm run watch        # or: rebuild on every save, until you stop it
npm run build:examples  # the examples/ folders you kept, after changing one
```

After a change, check it:

```sh
npm run audit        # the kit's rules: colours, control heights, manifest, protocol
npm run check:ui     # type-checks the scripts in ui.html
npm run check        # build + build:examples + audit + check:ui + unit tests
```

The audit and `check:ui` check the root and every `examples/` folder that is there.

`npm install` does not download browsers. The browser tests (`npm run test:e2e`) need Playwright's Chromium once: `npx playwright install chromium`.

Always build through the scripts. `tsc code.ts` (a file name on the command line) ignores `tsconfig.json` and fails ([pitfalls.md](pitfalls.md#11-run-tsc-through-the-project)).

## Import gotchas

- **macOS asks for access to Documents (or Desktop, Downloads).** If the folder is in one of those, macOS asks whether Figma may access it the first time you import or run the plugin. Allow it. If you clicked Don't Allow, Figma can't read the folder (what that looks like is not verified: an import that fails, or a plugin that won't load). Turn Figma on under System Settings > Privacy & Security > Files and Folders, or move the folder somewhere else, such as your home folder, and import again.
- **If nothing happens after choosing the menu item**, no file picker, or the picker closes without importing, try again from the Figma menu (the Figma logo, top left, or the app menu bar) rather than the right-click menu on the canvas, and with a file open. If it still does nothing, restart the desktop app. Reports of a picker that silently does nothing come from Figma's forum; the cause is not documented.
- **Plugins, not Widgets.** The Widgets menu has a look-alike Development > Import widget from manifest... item, which is for widgets. A plugin manifest belongs in **Plugins > Development > Import plugin from manifest...**.
- **Change the example `id` before you build on it.** `manifest.json` ships with `"id": "kit-starter-change-this-id"`. `figma.clientStorage` (where the kit remembers the window size, and where your plugin keeps settings) is keyed by that id, so every copy that keeps it shares one storage bucket on your machine, and data saved under an old id is gone after you change it. Give each plugin its own id before its first real use (Plugins > Development > New plugin... generates one, or use any unique string); Figma assigns the final id when you publish. Change `name` too, so you can tell your plugins apart in the menu. If the menu still shows the old name, import the manifest again. The same goes for an example you build on: every copy of it shares its `kit-example-<name>` id. ([pitfalls.md](pitfalls.md#10-a-unique-plugin-id))
- **Desktop app only.** The browser version of Figma has no "Import plugin from manifest". Once imported in the desktop app, the development plugin runs only there.
- **"Import plugin from manifest" refuses the file**: the manifest is broken. Run `npm run audit`, or compare it with the shape in [pitfalls.md](pitfalls.md#6-manifest-shape). `"main"` must name `code.js`, never `code.ts`.
- **The window opens blank or the plugin errors at once**: open **Plugins > Development > Show/Hide console** and look at the first error. [pitfalls.md](pitfalls.md) lists the usual ones.

Sources: [Import plugin from manifest (Figma help)](https://help.figma.com/hc/en-us/articles/360042786733), [plugin quickstart](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/), [clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage/), [forum: import from manifest in the web app](https://forum.figma.com/report-a-problem-6/unable-to-import-from-manifest-in-web-app-44727).
