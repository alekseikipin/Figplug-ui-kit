---
name: kit-frame-to-markup
description: Turns a Figma frame into kit markup for this repo's ui.html. Reads the frame with the official Figma MCP server (get_metadata, get_design_context, get_screenshot), maps each instance of a UI3 kit component, or each group of plain layers, to the kit's classes through docs/ui3-mapping.md (a modal becomes kit-dialog, a toast a kit.toast() call), maps auto layout to kit-stack, kit-row and kit-section, text styles to the kit's type tokens and colours to Figma's --figma-color-* tokens, then runs npm run audit and npm run check:ui and reports what did not map. Use when the person pastes a figma.com/design link to a frame, or asks to build, rebuild or match the plugin UI from a Figma design, a mockup, or a frame made with components from Figma's UI3 Community kit. Not for writing designs into Figma, generative plugins (PropsKit fig-* elements), FigJam boards or Figma Make files, or UI work without a Figma frame (use the kit-ui skill for that).
license: MIT
---

# Turn a Figma frame into kit markup

A procedure for agents working in this repo. The mapping itself lives in `references/ui3-mapping.md`, the classes in `references/components.md` and the tokens in `references/tokens.md`; this file says how to read a frame through the Figma MCP server and apply them.

> `references/` is a symlink to `../../../docs`. If it is missing or empty (a zip download or a Windows clone without symlink support), read the same files from `../../../docs/` (the `docs/` folder at the repo root).

## When to use

- The person pastes a `figma.com/design/...` link to a frame and wants it as the plugin's UI.
- "Make the plugin look like this frame", "rebuild this mockup with the kit", "match the design".
- The frame uses instances from Figma's UI3 Community kit, or plain layers drawn to look like Figma's panels.

## When not to use

- Writing to Figma (creating or editing frames): that is the Figma MCP server's own skills, not this one.
- Generative plugins built with PropsKit `fig-*` elements: they are not classic plugins, and PropsKit works only in generative plugins today.
- FigJam boards, Slides decks and Figma Make files: `get_metadata` reads Figma Design files only.
- UI work with no frame to follow: use the `kit-ui` skill.

## What you need

