// Tests for examples/kit-tour (the Figplug tour, kit 0.4.0).
// The main thread: they run the example's COMPILED code.js, the file Figma loads, whole (the
// kit:window block and the plugin below it) in a node:vm context against a figma stub, and pin the
// window mode, the selection count, the created reply for both shapes, the clamps, failures (also
// of the viewport, the selection and the zoom), open-github (a fixed address, and a notice when the
// browser can't open), and which messages it ignores.
// The files: the invariants a static read can check in manifest.json, code.ts and ui.html (the
// root's kit:window block, one listener, the nine screens and their footers, the address and the
// shape fill both threads share, the kit's file rules, the size budget, the copy rules). How the UI
// behaves (the groups, the pages, the messages it posts) is covered end to end by e2e/examples.spec.mjs.
// Run: tsc -p examples/kit-tour && node --test examples/kit-tour/example.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CODE_JS = read('./code.js');
const CODE_TS = read('./code.ts');
const UI = read('./ui.html');
const MANIFEST = JSON.parse(read('./manifest.json'));
const GITHUB = 'https://github.com/alekseikipin/Figplug-ui-kit';

// Settles every pending promise in the vm (it shares this realm's microtask queue).
const flush = () => new Promise((resolve) => setImmediate(resolve));
// vm objects have another realm's Object.prototype, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Boots code.js. `failAt` makes the n-th create call (1-based) throw, as an editor that can't
 * create the node would; `selection` is the current page's selection at startup. `throws` names
 * the stub parts that throw: 'center' (reading figma.viewport.center), 'select' (setting the
 * selection), 'zoom' (scrollAndZoomIntoView) or 'browser' (openExternal).
 */
async function boot({ selection = [], failAt = 0, editorType = 'figma', throws = [] } = {}) {
  const posted = [];
  const notified = [];
  const shown = [];
  const handlers = [];
  const events = {};
  const created = [];
  const zoomed = [];
  const opened = [];
  const warned = [];
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
    openExternal(url) {
      if (throws.includes('browser')) throw new Error('no browser here');
      opened.push(url);
    },
    on(type, fn) { (events[type] = events[type] || []).push(fn); },
    closePlugin() { closed += 1; },
  };
  const context = vm.createContext({
    figma,
    __html__: '<html></html>',
    console: { warn(...args) { warned.push(args.join(' ')); }, log() {}, error() {} },
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
    posted, notified, shown, created, zoomed, opened, warned, emit, fire, ofType,
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
  assert.match(env.notified[0].message, /^Couldn’t add shapes: cannot create a ellipse here$/);
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
  assert.deepEqual(env.notified, [{ message: 'Couldn’t add shapes: no viewport here', options: { error: true } }]);
});

test('when selecting or zooming fails, the shapes still count: one created reply, one notice that says what failed', async () => {
  for (const part of ['select', 'zoom']) {
    const env = await boot({ throws: [part] });
    await env.emit({ type: 'create-shapes', count: 3, shape: 'ellipse' });
    assert.equal(env.created.length, 3, part);
    assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 3, shape: 'ellipse' }], part);
    assert.equal(env.notified.length, 1, part);
    assert.match(env.notified[0].message, /^Added 3 shapes, but couldn’t select them: cannot (select|zoom) here$/, part);
    assert.deepEqual(env.notified[0].options, { error: true }, part);
  }
  const one = await boot({ throws: ['zoom'] });
  await one.emit({ type: 'create-shapes', count: 1, shape: 'rectangle' });
  assert.match(one.notified[0].message, /^Added 1 shape, but/);
});

test('open-github opens the kit\'s GitHub page in the browser, and creates and posts nothing', async () => {
  const env = await boot();
  const before = env.posted.length;
  await env.emit({ type: 'open-github' });
  assert.deepEqual(env.opened, [GITHUB]);
  assert.equal(env.created.length, 0);
  assert.equal(env.posted.length, before);
  assert.deepEqual(env.notified, []);
  assert.equal(env.closed, 0);
});

