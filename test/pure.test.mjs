// Tests for the pure part of the ui.html window runtime: clampSize, nextSnap and sameSize.
// The block between the exact `/* kit:pure:start */` and `/* kit:pure:end */` lines is cut out
// of ui.html and run in a fresh node:vm context with no window or document, which also proves
// it stays DOM-free. Point KIT_UI_HTML at another file (any text holding the block) to test it:
//   KIT_UI_HTML=path/to/runtime.js node --test "test/pure.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SOURCE_PATH = process.env.KIT_UI_HTML
  ? resolve(process.env.KIT_UI_HTML)
  : fileURLToPath(new URL('../ui.html', import.meta.url));
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

const START = '/* kit:pure:start */';
const END = '/* kit:pure:end */';

function pureBlock(src) {
  const lines = src.split('\n');
  // Marker lines may be indented (they sit inside the runtime IIFE) but must be alone on the line.
  const at = (marker) => lines.map((line, i) => (line.trim() === marker ? i : -1)).filter((i) => i >= 0);
  const starts = at(START);
  const ends = at(END);
  assert.equal(starts.length, 1, `${SOURCE_PATH} must contain exactly one "${START}" line`);
  assert.equal(ends.length, 1, `${SOURCE_PATH} must contain exactly one "${END}" line`);
  assert.ok(starts[0] < ends[0], 'kit:pure:start comes before kit:pure:end');
  return { text: lines.slice(starts[0] + 1, ends[0]).join('\n'), startLine: starts[0] + 1 };
}

const BLOCK = pureBlock(SOURCE);

// A fresh context per test: nothing leaks between cases, and no browser globals exist.
function load() {
  const context = vm.createContext({});
  vm.runInContext(BLOCK.text, context, { filename: `${SOURCE_PATH}#kit:pure`, lineOffset: BLOCK.startLine });
  const get = (name) => vm.runInContext(name, context);
  return { clampSize: get('clampSize'), nextSnap: get('nextSnap'), sameSize: get('sameSize') };
}

// vm objects carry another realm's Object.prototype, so deepStrictEqual against a literal fails;
// compare plain copies instead.
const plain = (value) => JSON.parse(JSON.stringify(value));

const BOUNDS = { minWidth: 240, maxWidth: 960, minHeight: 120, maxHeight: 900 };

// ---- the block itself ----

test('the pure block sits inside the runtime script when the source is HTML', () => {
  const open = SOURCE.indexOf('<script data-kit="runtime">');
  if (open === -1) return; // pointed at a bare runtime.js via KIT_UI_HTML
  const close = SOURCE.indexOf('</script>', open);
  const start = SOURCE.indexOf(START);
  assert.ok(open < start && SOURCE.indexOf(END) < close, 'markers are inside <script data-kit="runtime">');
});

test('the pure block references nothing from the page', () => {
  // Strip comments first: prose may say "window" freely, code may not.
  const code = BLOCK.text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const name of ['window', 'document', 'globalThis', 'self', 'parent', 'navigator', 'CONFIG', 'requestAnimationFrame', 'setTimeout']) {
    assert.doesNotMatch(code, new RegExp(`\\b${name}\\b`), `pure block must not use ${name}`);
  }
  const { clampSize, nextSnap, sameSize } = load();
  for (const fn of [clampSize, nextSnap, sameSize]) assert.equal(typeof fn, 'function');
});

// ---- clampSize ----

test('clampSize keeps sizes inside the bounds', () => {
  const { clampSize } = load();
  assert.deepEqual(plain(clampSize(400, 300, BOUNDS)), { width: 400, height: 300 });
  assert.deepEqual(plain(clampSize(100, 50, BOUNDS)), { width: 240, height: 120 });
  assert.deepEqual(plain(clampSize(5000, 5000, BOUNDS)), { width: 960, height: 900 });
  assert.deepEqual(plain(clampSize(240, 900, BOUNDS)), { width: 240, height: 900 }, 'edges are inclusive');
});

test('clampSize rounds to whole pixels', () => {
  const { clampSize } = load();
  assert.deepEqual(plain(clampSize(333.6, 401.4, BOUNDS)), { width: 334, height: 401 });
  assert.deepEqual(plain(clampSize(400.5, 300.5, BOUNDS)), { width: 401, height: 301 });
  assert.deepEqual(plain(clampSize(959.7, 120.2, BOUNDS)), { width: 960, height: 120 });
});

