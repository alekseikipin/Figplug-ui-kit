// Every place that names the kit version names package.json's, so a version bump that misses one
// fails here (docs/release-checklist.md, "Version bump", lists them). Versions that are history
// (CHANGELOG.md, the docs, test/fixtures/, the examples' READMEs and agent diffs) are not checked.
// The data-kit blocks of the copies are compared with ui.html's by test/blocks.test.mjs, so only
// the root's are read here; the <meta name="kit"> outside them is read in every copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const at = (file) => new URL(`../${file}`, import.meta.url);
const read = (file) => readFileSync(at(file), 'utf8');
const VERSION = JSON.parse(read('package.json')).version;
const V = '(\\d+\\.\\d+\\.\\d+)';

const examples = existsSync(at('examples'))
  ? readdirSync(at('examples'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(at(`examples/${entry.name}/ui.html`)))
    .map((entry) => `examples/${entry.name}/ui.html`)
  : [];

const META = new RegExp(`<meta name="kit" content="kit v${V} · protocol 1 `);
const PLACES = [
  ['ui.html', 'the tokens block header', new RegExp(`/\\* kit tokens v${V} · protocol 1 `)],
  ['ui.html', 'KIT_VERSION (kit.version)', new RegExp(`const KIT_VERSION = '${V}';`)],
  ...['ui.html', 'preview.html', 'e2e/fixtures/kit-ui.html', ...examples].map((file) => [file, '<meta name="kit">', META]),
  ['preview.html', 'the page header', new RegExp(`<span class="kit-text-secondary">v${V} · protocol 1</span>`)],
  ['code.ts', 'the kit:window:start line', new RegExp(`^// ==== kit:window:start · kit v${V} · protocol 1 `)],
  ['kit.d.ts', 'the first line', new RegExp(`^// kit\\.d\\.ts · kit v${V} · protocol 1\\n`)],
  ['package-lock.json', 'the version', new RegExp(`^\\{\\n  "name": "figplug-ui-kit",\\n  "version": "${V}",`)],
  ['package-lock.json', 'the root package', new RegExp(`\\n    "": \\{\\n      "name": "figplug-ui-kit",\\n      "version": "${V}",`)],
  ...['scripts/audit.mjs', 'scripts/check-ui.mjs', 'scripts/serve.mjs', 'scripts/make-fonts-css.mjs'].map((file) => [file, 'the header', new RegExp(`^(?:#!.*\\n)?// ${file.replace(/[./]/g, '\\$&')} · kit v${V} · `)]),
  ['tokens.figma-fallback.css', 'the header', new RegExp(`^/\\* tokens\\.figma-fallback\\.css · kit v${V} · `)],
  ['playwright.config.mjs', 'the header', new RegExp(`^// playwright\\.config\\.mjs · kit v${V}\\n`)],
  ['.github/ISSUE_TEMPLATE/bug_report.yml', 'the "Kit header" placeholder', new RegExp(`\\n {6}placeholder: kit v${V} · protocol 1\\n`)],
];

test(`every place that names the kit version says package.json's ${VERSION}`, () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  const wrong = [];
  for (const [file, what, pattern] of PLACES) {
    const found = pattern.exec(read(file));
    if (!found) wrong.push(`${file}: ${what} not found (its format changed? update test/version.test.mjs)`);
    else if (found[1] !== VERSION) wrong.push(`${file}: ${what} says ${found[1]}`);
  }
  assert.deepEqual(wrong, [], `bump these to ${VERSION} (docs/release-checklist.md#version-bump):\n${wrong.join('\n')}`);
});
