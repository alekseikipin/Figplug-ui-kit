// Tests for examples/kit-tour (the curated kit tour, kit 0.4.0).
// They run the example's COMPILED code.js, the file Figma loads, whole: the kit:window block and
// the plugin below it, in a node:vm context against a figma stub. The tour's UI is in ui.html and
// is covered end to end by e2e/examples.spec.mjs; the main thread only runs the starter's
// Create-shapes demo, pinned here: the window mode, the selection count, the created reply for
// both shapes, the clamps, failures (also of the viewport, the selection and the zoom), close, and
// which messages it ignores.
// Run: tsc -p examples/kit-tour && node --test examples/kit-tour/example.test.mjs

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
 * Boots code.js. `failAt` makes the n-th create call (1-based) throw, as an editor that can't
 * create the node would; `selection` is the current page's selection at startup. `throws` names
 * the stub parts that throw: 'center' (reading figma.viewport.center), 'select' (setting the
 * selection) or 'zoom' (scrollAndZoomIntoView).
 */
async function boot({ selection = [], failAt = 0, editorType = 'figma', throws = [] } = {}) {
  const posted = [];
  const notified = [];
  const shown = [];
  const handlers = [];
  const events = {};
  const created = [];
  const zoomed = [];
  let closed = 0;
  let creates = 0;
  let currentSelection = selection.slice();

  const make = (type) => {
    creates += 1;
    if (failAt && creates >= failAt) throw new Error(`cannot create a ${type.toLowerCase()} here`);
    const node = { type, x: 0, y: 0, fills: [] };
    created.push(node);
    return node;
  };
  const figma = {
    editorType,
    showUI(html, options) { shown.push({ html, options: plain(options) }); },
    ui: {
      on(type, fn) { if (type === 'message') handlers.push(fn); },
      once(type, fn) { if (type === 'message') handlers.push(fn); },
      off(type, fn) { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); },
      postMessage(msg) { posted.push(plain(msg)); },
      resize() {},
      show() {},
      hide() {},
    },
    clientStorage: { async getAsync() { return undefined; }, async setAsync() {} },
    currentPage: {
      get selection() { return currentSelection.slice(); },
      set selection(nodes) {
        if (throws.includes('select')) throw new Error('cannot select here');
        currentSelection = nodes.slice();
      },
    },
    viewport: {
      get center() {
        if (throws.includes('center')) throw new Error('no viewport here');
        return { x: 100.4, y: 50.6 };
      },
      scrollAndZoomIntoView(nodes) {
        if (throws.includes('zoom')) throw new Error('cannot zoom here');
        zoomed.push(nodes.length);
      },
    },
    createRectangle: () => make('RECTANGLE'),
    createEllipse: () => make('ELLIPSE'),
    notify(message, options) { notified.push({ message, options: plain(options) }); },
    on(type, fn) { (events[type] = events[type] || []).push(fn); },
    closePlugin() { closed += 1; },
  };
  const context = vm.createContext({
    figma,
    __html__: '<html></html>',
    console: { warn() {}, log() {}, error() {} },
    // The kit's show timers and its storage read timeout never need to fire here.
    setTimeout: () => 0,
    clearTimeout() {},
  });
  vm.runInContext(CODE_JS, context, { filename: 'examples/kit-tour/code.js' });
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
  return {
    posted, notified, shown, created, zoomed, emit, fire, ofType,
    get closed() { return closed; },
    get selection() { return currentSelection; },
    select(nodes) { currentSelection = nodes.slice(); },
  };
}

test('opens a fit-content window 360 wide, at most 720 tall, and kit:init says so', async () => {
  const env = await boot();
  assert.equal(env.shown.length, 1);
  assert.equal(env.shown[0].html, '<html></html>');
  assert.equal(env.shown[0].options.width, 360);
  assert.equal(env.shown[0].options.themeColors, true);
  await env.emit({ type: 'kit:ready', protocol: 1 });
  const [init] = env.ofType('kit:init');
  assert.equal(init.mode, 'fit-content');
  assert.equal(init.chrome, true);
  assert.equal(init.defaultSize.width, 360);
  assert.equal(init.bounds.maxHeight, 720);
});

test('the handle is off in Buzz, where the docked panel sizes itself', async () => {
  const env = await boot({ editorType: 'buzz' });
  await env.emit({ type: 'kit:ready', protocol: 1 });
  assert.equal(env.ofType('kit:init')[0].chrome, false);
});

test('posts the selection count at startup and on every selection change', async () => {
  const env = await boot({ selection: [{ id: '1:1' }, { id: '1:2' }] });
  assert.deepEqual(env.ofType('selection'), [{ type: 'selection', count: 2 }]);
  env.select([]);
  await env.fire('selectionchange');
  env.select([{ id: '1:3' }]);
  await env.fire('selectionchange');
  assert.deepEqual(env.ofType('selection').map((m) => m.count), [2, 0, 1]);
});

test('create-shapes, rectangles: a row at the view centre, selected and zoomed to, then one created reply', async () => {
  const env = await boot();
  await env.emit({ type: 'create-shapes', count: 3, shape: 'rectangle' });
  assert.deepEqual(env.created.map((n) => n.type), ['RECTANGLE', 'RECTANGLE', 'RECTANGLE']);
  assert.deepEqual(env.created.map((n) => [n.x, n.y]), [[100, 51], [250, 51], [400, 51]]);
  for (const node of env.created) assert.deepEqual(plain(node.fills), [{ type: 'SOLID', color: { r: 1, g: 0.5, b: 0 } }]);
  assert.equal(env.selection.length, 3);
  assert.deepEqual(env.zoomed, [3]);
  assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 3, shape: 'rectangle' }]);
  assert.deepEqual(env.notified, []);
});

