<img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/5141e9a8-0063-44e8-8015-bb61941c5d7f" />
Figplug UI Kit - theme-aware, resizable plugin UI you can drop into your own Figma plugin. This repo intentionally ships without build tooling or a manifest so it can be used as a lightweight reference or copied into an existing plugin setup.

What’s Included
- `code.ts`: Main thread logic (window resize + persistence)
- `ui.html`: Theme-aware UI with resizer, keyboard support, and snap sizes

What’s Not Included
- No `manifest.json` (add this in your plugin project)
- No `package.json`, bundler, or ESLint config
- No build/watch scripts

How To Use
Add files to a plugin project
- Copy `code.ts` and `ui.html` into your plugin's source.

Features
- Theme-aware tokens using `--figma-color-*` and `themeColors: true`
- Persistent window size via `figma.clientStorage`
- Smooth resize with drag handle, clamped bounds, and throttling
- Double-click snap widths (320, 480, 640px) and keyboard-accessible resizer

Configuration
- Toggle size persistence: set `PERSIST_WINDOW_SIZE` in `code.ts`.

Notes
- For a full, ready-to-run plugin starter (with manifest and scripts), start from the official quickstart and then copy these files:
  - https://www.figma.com/plugin-docs/plugin-quickstart-guide/
