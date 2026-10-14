// The three marked kit blocks (<style data-kit="tokens">, <style data-kit="components">,
// <script data-kit="runtime">) are pasted byte for byte: preview.html, the e2e kit fixture
// (e2e/fixtures/kit-ui.html) and every examples/*/ui.html must carry exactly the inner text of
// ui.html's, in the same order. Kit ui files also never hold
// an HTML comment (insurance against Figma's sandbox). Plain file reads, so `npm run check` catches
// drift without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const OPENS = ['<style data-kit="tokens">', '<style data-kit="components">', '<script data-kit="runtime">'];

// Each block's inner text, after checking it appears exactly once.
function blocks(file, html) {
  return OPENS.map((open) => {
    const start = html.indexOf(open);
    assert.ok(start >= 0, `${file}: no ${open}`);
    assert.equal(html.indexOf(open, start + 1), -1, `${file}: ${open} appears twice`);
    const close = html.indexOf(open.startsWith('<style') ? '</style>' : '</script>', start);
    return { start, text: html.slice(start + open.length, close) };
  });
}

const examples = existsSync(join(ROOT, 'examples'))
  ? readdirSync(join(ROOT, 'examples')).sort().map((name) => `examples/${name}/ui.html`).filter((p) => existsSync(join(ROOT, p)))
  : [];
const COPIES = ['preview.html', 'e2e/fixtures/kit-ui.html', ...examples];
const CANONICAL = blocks('ui.html', read('ui.html'));

test('ui.html blocks are canonical: tag alone on its line, text ending in a newline, in order', () => {
  for (const [i, { text }] of CANONICAL.entries()) {
    assert.ok(text.startsWith('\n') && text.endsWith('\n'), `${OPENS[i]} must start and end with a newline`);
  }
  assert.deepEqual(CANONICAL.map((b) => b.start), [...CANONICAL.map((b) => b.start)].sort((a, b) => a - b));
});

for (const file of COPIES) {
  test(`${file} carries the three kit blocks of ui.html byte for byte, in order`, () => {
    const copy = blocks(file, read(file));
    for (let i = 0; i < OPENS.length; i++) {
      assert.equal(copy[i].text, CANONICAL[i].text, `${file}: ${OPENS[i]} drifted from ui.html; copy it again`);
    }
    assert.deepEqual(copy.map((b) => b.start), [...copy.map((b) => b.start)].sort((a, b) => a - b), `${file}: blocks out of order`);
  });
}

for (const file of ['ui.html', ...COPIES]) {
  test(`${file} has no HTML comment`, () => {
    assert.doesNotMatch(read(file), /<!--/, `${file}: use the <meta name="kit"> tag or a CSS/JS comment instead`);
  });
}