test('create-shapes, ellipses: createEllipse, and the reply names the shape', async () => {
  const env = await boot();
  await env.emit({ type: 'create-shapes', count: 2, shape: 'ellipse' });
  assert.deepEqual(env.created.map((n) => n.type), ['ELLIPSE', 'ELLIPSE']);
  assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 2, shape: 'ellipse' }]);
});

test('the count is clamped to a whole number from 1 to 50, whatever the UI sends', async () => {
  for (const [count, made] of [[0, 1], [-5, 1], [0.4, 1], [2.6, 3], [50.4, 50], [1000, 50]]) {
    const env = await boot();
    await env.emit({ type: 'create-shapes', count, shape: 'rectangle' });
    assert.equal(env.created.length, made, `count ${count}`);
    assert.deepEqual(env.ofType('created'), [{ type: 'created', count: made, shape: 'rectangle' }], `count ${count}`);
  }
});

test('a create that fails still answers: count 0, an error notice, the selection untouched', async () => {
  const env = await boot({ selection: [{ id: '1:1' }], failAt: 1 });
  await env.emit({ type: 'create-shapes', count: 4, shape: 'ellipse' });
  assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 0, shape: 'ellipse' }]);
  assert.equal(env.notified.length, 1);
  assert.match(env.notified[0].message, /^Could not create shapes: cannot create a ellipse here$/);
  assert.deepEqual(env.notified[0].options, { error: true });
  assert.deepEqual(env.selection, [{ id: '1:1' }]);
  assert.deepEqual(env.zoomed, []);
});

test('a create that fails part-way reports, selects and shows the shapes that exist', async () => {
  const env = await boot({ failAt: 3 });
  await env.emit({ type: 'create-shapes', count: 5, shape: 'rectangle' });
  assert.equal(env.created.length, 2);
  assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 2, shape: 'rectangle' }]);
  assert.equal(env.notified.length, 1);
  assert.equal(env.selection.length, 2);
  assert.deepEqual(env.zoomed, [2]);
});

test('a viewport that cannot be read still gets one answer: count 0 and an error notice', async () => {
  const env = await boot({ throws: ['center'] });
  await env.emit({ type: 'create-shapes', count: 3, shape: 'rectangle' });
  assert.equal(env.created.length, 0);
  assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 0, shape: 'rectangle' }]);
  assert.deepEqual(env.notified, [{ message: 'Could not create shapes: no viewport here', options: { error: true } }]);
});

test('when selecting or zooming fails, the shapes still count: one created reply, one notice that says what failed', async () => {
  for (const part of ['select', 'zoom']) {
    const env = await boot({ throws: [part] });
    await env.emit({ type: 'create-shapes', count: 3, shape: 'ellipse' });
    assert.equal(env.created.length, 3, part);
    assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 3, shape: 'ellipse' }], part);
    assert.equal(env.notified.length, 1, part);
    assert.match(env.notified[0].message, /^Created 3 shapes, but could not select them: cannot (select|zoom) here$/, part);
    assert.deepEqual(env.notified[0].options, { error: true }, part);
  }
  const one = await boot({ throws: ['zoom'] });
  await one.emit({ type: 'create-shapes', count: 1, shape: 'rectangle' });
  assert.match(one.notified[0].message, /^Created 1 shape, but/);
});

test('close closes the plugin, creates nothing and posts nothing more', async () => {
  const env = await boot();
  const before = env.posted.length;
  await env.emit({ type: 'close' });
  assert.equal(env.closed, 1);
  assert.equal(env.created.length, 0);
  assert.equal(env.posted.length, before);
});

test('malformed and unknown messages are ignored: nothing created, no reply', async () => {
  const env = await boot();
  const bad = [
    null, undefined, 'create-shapes', 42, [], {},
    { type: 'create-shapes' },
    { type: 'create-shapes', count: '5', shape: 'rectangle' },
    { type: 'create-shapes', count: Number.NaN, shape: 'rectangle' },
    { type: 'create-shapes', count: Number.POSITIVE_INFINITY, shape: 'rectangle' },
    { type: 'create-shapes', count: 3 },
    { type: 'create-shapes', count: 3, shape: 'star' },
    { type: 'create-shapes', count: 3, shape: 'ELLIPSE' },
    { type: 'Create-shapes', count: 3, shape: 'rectangle' },
    { type: 'closed' },
    { type: 'kit:create-shapes', count: 3, shape: 'rectangle' },
  ];
  for (const msg of bad) await env.emit(msg);
  assert.equal(env.created.length, 0);
  assert.equal(env.closed, 0);
  assert.deepEqual(env.ofType('created'), []);
  assert.deepEqual(env.notified, []);
});

test('the kit\'s own messages reach the kit, not the tour', async () => {
  const env = await boot();
  await env.emit({ type: 'kit:ready', protocol: 1 });
  await env.emit({ type: 'kit:resize', width: 400, height: 300, user: true, final: true });
  assert.equal(env.created.length, 0);
  assert.deepEqual(env.ofType('created'), []);
  // Every message main posts is a kit:* message or one of the tour's two typed replies.
  for (const msg of env.posted) assert.ok(msg.type.startsWith('kit:') || ['selection', 'created'].includes(msg.type), msg.type);
});
