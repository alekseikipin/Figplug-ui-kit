# Contributing

1. **Open an issue first** ([bug form](https://github.com/alekseikipin/Figplug-ui-kit/issues/new/choose), or say what fails today and for whom), and wait for a yes before a pull request.
2. **Keep the principles** in [PLAN.md](PLAN.md#2-the-bet): hand-editable files and only `tsc`; no bundler, framework, runtime dependency, generator or CLI; every colour a `--figma-color-*` token; at most 20 components; neutral `kit` names.
3. **Every rule is checkable.** A new convention comes with an audit rule in `scripts/audit.mjs` and a fixture in `test/fixtures/`, or it doesn't land.
4. **Kit blocks change at the root only**: `ui.html`'s three `data-kit` blocks, `code.ts`'s `kit:window` block, `kit.d.ts`. Then copy them unchanged into `preview.html`, `e2e/fixtures/kit-ui.html` and every `examples/*`; `section-drift` and `npm test` list what is stale.
5. **Run `npm run check` and `npm run test:e2e`** and commit the rebuilt `code.js` files (CI fails on a stale one).
6. **Docs live in [docs/](docs/index.md).** README, AGENTS.md and the skill link into them by hand; never copy reference text across. Mark what you have not seen in a real Figma client UNVERIFIED.
7. **A change to `AGENTS.md`, a skill or a prompt** needs a one-shot run logged in [docs/prompts.md](docs/prompts.md#one-shot-log): a fresh clone, the entry prompt, the result.
8. Add a line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md). Public names are never renamed before 1.0.

By contributing you agree that your work is released under the [MIT licence](LICENSE).
