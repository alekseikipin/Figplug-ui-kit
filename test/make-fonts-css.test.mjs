// Tests for scripts/make-fonts-css.mjs: the format comes from the file's magic bytes, the weight and
// style from its name, the CLI writes one @font-face per file to stdout, and a file that is not a
// font, a missing path or no arguments exit 2. The "fonts" are a few bytes with the right magic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontFace } from '../scripts/make-fonts-css.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/make-fonts-css.mjs', import.meta.url));
const MAGIC = { woff2: 'wOF2', woff: 'wOFF', ttf: '\x00\x01\x00\x00', otf: 'OTTO' };

// Runs fn(dir, font) with font(name, kind) writing a tiny file of that kind into a temp folder.
function withFonts(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-fonts-test-'));
  try {
    return fn(dir, (name, kind) => {
      const path = join(dir, name);
      writeFileSync(path, Buffer.from(`${MAGIC[kind]}rest-of-font`, 'latin1'));
      return path;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const field = (css, name) => new RegExp(`${name}: ([^;]+);`).exec(css)?.[1];

test('format and data: MIME come from the magic bytes, not the extension', () => withFonts((dir, font) => {
  const cases = [['A.woff2', 'woff2', 'woff2', 'font/woff2'], ['B.woff', 'woff', 'woff', 'font/woff'],
    ['C.ttf', 'ttf', 'truetype', 'font/ttf'], ['D.otf', 'otf', 'opentype', 'font/otf'], ['E.ttf', 'woff2', 'woff2', 'font/woff2']];
  for (const [name, kind, format, mime] of cases) {
    const { css } = fontFace(font(name, kind));
    assert.match(css, new RegExp(`src: url\\("data:${mime};base64,[A-Za-z0-9+/=]+"\\) format\\("${format}"\\);`), name);
    assert.equal(field(css, 'font-family'), '"Inter"', name);
    assert.equal(field(css, 'font-display'), 'swap', name);
  }
}));

test('weight and style come from the file name', () => withFonts((dir, font) => {
  const cases = [
    ['InterVariable.woff2', '100 900', 'normal'],
    ['InterVariable-Italic.woff2', '100 900', 'italic'],
    ['Inter-VariableFont_opsz,wght.ttf', '100 900', 'normal'],
    ['Inter[wght].woff2', '100 900', 'normal'],
    ['Inter-Regular.woff2', '400', 'normal'],
    ['Inter-SemiBoldItalic.woff2', '600', 'italic'],
    ['Inter-ExtraLight.woff2', '200', 'normal'],
    ['Inter-ExtraBold.woff2', '800', 'normal'],
    ['Inter-Bold.woff2', '700', 'normal'],
    ['Inter-Thin.woff2', '100', 'normal'],
    ['Inter-Black.woff2', '900', 'normal'],
  ];
  for (const [name, weight, style] of cases) {
    const { css } = fontFace(font(name, 'woff2'));
    assert.equal(field(css, 'font-weight'), weight, name);
    assert.equal(field(css, 'font-style'), style, name);
  }
}));

test('the CLI prints one @font-face per file after the paste-here header', () => withFonts((dir, font) => {
  const result = run([font('Inter-Regular.woff2', 'woff2'), font('Inter-Bold.woff2', 'woff2')]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.match(/@font-face \{/g)?.length, 2);
  assert.match(result.stdout, /^\/\* fonts\.css · made by scripts\/make-fonts-css\.mjs from Inter-Regular\.woff2, Inter-Bold\.woff2/);
  assert.match(result.stdout, /AFTER the three data-kit blocks/);
  assert.match(result.stderr, /wrote 2 @font-face rule\(s\)/);
}));

test('a file that is not a font, a missing path or no arguments exit 2 with nothing on stdout', () => withFonts((dir) => {
  const notFont = join(dir, 'notes.woff2');
  writeFileSync(notFont, 'just text');
  for (const args of [[notFont], [join(dir, 'missing.woff2')], []]) {
    const result = run(args);
    assert.equal(result.status, 2, `${args}: ${result.stderr}`);
    assert.equal(result.stdout, '', `${args}`);
    assert.match(result.stderr, /make-fonts-css|usage/, `${args}`);
  }
  assert.match(run([notFont]).stderr, /is not a woff2, woff, ttf or otf file/);
}));

test('importing the script runs nothing', async () => {
  const module = await import('../scripts/make-fonts-css.mjs');
  assert.deepEqual(Object.keys(module), ['fontFace']);
  assert.notEqual(process.exitCode, 2, 'main() ran on import and printed its usage');
});