- **The official Figma MCP server**, connected to the agent: the remote server at `https://mcp.figma.com/mcp` (it needs a link to a frame or layer), or the desktop server at `http://127.0.0.1:3845/mcp`, which the person enables in the Figma desktop app (open a Design file, switch to Dev Mode, then "Enable desktop MCP server" in the inspect panel); the desktop server can also read the current selection. Setup: [Figma MCP server docs](https://developers.figma.com/docs/figma-mcp-server/). In Claude Code: `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then, in a new session, `/mcp` > figma > Authenticate.
- **A link to the frame**: right-click it in Figma > Copy link to selection. From `https://www.figma.com/design/<fileKey>/<name>?node-id=12-34`, the `fileKey` is the segment after `/design/` (for `/design/<fileKey>/branch/<branchKey>/...`, use the `branchKey`) and the `nodeId` is `12:34`.

## Instructions

1. **Read the rules.** `AGENTS.md` at the repo root (all of it), then `references/ui3-mapping.md` (all of it: the variant table, the layout and component tables, the parts with no kit equivalent, the plain-layer cues, text, spacing and colour). Open `references/components.md` for each class you are about to use.
2. **Check the link.** A Community link (`/community/file/...`) can't be read: ask the person to open the file with **Open in Figma**, which duplicates it into their drafts, and send the duplicate's frame link. A link without `node-id`: ask for the frame's own link, or call `get_metadata` with only the `fileKey` to list the pages and ask which frame.
3. **Read the structure.** Call `get_metadata` with the `fileKey` and `nodeId`. It returns an XML outline of layer ids, names, types, positions and sizes. List every instance with its name (an instance is usually named after its component) and, where the outline or the design context shows them, its variant values (Figma names a variant `Property=Value, ...`), plus every frame that arranges others.
4. **Read the design context.** Call `get_design_context` on the frame. If it answers with metadata only because the frame is large, call it on each child from step 3 instead. If the server asks you to load its own design-to-code guidance first, do so: in this repo "the project's components and tokens" are the kit's classes and tokens, so this skill's mapping decides the markup. The code it returns (React and Tailwind unless you ask for something else) is **reference to read, not code to paste**: take the structure, the text, the component names, the variant values and the variable names from it, and drop its class names, inline styles, pixel values, hex colours and asset URLs.
5. **See it.** Call `get_screenshot` on the frame to compare with what you build, and `get_variable_defs` to get the names of the variables its fills, strokes and text use.
6. **Map each instance.** Look up its main component name in `references/ui3-mapping.md` (Layout, Components) and write the kit markup from that row; turn its variant properties into attributes with "Variant properties to attributes". The names in that table are UNVERIFIED guesses: match by meaning when the frame's names differ, and note the real name for the report. A component listed under "UI3 parts with no kit equivalent" gets the replacement given there. Anything else becomes plain HTML with your own class names (never `kit-*`) and tokens only. Record every one of these for the report.
7. **Map plain layers by purpose**, not by pixels, with the "Frames without UI3 components" table: a 24px box with a placeholder is a `kit-input` whatever its exact size.
8. **Map the layout.** The frame itself becomes `<main class="kit-app" data-kit-root>`. A padded block becomes a `<section class="kit-section">`, a 1px line between blocks an `<hr class="kit-divider">`, vertical auto layout `.kit-stack`, horizontal auto layout `.kit-row`, a label above its control a `.kit-field`, a bar of buttons at the bottom a `.kit-footer`, a long list a `.kit-scroll` region. A modal (a card with a title bar, a close X and actions, usually drawn over a dimmed copy of the panel) becomes a `<dialog class="kit-dialog">` placed inside `[data-kit-root]` after the content, opened by its trigger's `data-kit-dialog-open` or `kit.dialog()`; a toast (a small dark pill with a sentence) is not markup but a `kit.toast()` call in the script, where the result arrives. A gap other than 8px is host CSS with a `--kit-spacer-*` token. Drop fixed widths inside the window and every height; the frame's width becomes the window's width in `installKitWindow({ size: { width } })` in `code.ts`, and the window fits its height on its own.
9. **Map the text.** Text strings are content: copy them as written. Text styles become the kit's type tokens with the "Text styles" table; headings are real `<h1>`/`<h2>` with `kit-heading`.
10. **Map the colours.** Never copy a hex value from the design, into CSS, a `style` attribute or a script. A bound variable becomes its `--figma-color-*` token ("Colour variables" in `references/ui3-mapping.md`); an unbound colour gets the token for its role from the cheat sheet in `references/tokens.md`. Icons are inline `<svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true">` painted with `currentColor`; the asset URLs in the MCP response are temporary, and `networkAccess: none` blocks remote images, so never point an `<img>` at them.
11. **Write it into `ui.html`.** The markup replaces what is inside `<main class="kit-app" data-kit-root>`; the resize handle stays once, right after `</main>`. Host CSS goes in the plain `<style>` after the three `data-kit` blocks, behaviour in the plain `<script>` at the end of `<body>`. Never edit the three marked blocks (`<style data-kit="tokens">`, `<style data-kit="components">`, `<script data-kit="runtime">`), the `kit:window` block in `code.ts` or `kit.d.ts`. If the frame implies behaviour (buttons that do something), wire the messages as the `kit-ui` skill describes.
12. **Run the checks** with the shell, fix every finding and run them again until both are clean (add `npm run build &&` first if you changed `code.ts`; `npm install` first if `node_modules` is missing):

    ```sh
    npm run audit && npm run check:ui
    ```

    A `color-literal` or `js-color-literal` finding usually means a hex came across from the design; `control-height` means a pixel height did. `references/pitfalls.md` explains every rule. Optionally run `npm run preview` and compare with the screenshot by eye (the preview's colours are a provisional fallback palette).
13. **Report** in plain words: what you built and which files changed; a "Didn't map" list with each layer's name and node id, what it was, and what you used instead (a component with no kit equivalent, a variant the kit lacks, a text style, spacing, radius or shadow off the kit's scale, a colour with no token, a height you dropped); every UI3 name that differed from the table's guess, so `references/ui3-mapping.md` can be verified; the two check results; and how to import the plugin (the last section of `AGENTS.md`).

## Examples

Illustrative: the instance names are the table's guesses, not names read from the UI3 file. A frame "Export" with vertical auto layout and 16px padding holds a text "Export" in Body medium strong; a "Dropdown" instance labelled Scale; a "Text input" instance labelled Suffix, with `State=Error` and the help text "Use letters, numbers and dashes only."; a "Switch" labelled Include hidden layers, with `On=True`; and, at the bottom, a bar with a top line and 10px padding holding "2 layers selected" and two "Button" instances, `Variant=Secondary` and `Variant=Primary`. It becomes:

```html
<main class="kit-app" data-kit-root>
  <section class="kit-section kit-stack">
    <h1 class="kit-heading">Export</h1>
    <div class="kit-field">
      <label class="kit-label" for="scale">Scale</label>
      <div class="kit-select"><select id="scale"><option>1x</option><option>2x</option><option>3x</option></select></div>
    </div>
    <div class="kit-field">
      <label class="kit-label" for="suffix">Suffix</label>
      <input class="kit-input" id="suffix" type="text" aria-invalid="true" aria-describedby="suffix-help">
      <p class="kit-help" id="suffix-help">Use letters, numbers and dashes only.</p>
    </div>
    <label class="kit-checkbox"><input type="checkbox" checked>Include hidden layers</label>
  </section>
  <footer class="kit-footer">
    <p class="kit-text-secondary" role="status">2 layers selected</p>
    <div class="kit-row">
      <button class="kit-button kit-button-secondary" type="button">Cancel</button>
      <button class="kit-button kit-button-primary" type="button">Export</button>
    </div>
  </footer>
</main>
<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>
```

No host CSS was needed: the 16px padding is the section's, the 8px gaps are the stack's and the row's. The matching part of the report:

```text
Didn't map
- "Switch" (12:40), On=True: no kit switch; used a kit-checkbox, checked.
- Bar padding 10px (12:52): off the spacing scale; the kit-footer keeps its own 8px/16px.
Names: the frame's "Dropdown" matched the table's "Select or dropdown"; "Switch" matched "Switch, toggle".
```

## Common edge cases

- **No Figma MCP tools in this session**: say so and how to connect the server (above). Don't rebuild a frame from its link alone. With only a screenshot, map it by eye with the plain-layer table and say the result is unverified.
- **A frame with a dialog open over the panel**: build the panel once, and the dialog as one `kit-dialog` its trigger opens ("Dialog, modal" in `references/ui3-mapping.md`). Don't copy the dimmed panel, the backdrop or the shadow: the dialog brings them. Each footer action becomes a button with `data-kit-dialog-close` and a `value`, and the script reads the value from `await kit.dialog('id')`.
- **A toast or snackbar in the frame**: write `kit.toast(message, { tone })` in the script where the action finishes, with the frame's text; never markup or a fixed-position element. `figma.notify()` from `code.ts` is the alternative only when the window is hidden or about to close, or the plugin has no UI.
- **One frame per state** (empty, filled, error): build one view and express the states with attributes and your script (`aria-invalid`, `hidden`, a `kit-empty` you show or hide), not with a copy of the markup per frame. Ask which frame is the starting state if it isn't clear.
- **A dark-theme frame**: the same tokens. Figma injects the theme; never write a second set of colours.
- **Detached instances or another library's components**: map them by purpose, like plain layers.
- **Brand colours, other fonts or a custom radius in a mockup**: still tokens, the kit's font and the kit's radii; list each one under "Didn't map".
- **A frame wider than the window's bounds** (240 to 960px wide by default): pick a width inside them, or raise `bounds.maxWidth` in `installKitWindow`; sizes are clamped to the bounds (`references/window-chrome.md`).
- **Code Connect snippets in the response** (components mapped to some other codebase): ignore them; this repo's components are the kit's classes.
- **A UI3 menu or tooltip that looks dark in the light theme**: the kit's follow the theme instead; that is expected (`references/tokens.md`, "UI3's dark menus are not reproducible"), not something to fix with colours.
- **The audit flags a kit block**: you edited one. Restore it from the release; don't change the audit.
