# Community listing

The copy for the kit's Figma Community listing, and the steps to republish it. Publishing is an owner action: nothing on this page has been submitted yet ([release-checklist.md](release-checklist.md#outward-actions-waiting-for-the-owner)).

The listing publishes the starter itself: the "Create shapes" demo with the kit's window chrome, so people can feel the UI before they clone the repo. The value is in the repo; the listing points there.

## Name

- **Name:** Figplug UI Kit
- **Fallback name:** TBD (fill in here once it is reserved; then use it in the README's brand line too)

Figma's trademark guidelines ask not to put "Fig" (part of Figma's name) in a product name, so "Figplug" may have to change; the fallback name is Figma-free for that case. Describe the kit with compatibility wording ("for Figma plugins", "works with Figma"), never as "a Figma UI kit". ([Using the Figma brand](https://www.figma.com/using-the-figma-brand/))

## Tagline

> Native-looking plugin UI and a resizable window, ready for Claude Code or Cursor.

## Description

Paste as is. The first paragraph is the same "Is this for you?" block as the top of the README.

> **Is this for you?** Quick internal tool: use Figma's agent. Network access, monetization, FigJam, Dev Mode or full UI control: start here.
>
> Not rsms/figplug (the build tool). Figplug UI Kit is a set of starter files for classic plugins, not a CLI.
>
> **What it is.** Three hand-editable files (manifest.json, code.ts with its compiled code.js, and ui.html) that import into the Figma desktop app with no terminal and no build. The UI uses Figma's own colour tokens, so it follows light, dark and FigJam; controls are 24px like Figma's panels. The window fits its content, resizes from a corner grip (drag, double-click to snap, or the keyboard) and remembers the width you chose. AGENTS.md tells Claude Code or Cursor how to build on it, and an audit script checks what they generate.
>
> **What this demo does.** "Create shapes": pick a count (1 to 50) and a shape (rectangle or ellipse), press Create, and the plugin places them in a row at the centre of your view, selects them and zooms to them. It shows how many layers you have selected. Drag the bottom-right grip to change the window's width, double-click it to snap between 320, 480 and 640 px; the next run opens at that width.
>
> **Get the files and docs:** https://github.com/alekseikipin/Figplug-ui-kit (setup: docs/install.md; building with an agent: docs/prompts.md).
>
> **Limits, plainly.**
> - Dropdowns use the native `<select>` popup of your operating system, not Figma's dark menu.
> - FigJam is light only (FigJam has no dark mode); its brand colour is purple.
> - Slides has no variables, components or styles, so plugins that need them don't work there.
> - Text uses Inter when the plugin window has it, otherwise your system font (system-ui); the kit loads no web fonts.
> - Dev Mode needs a separate plugin with its own manifest; this listing runs in Figma Design, FigJam, Slides and Buzz.
> - In Buzz (and Dev Mode) the plugin sits in a docked panel, so there is no resize grip.
> - Menus and tooltips can't be UI3's always-dark style with plugin tokens; they follow your theme instead.
>
> **Network access: none.** The plugin makes no network requests, collects nothing and has no telemetry. It stores one value on your machine, the window size, in Figma's plugin storage.
>
> **Support:** https://github.com/alekseikipin/Figplug-ui-kit/issues
>
> MIT licensed.

## Listing fields

| Field | Value |
|---|---|
| Category | Software development (or Design tools) |
| Network access label | No access to network (from `"networkAccess": { "allowedDomains": ["none"] }`) |
| Support contact | https://github.com/alekseikipin/Figplug-ui-kit/issues |
| Icon | 128 x 128 px. Not made yet. |
| Thumbnail | 1920 x 1080 px: the light and dark starter side by side. Not made yet; `docs/img/starter-light.png` and `starter-dark.png` are the source. |
| Carousel | Optional, up to nine images: the window in Design light, Design dark and FigJam, the resize grip mid-drag. |
| Data security form | Optional. Answers: no backend, no third-party requests, no authentication, no Figma data stored off the device (only the window size, in `figma.clientStorage`). Review can take up to two weeks. |
| Privacy policy | Not needed while the plugin processes no user data; required if a future version does. |

Sources: [Publish classic plugins to the Figma Community](https://help.figma.com/hc/en-us/articles/360042293394), [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914).

## Republish steps (owner action)

The listing already exists (published from the 2025 version; that it has not been updated since is UNVERIFIED: it comes from a search-engine snippet, and the listing page itself returned 403), so this is an update of that plugin, not a new one.

1. **Prerequisites.** The Figma desktop app (publishing only works there), two-factor authentication on the Figma account that owns the listing, the tagged release (`v0.2.0`), and the icon and thumbnail from the Listing fields above, which are not made yet ([steps](release-checklist.md#d-listing-icon-and-thumbnail-before-outward-action-2)).
2. **Make a publish folder.** Copy the release into a folder of its own. In that copy's `manifest.json`, set `"id"` to the published plugin's id (from the 2025 manifest, or from the plugin's entry in Figma's Manage plugins) and `"name"` to the listing name. Keep the repo's own `manifest.json` on the placeholder id, so people who import the repo never share storage or identity with the published plugin.
3. **Test it.** Import the copy's `manifest.json` (Plugins > Development > Import plugin from manifest...) and run it through the [surface matrix](release-checklist.md#manual-surface-matrix), at least Design light, Design dark and FigJam.
4. **Publish the update.** In the desktop app open Plugins > Manage plugins, find the published plugin and choose to publish a new version (the exact menu labels are not verified here). Replace the old description with the copy above, upload the icon and thumbnail, and check the support contact and the "No access to network" label on the final page.
5. **Submit and record.** Note the submission date in [release-checklist.md](release-checklist.md). Reviews have no published duration; forum reports in 2026 range from two to four or more weeks. Updates can be pushed while one is in review.

Review risks to know before submitting: the guidelines ask for no temporary content and an accurate description, and a starter demo may be read as sample content; the description therefore says plainly that it is a starter and links to the docs, as the guidelines ask. If a reviewer objects to the name, switch to the fallback name above.