test('the address lives in code.ts: one sent with the message is ignored', async () => {
  const env = await boot();
  await env.emit({ type: 'open-github', url: 'https://example.com/elsewhere' });
  assert.deepEqual(env.opened, [GITHUB]);
});

test('when the browser can\'t be opened, a plain notice points at Copy link, the console says why, and nothing throws', async () => {
  const env = await boot({ throws: ['browser'] });
  await env.emit({ type: 'open-github' });
  assert.deepEqual(env.opened, []);
  assert.deepEqual(env.notified, [{ message: 'Couldn’t open your browser. Use Copy link instead.', options: { error: true } }]);
  assert.ok(env.warned.some((line) => line.includes('no browser here')), 'the error text goes to the console, not the notice');
  // The plugin keeps working afterwards.
  await env.emit({ type: 'create-shapes', count: 1, shape: 'rectangle' });
  assert.deepEqual(env.ofType('created'), [{ type: 'created', count: 1, shape: 'rectangle' }]);
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
    { type: 'close' }, // the old tour's Close button: Figma's title bar closes the plugin now
    'open-github',
    { type: 'Open-github' },
    { type: 'open_github' },
    { type: 'kit:open-github' },
    { type: 'kit:create-shapes', count: 3, shape: 'rectangle' },
  ];
  for (const msg of bad) await env.emit(msg);
  assert.equal(env.created.length, 0);
  assert.equal(env.closed, 0);
  assert.deepEqual(env.opened, []);
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

// ---- The files -------------------------------------------------------------------------------

/** ui.html after the kit's three blocks: the tour's own CSS, markup and script. */
const HOST = UI.slice(UI.indexOf('</script>', UI.indexOf('<script data-kit="runtime">')) + '</script>'.length);
/** The tour's one script, at the end of <body>. */
const SCRIPT = (/<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(UI) || ['', ''])[1];
const SCREENS = ['home', 'buttons', 'fields', 'choices', 'popups', 'feedback', 'window', 'create', 'files'];
/** A tag's attributes, in any order: { name: value } ('' for a bare attribute). */
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']));
/** The tour's own ui.html budget, 1 KB under the audit's 128 KB warning, so a change that grows the file fails here first. */
const UI_BUDGET = 127 * 1024;

test('manifest.json: the example\'s own name and id, the starter\'s editors, dynamic-page, and no network (openExternal fetches nothing)', () => {
  assert.deepEqual(MANIFEST, {
    name: 'Kit tour (kit example)',
    id: 'kit-example-kit-tour',
    api: '1.0.0',
    main: 'code.js',
    ui: 'ui.html',
    editorType: ['figma', 'figjam', 'slides', 'buzz'],
    documentAccess: 'dynamic-page',
    networkAccess: { allowedDomains: ['none'] },
  });
});

test('code.ts: the root\'s kit:window block unchanged, one figma.ui.on listener, and no Close', () => {
  const block = (text) => text.slice(text.indexOf('// ==== kit:window:start'), text.indexOf('// ==== kit:window:end ===='));
  assert.ok(block(CODE_TS).length > 1000);
  assert.equal(block(CODE_TS), block(read('../../code.ts')), 'the kit:window block is the root code.ts\'s, byte for byte');
  const plugin = CODE_TS.slice(CODE_TS.indexOf('// ---- Your plugin starts here ----'));
  assert.equal((plugin.match(/figma\.ui\.on\(\s*'message'/g) || []).length, 1);
  assert.doesNotMatch(plugin, /onmessage\s*=/);
  assert.doesNotMatch(plugin, /closePlugin|TourCloseMessage|type: 'close'/, 'Figma\'s title bar closes the plugin; the tour has no Close button');
});

test('ui.html: Home and eight pages, one shown at a time; the screens that end in a footer say so, for the toast lane', () => {
  const screens = [...UI.matchAll(/<section\b([^>]*)>/g)].map((m) => ({ at: m.index, ...attrs(m[1]) })).filter((s) => /\btour-screen\b/.test(s.class || ''));
  assert.deepEqual(screens.map((s) => s['data-screen']), SCREENS);
  assert.deepEqual(screens.map((s) => s.id), SCREENS.map((id) => `screen-${id}`));
  assert.deepEqual(screens.map((s) => 'hidden' in s), SCREENS.map((id) => id !== 'home'), 'only Home is shown at first');
  for (const s of screens) {
    const body = UI.slice(s.at, UI.indexOf('</section>', s.at));
    assert.equal('data-footer' in s, /<\/footer>\s*$/.test(body), `${s['data-screen']}: data-footer if and only if it ends in its kit-footer`);
  }
});

test('ui.html and code.ts share the GitHub address and the shape fill', () => {
  assert.ok(CODE_TS.includes(`'${GITHUB}'`));
  assert.ok(SCRIPT.includes(`'${GITHUB}'`), 'Copy link copies the address main opens');
  assert.ok(HOST.replace(/<wbr>/g, '').includes('>github.com/alekseikipin/Figplug-ui-kit<'), 'the address is on the page, selectable');
  // The preview draws the new shapes in main's fill: TOUR_SHAPE_FILL in code.ts, SHAPE_FILL in ui.html.
  const fill = /TOUR_SHAPE_FILL\b[^=]*=\s*\{\s*r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+)\s*\}/.exec(CODE_TS);
  const ui = /\bSHAPE_FILL\s*=\s*\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]/.exec(SCRIPT);
  assert.ok(fill && ui, 'both files name the fill');
  assert.deepEqual(ui.slice(1).map(Number), fill.slice(1).map(Number));
});