test('clampSize never returns NaN or Infinity', () => {
  const { clampSize } = load();
  assert.deepEqual(plain(clampSize(NaN, NaN, BOUNDS)), { width: 240, height: 120 }, 'NaN lands on the minimum');
  assert.deepEqual(plain(clampSize(Infinity, Infinity, BOUNDS)), { width: 960, height: 900 });
  assert.deepEqual(plain(clampSize(-Infinity, -Infinity, BOUNDS)), { width: 240, height: 120 });
  assert.deepEqual(plain(clampSize(-50, -1, BOUNDS)), { width: 240, height: 120 });
  for (const junk of [undefined, null, '400', {}, [], true]) {
    const size = clampSize(junk, junk, BOUNDS);
    assert.ok(Number.isFinite(size.width) && Number.isFinite(size.height), `finite for ${String(junk)}`);
    assert.deepEqual(plain(size), { width: 240, height: 120 }, 'non-numbers are not coerced');
  }
});

test('clampSize repairs missing or junk bounds with generous defaults (70 x 0 to 4096)', () => {
  const { clampSize } = load();
  for (const bounds of [undefined, null, 'wide', 42, {}, { minWidth: NaN, maxWidth: Infinity, minHeight: '5', maxHeight: null }]) {
    const label = JSON.stringify(bounds) ?? String(bounds);
    assert.deepEqual(plain(clampSize(400, 300, bounds)), { width: 400, height: 300 }, label);
    assert.deepEqual(plain(clampSize(1, -1, bounds)), { width: 70, height: 0 }, `floor for ${label}`);
    assert.deepEqual(plain(clampSize(1e9, 1e9, bounds)), { width: 4096, height: 4096 }, `ceiling for ${label}`);
    assert.deepEqual(plain(clampSize(Infinity, NaN, bounds)), { width: 4096, height: 0 }, `non-finite for ${label}`);
  }
});

test('clampSize never goes under Figma\'s 70 x 0 floor, whatever the bounds say', () => {
  const { clampSize } = load();
  const tiny = { minWidth: 10, maxWidth: 50, minHeight: -20, maxHeight: -5 };
  assert.deepEqual(plain(clampSize(30, 10, tiny)), { width: 70, height: 0 });
  assert.deepEqual(plain(clampSize(-Infinity, -Infinity, tiny)), { width: 70, height: 0 });
});

test('clampSize lets min win when min > max (as CSS and code.ts do)', () => {
  const { clampSize } = load();
  const inverted = { minWidth: 500, maxWidth: 400, minHeight: 300.4, maxHeight: 100 };
  for (const [w, h] of [[450, 200], [100, 50], [9999, 9999], [NaN, Infinity]]) {
    assert.deepEqual(plain(clampSize(w, h, inverted)), { width: 500, height: 300 }, `${w} x ${h}`);
  }
});

test('clampSize rounds fractional bounds the way code.ts does, so results stay whole numbers', () => {
  const { clampSize } = load();
  const bounds = { minWidth: 240.4, maxWidth: 600.6, minHeight: 100.5, maxHeight: 400.2 };
  const low = clampSize(0, 0, bounds);
  const high = clampSize(9999, 9999, bounds);
  for (const value of [low.width, low.height, high.width, high.height]) assert.ok(Number.isInteger(value), String(value));
  assert.deepEqual(plain(low), { width: 240, height: 101 });
  assert.deepEqual(plain(high), { width: 601, height: 400 });
});

test('clampSize returns a new object and leaves its inputs alone', () => {
  const { clampSize } = load();
  const bounds = { ...BOUNDS };
  const a = clampSize(400, 300, bounds);
  const b = clampSize(400, 300, bounds);
  assert.notEqual(a, b);
  assert.deepEqual(bounds, BOUNDS);
});

// ---- nextSnap ----

const SNAPS = [320, 480, 640];

test('nextSnap cycles through the snaps', () => {
  const { nextSnap } = load();
  assert.equal(nextSnap(320, SNAPS), 480);
  assert.equal(nextSnap(480, SNAPS), 640);
  assert.equal(nextSnap(640, SNAPS), 320, 'at the widest: wraps');
  let width = 200;
  const seen = [];
  for (let i = 0; i < 6; i++) seen.push((width = nextSnap(width, SNAPS)));
  assert.deepEqual(seen, [320, 480, 640, 320, 480, 640]);
});

