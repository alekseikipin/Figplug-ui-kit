// Tests for scripts/audit.mjs. Each bad fixture in test/fixtures must trigger exactly one rule, at
// the right line; clean, negatives and check-ui-errors must trigger none. A few cases that need a
// broken folder (no manifest, invalid JSON) are built in a temp copy of the clean fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDir, colorLiterals, cssDeclarations, targetsControl } from '../scripts/audit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUDIT = join(ROOT, 'scripts', 'audit.mjs');
const FIXTURES = join(ROOT, 'test', 'fixtures');
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
const run = (args, cwd = ROOT) => spawnSync(process.execPath, [AUDIT, ...args], { cwd, encoding: 'utf8' });

// [fixture, expected rule, file the finding is in, text on the line it must point at]
const CASES = [
  ['clean'],
  ['negatives'],
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
];

test('every fixture folder has a case here', () => {
  assert.deepEqual(readdirSync(FIXTURES).filter((n) => !n.startsWith('.')).sort(), CASES.map(([n]) => n).sort());
});

for (const [name, rule, file, needle] of CASES) {
  test(`${name}: ${rule ?? 'no findings'}`, () => {
    const findings = auditDir(join(FIXTURES, name));
    assert.deepEqual(findings.map((f) => f.rule), rule ? [rule] : []);
    if (!rule) return;
    const [f] = findings;
    assert.equal(f.severity, 'error');
    assert.ok(f.file.endsWith(`${name}/${file}`), f.file);
    assert.equal(f.line, lineOf(readFileSync(join(FIXTURES, name, file), 'utf8'), needle));
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

// A style block added to the clean fixture's <head>, or markup added to its <main>.
const addStyle = (d, css) => patchText(d, 'ui.html', '</head>', `<style>${css}</style></head>`);
const addMarkup = (d, html) => patchText(d, 'ui.html', '</main>', `${html}</main>`);

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
];

for (const [label, rule, edit] of VARIANTS) {
  test(`variant, ${label}: ${rule ?? 'no findings'}`, () => {
    assert.deepEqual(auditVariant(edit).map((f) => f.rule), rule ? [rule] : []);
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
    writeFileSync(path, `\uFEFF${readFileSync(path, 'utf8')}`);
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

test('CLI --json prints the findings as an array', () => {
  const result = run(['--json', 'test/fixtures/manifest-first-page']);
  assert.equal(result.status, 1);
  const findings = JSON.parse(result.stdout);
  assert.equal(findings.length, 1);
  assert.deepEqual(Object.keys(findings[0]).sort(), ['file', 'line', 'message', 'rule', 'severity']);
  assert.equal(findings[0].rule, 'manifest-document-access');
});

test('CLI defaults to "." plus examples/* folders that have a manifest.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-audit-cli-'));
  try {
    cpSync(join(FIXTURES, 'clean'), dir, { recursive: true });
    cpSync(join(FIXTURES, 'color-named'), join(dir, 'examples', 'bad'), { recursive: true });
    cpSync(join(FIXTURES, 'color-named'), join(dir, 'examples', 'notes'), { recursive: true });
    rmSync(join(dir, 'examples', 'notes', 'manifest.json')); // not a plugin folder: skipped
    const result = run(['--json'], dir);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout).map((f) => `${f.file} ${f.rule}`), ['examples/bad/ui.html color-literal']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
