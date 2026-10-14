# Upgrade

The kit is pasted, not installed: there is no package to bump. A plugin built on it carries five kit pieces, and an upgrade replaces all five with the same release's copies. Everything else in the plugin is yours and stays as it is.

## What you replace

| Piece | Where it lives in your plugin | Replace |
|---|---|---|
| `<style data-kit="tokens">` | `ui.html`, in `<head>` | the whole element, opening tag to `</style>` |
| `<style data-kit="components">` | `ui.html`, after the tokens | the whole element |
| `<script data-kit="runtime">` | `ui.html`, after the components | the whole element, opening tag to `</script>` |
| the `kit:window` block | top of `code.ts` | every line from `// ==== kit:window:start ...` through `// ==== kit:window:end ====` |
| `kit.d.ts` | next to `code.ts` | the whole file |

A plain-JavaScript plugin (no `code.ts`) copies the `kit:window` block from the release's `code.js` instead and has no `kit.d.ts`.

What you keep: the markup inside `[data-kit-root]`, the resize handle, your `<style>` and `<script>` after the kit blocks, any `data-kit-config` script, your code below `// ---- Your plugin starts here ----`, and `manifest.json`.

## Steps

1. **Find your version.** All of these should name the same `kit vX.Y.Z · protocol N`: `<meta name="kit">` in `ui.html`, the first comment of `<style data-kit="tokens">`, the `// ==== kit:window:start` line in `code.ts` (and `code.js`), and the first line of `kit.d.ts`. One command shows them all:

   ```sh
   grep -nE 'kit (tokens )?v[0-9]' ui.html code.ts code.js kit.d.ts
   ```

   In the running plugin, `kit.version` in the UI's JavaScript returns the same number. If they disagree, a previous upgrade was only half done: finish it with the steps below.
