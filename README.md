<img width="1920" height="1080" alt="Image" src="https://github.com/user-attachments/assets/5141e9a8-0063-44e8-8015-bb61941c5d7f" />
<img width="128" height="128" alt="Image" src="https://github.com/user-attachments/assets/df574532-48b0-43ed-8732-460631728ff7" />
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
![Image](https://github.com/user-attachments/assets/1fba0bd4-e6bf-45ab-9fbf-f4d0e3e299f0)
- Persistent window size via `figma.clientStorage`
![Image](https://github.com/user-attachments/assets/ca762184-f669-41e0-b1b2-6a50e6945e00)
- Smooth resize with drag handle
![Image](https://github.com/user-attachments/assets/1e456071-9cf5-4044-8e44-9ce4ff4d97f5)
- Double-click snap widths (320, 480, 640px) and keyboard-accessible resizer
![Image](https://github.com/user-attachments/assets/c879c06a-d5a6-4b26-bc96-e9aef5251dff)

Configuration
- Toggle size persistence: set `PERSIST_WINDOW_SIZE` in `code.ts`.

Notes
- For a full, ready-to-run plugin starter (with manifest and scripts), start from the official quickstart and then copy these files:
  - https://www.figma.com/plugin-docs/plugin-quickstart-guide/
