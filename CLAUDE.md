@AGENTS.md

## Claude Code notes

- **Skills.** `.claude/skills/kit-ui/` (`kit-ui`) holds the procedure for building or editing a plugin UI in this repo; `.claude/skills/kit-frame-to-markup/` turns a Figma frame into kit markup. It loads when the task matches; `/kit-ui` invokes it by hand. Its `references/` folder is a symlink to `docs/`; if a clone lost the symlink (Windows without `core.symlinks`), read `docs/` directly.
- **Run the checks yourself with Bash**: `npm run build && npm run audit && npm run check:ui` (or `npm run check`, which adds the unit tests). Don't ask the person to run them, and don't report success until all three are clean. If `node_modules` is missing, run `npm install` (Node 24 or later). The person only needs the Figma desktop app.
- **Figma frames.** When the person pastes a Figma frame link and the Figma MCP server is connected, read the frame with `get_design_context` (and `get_screenshot` to see it), then rebuild it from kit classes ([docs/components.md](docs/components.md)) and tokens ([docs/tokens.md](docs/tokens.md#role--token-cheat-sheet)). Never copy its hex colours, pixel heights or generated React/Tailwind code into `ui.html`. Follow the `kit-frame-to-markup` skill, which maps UI3 kit components to kit markup through [docs/ui3-mapping.md](docs/ui3-mapping.md) (its UI3 names are still UNVERIFIED against Figma's Community file).
- **Secrets.** Never print, log or commit API keys, tokens, passwords or `.env` contents, and never paste them into `code.ts` or `ui.html`: a plugin's files ship to every person who installs it. If a plugin needs a key, tell the person where it goes and what it is for; don't echo it back.
- Don't commit, push, tag or publish (npm, Figma Community) unless the person asks.
