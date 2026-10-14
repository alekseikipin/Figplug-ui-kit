// Tests for tokens.figma-fallback.css, the browser-preview palette. Each of its three blocks
// (Design light, Design dark, FigJam) must declare exactly the 174 --figma-color-* names Figma
// documents, in the docs' order, with a colour value each, behind a zero-specificity selector so
// the palette Figma injects always wins. test/figma-color-tokens.txt is the documented list (one
// name per line, copied from Figma's css-variables page on 2026-10-13); it lives next to this file
// rather than in test/fixtures/, whose entries are audit plugin folders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const CSS = read('../tokens.figma-fallback.css');
const NAMES = read('./figma-color-tokens.txt').split('\n').map((line) => line.trim()).filter(Boolean);

const BLOCKS = [
  { theme: 'Design light', selector: ':where(:root)' },
  { theme: 'Design dark', selector: ':where(:root.figma-dark)' },
  { theme: 'FigJam', selector: ':where(:root[data-kit-surface="figjam"])' },
];

// Comments out, then every top-level "selector { body }" rule in source order.
function rules(css) {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}

function declarations(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return { name: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
  });
}

// The formats Figma's docs and runtime dumps use: 3/4/6/8-digit hex and rgb()/rgba().
const COLOUR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;

test('the documented list has 174 unique names: 43 bg, 30 border, 54 icon, 47 text', () => {
  assert.equal(NAMES.length, 174);
  assert.equal(new Set(NAMES).size, 174, 'no duplicates');
  const count = (type) => NAMES.filter((n) => n.startsWith(`--figma-color-${type}`)).length;
  assert.deepEqual([count('bg'), count('border'), count('icon'), count('text')], [43, 30, 54, 47]);
  assert.ok(NAMES.includes('--figma-color-bg-slot') && NAMES.includes('--figma-color-border-slot'), 'the 2026 slot tokens');
});

test('the file has exactly the three palette blocks, in cascade order', () => {
  assert.deepEqual(rules(CSS).map((r) => r.selector), BLOCKS.map((b) => b.selector));
});

for (const { theme, selector } of BLOCKS) {
  test(`${theme}: ${selector} declares exactly the 174 documented names, in order`, () => {
    const block = rules(CSS).find((r) => r.selector === selector);
    assert.ok(block, `no ${selector} block`);
    const decls = declarations(block.body);
    const names = decls.map((d) => d.name);
    assert.deepEqual(names.filter((n) => !NAMES.includes(n)), [], 'undocumented names');
    assert.deepEqual(NAMES.filter((n) => !names.includes(n)), [], 'missing names');
    assert.equal(names.length, NAMES.length, 'no name declared twice');
    assert.deepEqual(names, NAMES, 'same order as Figma\'s docs, so palettes diff line by line');
    for (const { name, value } of decls) assert.match(value, COLOUR, `${name} is not a colour: ${value}`);
  });
}

test('every selector has zero specificity, so an injected :root palette always wins', () => {
  for (const { selector } of rules(CSS)) assert.match(selector, /^:where\([^,]*\)$/, selector);
});

test('the palettes differ where Figma documents they do', () => {
  const value = (selector, name) =>
    declarations(rules(CSS).find((r) => r.selector === selector).body).find((d) => d.name === name).value;
  const [light, dark, figjam] = BLOCKS.map((b) => b.selector);
  assert.equal(value(light, '--figma-color-bg-brand'), '#0d99ff', 'Design brand is blue');
  assert.equal(value(figjam, '--figma-color-bg-brand'), '#9747ff', 'FigJam brand is purple');
  assert.equal(value(dark, '--figma-color-bg'), '#2c2c2c', 'dark panel background');
});

test('the header keeps the provenance, the MIT notice and the PROVISIONAL warning', () => {
  const header = CSS.slice(0, CSS.indexOf('*/'));
  for (const needle of ['PROVISIONAL', 'create-figma-plugin', '72554ac01620', 'Copyright (c) Yuan Qing Lim',
    'Permission is hereby granted', 'tools/probe', 'developers.figma.com/docs/plugins/css-variables']) {
    assert.ok(header.includes(needle), `header mentions ${needle}`);
  }
});

test('ui.html never ships the fallback or the preview-only hooks', () => {
  const ui = read('../ui.html');
  assert.doesNotMatch(ui, /tokens\.figma-fallback\.css/, 'ui.html links the preview palette');
  assert.doesNotMatch(ui, /data-kit-demo-state|data-kit-surface/, 'preview-only attributes leaked into ui.html');
});
