// Tests for scripts/audit.mjs. Each bad fixture in test/fixtures must trigger exactly one rule, at
// the right line and severity; clean, negatives, negatives-v2 and check-ui-errors must trigger none.
// The oneshot-* fixtures are the five Phase 1 one-shot plugins (docs/prompts.md), their own code
// verbatim: they pin what the audit says about real agent output. Cases that need a broken folder,
// an examples/ layout or a one-line change are built in a temp copy of the clean fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDir, colorLiterals, cssDeclarations, RULES, scanJs, targetsControl } from '../scripts/audit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUDIT = join(ROOT, 'scripts', 'audit.mjs');
const FIXTURES = join(ROOT, 'test', 'fixtures');
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
const run = (args, cwd = ROOT) => spawnSync(process.execPath, [AUDIT, ...args], { cwd, encoding: 'utf8' });

// [fixture, expected rule, file the finding is in, text on the line it must point at, severity]
const CASES = [
  ['clean'],
  ['negatives'],
  ['negatives-v2'],
  ['check-ui-errors'],
  ['color-hex-host-style', 'color-literal', 'ui.html', '#333333'],
  ['color-rgb-style-attr', 'color-literal', 'ui.html', 'rgb(0, 0, 0)'],
  ['color-svg-fill', 'color-literal', 'ui.html', '<path fill="#000"'],
  ['color-named', 'color-literal', 'ui.html', 'solid white'],
  ['color-in-tokens-block', 'color-literal', 'ui.html', '#e6e6e6'],
  ['control-height-28', 'control-height', 'ui.html', 'height: 28px'],
  ['control-height-inline', 'control-height', 'ui.html', 'height: 36px'],
  ['manifest-no-document-access', 'manifest-document-access', 'manifest.json', '{'],
  ['manifest-first-page', 'manifest-document-access', 'manifest.json', '"first-page"'],
  ['manifest-no-network-access', 'manifest-network-access', 'manifest.json', '{'],
  ['manifest-main-ts', 'manifest-fields', 'manifest.json', '"main"'],
  ['protocol-mismatch', 'protocol-mismatch', 'ui.html', 'const KIT_PROTOCOL = 1'],
  ['section-drift', 'section-drift', 'preview.html', 'padding: 0 12px'],
  ['missing-disabled', 'missing-disabled', 'ui.html', '.layer-row:hover'],
  ['sync-getter', 'sync-getter', 'code.ts', 'figma.getNodeById('],
  ['unawaited-async', 'unawaited-async', 'code.ts', 'figma.loadFontAsync('],
  ['unawaited-foreach', 'unawaited-async', 'code.ts', 'texts.forEach(async'],
  ['aria-label-override', 'aria-label-override', 'ui.html', 'aria-label="Text to add'],
  ['missing-lang', 'missing-lang', 'ui.html', '<html>'],
  ['missing-describedby', 'missing-describedby', 'ui.html', '<input class="kit-input" id="count"'],
  ['missing-describedby-tooltip', 'missing-describedby', 'ui.html', '<span class="kit-tooltip"'],
  ['budget', 'budget', 'ui.html', '<!doctype html>', 'warning'],
  ['ses-forbidden', 'ses-forbidden', 'code.ts', "import('./words')"],
  ['ses-forbidden-ui', 'ses-forbidden', 'ui.html', '<!--', 'warning'],
  ['top-level-module', 'top-level-module', 'code.ts', 'export {}'],
  ['onmessage-assign', 'onmessage-assign', 'code.ts', 'figma.ui.onmessage =', 'warning'],
  ['js-color-literal', 'js-color-literal', 'ui.html', "'#e5e5e5'"],
  ['orphan-help', 'orphan-help', 'ui.html', 'id="status"', 'warning'],
];

// The Phase 1 one-shot plugins: [fixture, [rule, text on the line] for each finding, in order].
// Every one passed audit v1; v2 finds only .kit-help used as plain text (all warnings). Their
// other suspicious-looking code (a swatch colour from document data, Promise.all of getNodeByIdAsync,
// a .catch()-ed lookup, a <template> help wired by script) must stay quiet.
const ONESHOTS = [
  ['oneshot-rename-layers', [['orphan-help', 'id="preview-empty"'], ['orphan-help', 'rename-status" id="status"']]],
  ['oneshot-export-selection', [['orphan-help', 'export-status" id="status"']]],
  ['oneshot-content-fill', [['orphan-help', '<p class="kit-help" id="status"']]],
  ['oneshot-variables-sync', [['orphan-help', '<p class="kit-help">Type a hex code'], ['orphan-help', 'id="empty"'],
    ['orphan-help', '<p class="kit-help" id="status"']]],
  ['oneshot-a11y-contrast', [['orphan-help', '<p class="kit-help">Each selected'], ['orphan-help', 'id="hint"']]],
];

test('every fixture folder has a case here', () => {
  const folders = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort();
  assert.deepEqual(folders, [...CASES.map(([n]) => n), ...ONESHOTS.map(([n]) => n)].sort());
});

// Every rule id the audit reports, as docs/pitfalls.md lists them.
const RULE_IDS = ['manifest-fields', 'manifest-document-access', 'manifest-network-access', 'color-literal', 'control-height',
  'protocol-mismatch', 'section-drift', 'missing-disabled', 'sync-getter', 'unawaited-async', 'aria-label-override',
  'missing-lang', 'missing-describedby', 'budget', 'ses-forbidden', 'top-level-module', 'onmessage-assign',
  'js-color-literal', 'orphan-help'];

test('every rule has a fixture that triggers it, and docs/pitfalls.md documents it', () => {
  assert.equal(RULES.length, RULE_IDS.length);
  assert.deepEqual([...new Set(CASES.map(([, rule]) => rule).filter(Boolean))].sort(), [...RULE_IDS].sort());
  const pitfalls = readFileSync(join(ROOT, 'docs', 'pitfalls.md'), 'utf8');
  for (const id of RULE_IDS) assert.match(pitfalls, new RegExp(`^\\| \`${id}\` \\|`, 'm'), `${id} in the rule reference table`);
});

for (const [name, rule, file, needle, severity = 'error'] of CASES) {
  test(`${name}: ${rule ?? 'no findings'}`, () => {
    const findings = auditDir(join(FIXTURES, name));
    assert.deepEqual(findings.map((f) => f.rule), rule ? [rule] : [], JSON.stringify(findings, null, 1));
    if (!rule) return;
    const [f] = findings;
    assert.equal(f.severity, severity);
    assert.ok(f.file.endsWith(`${name}/${file}`), f.file);
    assert.equal(f.line, lineOf(readFileSync(join(FIXTURES, name, file), 'utf8'), needle));
  });
}

for (const [name, expected] of ONESHOTS) {
  test(`${name} (a Phase 1 one-shot plugin): ${expected.length} orphan-help warning(s), nothing else`, () => {
    const findings = auditDir(join(FIXTURES, name));
    const ui = readFileSync(join(FIXTURES, name, 'ui.html'), 'utf8');
    assert.deepEqual(findings.map((f) => [f.rule, f.severity, f.line]),
      expected.map(([rule, needle]) => [rule, 'warning', lineOf(ui, needle)]));
    assert.ok(findings.every((f) => f.file.endsWith(`${name}/ui.html`)));
  });
}

