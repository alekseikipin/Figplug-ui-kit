// Tests for examples/export-selection (the export-selection archetype, kit 0.3.0).
// They run the example's COMPILED code.js, the file Figma loads, whole: the kit:window block and
// the plugin below it, in a node:vm context against a figma stub with scene nodes whose
// exportAsync returns known bytes. They pin the core behaviour: the window mode, the selection
// sizes, the message shapes (bytes travel as exportAsync's own Uint8Array), the file names,
// failures, and the saved scale.
// Run: tsc -p examples/export-selection && node --test examples/export-selection/example.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE_JS = readFileSync(new URL('./code.js', import.meta.url), 'utf8');

// Settles every pending promise in the vm (it shares this realm's microtask queue).
const flush = () => new Promise((resolve) => setImmediate(resolve));
// vm objects have another realm's Object.prototype, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * A scene node for the stub. `render` is absoluteRenderBounds (null: nothing drawn), `box` is
 * absoluteBoundingBox. exportAsync records its settings and resolves to `bytes`, or rejects
 * with `fail`. `exportable: false` leaves exportAsync off, like a node without ExportMixin.
 */
function makeNode({ id, name, type = 'FRAME', render, box, bytes, fail, exportable = true }) {
  const bounds = box === undefined ? { x: 0, y: 0, width: 100, height: 100 } : box;
  const node = {
    id,
    name,
    type,
    absoluteBoundingBox: bounds,
    absoluteRenderBounds: render === undefined ? bounds : render,
    exports: [],
    bytes: bytes || new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, id.length]),
  };
  if (exportable) {
    node.exportAsync = async (settings) => {
      node.exports.push(plain(settings));
      if (fail) throw new Error(fail);
      return node.bytes;
    };
  }
  return node;
}

/** Boots code.js with this selection, these other nodes (by id), and these stored values. */
async function boot({ selection = [], nodes = [], stored = {}, failGetNode = [] } = {}) {
  const posted = [];
  const notified = [];
  const warned = [];
  const shown = [];
  const handlers = [];
  const events = {};
  const store = new Map(Object.entries(stored));
  const sets = [];
  const byId = new Map([...selection, ...nodes].map((n) => [n.id, n]));
  const timers = [];

  const figma = {
    editorType: 'figma',
    showUI(html, options) { shown.push({ html, options: plain(options) }); },
    ui: {
      on(type, fn) { if (type === 'message') handlers.push(fn); },
      once(type, fn) { if (type === 'message') handlers.push(fn); },
      off(type, fn) { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); },
      // Kept as posted (no clone), so a test can check that bytes is exportAsync's own array.
      postMessage(msg) { posted.push(msg); },
      resize() {},
      show() {},
      hide() {},
    },
    clientStorage: {
      async getAsync(key) { return store.get(key); },
      async setAsync(key, value) { sets.push({ key, value: plain(value) }); store.set(key, value); },
    },
    currentPage: { id: '0:1', type: 'PAGE', get selection() { return selection.slice(); } },
    on(type, fn) { (events[type] = events[type] || []).push(fn); },
    async getNodeByIdAsync(id) {
      if (failGetNode.includes(id)) throw new Error('getNodeByIdAsync failed');
      return byId.get(id) || null;
    },
    notify(message, options) { notified.push({ message, options: plain(options) }); },
  };
  const context = vm.createContext({
    figma,
    __html__: '<html></html>',
    console: { warn: (...args) => warned.push(args.map(String).join(' ')), log() {}, error() {} },
    // The kit's 500 ms show cap and 300 ms read timeout never need to fire here.
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    clearTimeout() {},
  });
  vm.runInContext(CODE_JS, context, { filename: 'examples/export-selection/code.js' });
  await flush();

  const emit = async (msg) => {
    for (const fn of handlers.slice()) fn(msg, { origin: 'null' });
    await flush();
  };
  const fire = async (type) => {
    for (const fn of events[type] || []) fn();
    await flush();
  };
  const ofType = (type) => posted.filter((m) => m && m.type === type);
  return { context, figma, posted, notified, warned, shown, events, sets, emit, fire, ofType, setSelection: (next) => { selection = next; } };
}

test('opens a resizable window: one showUI, and kit:init answers kit:ready with mode "resizable"', async () => {
  const env = await boot();
  assert.equal(env.shown.length, 1);
  assert.equal(env.shown[0].html, '<html></html>');
  await env.emit({ type: 'kit:ready', protocol: 1 });
  const init = env.ofType('kit:init');
  assert.equal(init.length, 1);
  assert.equal(init[0].mode, 'resizable');
  assert.equal(init[0].chrome, true);
});