test('ui.html keeps the kit\'s rules: one classic strict script at the end, no comments, no storage, no form, one handle after </main>, unique ids', () => {
  assert.ok(!UI.includes('<!--'), 'no HTML comments');
  assert.deepEqual([...HOST.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]), [''], 'one plain classic <script> after the kit blocks');
  assert.match(SCRIPT, /^\s*'use strict';/);
  assert.match(UI, /<\/script>\s*<\/body>\s*<\/html>\s*$/);
  assert.doesNotMatch(HOST, /\b(localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(HOST.replace(SCRIPT, ''), /<form\b/, 'no <form> (its submit may be blocked in the plugin iframe)');
  assert.equal((HOST.match(/<button class="kit-resize-handle"/g) || []).length, 1);
  assert.ok(HOST.indexOf('</main>') < HOST.indexOf('<button class="kit-resize-handle"'), 'the handle comes after </main>');
  const ids = [...HOST.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'no id is used twice');
});

test('ui.html stays under its 127 KB budget, 1 KB short of the audit\'s 128 KB size warning', () => {
  const bytes = Buffer.byteLength(UI);
  assert.ok(bytes < UI_BUDGET, `ui.html is ${bytes.toLocaleString('en')} bytes, over the tour's budget of ${UI_BUDGET.toLocaleString('en')} (127 KB): `
    + 'trim the host CSS, markup or script now, before the audit\'s 128 KB warning (131,072 bytes) is reached');
});

test('the copy: the approved lines, "AI agent", and no AI tool names', () => {
  for (const line of [
    '20 parts for your Figma plugin', 'They look and work like Figma’s own panels.', 'This plugin is built with them.', 'You’ve tried 0 of 20 parts',
    'Change its properties.', 'Point at an icon for its tooltip.', 'Edit the frame.', 'Clear its name to see an error.',
    'Tick Hidden and watch All change.', 'Open a sample frame’s menu.', 'Deleting can be undone.', 'Pick a tone.',
    'A notice stays put; a toast comes and goes.', 'Add frames and the window grows.', 'Drag the corner.',
    'Adds real shapes to this page, in a row, and selects them.', 'Build your own plugin', 'Free starter code with all 20 parts.',
    'Describe your plugin, and an AI agent builds it with them.', 'Open the folder in an AI agent that can edit files on your computer, and say what your plugin should do.',
    'That’s the whole kit. Get the files and build your own.', 'Colours from Figma', 'Shown in the list.',
  ]) assert.ok(HOST.includes(line), line);
  assert.doesNotMatch(HOST, /\b(Claude|Cursor|Codex|Copilot|ChatGPT|Gemini|OpenAI|Anthropic)\b/);
});