// A temp copy of the clean fixture, changed by edit(dir), audited, then removed.
function auditVariant(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-audit-test-'));
  try {
    cpSync(join(FIXTURES, 'clean'), dir, { recursive: true });
    edit(dir);
    return auditDir(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const patchJson = (dir, patch) => {
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), ...patch }, null, 2));
};
const patchText = (dir, file, from, to) => {
  const path = join(dir, file);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes(from), `${file} contains ${from}`);
  writeFileSync(path, text.replace(from, to));
};

// A style block added to the clean fixture's <head>, markup added to its <main>, a host script
// added before </body>, or main-thread code added to the end of its code.ts.
const addStyle = (d, css) => patchText(d, 'ui.html', '</head>', `<style>${css}</style></head>`);
const addMarkup = (d, html) => patchText(d, 'ui.html', '</main>', `${html}</main>`);
const addScript = (d, js) => patchText(d, 'ui.html', '</body>', `<script>\n${js}\n</script></body>`);
const addMain = (d, ts) => writeFileSync(join(d, 'code.ts'), `${readFileSync(join(d, 'code.ts'), 'utf8')}\n${ts}\n`);
// A disabled button the host styles with .row, for the missing-disabled cases (the rule only
// looks at pages that disable something), and a style next to some disabled control.
const rowButton = (d, css) => { addMarkup(d, '<button class="row" type="button" disabled>Frame 1</button>'); addStyle(d, css); };
const disabledStyle = (d, css) => { addMarkup(d, '<button type="button" disabled>Off</button>'); addStyle(d, css); };