test('png-selection at startup: each layer at 1x from its render bounds; nothing drawn is 0; a slice uses its bounding box', async () => {
  const selection = [
    makeNode({ id: '1:1', name: 'Card', render: { x: -4, y: -2, width: 128.5, height: 88 }, box: { x: 0, y: 0, width: 120, height: 80 } }),
    makeNode({ id: '1:2', name: 'Hidden label', type: 'TEXT', render: null, box: { x: 0, y: 0, width: 40, height: 16 } }),
    makeNode({ id: '1:3', name: 'Icon slice', type: 'SLICE', render: null, box: { x: 10, y: 10, width: 64, height: 48 } }),
  ];
  const env = await boot({ selection });
  const sel = env.ofType('png-selection');
  assert.equal(sel.length, 1);
  assert.deepEqual(plain(sel[0]), {
    type: 'png-selection',
    count: 3,
    max: 100,
    layers: [
      { id: '1:1', name: 'Card', width: 128.5, height: 88 },
      { id: '1:2', name: 'Hidden label', width: 0, height: 0 },
      { id: '1:3', name: 'Icon slice', width: 64, height: 48 },
    ],
  });
});

test('more than 100 selected layers: the count is sent, the layer list is empty', async () => {
  const selection = Array.from({ length: 101 }, (_, i) => makeNode({ id: `2:${i}`, name: `L${i}` }));
  const env = await boot({ selection });
  const [sel] = env.ofType('png-selection');
  assert.equal(sel.count, 101);
  assert.equal(sel.max, 100);
  assert.deepEqual(plain(sel.layers), []);
});

test('selectionchange and currentpagechange post the selection again', async () => {
  const env = await boot();
  assert.equal(env.ofType('png-selection').length, 1);
  env.setSelection([makeNode({ id: '3:1', name: 'New' })]);
  await env.fire('selectionchange');
  await env.fire('currentpagechange');
  const sel = env.ofType('png-selection');
  assert.equal(sel.length, 3);
  assert.deepEqual(plain(sel[2].layers), [{ id: '3:1', name: 'New', width: 100, height: 100 }]);
});

test('png-export: one png-file per layer carrying exportAsync\'s own Uint8Array, then png-done', async () => {
  const a = makeNode({ id: '4:1', name: 'Hero' });
  const b = makeNode({ id: '4:2', name: 'hero' });
  const c = makeNode({ id: '4:3', name: 'icon.png' });
  const env = await boot({ selection: [a, b, c] });
  await env.emit({ type: 'png-export', ids: ['4:1', '4:2', '4:3'], scale: 2 });

  for (const node of [a, b, c]) assert.deepEqual(node.exports, [{ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }]);
  const out = env.posted.filter((m) => m.type === 'png-file' || m.type === 'png-done');
  assert.deepEqual(out.map((m) => m.type), ['png-file', 'png-file', 'png-file', 'png-done']);
  const files = out.slice(0, 3);
  files.forEach((msg, i) => {
    // The shape Figma can carry: plain fields and a Uint8Array (no Blob, ArrayBuffer or number[]).
    assert.deepEqual(Object.keys(msg), ['type', 'name', 'bytes']);
    assert.ok(msg.bytes instanceof Uint8Array, 'bytes is a Uint8Array');
    assert.equal(msg.bytes, [a, b, c][i].bytes, 'bytes is the array exportAsync returned, not a copy or a conversion');
  });
  assert.deepEqual(files.map((m) => m.name), ['Hero@2x.png', 'hero 2@2x.png', 'icon@2x.png']);
  assert.deepEqual(plain(out[3]), { type: 'png-done', exported: 3, failed: [] });
  assert.deepEqual(env.notified, []);
});

test('scale: 1x has no suffix and 3x is @3x; a slice exports with contentsOnly: false', async () => {
  const frame = makeNode({ id: '5:1', name: 'Logo' });
  const slice = makeNode({ id: '5:2', name: 'Area', type: 'SLICE', render: null });
  const env = await boot({ selection: [frame, slice] });
  await env.emit({ type: 'png-export', ids: ['5:1'], scale: 1 });
  await env.emit({ type: 'png-export', ids: ['5:1', '5:2'], scale: 3 });
  assert.deepEqual(env.ofType('png-file').map((m) => m.name), ['Logo.png', 'Logo@3x.png', 'Area@3x.png']);
  assert.deepEqual(frame.exports, [
    { format: 'PNG', constraint: { type: 'SCALE', value: 1 } },
    { format: 'PNG', constraint: { type: 'SCALE', value: 3 } },
  ]);
  assert.deepEqual(slice.exports, [{ format: 'PNG', constraint: { type: 'SCALE', value: 3 }, contentsOnly: false }]);
});