2. **Read [CHANGELOG.md](../CHANGELOG.md)** from your version up to the new one: what was added, what changed in behaviour, and whether `KIT_PROTOCOL` moved ([below](#protocol-bumps)).
3. **Commit first** if the plugin is in git, so that afterwards `git diff` shows exactly what the release changed and nothing else.
4. **Get the release.** The files at the release's tag on GitHub (`vX.Y.Z`, with a source zip on the Releases page). A version that CHANGELOG.md still marks Unreleased has no tag yet: take its files from `main`, and check that their version strings name it.
5. **Paste the five pieces**, unchanged. Copy each block whole, from its opening tag or start line to its closing tag or end line, and turn off format-on-save while you do: a reformatted block is no longer the release's.
6. **Rebuild and check:**

   ```sh
   npm run build
   npm run audit && npm run check:ui
   ```

   `npm run build` turns the new `kit:window` block into `code.js`, which is what Figma runs. A new release may add audit rules: code that passed the old audit can get new findings, each explained in [pitfalls.md](pitfalls.md#audit-rules).
7. **Rerun in Figma** (Cmd+Opt+P): the window opens at its fitted size, the grip resizes it, a second run reopens at the width you chose, and your own messages still arrive on both sides.

## If your plugin is a clone of this repo

A plugin started from the 60-second start or the entry prompt is a clone of the kit, so the kit's tooling lives in it too, and the tooling checks the pasted blocks against its own copies. Take these from the same release as the five pieces, or delete what you don't use:

- `preview.html`: the audit's `section-drift` and `test/blocks.test.mjs` report its blocks once your `ui.html`'s are newer.
- `e2e/` (its `fixtures/kit-ui.html` carries byte copies of the blocks), `test/`, `scripts/`, `playwright.config.mjs` and `tokens.figma-fallback.css`, so the checks and the preview match the blocks.
- `examples/`: each example carries its own copy of the kit, which `section-drift` compares with your root files.
- `AGENTS.md`, `CLAUDE.md`, `.claude/skills/` and `docs/`, so your agent reads the rules of the release you run.
- `package.json`'s `devDependencies` and `scripts`, then `npm install`.
- Not part of your plugin: `contrib/` (the sample for `figma/plugin-samples`, since 0.4.0) and `docs/listing/` (the Community listing images of two examples). Nothing builds them or ships them with your plugin, but the docs link to them, so take them from the release along with `docs/` (without them `test/docs-links.test.mjs` fails).

Never take `manifest.json`, `code.ts`, `code.js` or `ui.html` whole from a release: they hold your plugin.

## What the checks compare

- **`protocol-mismatch`** compares the `KIT_PROTOCOL` number in `code.ts` (or the main `.js`) with the one in the `ui.html` runtime, and with the one in the compiled `code.js`. It catches a half-upgrade, or a `code.js` you forgot to rebuild, only when that number differs; 0.2.0, 0.3.0 and 0.4.0 are all protocol 1, so a mix of them passes it. Always run `npm run build` after pasting.
- **`section-drift`** compares the copies of the kit inside one repo with that repo's root: `preview.html`'s three blocks against `ui.html`'s (in a folder that has a `preview.html`), and each `examples/<name>`'s ui blocks, `kit:window` block and `kit.d.ts` against the root's. It never compares anything with a release: the audit downloads nothing and holds no reference copy of any version.

So in the kit's own repo `section-drift` tells you which copies lag behind the root. In your own plugin there is usually nothing to compare to: a plugin you added the kit to has no `preview.html` and no `examples/`, and a clone whose preview and examples you deleted has none either. There the audit stays silent whether your blocks are current, stale or edited by hand, and **the version strings in step 1 are what tells you which release you have.**

To check that your pasted blocks are byte for byte a release's, borrow `section-drift`: in a clone of the kit at that release, copy your plugin folder into `examples/` and audit it there.

```sh
cp -R path/to/your-plugin examples/your-plugin
node scripts/audit.mjs examples/your-plugin
rm -rf examples/your-plugin
```

An edited block, the version line included, shows as a `section-drift` line at the first line that differs (line endings don't count; other whitespace does); a missing or doubled block and a missing `kit.d.ts` get a line of their own. A plain-JavaScript plugin gets a `no kit.d.ts` line it can ignore, and its `code.js` block is not compared. The same run applies every other audit rule to your plugin.

## Protocol bumps

`KIT_PROTOCOL` is the version of the `kit:*` messages between `code.ts` and `ui.html`. It changes only when a kit message changes shape; a message that the other side can safely ignore is added within the same protocol, as `kit:fit` was in 0.3.0. Each side ignores `kit:*` types it doesn't know, so a newer half next to an older one just lacks the new feature ([messages.md](messages.md#the-kit-protocol-protocol-1)).

When a release does bump it, upgrade both halves together. With mismatched halves each side warns once in the console, naming both numbers, and carries on, and `npm run audit` reports `protocol-mismatch`. The release's CHANGELOG entry says so. Every release so far is protocol 1.

## What never changes before 1.0

Every breaking rename landed in 0.2.0 ([CHANGELOG.md](../CHANGELOG.md)). From 0.2.0 until 1.0, no public name is renamed or removed; releases only add. Public means the names a release lists under "Public surface": the `kit-*` classes, the `--kit-*` tokens, the `data-kit-*` attributes, the `kit:*` messages and their fields, the storage key `kit:window` and its record, `installKitWindow()` and its options, `window.kit`, the `data-kit-config` keys, the types in `kit.d.ts`, the npm scripts and the audit rule ids. Your markup, CSS and messages keep working across an upgrade, and saved window sizes carry over.

Not covered, and free to change in any release: the internal names in the `kit:window` block (`kitIsSizeRecord`, `kitClampSize`, `KIT_STORAGE_KEY` ...), the private custom properties inside components (`--kit-button-*`, `--kit-list-*` ...), the CSS inside the blocks, and defaults and behaviour, each listed under Changed. A release may also add names with the kit's reserved prefixes, so don't declare top-level names that start with `kit` or `Kit` plus a capital letter, or with `KIT_`, in your own code ([pitfall 17](pitfalls.md#17-smaller-traps)).

## From 0.2.0 to 0.3.0

Nothing was renamed and `KIT_PROTOCOL` stays 1, so the steps above are the whole upgrade. After it:

- **Translated the handle's label?** 0.3.0 adds two strings next to `strings.resizeLabel`: `strings.resizeHint` (the handle's description) and `strings.announce` (said after a keyboard resize). Without them a screen reader hears the English defaults ([window-chrome.md](window-chrome.md#customising-config)).
- **`kit-text-secondary` resets its margins** now, like `kit-help`. A `<p class="kit-text-secondary">` that relied on the browser's paragraph margins sits closer to its neighbours; add spacing in your own CSS, or put it in a `kit-stack`.
- **The runtime adds two elements** at the end of `<body>` when the page has a resize handle: `#kit-resize-hint` and a `[data-kit-announce]` live region. Don't use that id or attribute yourself.
- **New audit rules.** 0.3.0 adds 13 (`missing-disabled`, `sync-getter`, `unawaited-async`, `aria-label-override`, `missing-lang`, `missing-describedby`, `orphan-help`, `section-drift`, `budget`, `ses-forbidden`, `top-level-module`, `onmessage-assign`, `js-color-literal`); in a clone, take `scripts/audit.mjs` from 0.3.0 to get them, and expect findings in code that passed 0.2.0's audit.
- **The kit blocks are about 51.3 KB (52,549 bytes) in 0.3.0**, and 0.3.0's `budget` rule warns once the whole `ui.html` reaches 64 KB or 1,600 lines, your own code included. 0.4.0 replaced that rule ([below](#from-030-to-040)): if 0.3.0's warning shows up for a plugin of your own, take the 0.4.0 audit rather than cutting features ([pitfall 20](pitfalls.md#20-the-size-budget)).
- **New, if you want them:** fourteen components and `kit-scroll` ([components.md](components.md)), `fit()` on the window `installKitWindow()` returns ([window-chrome.md](window-chrome.md#fit-on-request-kitfit-and-kitwindowfit)), End on the handle for the widest snap.

## From 0.3.0 to 0.4.0

Nothing was renamed and `KIT_PROTOCOL` stays 1, so the steps above are the whole upgrade. After it:

- **Re-paste `kit.d.ts` with the blocks.** The 0.4.0 runtime's JSDoc names `KitDialogLike`, `KitToastOptions` and `KitToastHandle`, which only 0.4.0's `kit.d.ts` declares: with the 0.3.0 file, `npm run check:ui` reports `TS2304 Cannot find name` for each of them (tried on 2026-10-14). `KitUiApi` gained `dialog()` and `toast()`, so an object of your own typed `KitUiApi`, such as a test stub, needs both.
- **Translated the strings?** 0.4.0 adds `strings.dismiss`, the name of each toast's close button (default "Dismiss"). Add it to your `data-kit-config` ([window-chrome.md](window-chrome.md#customising-config)).
- **Names the runtime now uses.** The capture `click` listener the menu already had now also acts on `data-kit-dialog-open`, `data-kit-dialog-close` and `data-kit-dialog-light-dismiss`, the first `kit.toast()` adds a `div.kit-toast-region` to the page, and Escape sets `data-kit-tooltip-dismissed` on a tooltip's host. Don't use those attributes, or the `kit-dialog*` and `kit-toast*` classes, for your own elements. The runtime adds no listener at startup that 0.3.0 didn't, so a listener count in your own tests stays as it was.
- **Escape now hides tooltips.** If you added the Escape workaround script that 0.3.0's accessibility page suggested, delete it: the runtime now does the same ([accessibility.md](accessibility.md#tooltip)). The runtime doesn't take the key, so your own Escape handlers still run.
- **The size budget is the kit's, not yours.** The kit blocks are about 59.4 KB (60,776 bytes) in 0.4.0. In a clone, take `scripts/audit.mjs` from 0.4.0: its `budget` warning fires when the three `data-kit` blocks together pass 60 KB (pasted twice, edited, or holding code of your own) or when the whole ui file passes 128 KB or 3,200 lines, and no longer at 64 KB or 1,600 lines. That limit is now the starter shell's, checked by `test/budget.test.mjs`, which skips once your plugin has replaced the Create-shapes demo ([pitfall 20](pitfalls.md#20-the-size-budget)).
- **Built a dialog or a toast of your own?** Kit 0.3.0's UI3 mapping suggested a window view made of a section header, a section and a footer for a dialog, and `figma.notify()` for a toast. Both keep working; switch when you want to ([ui3-mapping.md](ui3-mapping.md#components)). `figma.notify()` is still the right call when the window is hidden or about to close.
- **Fixes you may notice** (the [0.4.0 "Fixed" list](../CHANGELOG.md#fixed)): in `resizable` mode a fit (`kit.fit()`, or `fit()` in `code.ts`) that arrives while the person drags the handle is dropped, not queued, so the drag's size stands until the next fit; in forced colours every `.kit-icon` takes the colour of what it sits in; in an engine without `ToggleEvent.source`, a menu opened from its second button sits under that button.
- **New, if you want them:** the dialog (`dialog.kit-dialog`, `data-kit-dialog-open` or `await kit.dialog('id')`) and the toast (`kit.toast(message, { tone, duration, action })`), in [components.md](components.md#dialog) and [components.md](components.md#toast).

From the 2025 files (the npm packages, or this repo before 0.2.0), upgrading is a replacement, not a re-paste: follow the [breaking renames table](../CHANGELOG.md#breaking-renames-from-the-2025-09-13-version).
