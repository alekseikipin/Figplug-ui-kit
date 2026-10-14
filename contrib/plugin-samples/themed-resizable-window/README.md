# Themed Resizable Window

![The sample window in the light and dark themes](../_screenshots/themed-resizable-window.png)

This sample shows a plugin window that follows the Figma theme and that people can resize from its bottom-right corner, with the mouse or the keyboard. The window reopens at the same size the next time the plugin runs.

It demonstrates:

- `figma.showUI(__html__, { themeColors: true })` with a UI styled only by the `--figma-color-*` CSS variables, so it matches the light and dark themes and FigJam without naming a colour,
- a resize handle that uses pointer capture, cancels with Escape and works from the keyboard (arrow keys, Shift for bigger steps),
- `figma.ui.resize` with the requested size validated, clamped and rounded in `code.ts`, and
- saving the size with `figma.clientStorage` and passing it to `figma.showUI` on the next run.

The code is meant for learning: treat it as a starting point and adapt it to your plugin.

## Running it

```
npm install
npm run build
```

Then import `manifest.json` from the Figma desktop app (Plugins > Development > Import plugin from manifest...).

## Known Limitations

- Figma documents a minimum window size (70 × 0) but no maximum, so the 240 × 160 to 1200 × 900 limits in `code.ts` are this sample's choice.
- `figma.clientStorage` lives on the user's machine and is keyed by the plugin `id`: the size doesn't follow people to another device, and changing the `id` forgets it.
- Each arrow key press starts from the window's current size, so holding a key down can skip a step while the window catches up.
- FigJam has no dark theme; there the variables hold FigJam's light palette.