const VARIANTS = [
  ['no manifest.json', 'manifest-fields', (d) => rmSync(join(d, 'manifest.json'))],
  ['manifest.json that is not JSON', 'manifest-fields', (d) => writeFileSync(join(d, 'manifest.json'), '{ "name": ')],
  ['"main" pointing to a missing file', 'manifest-fields', (d) => rmSync(join(d, 'code.js'))],
  ['"dev" combined with "figjam"', 'manifest-fields', (d) => patchJson(d, { editorType: ['figjam', 'dev'] })],
  ['missing "ui"', 'manifest-fields', (d) => patchJson(d, { ui: undefined })],
  ['allowedDomains ["*"] without reasoning', 'manifest-network-access',
    (d) => patchJson(d, { networkAccess: { allowedDomains: ['*'] } })],
  ['empty allowedDomains', 'manifest-network-access', (d) => patchJson(d, { networkAccess: { allowedDomains: [] } })],
  ['--kit-control-height overridden to 28px', 'control-height',
    (d) => patchText(d, 'ui.html', '--kit-control-height: 24px', '--kit-control-height: 28px')],
  ['hsl() in a host style', 'color-literal', (d) => addStyle(d, '.x { color: hsl(0 0% 20%); }')],
  ['a var() fallback literal', 'color-literal',
    (d) => patchText(d, 'ui.html', 'var(--figma-color-bg-brand)', 'var(--figma-color-bg-brand, #0d99ff)')],
  ['a shadow token outside the tokens block', 'color-literal',
    (d) => addStyle(d, ':root { --kit-shadow-menu: 0 1px 2px rgba(0, 0, 0, 0.2); }')],
  ['code.ts with KIT_PROTOCOL but no runtime in ui.html', 'protocol-mismatch',
    (d) => patchText(d, 'ui.html', 'const KIT_PROTOCOL = 1;', '')],
  ['a runtime but no KIT_PROTOCOL in code.ts', 'protocol-mismatch', (d) => {
    rmSync(join(d, 'code.ts')); // the audit then reads the manifest's main, code.js
    patchText(d, 'code.js', 'const KIT_PROTOCOL = 1;', '');
  }],
  // Colours the browser applies although no space or no literal "#" precedes them.
  ['minified "1px solid#000"', 'color-literal', (d) => addStyle(d, '.x{border:1px solid#000}')],
  ['minified "0 0 1px#000"', 'color-literal', (d) => addStyle(d, '.x{box-shadow:0 0 1px#000}')],
  ['an entity-encoded # in style=""', 'color-literal', (d) => addMarkup(d, '<p style="color: &#35;0000ff">x</p>')],
  ['&num; in a fill attribute', 'color-literal', (d) => addMarkup(d, '<svg><path fill="&num;000" d="M0 0"/></svg>')],
  ['an escaped \\# in a value is a name, not a colour', null, (d) => addStyle(d, '.x { grid-area: a\\#fff; }')],
  // An HTML comment is masked for every other rule, and is itself a (warning) finding.
  ['a commented-out <p style="color: red"> is only the comment warning', ['ses-forbidden'],
    (d) => addMarkup(d, '<!-- <p style="color: red">x</p> -->')],
  // Control heights: other properties, other units, and --kit-control-height wherever it is set.
  ['block-size on .kit-button', 'control-height', (d) => addStyle(d, '.kit-button { block-size: 28px; }')],
  ['min-block-size on .kit-input', 'control-height', (d) => addStyle(d, '.kit-input { min-block-size: 28px; }')],
  ['max-height on .kit-button', 'control-height', (d) => addStyle(d, '.kit-button { max-height: 20px; }')],
  ['calc(28px) on a button', 'control-height', (d) => addStyle(d, 'button { height: calc(28px); }')],
  ['1.75rem on .kit-select > select', 'control-height', (d) => addStyle(d, '.kit-select > select { height: 1.75rem; }')],
  ['2em on .kit-button-primary', 'control-height', (d) => addStyle(d, '.kit-button-primary { height: 2em; }')],
  ['1.5rem (24px) is fine', null, (d) => addStyle(d, '.kit-button { height: 1.5rem; }')],
  ['--kit-control-height: 1.75rem (28px)', 'control-height',
    (d) => patchText(d, 'ui.html', '--kit-control-height: 24px', '--kit-control-height: 1.75rem')],
  ['--kit-control-height: var(--other)', 'control-height',
    (d) => addStyle(d, '.x { --kit-control-height: var(--other); }')],
  ['--kit-control-height: var(--kit-control-height-large) is fine', null,
    (d) => addStyle(d, '.x { --kit-control-height: var(--kit-control-height-large); }')],
  ['inline --kit-control-height on <main>', 'control-height',
    (d) => patchText(d, 'ui.html', '<main class="kit-app" data-kit-root>', '<main class="kit-app" data-kit-root style="--kit-control-height: 28px">')],
  ['inline --kit-control-height on a button', 'control-height',
    (d) => addMarkup(d, '<button type="button" style="--kit-control-height: 28px">a</button>')],
  ['input[type="checkbox" i] is not a control', null, (d) => addStyle(d, 'input[type="checkbox" i] { height: 16px; }')],
  ['a .kit-button-group wrapper is not a control', null, (d) => addStyle(d, '.kit-button-group { height: 40px; }')],
  ['the visually-hidden idiom (1px) is fine', null, (d) => addStyle(d, 'button.sr-only { height: 1px; }')],
  ['a textarea sizes to its rows', null, (d) => addStyle(d, 'textarea { min-height: 80px; }')],
  ['select[multiple] sizes to its rows', null, (d) => addStyle(d, 'select[multiple] { height: 96px; }')],
  ['inline height on <textarea> and <select size="4">', null,
    (d) => addMarkup(d, '<textarea style="height: 80px"></textarea><select size="4" style="height: 96px"></select>')],
  // KIT_PROTOCOL: comments and strings never count; the compiled code.js must match code.ts.
  ['an old KIT_PROTOCOL in a code.ts comment', null,
    (d) => patchText(d, 'code.ts', 'const KIT_PROTOCOL = 1;', '// 0.1 had: const KIT_PROTOCOL = 0;\nconst KIT_PROTOCOL = 1;')],
  ['an old KIT_PROTOCOL in a runtime comment', null,
    (d) => patchText(d, 'ui.html', "'use strict';", "'use strict';\n      /* was: const KIT_PROTOCOL = 0 */")],
  ['KIT_PROTOCOL = 1.5 in the runtime', 'protocol-mismatch',
    (d) => patchText(d, 'ui.html', 'const KIT_PROTOCOL = 1;', 'const KIT_PROTOCOL = 1.5;')],
  ['code.js stale against code.ts', 'protocol-mismatch', (d) => patchText(d, 'code.js', 'const KIT_PROTOCOL = 1;', 'const KIT_PROTOCOL = 2;')],
  ['code.js without KIT_PROTOCOL next to a code.ts with it', 'protocol-mismatch',
    (d) => patchText(d, 'code.js', 'const KIT_PROTOCOL = 1;', '')],
  // Manifest values of the wrong kind.
  ['editorType ["figam"]', 'manifest-fields', (d) => patchJson(d, { editorType: ['figam'] })],
  ['editorType [123]', 'manifest-fields', (d) => patchJson(d, { editorType: [123] })],
  ['"main": 123', 'manifest-fields', (d) => patchJson(d, { main: 123 })],
  ['"ui": {}', 'manifest-fields', (d) => patchJson(d, { ui: {} })],
  ['"ui": ["ui.html"]', 'manifest-fields', (d) => patchJson(d, { ui: ['ui.html'] })],
  ['"ui": { "main": "ui.html" } is fine', null, (d) => patchJson(d, { ui: { main: 'ui.html' } })],

  // missing-disabled: which rules give a control hover feedback, and what counts as handling disabled.
  ['hover on a button built in an innerHTML string, disabled by script', 'missing-disabled', (d) => {
    addScript(d, "const main = document.querySelector('main');\nmain.innerHTML = '<button class=\"row\">x</button>';\nmain.firstChild.disabled = true;");
    addStyle(d, '.row:hover { background: var(--figma-color-bg-hover); }');
  }],
  ['hover on button, the element', 'missing-disabled', (d) => disabledStyle(d, 'button:hover { color: var(--figma-color-text); }')],
  ['hover on .kit-button-primary in a host style', 'missing-disabled',
    (d) => disabledStyle(d, '.kit-button-primary:hover { background: var(--figma-color-bg-brand-hover); }')],
  ['hover on a control inside @media (hover: hover)', 'missing-disabled',
    (d) => rowButton(d, '@media (hover: hover) { .row:hover { background: var(--figma-color-bg-hover); } }')],
  ['hover on [role="button"], with aria-disabled set by script', 'missing-disabled', (d) => {
    addStyle(d, '[role="button"]:hover { color: var(--figma-color-text); }');
    addScript(d, "document.body.setAttribute('aria-disabled', 'false');");
  }],
  ['hover on a control of a page that never disables anything', null,
    (d) => addStyle(d, 'button:hover { color: var(--figma-color-text); }')],
  ['an [aria-disabled="true"] rule handles it', null, (d) => rowButton(d,
    '.row:hover { background: var(--figma-color-bg-hover); } .row[aria-disabled="true"] { background: transparent; }')],
  [':enabled:hover is fine', null, (d) => rowButton(d, '.row:enabled:hover { background: var(--figma-color-bg-hover); }')],
  ['a generic :disabled rule handles it', null,
    (d) => rowButton(d, '.row:hover { background: var(--figma-color-bg-hover); } button:disabled { cursor: default; }')],
  ['hover on a div is not a control', null, (d) => {
    addMarkup(d, '<div class="card">x</div>');
    addStyle(d, '.card:hover { background: var(--figma-color-bg-hover); }');
  }],
  ['a hover that only changes layout is not feedback', null, (d) => rowButton(d, '.row:hover { min-height: 24px; }')],
  [':not(:hover) is not hover', null, (d) => rowButton(d, '.row:not(:hover) { color: var(--figma-color-text-secondary); }')],

  // sync-getter: each dynamic-page trap, and what is fine.
  ...[
    ['figma.getStyleById', 'figma.getStyleById("S:1");'],
    ['figma.getLocalPaintStyles', 'const styles = figma.getLocalPaintStyles();'],
    ['figma.getFileThumbnailNode', 'const thumb = figma.getFileThumbnailNode();'],
    ['figma.variables.getLocalVariables', 'const vars = figma.variables.getLocalVariables("COLOR");'],
    ['figma.variables.getVariableCollectionById', 'const c = figma.variables.getVariableCollectionById("VC:1");'],
    ['reading instance.mainComponent', 'function main(i: InstanceNode) { return i.mainComponent?.name; }'],
    ['assigning figma.currentPage', 'figma.currentPage = figma.root.children[1];'],
    ['assigning node.fillStyleId', 'function f(n: RectangleNode) { n.fillStyleId = "S:1"; }'],
    ['assigning node.textStyleId', 'function f(n: TextNode) { n.textStyleId = "S:1"; }'],
    ['node.setRangeFillStyleId', 'function f(n: TextNode) { n.setRangeFillStyleId(0, 1, "S:1"); }'],
    ['figma.root.findAll without loadAllPagesAsync', 'const texts = figma.root.findAll((n) => n.type === "TEXT");'],
    ['figma.root.findAllWithCriteria', 'const texts = figma.root.findAllWithCriteria({ types: ["TEXT"] });'],
    ["figma.on('documentchange') without loadAllPagesAsync", "figma.on('documentchange', () => {});"],
  ].map(([label, ts]) => [label, 'sync-getter', (d) => addMain(d, ts)]),
  ['a sync fallback behind a check for its Async version is fine', null, (d) => addMain(d, [
    'async function style(node: TextNode, id: string) {',
    "  const api = node as unknown as Record<string, unknown>;",
    "  if (typeof api.setRangeTextStyleIdAsync === 'function') await node.setRangeTextStyleIdAsync(0, 1, id);",
    '  else node.setRangeTextStyleId(0, 1, id);',
    '}',
  ].join('\n'))],
  ['figma.root.findAll after loadAllPagesAsync is fine', null,
    (d) => addMain(d, 'async function all() { await figma.loadAllPagesAsync(); return figma.root.findAll(() => true); }')],
  ["documentchange after loadAllPagesAsync is fine", null,
    (d) => addMain(d, "figma.loadAllPagesAsync().then(() => figma.on('documentchange', () => {}));")],
  ['assigning instance.mainComponent, reading currentPage, page.findAll are fine', null, (d) => addMain(d, [
    'function swap(i: InstanceNode, c: ComponentNode) { i.mainComponent = c; }',
    'const page = figma.currentPage;',
    'figma.currentPage.selection = page.findAll((n) => n.type === "TEXT");',
  ].join('\n'))],
  ['sync getters named in comments and strings are fine', null,
    (d) => addMain(d, '// figma.getNodeById(id) throws\nconst NOTE = "figma.getLocalPaintStyles() and figma.currentPage = page";')],
  // The same calls spelled another way (audit attack, round 1): optional chaining, a bracket, a
  // name for figma, figma.root or figma.variables.
  ...[
    ['figma?.getNodeById', 'function f(id: string) { return figma?.getNodeById(id); }'],
    ['figma.getNodeById?.()', 'function f(id: string) { return figma.getNodeById?.(id); }'],
    ["figma['getNodeById']", "function f(id: string) { return figma['getNodeById'](id); }"],
    ["node['fillStyleId'] =", "function f(n: RectangleNode) { n['fillStyleId'] = 'S:1'; }"],
    ['const f = figma; f.getNodeById', 'const f = figma;\nfunction g(id: string) { return f.getNodeById(id); }'],
    ['const root = figma.root; root.findAll', 'const root = figma.root;\nconst texts = root.findAll((n) => n.type === "TEXT");'],
    ['const { variables: vars } = figma; vars.getLocalVariables', 'const { variables: vars } = figma;\nconst v = vars.getLocalVariables();'],
  ].map(([label, ts]) => [label, 'sync-getter', (d) => addMain(d, ts)]),
  ['names in an array literal, another object\'s figma and getNodeByIdAsync are fine', null, (d) => addMain(d, [
    "const KEYS = ['fillStyleId', 'mainComponent'];",
    "function keys() { return ['mainComponent']; }",
    'const f = figma;',
    'declare const o: { f: { getNodeById(id: string): null } };',
    "o.f.getNodeById('1');",
    'async function g(id: string) { return [KEYS, keys, await f.getNodeByIdAsync(id)]; }',
  ].join('\n'))],

  // unawaited-async: the promise has to reach an await, a return, a then/catch, or a collection.
  ...[
    ['a dropped call in an arrow body', "figma.on('run', () => { figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); });"],
    ['a dropped call ending a line (no semicolon)', "const x = 1\nfigma.clientStorage.setAsync('k', x)\nconst y = 2"],
    ['a dropped call in an if body', 'function f(c: boolean, n: TextNode) { if (c) figma.loadFontAsync(n.fontName as FontName); }'],
    ['a promise as a condition', 'async function f(id: string) { if (figma.getNodeByIdAsync(id)) return; }'],
    ['a negated promise', 'async function f(id: string) { if (!figma.getNodeByIdAsync(id)) return; }'],
    ['a property read on the promise', 'async function f(id: string) { return figma.getNodeByIdAsync(id).name; }'],
    ['await on the property, not the call', 'async function f(id: string) { const n = await figma.getNodeByIdAsync(id).name; }'],
    ['a variable that is never awaited', 'async function f(id: string) { const node = figma.getNodeByIdAsync(id); console.warn(node); }'],
    ['a Promise.all result that is never awaited',
      'async function f(ids: string[]) { const nodes = Promise.all(ids.map((id) => figma.getNodeByIdAsync(id))); console.warn(nodes); }'],
    ['a promise in a template string', 'async function f(id: string) { console.warn(`${figma.getNodeByIdAsync(id)}`); }'],
    ['a dropped call to your own *Async function', 'async function loadAsync(): Promise<void> {}\nloadAsync();'],
  ].map(([label, ts]) => [label, 'unawaited-async', (d) => addMain(d, ts)]),
  ['awaited, returned, then-ed, caught, voided, collected and kept promises are fine', null, (d) => addMain(d, [
    'async function a(n: TextNode) { await figma.loadFontAsync(n.fontName as FontName); }',
    'function b(n: TextNode) { return figma.loadFontAsync(n.fontName as FontName); }',
    "figma.clientStorage.getAsync('k').then((v) => console.warn(v));",
    "figma.clientStorage.getAsync('k')\n  .then((v) => console.warn(v));",
    "figma.clientStorage.setAsync('k', 1).catch(() => {});",
    "void figma.clientStorage.setAsync('k', 1);",
    'async function c(ids: string[]) { return Promise.all(ids.map((id) => figma.getNodeByIdAsync(id))); }',
    'async function d(x: TextNode, y: TextNode) { await Promise.all([figma.loadFontAsync(x.fontName as FontName), figma.loadFontAsync(y.fontName as FontName)]); }',
    "async function e() { const p = figma.clientStorage.getAsync('k'); const q = figma.clientStorage.getAsync('j'); return [await p, await q]; }",
    "async function g(id: string) { const p = figma.getNodeByIdAsync(id); return await withTimeout(p, 300); }",
    'function h(id: string, list: Promise<unknown>[]) { const p = figma.getNodeByIdAsync(id); list.push(p); }',
    'async function i(id: string) { const n = (await figma.getNodeByIdAsync(id))?.name; return n; }',
    "async function j(c: boolean) { return await (c ? figma.clientStorage.getAsync('a') : figma.clientStorage.getAsync('b')); }",
    "track(figma.clientStorage.getAsync('k'));",
    'const state = { ready: null as unknown }; state.ready = figma.clientStorage.getAsync("k");',
    'async function k(nodes: SceneNode[]) { return await nodes[0].exportAsync({ format: "PNG" }); }',
    'async function m() { for (const v of await figma.variables.getLocalVariablesAsync()) console.warn(v); }',
  ].join('\n'))],
  // forEach drops what its callback returns; a case label starts a statement; a line that ends in a
  // literal (no semicolons) or a regex after if (...) must not hide the next statement.
  ...[
    ['a concise forEach callback', 'function f(ns: TextNode[]) { ns.forEach((n) => figma.loadFontAsync(n.fontName as FontName)); }', 1],
    ['an async forEach callback', 'function f(ns: TextNode[]) {\n  ns.forEach(async (n) => {\n    await figma.loadFontAsync(n.fontName as FontName);\n  });\n}', 1],
    ['an *Async function passed to forEach', 'async function loadAsync(n: TextNode) { await figma.loadFontAsync(n.fontName as FontName); }\nfunction f(ns: TextNode[]) { ns.forEach(loadAsync); }', 1],
    ['dropped calls after case and default labels',
      "declare const t: string;\nswitch (t) {\n  case 'save':\n    figma.clientStorage.setAsync('k', 1);\n    break;\n  default:\n    figma.clientStorage.deleteAsync('k');\n}", 2],
    ['a dropped call in a CRLF file without semicolons', "const x = 1\r\nfigma.clientStorage.setAsync('k', x)\r\nconst y = 2\r\nvoid y", 1],
    ['a dropped call after a line that ends in a string', "const name = 'a'\nfigma.clientStorage.setAsync('k', name)", 1],
    ['a dropped call after if (...) /regex/', "declare const ok: boolean;\nif (ok) /'/.test('x');\nfigma.clientStorage.setAsync('k', 1);", 1],
  ].map(([label, ts, n]) => [label, Array(n).fill('unawaited-async'), (d) => addMain(d, ts)]),
  ['void in a forEach callback, a "default" key, isAsync() and an awaited map(async) are fine', null, (d) => addMain(d, [
    'function a(ns: TextNode[]) { ns.forEach((n) => void figma.loadFontAsync(n.fontName as FontName)); }',
    "const o = { default: figma.clientStorage.getAsync('k') };",
    'function isAsync(f: unknown): boolean { return String(f).startsWith("async"); }',
    'if (isAsync(a)) console.warn(o);',
    'async function b(ns: TextNode[]) { await Promise.all(ns.map(async (n) => { await figma.loadFontAsync(n.fontName as FontName); })); }',
    "declare const t: string;\nswitch (t) { case 'a': void b([]); break; }",
  ].join('\n'))],
  ['declarations and signatures of *Async functions are not calls', null, (d) => addMain(d, [
    'async function loadAsync(): Promise<void> {}',
    'class Store { async saveAsync(x: number): Promise<void> { void x; } readAsync(): Promise<void> { return Promise.resolve(); } }',
    'interface HostStore { getAsync(key: string): Promise<unknown>; }',
    'const NOTE = "figma.loadFontAsync(font);"; // figma.loadFontAsync(font);',
  ].join('\n'))],

  // ses-forbidden: raw text, comments and strings included, in code.ts and the compiled code.js.
  ['"<!--" in a code.ts string', ['ses-forbidden'], (d) => addMain(d, 'const markup = "<!-- note";')],
  ['"-->" as i-->0', ['ses-forbidden'], (d) => addMain(d, 'let i = 3;\nwhile (i-->0) {}')],
  ['"import (" with a space', ['ses-forbidden'], (d) => addMain(d, '// call import (later)')],
  ['import( in code.js only', ['ses-forbidden'], (d) => patchText(d, 'code.js', 'const KIT_PROTOCOL = 1;', 'const KIT_PROTOCOL = 1;\n// import("x")')],
  ['import( and <!-- in both code.ts and code.js', ['ses-forbidden', 'ses-forbidden', 'ses-forbidden', 'ses-forbidden'], (d) => {
    addMain(d, '// import("x") <!--');
    patchText(d, 'code.js', 'const KIT_PROTOCOL = 1;', 'const KIT_PROTOCOL = 1;\n// import("x") <!--');
  }],
  ['i-- > 0 and lib.import() are fine', null,
    (d) => addMain(d, 'let i = 3;\nwhile (i-- > 0) {}\ndeclare const lib: Record<string, (n: number) => number>;\nlib.import(1);')],

  // top-level-module and onmessage-assign.
  ['import ... from in code.ts', 'top-level-module', (d) => addMain(d, "import { helper } from './helper';")],
  ['import type in code.ts', 'top-level-module', (d) => addMain(d, "import type { Helper } from './helper';")],
  ['export const in code.ts', 'top-level-module', (d) => addMain(d, 'export const HELPER = 1;')],
  ['export inside declare namespace is not a module', null,
    (d) => addMain(d, 'declare namespace HostTypes { export interface Row { id: string } }\nconst exportsCount = 0;\nvoid exportsCount;')],
  ['comparing figma.ui.onmessage is fine', null, (d) => addMain(d, 'if (figma.ui.onmessage === undefined) figma.ui.on("message", () => {});')],
  ['figma.ui.onmessage = in a comment is fine', null, (d) => addMain(d, '// never: figma.ui.onmessage = (msg) => {}')],

  // aria-label-override.
  ['an aria-label on a control wrapped in its label', 'aria-label-override',
    (d) => addMarkup(d, '<label class="kit-checkbox"><input type="checkbox" aria-label="Toggle"> Include hidden layers</label>')],
  ['an aria-label that replaces a button text', 'aria-label-override', (d) => addMarkup(d, '<button type="button" aria-label="Dismiss">Close</button>')],
  ['an aria-label that replaces a submit value', 'aria-label-override', (d) => addMarkup(d, '<input type="submit" value="Apply" aria-label="Rename layers">')],
  ['an aria-label on role="button" text', 'aria-label-override', (d) => addMarkup(d, '<div role="button" tabindex="0" aria-label="Remove">Delete</div>')],
  ['an aria-label that keeps every word of the visible label is fine', null, (d) => addMarkup(d, [
    '<label for="n">Name:</label><input id="n" aria-label="Layer name">',
    '<button type="button" aria-label="Close dialog">Close</button>',
    '<label for="t">Duration (s)</label><input id="t" aria-label="Animation duration in seconds">',
  ].join(''))],
  ['icon-only, symbol-only and visually hidden labels are fine', null, (d) => addMarkup(d, [
    '<button class="kit-icon-button" type="button" aria-label="Settings"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0"/></svg></button>',
    '<button type="button" aria-label="Dismiss">&times;</button>',
    '<label class="kit-visually-hidden" for="q">Search</label><input id="q" aria-label="Filter layers">',
    '<button type="button" aria-label="Select Frame 1">Select<span class="kit-visually-hidden"> Frame 1</span></button>',
  ].join(''))],
  ['aria-labelledby wins over aria-label', null,
    (d) => addMarkup(d, '<label for="q" id="ql">Search</label><input id="q" aria-label="Filter" aria-labelledby="ql">')],
  ['an aria-label on role="button" whose text follows a nested <div>', 'aria-label-override',
    (d) => addMarkup(d, '<div role="button" tabindex="0" aria-label="Remove"><div class="kit-icon"></div>Delete item</div>')],
  ['one-letter symbols and the value text of a slider, spinbutton or combobox are fine', null, (d) => addMarkup(d, [
    '<button type="button" aria-label="Close">X</button><button type="button" aria-label="Bold">B</button>',
    '<div role="slider" tabindex="0" aria-label="Opacity" aria-valuenow="50">50%</div>',
    '<div role="spinbutton" tabindex="0" aria-label="Count" aria-valuenow="5">5 items</div>',
    '<div role="combobox" tabindex="0" aria-label="Font weight" aria-expanded="false">Regular</div>',
  ].join(''))],

  // missing-lang, missing-describedby, orphan-help.
  ['lang=""', 'missing-lang', (d) => patchText(d, 'ui.html', '<html lang="en">', '<html lang="">')],
  ['no <html> element at all', 'missing-lang', (d) => patchText(d, 'ui.html', '<html lang="en">', '')],
  ['role="tooltip" without an id', 'missing-describedby', (d) => addMarkup(d, '<span class="kit-tooltip" role="tooltip">More</span>')],
  ['a tooltip referenced from a script is fine', null, (d) => {
    addMarkup(d, '<button id="info" type="button">Info</button><span class="kit-tooltip" role="tooltip" id="tip">More</span>');
    addScript(d, "document.getElementById('info').setAttribute('aria-describedby', 'tip');");
  }],
  ['aria-invalid="true" inside a <template> is wired by script', null,
    (d) => addMarkup(d, '<template><input class="kit-input" aria-invalid="true"></template>')],
  ['aria-invalid with aria-errormessage is fine', null,
    (d) => addMarkup(d, '<input id="c" aria-invalid="true" aria-errormessage="c-help"><p class="kit-help" id="c-help">Bad</p>')],
  // aria-invalid is usually set by a script: resolved when the element comes from a literal id.
  ...[
    ['getElementById', "const n = document.getElementById('n');\nn.setAttribute('aria-invalid', 'true');"],
    ['a helper with a JSDoc cast', "const byId = (id) => document.getElementById(id);\nconst n = /** @type {HTMLInputElement} */ (byId('n'));\nn.setAttribute('aria-invalid', 'true');"],
    ['an inline lookup', "document.querySelector('#n').setAttribute('aria-invalid', 'true');"],
  ].map(([how, js]) => [`aria-invalid set from a script on an element found by ${how}`, 'missing-describedby', (d) => {
    addMarkup(d, '<input id="n">');
    addScript(d, js);
  }]),
  ['aria-invalid from a script on a described element, "false", or an element the audit can\'t resolve, is fine', null, (d) => {
    addMarkup(d, '<input id="a" aria-describedby="a-help"><p class="kit-help" id="a-help">A</p><input id="b"><input id="c"><input id="e">');
    addScript(d, [
      "const a = document.getElementById('a');\na.setAttribute('aria-invalid', 'true');",
      "const b = document.getElementById('b');\nb.setAttribute('aria-describedby', 'a-help');\nb.setAttribute('aria-invalid', 'true');",
      "document.getElementById('c').setAttribute('aria-invalid', 'false');",
      "function setError(input) { input.setAttribute('aria-invalid', 'true'); }\nsetError(document.getElementById('e'));",
    ].join('\n'));
  }],
  ['a .kit-help without an id', ['orphan-help'], (d) => addMarkup(d, '<p class="kit-help">Secondary text</p>')],
  ['a .kit-help referenced from a setAttribute literal or an HTML string is fine', null, (d) => {
    addMarkup(d, '<input id="a"><p class="kit-help" id="a-help">A</p><p class="kit-help" id="b-help">B</p>');
    addScript(d, "document.getElementById('a').setAttribute('aria-describedby', 'a-help');\ndocument.body.insertAdjacentHTML('beforeend', '<input aria-describedby=\"b-help\">');");
  }],
  ['a .kit-help referenced only in a commented-out line', ['orphan-help'], (d) => {
    addMarkup(d, '<p class="kit-help" id="a-help">A</p>');
    addScript(d, "// input.setAttribute('aria-describedby', 'a-help');");
  }],
  ['a .kit-help inside a <template> is wired by script', null, (d) => addMarkup(d, '<template><p class="kit-help"></p></template>')],

  // budget (a warning): lines and bytes, with data: fonts outside it.
  ['exactly 1,599 lines is within budget', null, (d) => {
    const text = readFileSync(join(d, 'ui.html'), 'utf8');
    const lines = text.split('\n').length - 1;
    writeFileSync(join(d, 'ui.html'), text.replace('</main>', `${'\n'.repeat(1599 - lines)}</main>`));
  }],
  ['1,600 lines is over budget', ['budget'], (d) => {
    const text = readFileSync(join(d, 'ui.html'), 'utf8');
    const lines = text.split('\n').length - 1;
    writeFileSync(join(d, 'ui.html'), text.replace('</main>', `${'\n'.repeat(1600 - lines)}</main>`));
  }],
  ['64 KB is over budget', ['budget'], (d) => addMarkup(d, `<p>${'x'.repeat(64 * 1024)}</p>`)],
  ['a 100 KB data: font is outside the budget', null,
    (d) => addStyle(d, `@font-face { font-family: Inter; src: url("data:font/woff2;base64,${'A'.repeat(100_000)}") format("woff2"); }`)],
  ['a 100 KB data: image is inside it', ['budget'],
    (d) => addStyle(d, `.logo { background-image: url(data:image/png;base64,${'A'.repeat(100_000)}); }`)],

  // js-color-literal: literals set from host scripts; colours from data and tokens are fine.
  ...[
    ['style.backgroundColor = a ternary of named colours', "document.body.style.backgroundColor = ok ? 'red' : 'green';", 2],
    ["style.setProperty('--swatch', '#ff0000')", "document.body.style.setProperty('--swatch', '#ff0000');", 1],
    ['style.cssText', "document.body.style.cssText = 'padding: 0; border: 1px solid black';", 1],
    ['style = a declaration list', "document.body.style = 'color: rgb(0, 0, 0)';", 1],
    ["style['border-color']", "document.body.style['border-color'] = '#000';", 1],
    ["setAttribute('style', ...)", "document.body.setAttribute('style', 'color: #123456');", 1],
    ["setAttribute('fill', ...)", "document.body.setAttribute('fill', '#123456');", 1],
    ['style="" in an innerHTML string', "document.body.innerHTML = '<p style=\"color: #fff\">x</p>';", 1],
    ['a literal next to a ${} hole in a template', 'document.body.innerHTML = `<p style="color: ${hex}; background: white">x</p>`;', 1],
    ['fill="" in an SVG string', "document.body.innerHTML = '<svg><path fill=\"#000\" d=\"M0 0\"/></svg>';", 1],
    ['a var() fallback literal', "document.body.style.color = 'var(--figma-color-text, #000)';", 1],
    ['style.cssText +=', "document.body.style.cssText += 'color: red';", 1],
    ['Object.assign(el.style, {...})', "const ok = true;\nObject.assign(document.body.style, { color: ok ? '#123456' : 'red', 'border-color': 'rgb(0, 0, 0)', padding: '4px' });", 3],
    ["setAttributeNS(null, 'fill', ...)", "const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');\nr.setAttributeNS(null, 'fill', '#ff0000');", 1],
  ].map(([label, js, n]) => [label, Array(n).fill('js-color-literal'), (d) => addScript(d, js)]),
  ['colour functions finished from data, Object.assign on dataset, and setAttributeNS of an href are fine', null, (d) => addScript(d, [
    'const r = 1, g = 2, b = 3, h = 4;',
    "document.body.style.color = 'rgb(' + r + ', ' + g + ', ' + b + ')';",
    "document.body.style.background = 'hsl(' + h + ' 50% 50%)';",
    "Object.assign(document.body.style, { color: 'var(--figma-color-text)', fontFamily: 'Tan', width: '10px' });",
    "Object.assign(document.body.dataset, { color: 'red' });",
    "const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');",
    "use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#icon-red');",
  ].join('\n'))],
  // CSS: a mask uses only alpha; nested rules are resolved (& is the parent).
  ['a black-to-transparent mask gradient is fine', null, (d) => addStyle(d,
    '.list { mask-image: linear-gradient(to bottom, black 80%, transparent); -webkit-mask: linear-gradient(black, transparent); }')],
  ['a nested &:hover on a control of a page that disables it', 'missing-disabled',
    (d) => rowButton(d, '.row { padding: 0; &:hover { background: var(--figma-color-bg-hover); } }')],
  ['a nested &:disabled handles a nested &:hover', null,
    (d) => rowButton(d, '.row { &:hover { background: var(--figma-color-bg-hover); } &:disabled { background: none; } }')],
  ['a nested &.big height on .kit-button', 'control-height', (d) => addStyle(d, '.kit-button { &.big { height: 28px; } }')],
  ['figma.ui.onmessage = through a name for figma', ['onmessage-assign'], (d) => addMain(d, 'const f = figma;\nf.ui.onmessage = () => {};')],
  ['colours from data, tokens, names and selectors are fine', null, (d) => addScript(d, [
    "const hex = '#' + 'ff8800';",
    'document.body.style.color = hex;',
    "document.body.style.color = hex || 'transparent';",
    "document.body.style.setProperty('--swatch', hex);",
    "document.body.style.setProperty('color', 'var(--figma-color-text)');",
    "document.body.style.fontFamily = 'Tan';",
    'document.body.innerHTML = `<p style="color: rgb(${1}, ${2}, ${3})">x</p>`;',
    "document.querySelectorAll('[fill=\"#000\"]');",
    "// document.body.style.color = '#fff';",
    "const re = /'/g; document.body.style.color = 'var(--figma-color-text)'; const s = 'it\\'s'; void re; void s;",
  ].join('\n'))],
];