test('failures are skipped and named: a deleted layer, a failed lookup, no exportAsync, a render error; one error notify', async () => {
  const ok = makeNode({ id: '6:1', name: 'Fine' });
  const noExport = makeNode({ id: '6:2', name: 'Odd', exportable: false });
  const broken = makeNode({ id: '6:3', name: 'Huge', fail: 'too large' });
  const env = await boot({ selection: [ok, noExport, broken], failGetNode: ['6:9'] });
  await env.emit({ type: 'png-export', ids: ['6:1', 'gone', '6:2', '6:3', '6:9'], scale: 2 });
  assert.deepEqual(env.ofType('png-file').map((m) => m.name), ['Fine@2x.png']);
  assert.deepEqual(plain(env.ofType('png-done')), [
    { type: 'png-done', exported: 1, failed: ['a deleted layer', 'Odd', 'Huge', 'a deleted layer'] },
  ]);
  assert.deepEqual(env.notified, [{ message: 'Could not export 4 layers', options: { error: true } }]);
});

test('png-done is sent even when every layer fails', async () => {
  const env = await boot({ selection: [makeNode({ id: '7:1', name: 'Only', fail: 'boom' })] });
  await env.emit({ type: 'png-export', ids: ['7:1'], scale: 2 });
  assert.deepEqual(plain(env.ofType('png-done')), [{ type: 'png-done', exported: 0, failed: ['Only'] }]);
  assert.deepEqual(env.notified, [{ message: 'Could not export 1 layer', options: { error: true } }]);
});

test('malformed messages are ignored: bad scale, empty or non-string ids, more than 100 ids, unknown types', async () => {
  const node = makeNode({ id: '8:1', name: 'X' });
  const env = await boot({ selection: [node] });
  const before = env.posted.length;
  for (const msg of [
    { type: 'png-export', ids: ['8:1'], scale: 4 },
    { type: 'png-export', ids: ['8:1'], scale: '2' },
    { type: 'png-export', ids: [], scale: 2 },
    { type: 'png-export', ids: [8], scale: 2 },
    { type: 'png-export', ids: Array.from({ length: 101 }, () => '8:1'), scale: 2 },
    { type: 'png-export', scale: 2 },
    { type: 'png-save-scale', scale: 0 },
    { type: 'kit:export', ids: ['8:1'], scale: 2 },
    null,
    'png-export',
  ]) await env.emit(msg);
  assert.deepEqual(node.exports, []);
  assert.deepEqual(env.posted.slice(before), []);
  assert.deepEqual(env.sets, []);
});

test('file names: golden cases', async () => {
  const { context } = await boot();
  const name = (layer, scale = 2, used = new Set()) => context.pngFileName(layer, scale, used);
  assert.equal(name('Hero', 1), 'Hero.png');
  assert.equal(name('Hero', 2), 'Hero@2x.png');
  assert.equal(name('Hero', 3), 'Hero@3x.png');
  assert.equal(name('a/b:c*?"<>|d'), 'a-b-c-d@2x.png', 'characters file systems refuse become one "-" per run');
  assert.equal(name('Card\n  title\t'), 'Card title@2x.png', 'a line break in a text layer name is a space');
  assert.equal(name('bell\u0007ring'), 'bell-ring@2x.png');
  assert.equal(name('logo.png'), 'logo@2x.png');
  assert.equal(name('logo.PNG '), 'logo@2x.png');
  assert.equal(name('  .hidden.  '), 'hidden@2x.png', 'leading and trailing dots and spaces go');
  assert.equal(name(''), 'Layer@2x.png');
  assert.equal(name('...'), 'Layer@2x.png');
  assert.equal(name('x'.repeat(150)), 'x'.repeat(100) + '@2x.png');
  // 99 letters, then an emoji (two UTF-16 units), then more: the cut keeps the emoji whole.
  assert.equal(name('a'.repeat(99) + '\u{1F600}' + 'bcd'), 'a'.repeat(99) + '\u{1F600}' + '@2x.png');

  const used = new Set();
  assert.deepEqual(['Hero', 'hero', 'Hero 2', 'HERO'].map((n) => name(n, 2, used)), ['Hero@2x.png', 'hero 2@2x.png', 'Hero 2 2@2x.png', 'HERO 3@2x.png']);
});

test('the scale is remembered: png-save-scale stores it, the next run sends it back as png-settings', async () => {
  const first = await boot();
  assert.deepEqual(first.ofType('png-settings'), [], 'nothing saved yet: no png-settings');
  await first.emit({ type: 'png-save-scale', scale: 3 });
  assert.deepEqual(first.sets, [{ key: 'export-png:scale', value: 3 }]);

  const next = await boot({ stored: { 'export-png:scale': 3 } });
  assert.deepEqual(plain(next.ofType('png-settings')), [{ type: 'png-settings', scale: 3 }]);
  const junk = await boot({ stored: { 'export-png:scale': '3' } });
  assert.deepEqual(junk.ofType('png-settings'), [], 'a stored value that is not 1, 2 or 3 is ignored');
});