test('nextSnap picks the next wider snap from between snaps, and wraps past the widest', () => {
  const { nextSnap } = load();
  assert.equal(nextSnap(100, SNAPS), 320, 'below the narrowest');
  assert.equal(nextSnap(319, SNAPS), 320);
  assert.equal(nextSnap(321, SNAPS), 480, 'strictly wider: no tolerance band');
  assert.equal(nextSnap(479.5, SNAPS), 480);
  assert.equal(nextSnap(500, SNAPS), 640);
  assert.equal(nextSnap(641, SNAPS), 320);
  assert.equal(nextSnap(5000, SNAPS), 320);
});

test('nextSnap does not care about snap order and does not reorder the caller\'s array', () => {
  const { nextSnap } = load();
  const unsorted = [640, 320, 480];
  assert.equal(nextSnap(320, unsorted), 480);
  assert.equal(nextSnap(400, unsorted), 480);
  assert.equal(nextSnap(640, unsorted), 320);
  assert.deepEqual(unsorted, [640, 320, 480]);
  assert.equal(nextSnap(320, [480, 320, 480, 640, 320]), 480, 'duplicates are harmless');
});

test('nextSnap ignores junk snaps and never returns a non-finite number', () => {
  const { nextSnap } = load();
  assert.equal(nextSnap(320, [NaN, 480, Infinity, -5, 0, '640', null, 320]), 480);
  assert.equal(nextSnap(480, [NaN, 480, Infinity, -5, 0, '640', null, 320]), 320);
  assert.equal(nextSnap(NaN, SNAPS), 320, 'NaN width: start of the cycle');
  assert.equal(nextSnap(Infinity, SNAPS), 320);
  assert.equal(nextSnap(-Infinity, SNAPS), 320);
  assert.equal(nextSnap(undefined, SNAPS), 320);
});

test('nextSnap with no usable snaps returns the width unchanged (or 0)', () => {
  const { nextSnap } = load();
  assert.equal(nextSnap(400, []), 400);
  assert.equal(nextSnap(400, [NaN, -1]), 400);
  assert.equal(nextSnap(400, null), 400);
  assert.equal(nextSnap(400, undefined), 400);
  assert.equal(nextSnap(NaN, []), 0);
  assert.equal(nextSnap(Infinity, null), 0);
  assert.equal(nextSnap(400, [480]), 480, 'a single snap');
  assert.equal(nextSnap(480, [480]), 480, 'a single snap wraps to itself');
});

// ---- sameSize ----

test('sameSize compares width and height exactly', () => {
  const { sameSize } = load();
  assert.equal(sameSize({ width: 400, height: 300 }, { width: 400, height: 300 }), true);
  assert.equal(sameSize({ width: 400, height: 300 }, { width: 401, height: 300 }), false);
  assert.equal(sameSize({ width: 400, height: 300 }, { width: 400, height: 301 }), false);
  assert.equal(sameSize({ width: 400, height: 300 }, { width: 400.4, height: 300 }), false, 'no rounding: callers clamp first');
  assert.equal(sameSize({ width: 400, height: 300, user: true }, { width: 400, height: 300 }), true, 'extra fields ignored');
});

test('sameSize is false whenever either side is missing or not a number', () => {
  const { sameSize } = load();
  const size = { width: 400, height: 300 };
  assert.equal(sameSize(null, size), false);
  assert.equal(sameSize(size, null), false);
  assert.equal(sameSize(null, null), false, 'nothing sent yet is never "the same"');
  assert.equal(sameSize(undefined, undefined), false);
  assert.equal(sameSize({ width: NaN, height: 300 }, { width: NaN, height: 300 }), false);
  assert.equal(typeof sameSize(size, size), 'boolean');
});

test('sameSize agrees with clampSize output from the same realm and across calls', () => {
  const { clampSize, sameSize } = load();
  assert.equal(sameSize(clampSize(400.2, 299.8, BOUNDS), clampSize(399.6, 300.1, BOUNDS)), true);
  assert.equal(sameSize(clampSize(NaN, NaN, BOUNDS), clampSize(-1, -1, BOUNDS)), true);
});
