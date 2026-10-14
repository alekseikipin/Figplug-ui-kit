// Tests for scripts/check-ui.mjs: inline scripts are extracted with the right ui.html lines, a JSDoc
// type error in the runtime (strict) and a bad kit call in a host script (non-strict) both fail with
// ui.html line numbers, and the clean fixture passes even though its host script is untyped. Temp
// variants of the clean fixture cover module scope, ES2020 syntax, odd line breaks, a missing
// runtime and folders with nothing to check.
// The tsc runs need TypeScript (npm install); without it these tests are skipped, not failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScripts } from '../scripts/check-ui.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = join(ROOT, 'scripts', 'check-ui.mjs');
const FIXTURES = join(ROOT, 'test', 'fixtures');
// Lines as an editor shows them: \r\n, \r and \n end a line; U+2028 does not.
const lineOf = (text, needle) => text.split(/\r\n|\r|\n/).findIndex((l) => l.includes(needle)) + 1;

function checkUi(t, ...dirs) {
  const result = spawnSync(process.execPath, [CHECK, ...dirs], { cwd: ROOT, encoding: 'utf8' });
  if (result.status === 2 && /could not run tsc/.test(result.stderr)) {
    t.skip('TypeScript is not installed (run npm install)');
  }
  return result;
}
const checkFixture = (t, fixture) => checkUi(t, `test/fixtures/${fixture}`);

// A temp copy of the clean fixture whose ui.html is changed by edit(html), checked, then removed.
function checkVariant(t, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-check-ui-test-'));
  try {
    cpSync(join(FIXTURES, 'clean'), dir, { recursive: true });
    const html = edit(readFileSync(join(dir, 'ui.html'), 'utf8'));
    writeFileSync(join(dir, 'ui.html'), html);
    return { html, ...checkUi(t, dir) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const beforeBody = (script) => (html) => html.replace('</body>', `${script}\n</body>`);
// "ui.html:<line>  <code>  " at the start of an output line.
const at = (line, code) => new RegExp(`ui\\.html:${line}  ${code}  `, 'm');

test('inlineScripts keeps document order and ui.html lines; skips src, JSON and commented-out scripts', () => {
  const html = [
    '<!doctype html>',
    '<script data-kit="runtime">',
    'const a = 1;',
    '</script>',
    '<script src="x.js"></script>',
    '<script type="application/json">{"a": 1}</script>',
    '<!-- <script>not code(</script> -->',
    '<script type="module">const b = 2;</script>',
    '<script>',
    '  const c = 3;',
    '</script>',
    '<script data-type="host" data-src="x">const d = 4;</script>', // data-* are not type or src
    '<script type=" Text/JavaScript ">const e = 5;</script>',
    '<script type="text/template"><p>{{ x }}</p></script>',
    '<script data-kit="runtime-extra">const f = 6;</script>',
  ].join('\n');
  const scripts = inlineScripts(html);
  assert.deepEqual(scripts.map((s) => [s.line, s.runtime, s.module, s.body.trim()]), [
    [2, true, false, 'const a = 1;'],
    [8, false, true, 'const b = 2;'], // returned, flagged as a module: checkDir skips it
    [9, false, false, 'const c = 3;'],
    [12, false, false, 'const d = 4;'],
    [13, false, false, 'const e = 5;'],
    [15, false, false, 'const f = 6;'],
  ]);
  for (const s of scripts) assert.equal(html.slice(s.start, s.start + s.body.length), s.body);
});

test('inlineScripts counts a lone CR as a line break, as editors and the HTML parser do', () => {
  const scripts = inlineScripts('<!doctype html>\r<p>\r\n</p>\n<script>x</script>');
  assert.deepEqual(scripts.map((s) => s.line), [4]);
});

test('check-ui fails on check-ui-errors and reports ui.html lines', (t) => {
  const result = checkFixture(t, 'check-ui-errors');
  if (result.status === 2) return;
  const html = readFileSync(join(FIXTURES, 'check-ui-errors', 'ui.html'), 'utf8');
  const runtimeLine = lineOf(html, 'deliberate type error');
  const hostLine = lineOf(html, 'kit.fit(true)');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  // Strict runtime check: a string where kit.d.ts wants a number.
  assert.match(result.stdout, new RegExp(`^test/fixtures/check-ui-errors/ui\\.html:${runtimeLine}  TS2322  `, 'm'));
  // Non-strict host check still catches a wrong call into window.kit.
  assert.match(result.stdout, new RegExp(`^test/fixtures/check-ui-errors/ui\\.html:${hostLine}  TS2554  `, 'm'));
  assert.match(result.stdout, /^check-ui: 2 error\(s\) in 1 plugin folder$/m);
});

test('check-ui passes on the clean fixture (untyped host code is fine)', (t) => {
  const result = checkFixture(t, 'clean');
  if (result.status === 2) return;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^check-ui: no type errors in 1 plugin folder$/m);
});

test('a module script keeps its own scope: skipped with a warning, and classic code cannot see it', (t) => {
  const result = checkVariant(t, beforeBody([
    '<script type="module">',
    '  const create = 1; // the host script declares create too: legal, a module has its own scope',
    '  const fromModule = 2;',
    '</script>',
    '<script>',
    '  fromModule.toFixed(); // a ReferenceError in the browser',
    '</script>',
  ].join('\n')));
  if (result.status === 2) return;
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, at(lineOf(result.html, 'fromModule.toFixed'), 'TS2304'));
  assert.match(result.stdout, at(lineOf(result.html, '<script type="module">'), 'module'));
  assert.match(result.stdout, /^check-ui: 1 error\(s\) in 1 plugin folder; 1 warning\(s\)$/m);
  assert.doesNotMatch(result.stdout, /TS2451/); // no "Cannot redeclare 'create'"
});

test('syntax newer than ES2020 fails at its ui.html line, even past a lone CR and a U+2028', (t) => {
  const result = checkVariant(t, beforeBody([
    '<script>',
    '  // An old Mac line break follows:\r  const lineSeparator = "\u2028"; // legal in a string since ES2019',
    '  let total = null;',
    '  total ??= 1;',
    '  class Counter { count = 0; }',
    '  kit.fit(Counter, total);',
    '</script>',
  ].join('\n')));
  if (result.status === 2) return;
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, at(lineOf(result.html, 'total ??= 1'), 'ES2020'));
  assert.match(result.stdout, at(lineOf(result.html, 'class Counter'), 'ES2020'));
  assert.match(result.stdout, at(lineOf(result.html, 'kit.fit(Counter'), 'TS2554'));
  assert.match(result.stdout, /^check-ui: 3 error\(s\) in 1 plugin folder$/m);
});

test('a ui.html without the kit runtime fails, and so does a host call to kit', (t) => {
  const result = checkVariant(t, (html) => html.replace(/<script data-kit="runtime">[\s\S]*?<\/script>/, ''));
  if (result.status === 2) return;
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, at(1, 'check-ui'));
  assert.match(result.stdout, at(lineOf(result.html, 'kit.fit()'), 'TS2304'));
});

test('a folder with nothing to check fails: no such folder, or a manifest naming a missing ui file', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-check-ui-test-'));
  try {
    cpSync(join(FIXTURES, 'clean'), dir, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, ui: 'nope.html' }));
    const result = checkUi(t, join(dir, 'does-not-exist'), dir);
    if (result.status === 2) return;
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /does-not-exist  check-ui  no such folder$/m);
    assert.match(result.stdout, /nope\.html  check-ui  manifest\.json names this ui file, but it does not exist$/m);
    assert.match(result.stdout, /^check-ui: 2 error\(s\) in 2 plugin folders$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