for (const [label, rule, edit] of VARIANTS) {
  const expected = Array.isArray(rule) ? rule : rule ? [rule] : [];
  test(`variant, ${label}: ${expected.join(', ') || 'no findings'}`, () => {
    assert.deepEqual(auditVariant(edit).map((f) => f.rule), expected);
  });
}

test('a finding in a decoded attribute value points at its line in the file', () => {
  const [f] = auditVariant((d) => addMarkup(d, '<p style="\n  padding: 0;\n  color: &#x23;fff;\n">x</p>'));
  const ui = readFileSync(join(FIXTURES, 'clean', 'ui.html'), 'utf8');
  assert.equal(f.rule, 'color-literal');
  assert.equal(f.line, lineOf(ui, '</main>') + 2);
  assert.match(f.message, /literal colour #fff /);
});

test('a stale code.js is reported in code.js, with the fix', () => {
  const [f] = auditVariant((d) => patchText(d, 'code.js', 'const KIT_PROTOCOL = 1;', 'const KIT_PROTOCOL = 2;'));
  assert.ok(f.file.endsWith('/code.js'), f.file);
  assert.equal(f.line, lineOf(readFileSync(join(FIXTURES, 'clean', 'code.js'), 'utf8'), 'const KIT_PROTOCOL'));
  assert.match(f.message, /KIT_PROTOCOL is 2 here but 1 in .*code\.ts:\d+; .*code\.js is stale, run npm run build$/);
});

test('a manifest with a byte-order mark is read, with a warning', () => {
  const findings = auditVariant((d) => {
    const path = join(d, 'manifest.json');
    writeFileSync(path, `﻿${readFileSync(path, 'utf8')}`);
  });
  assert.deepEqual(findings.map((f) => [f.rule, f.severity, f.line]), [['manifest-fields', 'warning', 1]]);
  assert.match(findings[0].message, /byte-order mark/);
});

test('missing "ui" still checks ui.html for colours', () => {
  const rules = auditVariant((d) => {
    patchJson(d, { ui: undefined });
    addStyle(d, '.x { color: #fff; }');
  }).map((f) => f.rule);
  assert.deepEqual(rules.sort(), ['color-literal', 'manifest-fields']);
});

test('js-color-literal points at the literal in the script, and unawaited-async at the call', () => {
  const [color] = auditVariant((d) => addScript(d, "const el = document.body;\nel.style.color =\n  '#123456';"));
  const [call] = auditVariant((d) => addMain(d, 'function f(n: TextNode) {\n  figma.loadFontAsync(n.fontName as FontName);\n}'));
  const ui = readFileSync(join(FIXTURES, 'clean', 'ui.html'), 'utf8');
  const code = readFileSync(join(FIXTURES, 'clean', 'code.ts'), 'utf8');
  assert.equal(color.line, lineOf(ui, '</body>') + 3);
  assert.match(color.message, /literal colour #123456 set from script \(style\.color =\)/);
  assert.equal(call.line, code.split('\n').length + 2);
  assert.match(call.message, /^loadFontAsync\(\) returns a promise that nothing awaits/);
});

// section-drift across a kit root and its examples: the root holds a kit:window block in code.ts
// and a kit.d.ts, examples/demo is a byte copy, then one file of the copy is changed.
const KIT_WINDOW = [
  '// ==== kit:window:start · kit v0.3.0 · protocol 1 · paste this block unchanged ====',
  'const KIT_PROTOCOL = 1;',
  'function installKitWindow(): void { figma.showUI(__html__, { themeColors: true }); }',
  '// ==== kit:window:end ====',
  '',
  '// ---- Your plugin starts here ----',
  'installKitWindow();',
  '',
].join('\n');
function auditKit(edit, dirs = ['.', 'examples/demo']) {
  const root = mkdtempSync(join(tmpdir(), 'kit-audit-drift-'));
  try {
    cpSync(join(FIXTURES, 'clean'), root, { recursive: true });
    writeFileSync(join(root, 'code.ts'), KIT_WINDOW);
    writeFileSync(join(root, 'kit.d.ts'), '// kit.d.ts · kit v0.3.0\ninterface KitSize { width: number; height: number }\n');
    writeFileSync(join(root, 'preview.html'), readFileSync(join(root, 'ui.html'), 'utf8'));
    const demo = join(root, 'examples', 'demo');
    mkdirSync(demo, { recursive: true });
    for (const f of ['manifest.json', 'ui.html', 'code.ts', 'code.js', 'kit.d.ts']) cpSync(join(root, f), join(demo, f));
    edit(root, demo);
    const result = run(['--json', ...dirs], root);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const driftOf = (findings) => findings.map((f) => `${f.file}:${f.line} ${f.rule}`);

test('section-drift: identical kit blocks, kit:window blocks and kit.d.ts files pass', () => {
  assert.deepEqual(auditKit(() => {}), []);
});

test('section-drift: an example\'s ui block, kit:window block and kit.d.ts, at the first differing line', () => {
  const edits = (root, demo) => {
    patchText(demo, 'ui.html', "'use strict';", "'use strict';\n      // edited");
    patchText(demo, 'code.ts', 'function installKitWindow', '// edited\nfunction installKitWindow');
    patchText(demo, 'kit.d.ts', 'interface KitSize', 'interface KitSize2');
  };
  const findings = auditKit(edits);
  const ui = readFileSync(join(FIXTURES, 'clean', 'ui.html'), 'utf8');
  assert.deepEqual(driftOf(findings), [
    'examples/demo/code.ts:3 section-drift',
    'examples/demo/kit.d.ts:2 section-drift',
    `examples/demo/ui.html:${lineOf(ui, "'use strict';") + 1} section-drift`,
  ]);
  assert.match(findings[0].message, /^the kit:window block differs from code\.ts:3: "\/\/ edited" here, "function installKitWindow/);
  assert.match(findings[2].message, /^<script data-kit="runtime"> differs from ui\.html:\d+: /);
});

test('section-drift: auditing an example alone still compares it with the kit root', () => {
  const findings = auditKit((root, demo) => patchText(demo, 'kit.d.ts', 'height: number', 'height: string'), ['examples/demo']);
  assert.deepEqual(driftOf(findings), ['examples/demo/kit.d.ts:2 section-drift']);
});

test('section-drift: a missing block, kit:window block or kit.d.ts in an example', () => {
  const findings = auditKit((root, demo) => {
    const ui = readFileSync(join(demo, 'ui.html'), 'utf8');
    writeFileSync(join(demo, 'ui.html'), ui.replace(/<style data-kit="tokens">[\s\S]*?<\/style>/, ''));
    writeFileSync(join(demo, 'code.ts'), 'const KIT_PROTOCOL = 1;\n');
    rmSync(join(demo, 'kit.d.ts'));
  });
  assert.deepEqual(driftOf(findings), [
    'examples/demo/code.ts:1 section-drift', 'examples/demo/kit.d.ts:1 section-drift', 'examples/demo/ui.html:1 section-drift']);
  assert.match(findings[2].message, /^no <style data-kit="tokens"> block; paste it from ui\.html/);
});

test('section-drift: CRLF line endings are not drift, an edit in a CRLF copy is, and whitespace-only edits say so', () => {
  const crlf = (dir, file) => writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8').replace(/\n/g, '\r\n'));
  assert.deepEqual(auditKit((root, demo) => ['ui.html', 'code.ts', 'kit.d.ts'].forEach((f) => crlf(demo, f)), ['examples/demo']), []);
  const ui = readFileSync(join(FIXTURES, 'clean', 'ui.html'), 'utf8');
  const edited = auditKit((root, demo) => { patchText(demo, 'ui.html', 'padding: 0 8px;', 'padding: 0 9px;'); crlf(demo, 'ui.html'); }, ['examples/demo']);
  assert.deepEqual(driftOf(edited), [`examples/demo/ui.html:${lineOf(ui, 'padding: 0 8px;')} section-drift`]);
  const [space] = auditKit((root, demo) => patchText(demo, 'code.ts', '// ==== kit:window:end ====', '// ==== kit:window:end ==== '), ['examples/demo']);
  assert.match(space.message, /"\/\/ ==== kit:window:end ====" differs only in spaces or tabs/);
});

test('section-drift: preview.html is compared only with its own folder\'s ui.html (the repo root)', () => {
  const edit = (root) => patchText(root, 'preview.html', 'padding: 0 8px;', 'padding: 0 12px;');
  assert.deepEqual(driftOf(auditKit(edit)), [`preview.html:${lineOf(readFileSync(join(FIXTURES, 'clean', 'ui.html'), 'utf8'), 'padding: 0 8px;')} section-drift`]);
  assert.deepEqual(auditKit(edit, ['examples/demo']), []);
});

test('CLI prints "path:line  rule-id  message" and exits 1 on errors', () => {
  const result = run(['test/fixtures/clean', 'test/fixtures/color-hex-host-style']);
  assert.equal(result.status, 1);
  const line = lineOf(readFileSync(join(FIXTURES, 'color-hex-host-style', 'ui.html'), 'utf8'), '#333333');
  const expected = `^test/fixtures/color-hex-host-style/ui\\.html:${line}  color-literal  literal colour #333333 `;
  assert.match(result.stdout, new RegExp(expected, 'm'));
  assert.match(result.stdout, /^audit: 1 error\(s\), 0 warning\(s\) in 2 plugin folders/m);
});

test('CLI exits 0 on a clean folder', () => {
  const result = run(['test/fixtures/clean']);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.stdout.trim(), 'audit: no problems in 1 plugin folder');
});

test('CLI exits 0 when every finding is a warning, and marks them', () => {
  const result = run(['test/fixtures/orphan-help', 'test/fixtures/budget']);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /^test\/fixtures\/orphan-help\/ui\.html:\d+  orphan-help  warning: /m);
  assert.match(result.stdout, /^audit: 0 error\(s\), 2 warning\(s\) in 2 plugin folders/m);
});

test('CLI --json prints the findings as an array', () => {
  const result = run(['--json', 'test/fixtures/manifest-first-page']);
  assert.equal(result.status, 1);
  const findings = JSON.parse(result.stdout);
  assert.equal(findings.length, 1);
  assert.deepEqual(Object.keys(findings[0]).sort(), ['file', 'line', 'message', 'rule', 'severity']);
  assert.equal(findings[0].rule, 'manifest-document-access');
});

test('CLI defaults to "." plus examples/* folders that have a manifest.json, never tools/ or test/fixtures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-audit-cli-'));
  try {
    cpSync(join(FIXTURES, 'clean'), dir, { recursive: true });
    cpSync(join(FIXTURES, 'color-named'), join(dir, 'examples', 'bad'), { recursive: true });
    cpSync(join(FIXTURES, 'color-named'), join(dir, 'examples', 'notes'), { recursive: true });
    rmSync(join(dir, 'examples', 'notes', 'manifest.json')); // not a plugin folder: skipped
    cpSync(join(FIXTURES, 'color-named'), join(dir, 'tools', 'probe'), { recursive: true });
    cpSync(join(FIXTURES, 'color-named'), join(dir, 'test', 'fixtures', 'bad'), { recursive: true });
    const result = run(['--json'], dir);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout).map((f) => `${f.file} ${f.rule}`), ['examples/bad/ui.html color-literal']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanJs: comments, strings, templates with holes and regex literals', () => {
  const js = "const a = 'x // y'; // note\nconst re = /'[/]/g; const t = `a ${b + 'c'} d`; const q = x / 2 / 3;";
  const { spans, masked, code } = scanJs(js);
  assert.deepEqual(spans.map((s) => [s.kind, js.slice(s.start, s.end)]), [
    ['string', 'x // y'], ['comment', '// note'], ['regex', "'[/]"], ['template', "a ${b + 'c'} d"], ['string', 'c']]);
  assert.equal(masked.length, js.length);
  assert.ok(masked.includes("const a = '      ';") && masked.includes('${b +'));
  assert.ok(!masked.includes('note') && !code.includes('note') && code.includes("'x // y'"));
  assert.ok(masked.includes('x / 2 / 3'), 'a division is not a regex');
  // After the ")" of an if/while/for header an operand is expected, so "/" starts a regex there.
  const head = "if (ok) /'/.test(s); const n = (a) / 2;";
  assert.deepEqual(scanJs(head).spans.map((s) => [s.kind, head.slice(s.start, s.end)]), [['regex', "'"]]);
});

