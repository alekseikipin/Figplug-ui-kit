<img width="1920" height="402" alt="Image" src="https://github.com/user-attachments/assets/b1fd628f-59ae-4052-994d-3e988df0489c" />
Figplug UI Kit - theme-aware, resizable plugin UI you can drop into your own Figma plugin. This repo intentionally ships without build tooling or a manifest so it can be used as a lightweight reference or copied into an existing plugin setup.


What’s Included
- `code.ts`: Main thread logic (window resize + persistence)
- `ui.html`: Theme-aware UI with resizer, keyboard support, and snap sizes

What’s Not Included
- No `manifest.json` (add this in your plugin project)
- No `package.json`, bundler, or ESLint config
- No build/watch scripts

How To Use
- Copy `code.ts` and `ui.html` into your plugin's source.

Features
- Theme-aware tokens using `--figma-color-*` and `themeColors: true`
![Image](https://github.com/user-attachments/assets/3671e727-4939-481d-bd09-f4c80b4c2c2b)
- Persistent window size via `figma.clientStorage`
![Image](https://github.com/user-attachments/assets/b2a89621-674a-430c-a754-85ae32f7ade4)
- Smooth resize with drag handle
![Image](https://github.com/user-attachments/assets/0ebea3a1-ffdc-458a-b3b8-d1adad849adb)
- Double-click snap widths (320, 480, 640px) and keyboard-accessible resizer
![Image](https://github.com/user-attachments/assets/208c4976-b70d-4b17-ac77-f12c1fbcfeb0)

Configuration
- Toggle size persistence: set `PERSIST_WINDOW_SIZE` in `code.ts`.

Notes
- For a full, ready-to-run plugin starter (with manifest and scripts), start from the official quickstart and then copy these files:
  - https://www.figma.com/plugin-docs/plugin-quickstart-guide/