test('colorLiterals: what counts as a literal colour', () => {
  const cases = [
    ['color', '#FFF', ['#FFF']],
    ['background', '#ffffff80', ['#ffffff80']],
    ['background', 'var(--figma-color-bg, #fff)', ['#fff']], // a fallback is still a literal
    ['color', 'oklch(0.7 0.1 200)', ['oklch(0.7 0.1 200)']],
    ['filter', 'drop-shadow(0 0 2px black)', ['black']],
    ['outline', '1px solid Highlight', ['Highlight']], // system colours follow the OS, not Figma
    ['--kit-x', 'red', ['red']],
    ['color', 'currentcolor', []],
    ['background', 'color-mix(in srgb, var(--a) 50%, transparent)', []],
    ['border', '1px solid var(--figma-color-border)', []],
    ['font-family', 'Tomato, Tan', []], // names, not colours
    ['animation', 'kit-spin 1s linear infinite', []],
    ['color', '#12345', []],
    ['border', '1px solid#000', ['#000']], // minified: still a hash token
    ['box-shadow', '0 0 1px#000', ['#000']],
    ['grid-area', 'a\\#fff', []], // an escaped # belongs to the name
    ['color', 'rgb(\u0001\u0001, 0, 0)', []], // a ${} hole in a template: built from data
    ['mask-image', 'linear-gradient(black, transparent)', []], // a mask uses only alpha
    ['-webkit-mask', 'linear-gradient(#000, transparent)', []],
  ];
  for (const [prop, value, expected] of cases) {
    assert.deepEqual(colorLiterals(value, prop).map((c) => c.text), expected, `${prop}: ${value}`);
  }
});

test('targetsControl: only the selector subject counts', () => {
  const cases = [
    ['.kit-select select', true],
    ['.kit-button.kit-button-large', true],
    ['.kit-button-primary:hover', true],
    ['select:not([multiple])', true],
    ['a, button:hover', true],
    [':is(.a, .b) .kit-input', true],
    ['.kit-select::after', false],
    ['button.kit-icon-button svg', false],
    ['label > input[type="radio"]', false],
    ['input[type="checkbox" i]', false],
    ['input[type=radio s]:checked', false],
    ['.kit-checkbox input', false],
    ['.kit-buttons', false],
    ['.kit-button-group', false], // a host wrapper, not a control
    ['.kit-input-icon', false],
    ['textarea:focus-visible', false], // multi-line controls size to their rows
    ['.kit-select > select[multiple]', false],
    ['select[size="4"]', false],
  ];
  for (const [selector, expected] of cases) assert.equal(targetsControl(selector), expected, selector);
});

test('cssDeclarations: braces and semicolons in strings and url() do not split', () => {
  const decls = cssDeclarations('a:hover{color:red} @media (x: y) { .b { c: #fff; } } .d { content: "{;}"; e: url("x;y") }');
  assert.deepEqual(decls.map((d) => [d.selector, d.prop]), [['a:hover', 'color'], ['.b', 'c'], ['.d', 'content'], ['.d', 'e']]);
});

test('cssDeclarations: nested rules are resolved as CSS nesting reads them', () => {
  const decls = cssDeclarations('.a, .b { x: 1; &:hover { y: 2; } .c { z: 3; } @media (hover: hover) { w: 4; & > .d { v: 5; } } }');
  assert.deepEqual(decls.map((d) => [d.selector, d.prop]), [['.a, .b', 'x'], ['.a:hover, .b:hover', 'y'], ['.a .c, .b .c', 'z'],
    ['.a, .b', 'w'], ['.a > .d, .b > .d', 'v']]);
});
