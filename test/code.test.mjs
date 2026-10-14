// Tests for the main-thread kit block (code.ts -> code.js).
// They run the COMPILED code.js, because that is the file Figma loads: the kit block is cut out
// between its fence lines and evaluated in a node:vm context against a hand-written figma stub
// and a fake clock, so timing rules (show 800 ms after kit:ready or 3 s after install, 400 ms save
// debounce, 300 ms storage read timeout) are exact.
// Run: npm run build && node --test "test/code.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE_JS = readFileSync(new URL('../code.js', import.meta.url), 'utf8');
const CODE_TS = readFileSync(new URL('../code.ts', import.meta.url), 'utf8');

function kitBlock(src) {
  const lines = src.split('\n');
  const start = lines.findIndex((line) => line.startsWith('// ==== kit:window:start'));
  const end = lines.findIndex((line) => line.startsWith('// ==== kit:window:end'));
  assert.ok(start >= 0 && end > start, 'code.js has the kit:window:start/end fence lines (run npm run build?)');
  return lines.slice(start, end + 1).join('\n');
}

// tsc emits "use strict" at the top of code.js; keep it so the block runs as it does in Figma.
const KIT_BLOCK = '"use strict";\n' + kitBlock(CODE_JS);
const DEFAULT_BOUNDS = { minWidth: 240, maxWidth: 960, minHeight: 120, maxHeight: 900 };

// Settles every pending promise in the vm (it shares this realm's microtask queue).
const flush = () => new Promise((resolve) => setImmediate(resolve));
// vm objects have another realm's Object.prototype, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function makeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    // Runs due timers in order, including ones scheduled by earlier timers inside the window.
    tick(ms) {
      const target = now + ms;
      for (;;) {
        let dueId;
        let due;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (!due || timer.at < due.at)) { dueId = id; due = timer; }
        }
        if (!due) break;
        timers.delete(dueId);
        now = due.at;
        due.fn();
      }
      now = target;
    },
    get pending() { return timers.size; },
  };
}

/**
 * A figma stub with just what the kit (and the host demo) touch. `log` records the order of
 * window and storage calls so tests can assert "resized before shown" and similar.
 */
function makeFigma({ editorType = 'figma', stored, failGet = false, failSet = false, holdGet = false, failResize = false } = {}) {
  const log = [];
  // resizeArgs: every figma.ui.resize call as made, before the stub validates it (resize: the applied ones).
  const calls = { showUI: [], resize: [], resizeArgs: [], show: 0, posted: [], set: [], get: 0, warn: [], log: [], notify: [] };
  const listeners = [];
  const store = new Map();
  if (stored !== undefined) store.set('kit:window', stored);
  let releaseGet;
  const gate = new Promise((resolve) => { releaseGet = resolve; });

  const figma = {
    editorType,
    showUI(html, options) {
      log.push('showUI');
      calls.showUI.push({ html, options: plain(options) });
    },
    ui: {
      onmessage: undefined,
      on(type, fn) { assert.equal(type, 'message'); listeners.push({ fn, once: false }); },
      once(type, fn) { assert.equal(type, 'message'); listeners.push({ fn, once: true }); },
      off(type, fn) {
        const index = listeners.findIndex((entry) => entry.fn === fn);
        if (index >= 0) listeners.splice(index, 1);
      },
      postMessage(msg) {
        log.push('post:' + (msg && msg.type));
        calls.posted.push(plain(msg));
      },
      resize(width, height) {
        calls.resizeArgs.push([width, height]);
        // Figma throws on non-finite and on fractional sizes (measured in Figma 126.9: "Expected
        // integer, received float"); so does the stub, so a leak fails loudly.
        if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('resize: not a finite number');
        if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('resize: Expected integer, received float');
        if (failResize) throw new Error('resize not supported here');
        log.push(`resize:${width}x${height}`);
        calls.resize.push([width, height]);
      },
      show() { log.push('show'); calls.show += 1; },
      hide() { log.push('hide'); },
    },
    clientStorage: {
      async getAsync(key) {
        log.push('get');
        calls.get += 1;
        if (holdGet) await gate;
        if (failGet) throw new Error('storage unavailable');
        return store.get(key);
      },
      async setAsync(key, value) {
        log.push('set');
        calls.set.push({ key, value: plain(value) });
        if (failSet) throw new Error('quota exceeded');
        store.set(key, plain(value));
      },
      async deleteAsync(key) { store.delete(key); },
      async keysAsync() { return [...store.keys()]; },
    },
  };

  // Delivers a UI -> main message to every listener, the way figma.ui.on handlers receive it.
  const emit = (msg) => {
    for (const entry of [...listeners]) {
      if (entry.once) listeners.splice(listeners.indexOf(entry), 1);
      entry.fn(msg, { origin: 'null' });
    }
  };
  return { figma, calls, log, listeners, store, emit, releaseGet };
}

function boot(stubOptions = {}, source = KIT_BLOCK) {
  const env = makeFigma(stubOptions);
  const clock = makeClock();
  const context = vm.createContext({
    figma: env.figma,
    __html__: '<p>ui</p>',
    console: {
      warn: (...args) => env.calls.warn.push(args.join(' ')),
      log: (...args) => env.calls.log.push(args.join(' ')),
      error: (...args) => env.calls.log.push(args.join(' ')),
      info: (...args) => env.calls.log.push(args.join(' ')),
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  vm.runInContext(source, context, { filename: 'code.js' });
  const install = (options) => context.installKitWindow(options);
  // Sends kit:ready and returns the kit:init reply (after storage settles).
  const handshake = async (protocol = 1) => {
    env.emit({ type: 'kit:ready', protocol });
    await flush();
    return env.calls.posted.filter((msg) => msg.type === 'kit:init').at(-1);
  };
  return { ...env, clock, context, install, handshake };
}

const resize = (width, height, extra = {}) => ({ type: 'kit:resize', width, height, ...extra });
const record = (width, height, editorType = 'figma') => ({ v: 1, editorType, width, height });

// ---- source shape ----

test('code.js is a plain script Figma can load', () => {
  assert.ok(!/^\s*export\b/m.test(CODE_JS), 'no export statement (tsc adds "export {}" if code.ts has one)');
  for (const [name, src] of [['code.ts', CODE_TS], ['code.js', CODE_JS]]) {
    assert.ok(!src.includes('import('), `${name} never contains the text import( (SES rejects it)`);
    assert.ok(!src.includes('<!--') && !src.includes('-->'), `${name} has no HTML comment markers`);
    assert.ok(!/^\s*import\b/m.test(src), `${name} has no import statement`);
    assert.ok(!/\.onmessage\s*=/.test(src), `${name} never assigns figma.ui.onmessage`);
  }
  assert.ok(CODE_JS.includes('// ---- Your plugin starts here ----'));
});

test('the kit block only declares kit-prefixed names and stays quiet', () => {
  const block = kitBlock(CODE_JS);
  const names = [...block.matchAll(/^(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.ok(names.includes('KIT_PROTOCOL') && names.includes('installKitWindow') && names.includes('kitIsSizeRecord'));
  for (const name of names) assert.match(name, /^(KIT_|kit|installKitWindow$)/, `top-level name ${name} is kit-prefixed`);
  assert.ok(!/console\.log|figma\.notify|figma\.on\(\s*['"]close/.test(block), 'no console.log, notify or close hook');
  assert.match(block, /const KIT_PROTOCOL = 1;/);
});

test('the kit:window header, code.js and kit.d.ts name the same kit version and protocol', () => {
  const header = /^\/\/ .*kit v(\d+\.\d+\.\d+) · protocol (\d+)/;
  const ts = CODE_TS.split('\n')[0].match(header);
  const js = kitBlock(CODE_JS).split('\n')[0].match(header);
  const dts = readFileSync(new URL('../kit.d.ts', import.meta.url), 'utf8').split('\n')[0].match(header);
  assert.ok(ts && js && dts, 'each file starts with a "kit vX.Y.Z · protocol N" header line');
  assert.deepEqual(js.slice(1), ts.slice(1), 'code.js is built from this code.ts (npm run build)');
  assert.deepEqual(dts.slice(1), ts.slice(1), 'kit.d.ts comes from the same release');
  assert.equal(ts[2], '1', 'protocol 1: kit:fit was added without a protocol bump');
});

// ---- showUI ----

test('showUI: themeColors on, hidden until fitted, default size, html and title', () => {
  const kit = boot();
  const win = kit.install();
  assert.equal(kit.calls.showUI.length, 1, 'showUI is called synchronously by install');
  const [{ html, options }] = kit.calls.showUI;
  assert.equal(html, '<p>ui</p>', 'defaults to __html__');
  assert.deepEqual(options, { width: 320, height: 360, themeColors: true, visible: false });
  assert.ok(!('title' in options), 'no title key unless one is given');
  assert.deepEqual(plain(win), { mode: 'fit-content', chrome: true, editorType: 'figma' });
  assert.ok(Object.isFrozen(win));
  assert.deepEqual(kit.log.slice(0, 2), ['showUI', 'get'], 'storage is read right after showUI');
});

test('showUI: custom html, title, clamped size; every mode opens hidden, fixed too', () => {
  const kit = boot();
  kit.install({ html: '<b>x</b>', title: 'Hello', mode: 'resizable', size: { width: 10, height: 5000 } });
  assert.deepEqual(kit.calls.showUI[0], {
    html: '<b>x</b>',
    options: { width: 240, height: 900, themeColors: true, visible: false, title: 'Hello' },
  });

  // Figma showed a window before its page had painted: blank for up to ~1 s (docs/window-chrome.md).
  const fixed = boot();
  fixed.install({ mode: 'fixed', size: { width: 400 } });
  assert.deepEqual(fixed.calls.showUI[0].options, { width: 400, height: 360, themeColors: true, visible: false });
  fixed.clock.tick(1000);
  assert.equal(fixed.calls.show, 0, 'not shown before its UI has loaded');
});

test('unknown mode and junk options fall back to the defaults, with one warning naming them', () => {
  const kit = boot();
  const win = kit.install({ mode: 'stretchy', size: { width: NaN, height: '200' }, persist: 'no' });
  assert.equal(win.mode, 'fit-content');
  assert.deepEqual(kit.calls.showUI[0].options, { width: 320, height: 360, themeColors: true, visible: false });
  assert.equal(kit.calls.warn.length, 1, 'one warning for all of them');
  assert.match(kit.calls.warn[0], /^kit: installKitWindow ignored mode 'stretchy', size\.width, size\.height, persist /);
  for (const options of [null, 'resizable', () => {}]) {
    const other = boot();
    assert.doesNotThrow(() => other.install(options));
    assert.equal(other.calls.warn.length, options === null ? 0 : 1, String(options));
  }
});

test('a misspelled mode and a non-string html warn instead of passing silently', () => {
  const typo = boot();
  assert.equal(typo.install({ mode: 'resizeable' }).mode, 'fit-content');
  assert.equal(typo.calls.warn.length, 1);
  assert.match(typo.calls.warn[0], /mode 'resizeable'/);

  for (const html of [123, {}, ['<p>x</p>']]) {
    const kit = boot();
    kit.install({ html });
    assert.equal(kit.calls.showUI[0].html, '<p>ui</p>', `html ${JSON.stringify(html)} falls back to __html__`);
    assert.equal(kit.calls.warn.length, 1);
    assert.match(kit.calls.warn[0], /ignored html /);
  }

  const unknown = boot();
  unknown.install({ width: 400, bounds: { maxWidht: 600, minWidth: '300' }, title: 7 });
  assert.equal(unknown.calls.warn.length, 1);
  assert.match(unknown.calls.warn[0], /ignored width, bounds\.maxWidht, bounds\.minWidth, title /);
});

test('valid, empty and null-valued options warn about nothing', () => {
  const valid = [
    undefined, {},
    { html: '<b>x</b>', title: 'T', mode: 'fixed', size: { width: 300, height: 200 }, bounds: { minWidth: 100, maxWidth: 500, minHeight: 50, maxHeight: 400 }, persist: false },
    { mode: 'resizable', size: { width: 300 }, bounds: {}, persist: true },
    { html: null, title: undefined, mode: undefined, size: null, bounds: { maxWidth: null }, persist: undefined },
    // Out-of-range numbers are clamped and repaired, not rejected.
    { size: { width: 5, height: 99999 }, bounds: { minWidth: 10, maxWidth: 5 } },
  ];
  for (const options of valid) {
    const kit = boot();
    kit.install(options);
    assert.deepEqual(kit.calls.warn, [], JSON.stringify(options));
  }
});

// ---- bounds ----

test('bounds merge over the surface defaults and are repaired', () => {
  const cases = [
    [{ maxWidth: 600 }, { ...DEFAULT_BOUNDS, maxWidth: 600 }],
    [{ minWidth: 10, maxWidth: NaN, minHeight: -5, maxHeight: '50' }, { minWidth: 70, maxWidth: 960, minHeight: 0, maxHeight: 900 }],
    [{ minWidth: 500, maxWidth: 400, minHeight: 300.4, maxHeight: 100 }, { minWidth: 500, maxWidth: 500, minHeight: 300, maxHeight: 300 }],
    [{ maxHeight: Infinity, minWidth: null }, DEFAULT_BOUNDS],
    ['wide', DEFAULT_BOUNDS],
  ];
  return Promise.all(cases.map(async ([bounds, expected]) => {
    const kit = boot();
    kit.install({ bounds });
    const init = await kit.handshake();
    assert.deepEqual(init.bounds, expected, JSON.stringify(bounds));
  }));
});

test('surfaces: chrome on in Design, FigJam and Slides; off in Dev Mode, Buzz and unknown editors', async () => {
  const surfaces = [
    ['figma', true, 240], ['figjam', true, 240], ['slides', true, 240], ['dev', false, 300], ['buzz', false, 240],
    // An editor newer than the kit: handle off and default bounds until a kit release adds it.
    ['sites', false, 240], ['FIGMA', false, 240], ['', false, 240],
  ];
  for (const [editorType, chrome, minWidth] of surfaces) {
    const kit = boot({ editorType });
    const win = kit.install();
    assert.equal(win.chrome, chrome, editorType);
    const init = await kit.handshake();
    assert.equal(init.chrome, chrome, editorType);
    assert.equal(init.editorType, editorType);
    assert.deepEqual(init.bounds, { ...DEFAULT_BOUNDS, minWidth }, editorType);
  }
});

test('Dev Mode: minimum width 300 applies to the default size and to resizes', async () => {
  const kit = boot({ editorType: 'dev' });
  kit.install({ size: { width: 200, height: 200 } });
  assert.deepEqual(kit.calls.showUI[0].options, { width: 300, height: 200, themeColors: true, visible: false });
  const init = await kit.handshake();
  assert.deepEqual(init.defaultSize, { width: 300, height: 200 });
  kit.emit(resize(100, 400));
  assert.deepEqual(kit.calls.resize.at(-1), [300, 400]);
});

// ---- handshake ----

test('kit:init is sent only after the storage read resolves, with the full state', async () => {
  const kit = boot({ holdGet: true });
  kit.install({ mode: 'resizable' });
  kit.emit({ type: 'kit:ready', protocol: 1 });
  await flush();
  assert.equal(kit.calls.posted.length, 0, 'no kit:init while storage is pending');
  kit.releaseGet();
  await flush();
  assert.equal(kit.calls.posted.length, 1);
  assert.deepEqual(kit.calls.posted[0], {
    type: 'kit:init',
    protocol: 1,
    mode: 'resizable',
    chrome: true,
    editorType: 'figma',
    bounds: DEFAULT_BOUNDS,
    size: { width: 320, height: 360 },
    defaultSize: { width: 320, height: 360 },
    restored: false,
  });
});

test('every kit:ready gets a reply (a reloaded UI handshakes again)', async () => {
  const kit = boot();
  kit.install();
  await kit.handshake();
  await kit.handshake();
  assert.equal(kit.calls.posted.filter((m) => m.type === 'kit:init').length, 2);
});

test('protocol mismatch warns once and still replies', async () => {
  const kit = boot();
  kit.install();
  const init = await kit.handshake(2);
  await kit.handshake(2);
  kit.emit({ type: 'kit:ready' });
  await flush();
  assert.equal(init.protocol, 1, 'the reply carries main\'s own protocol');
  assert.equal(kit.calls.posted.filter((m) => m.type === 'kit:init').length, 3);
  assert.equal(kit.calls.warn.length, 1);
  assert.match(kit.calls.warn[0], /protocol 2/);

  const ok = boot();
  ok.install();
  await ok.handshake(1);
  assert.equal(ok.calls.warn.length, 0);

  // A string protocol is quoted, so the warning never reads "protocol 1 but code.ts speaks 1".
  const text = boot();
  text.install();
  await text.handshake('1');
  assert.equal(text.calls.warn.length, 1);
  assert.match(text.calls.warn[0], /protocol "1" but code\.ts speaks 1\./);
});

// ---- restore ----

test('restore: resizable applies width and height before the window is shown', async () => {
  const kit = boot({ stored: record(500, 600) });
  kit.install({ mode: 'resizable' });
  const init = await kit.handshake();
  assert.deepEqual(kit.calls.resize, [[500, 600]]);
  assert.equal(kit.calls.show, 0, 'restoring does not show the window by itself');
  assert.deepEqual(init.size, { width: 500, height: 600 });
  assert.deepEqual(init.defaultSize, { width: 320, height: 360 });
  assert.equal(init.restored, true);
});

test('restore: fit-content applies the width only', async () => {
  const kit = boot({ stored: record(500, 600) });
  kit.install();
  const init = await kit.handshake();
  assert.deepEqual(kit.calls.resize, [[500, 360]]);
  assert.deepEqual(init.size, { width: 500, height: 360 });
  assert.equal(init.restored, true);
});

test('restore: a saved size is clamped to the current bounds', async () => {
  const kit = boot({ stored: record(5000, 5000) });
  kit.install({ mode: 'resizable', bounds: { maxWidth: 800 } });
  const init = await kit.handshake();
  assert.deepEqual(init.size, { width: 800, height: 900 });
});

test('restore: skipped in fixed mode, with persist:false, and for another editor', async () => {
  for (const [label, stub, options] of [
    ['fixed', {}, { mode: 'fixed' }],
    ['persist false', {}, { mode: 'resizable', persist: false }],
    ['other editor', { editorType: 'figjam' }, { mode: 'resizable' }],
  ]) {
    const kit = boot({ stored: record(500, 600), ...stub });
    kit.install(options);
    const init = await kit.handshake();
    assert.equal(init.restored, false, label);
    assert.deepEqual(kit.calls.resize, [], label);
    if (label !== 'other editor') assert.equal(kit.calls.get, 0, `${label}: storage is not even read`);
  }
});

test('restore: invalid records are ignored without throwing', async () => {
  const invalid = [
    null, 'big', 42, [], {},
    { v: 2, editorType: 'figma', width: 500, height: 600 },
    { v: '1', editorType: 'figma', width: 500, height: 600 },
    { v: 1, width: 500, height: 600 },
    { v: 1, editorType: 'figma', width: NaN, height: 600 },
    { v: 1, editorType: 'figma', width: 500, height: Infinity },
    { v: 1, editorType: 'figma', width: '500', height: 600 },
    { v: 1, editorType: 'figma', width: -500, height: 600 },
    { v: 1, editorType: 'figma', width: 0, height: 600 },
    { v: 1, editorType: 'figma', width: 500 },
    { width: 500, height: 600 }, // the pre-0.2 record shape
  ];
  for (const stored of invalid) {
    const kit = boot({ stored });
    kit.install({ mode: 'resizable' });
    const init = await kit.handshake();
    assert.equal(init.restored, false, JSON.stringify(stored));
    assert.deepEqual(kit.calls.resize, [], JSON.stringify(stored));
  }
});

test('kitIsSizeRecord accepts exactly the v1 shape', () => {
  const { context } = boot();
  assert.equal(context.kitIsSizeRecord(record(1, 1)), true);
  assert.equal(context.kitIsSizeRecord({ ...record(320.5, 200), extra: true }), true);
  for (const bad of [undefined, null, 1, 'x', { ...record(1, 1), v: 0 }, { ...record(1, 1), editorType: 3 }, record(1, -1), record(1, NaN)]) {
    assert.equal(context.kitIsSizeRecord(bad), false, JSON.stringify(bad));
  }
});

test('a storage read that never settles still sends kit:init after 300 ms; a late answer is ignored', async () => {
  const kit = boot({ stored: record(500, 600), holdGet: true });
  kit.install({ mode: 'resizable' });
  kit.emit({ type: 'kit:ready', protocol: 1 });
  await flush();
  kit.clock.tick(299);
  await flush();
  assert.equal(kit.calls.posted.length, 0, 'still waiting at 299 ms');
  kit.clock.tick(1);
  await flush();
  assert.equal(kit.calls.posted.length, 1);
  assert.equal(kit.calls.posted[0].restored, false);
  assert.deepEqual(kit.calls.posted[0].size, { width: 320, height: 360 });
  assert.deepEqual(kit.log.slice(0, 3), ['showUI', 'get', 'post:kit:init'], 'kit:init goes out before the window is shown');

  kit.releaseGet();
  await flush();
  assert.deepEqual(kit.calls.resize, [], 'the late answer does not move the window');
  kit.emit(resize(500, 600, { user: true, final: true }));
  assert.equal(kit.calls.set.length, 0, 'it still counts as stored, so the same size is not written again');
  assert.deepEqual(await kit.handshake().then((init) => init.restored), false, 'a later handshake does not claim a restore');
});

test('a figma.ui.resize that throws during restore still sends kit:init, with no unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String(reason));
  process.on('unhandledRejection', onUnhandled);
  try {
    const kit = boot({ stored: record(500, 600), failResize: true });
    kit.install({ mode: 'resizable' });
    const init = await kit.handshake();
    assert.equal(init.restored, false);
    assert.deepEqual(init.size, { width: 320, height: 360 }, 'the size Figma refused is not reported');
    assert.doesNotThrow(() => kit.emit(resize(400, 300, { user: true, final: true })));
    assert.equal(kit.calls.show, 1, 'the window is still shown');
    assert.equal(kit.calls.set.length, 0, 'a size that was not applied is not saved');
    assert.equal(kit.calls.warn.length, 1);
    assert.match(kit.calls.warn[0], /figma\.ui\.resize failed: .*resize not supported here/);
    await flush();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test('closing the plugin while storage is read leaves no unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String(reason));
  process.on('unhandledRejection', onUnhandled);
  try {
    const kit = boot({ stored: record(500, 600), holdGet: true });
    kit.install({ mode: 'resizable' });
    kit.emit({ type: 'kit:ready', protocol: 1 });
    await flush();
    // What figma.closePlugin() does to the window calls, as the read is still in flight.
    kit.figma.ui.resize = () => { throw new Error('resize: plugin is closed'); };
    kit.figma.ui.postMessage = () => { throw new Error('postMessage: plugin is closed'); };
    kit.releaseGet();
    await flush();
    await flush();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test('a storage read failure still sends kit:init and warns once', async () => {
  const kit = boot({ stored: record(500, 600), failGet: true });
  kit.install({ mode: 'resizable' });
  const init = await kit.handshake();
  assert.equal(init.restored, false);
  assert.deepEqual(init.size, { width: 320, height: 360 });
  assert.equal(kit.calls.warn.length, 1);
});

test('a resize by the person before storage resolves wins over the saved size', async () => {
  const kit = boot({ stored: record(500, 600), holdGet: true });
  kit.install({ mode: 'resizable' });
  kit.emit(resize(400, 300, { user: true, final: true }));
  kit.releaseGet();
  const init = await kit.handshake();
  assert.equal(init.restored, false);
  assert.deepEqual(init.size, { width: 400, height: 300 });
  assert.deepEqual(kit.calls.resize, [[400, 300]]);
});

// ---- kit:resize ----

test('malformed kit:resize never reaches figma.ui.resize and never throws', async () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  const malformed = [
    null, undefined, 0, 'kit:resize', [], () => {},
    { type: 'kit:resize' },
    resize(NaN, 300), resize(300, NaN),
    resize(Infinity, 300), resize(300, -Infinity), resize(1e400, 300),
    resize('400', '300'), resize(400, '300'),
    resize(400), resize(undefined, 300),
    resize(-1, 300), resize(300, -0.5),
    resize(null, null), resize({}, []), resize(true, false),
    resize(10n, 300),
  ];
  for (const msg of malformed) {
    assert.doesNotThrow(() => kit.emit(msg), String(msg && JSON.stringify(msg, (k, v) => (typeof v === 'bigint' ? 'bigint' : v))));
  }
  for (const msg of malformed) {
    if (msg && typeof msg === 'object') assert.doesNotThrow(() => kit.emit({ ...msg, user: true, final: true }));
  }
  await flush();
  assert.deepEqual(kit.calls.resize, []);
  assert.equal(kit.calls.show, 0, 'a rejected message does not count as the first fit');
  assert.equal(kit.calls.set.length, 0);
});

test('kit:resize is clamped and rounded', () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  kit.emit(resize(10, 10000));
  kit.emit(resize(5000, 0));
  kit.emit(resize(333.6, 401.4));
  kit.emit(resize(400.5, 300.5));
  assert.deepEqual(kit.calls.resize, [[240, 900], [960, 120], [334, 401], [401, 301]]);
});

test('figma.ui.resize and showUI only ever get whole pixels, never under 70 x 0', async () => {
  // Fractions on every way in: options.size and options.bounds (defaultSize), a stored record (an
  // older or hand-written one; restore), and kit:resize from the UI. Figma throws on a fractional
  // size ("Expected integer, received float"), and so does the stub.
  const cases = [
    [{}, { mode: 'resizable', size: { width: 333.3, height: 222.7 }, bounds: { minWidth: 250.6, maxWidth: 700.4, minHeight: 100.5, maxHeight: 800.2 } }, record(500.4, 600.6)],
    [{}, { size: { width: 320.5, height: 360.5 } }, record(480.5, 99.5)],
    [{ editorType: 'dev' }, { size: { width: 299.5 } }, record(300.5, 400.5, 'dev')],
    [{ editorType: 'figjam' }, { mode: 'resizable', bounds: { minWidth: 0.4, minHeight: -0.4, maxWidth: 900.5, maxHeight: 1e6 + 0.5 } }, undefined],
    [{}, { mode: 'fixed', size: { width: 300.5, height: 200.5 } }, record(400, 400)],
  ];
  const fractions = [[333.5, 401.49], [0.4, 0.6], [10.5, 10000.5], [5000.25, -0], [289.999, 120.001], [70.5, 0.5]];
  for (const [stub, options, stored] of cases) {
    const label = JSON.stringify(options);
    const kit = boot({ ...stub, stored });
    kit.install(options);
    const init = await kit.handshake();
    for (const [w, h] of fractions) {
      kit.emit(resize(w, h));
      kit.emit(resize(w, h, { user: true }));
      kit.emit(resize(w + 1, h + 1, { user: true, final: true }));
    }
    kit.clock.tick(1000);
    await flush();
    const sizes = [
      ...kit.calls.showUI.map((c) => [c.options.width, c.options.height]),
      ...kit.calls.resizeArgs,
      [init.size.width, init.size.height], [init.defaultSize.width, init.defaultSize.height],
      [init.bounds.minWidth, init.bounds.minHeight], [init.bounds.maxWidth, init.bounds.maxHeight],
      ...kit.calls.set.map((c) => [c.value.width, c.value.height]),
    ];
    for (const [w, h] of sizes) {
      assert.ok(Number.isInteger(w) && Number.isInteger(h), `${label}: ${w} x ${h} is whole pixels`);
      assert.ok(w >= 70 && h >= 0, `${label}: ${w} x ${h} is at least 70 x 0`);
    }
    if (options.mode !== 'fixed') assert.ok(kit.calls.resizeArgs.length > fractions.length, `${label}: the resizes were made`);
    assert.deepEqual(kit.calls.warn, [], `${label}: Figma never refused a size`);
  }

  // Figma's floor: a narrower width becomes 70 (measured: 10 x 10 gave 70 x 10, 70 x 0 stayed).
  const floor = boot();
  floor.install({ mode: 'resizable', bounds: { minWidth: 0, minHeight: 0 } });
  floor.emit(resize(0, 0));
  assert.deepEqual(floor.calls.resize, [[70, 0]]);
});

// ---- visibility: every mode opens hidden until its UI is ready ----
// Figma showed a window before its page had painted (blank for up to ~1 s on a heavier page), so
// the 800 ms delay counts from kit:ready, not from installKitWindow() (docs/window-chrome.md).

test('visibility: the first kit:resize shows the window, after resizing it, before or after kit:ready', async () => {
  for (const ready of [false, true]) {
    const kit = boot();
    kit.install();
    if (ready) await kit.handshake();
    kit.clock.tick(400);
    assert.equal(kit.calls.show, 0, `kit:ready ${ready}`);
    kit.emit(resize(320, 200));
    assert.deepEqual(kit.log.slice(-2), ['resize:320x200', 'show']);
    kit.emit(resize(320, 250));
    kit.clock.tick(5000);
    assert.equal(kit.calls.show, 1, 'shown once; its timer was cancelled');
    assert.equal(kit.clock.pending, 0);
  }
});

test('visibility: a UI that loads (kit:ready) but asks for no size is shown 800 ms after kit:ready', async () => {
  const kit = boot();
  kit.install();
  kit.clock.tick(1200); // a slow page: kit:ready arrives 1.2 s after showUI
  assert.equal(kit.calls.show, 0, 'still loading, so still hidden');
  await kit.handshake();
  kit.clock.tick(799);
  assert.equal(kit.calls.show, 0);
  kit.clock.tick(1);
  assert.equal(kit.calls.show, 1);
  assert.deepEqual(kit.calls.resize, [], 'shown at the size it has');
  kit.emit(resize(320, 200));
  kit.clock.tick(5000);
  assert.equal(kit.calls.show, 1, 'a later fit resizes but never shows again');
  assert.equal(kit.clock.pending, 0, 'the 3 s fallback was replaced, not added to');
});

test('visibility: kit:ready replaces the 3 s fallback, so a page that loads late still gets its 800 ms', async () => {
  const kit = boot();
  kit.install();
  kit.clock.tick(2800);
  await kit.handshake();
  kit.clock.tick(799); // 3,599 ms after install, past the fallback
  assert.equal(kit.calls.show, 0);
  kit.clock.tick(1);
  assert.equal(kit.calls.show, 1);

  // A UI that handshakes again while the window is still hidden starts the 800 ms over.
  const again = boot();
  again.install();
  await again.handshake();
  again.clock.tick(700);
  await again.handshake();
  again.clock.tick(799);
  assert.equal(again.calls.show, 0);
  again.clock.tick(1);
  assert.equal(again.calls.show, 1);
  assert.equal(again.clock.pending, 0);
});

test('visibility: the show delay after kit:ready leaves a margin over the runtime\'s default font and kit:init wait', () => {
  // The runtime's first fit waits at most initTimeoutMs from sending kit:ready; main's delay counts
  // from receiving it. Equal values race, and the window can show at its starting size a moment
  // before it fits (seen in the fake host with fonts that never settle).
  const delay = Number(/\bconst KIT_SHOW_DELAY_MS = (\d+);/.exec(CODE_JS)?.[1]);
  const ui = readFileSync(new URL('../ui.html', import.meta.url), 'utf8');
  const wait = Number(/\binitTimeoutMs: (\d+),/.exec(ui)?.[1]);
  assert.ok(Number.isInteger(delay) && Number.isInteger(wait), `delay ${delay}, initTimeoutMs ${wait}`);
  assert.ok(delay - wait >= 250, `KIT_SHOW_DELAY_MS (${delay}) must stay at least 250 ms over the runtime's initTimeoutMs (${wait})`);
});

test('visibility: a page that never sends kit:ready (no kit runtime) is shown 3 s after install, in every mode', () => {
  for (const mode of ['fit-content', 'resizable', 'fixed']) {
    const kit = boot();
    kit.install({ mode });
    kit.clock.tick(2999);
    assert.equal(kit.calls.show, 0, mode);
    kit.clock.tick(1);
    assert.equal(kit.calls.show, 1, mode);
    assert.equal(kit.clock.pending, 0, mode);
  }
});

test('visibility: fixed mode is shown right after its kit:init reply, and only once', async () => {
  const kit = boot();
  kit.install({ mode: 'fixed', size: { width: 300, height: 200 } });
  assert.equal(kit.calls.show, 0);
  const init = await kit.handshake();
  assert.equal(init.mode, 'fixed');
  assert.deepEqual(kit.log, ['showUI', 'post:kit:init', 'show'], 'no storage read and no resize: the reply, then show');
  await kit.handshake();
  kit.emit(resize(320, 229)); // a runtime's fallback guess: ignored, and no second show
  kit.clock.tick(5000);
  assert.equal(kit.calls.show, 1);
  assert.deepEqual(kit.calls.resize, []);
  assert.equal(kit.clock.pending, 0);
});

test('visibility: a figma.ui.show that throws (a plugin closed before its window showed) is swallowed', () => {
  const kit = boot();
  kit.install();
  kit.figma.ui.show = () => { throw new Error('The plugin is closed'); };
  assert.doesNotThrow(() => kit.clock.tick(3000));
  assert.deepEqual(kit.calls.warn, []);
  assert.equal(kit.clock.pending, 0);
});

// ---- persistence ----

test('a final user resize is saved at once and not saved twice', async () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  kit.emit(resize(400, 300, { user: true, final: true }));
  assert.deepEqual(kit.calls.set, [{ key: 'kit:window', value: record(400, 300) }]);
  kit.emit(resize(400, 300, { user: true, final: true }));
  assert.equal(kit.calls.set.length, 1, 'same size: no write');
  kit.emit(resize(400, 310, { user: true, final: true }));
  assert.equal(kit.calls.set.length, 2);
  assert.deepEqual(kit.calls.set[1].value, record(400, 310));
});

test('a final resize equal to the restored size is not written again', async () => {
  const kit = boot({ stored: record(500, 600) });
  kit.install({ mode: 'resizable' });
  await kit.handshake();
  kit.emit(resize(500, 600, { user: true, final: true }));
  assert.equal(kit.calls.set.length, 0);
});

test('mid-drag user resizes are debounced by 400 ms', () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  kit.emit(resize(400, 300, { user: true }));
  kit.clock.tick(100);
  kit.emit(resize(410, 300, { user: true }));
  kit.clock.tick(100);
  kit.emit(resize(420, 300, { user: true }));
  kit.clock.tick(399);
  assert.equal(kit.calls.set.length, 0);
  kit.clock.tick(1);
  assert.deepEqual(kit.calls.set.map((c) => c.value), [record(420, 300)]);
});

test('a final resize cancels the pending debounced write', () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  kit.emit(resize(500, 300, { user: true }));
  kit.clock.tick(100);
  kit.emit(resize(520, 300, { user: true, final: true }));
  assert.deepEqual(kit.calls.set.map((c) => c.value), [record(520, 300)]);
  kit.clock.tick(1000);
  assert.equal(kit.calls.set.length, 1);
});

test('resizes that are not from the person are never saved', () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  kit.emit(resize(400, 300));
  kit.emit(resize(400, 300, { final: true }));
  kit.emit(resize(410, 300, { user: 'true', final: true }));
  kit.emit(resize(420, 300, { user: 1 }));
  kit.clock.tick(1000);
  assert.equal(kit.calls.set.length, 0);
  assert.equal(kit.calls.resize.length, 4, 'they still resize the window');
});

test('fit-content saves and compares the width only', () => {
  const kit = boot();
  kit.install();
  kit.emit(resize(400, 300, { user: true, final: true }));
  kit.emit(resize(400, 500, { user: true, final: true }));
  kit.emit(resize(400, 200));
  kit.emit(resize(420, 200, { user: true, final: true }));
  assert.deepEqual(kit.calls.set.map((c) => c.value), [record(400, 300), record(420, 200)]);
});

test('persist:false never writes, and resizing still works', () => {
  const kit = boot();
  kit.install({ mode: 'resizable', persist: false });
  kit.emit(resize(400, 300, { user: true, final: true }));
  kit.emit(resize(410, 300, { user: true }));
  kit.clock.tick(1000);
  assert.equal(kit.calls.set.length, 0);
  assert.deepEqual(kit.calls.resize, [[400, 300], [410, 300]]);
});

test('fixed mode ignores kit:resize, so a UI that fell back before kit:init cannot shrink it', async () => {
  const kit = boot();
  kit.install({ mode: 'fixed', size: { width: 320, height: 360 } });
  // The runtime's fallback fit (no kit:init within 500 ms, e.g. a busy main thread), then a
  // late handshake, then anything else that claims to be from the person.
  kit.emit(resize(320, 229));
  assert.equal(kit.calls.show, 0, 'an ignored kit:resize does not show a fixed window either');
  await kit.handshake();
  kit.emit(resize(400, 300, { user: true, final: true }));
  kit.emit(resize(410, 300, { user: true }));
  kit.clock.tick(1000);
  assert.deepEqual(kit.calls.resize, []);
  assert.equal(kit.calls.set.length, 0);
  assert.equal(kit.calls.show, 1, 'shown once, after kit:init');
});

test('a storage write failure is swallowed, warned once and retried on the next gesture', async () => {
  const kit = boot({ failSet: true });
  kit.install({ mode: 'resizable' });
  kit.emit(resize(400, 300, { user: true, final: true }));
  await flush();
  kit.emit(resize(400, 300, { user: true, final: true }));
  await flush();
  assert.equal(kit.calls.set.length, 2, 'a failed write is not remembered as saved');
  assert.equal(kit.calls.warn.length, 1);
});

// ---- coexistence ----

test('host messages are ignored and the kit listens with ui.on, not onmessage', async () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  assert.equal(kit.listeners.length, 1);
  assert.equal(kit.figma.ui.onmessage, undefined);
  const hostMessages = [
    { type: 'create-shapes', count: 3, width: 400, height: 300 },
    { type: 'kitty', width: 400, height: 300 },
    { type: 'KIT:resize', width: 400, height: 300 },
    { type: 5 }, { kind: 'kit:resize', width: 400, height: 300 },
    'kit:ready', 'hello', 42, null,
    { type: 'kit:init' }, { type: 'kit:fit' }, { type: 'kit:' },
  ];
  for (const msg of hostMessages) assert.doesNotThrow(() => kit.emit(msg));
  await flush();
  kit.clock.tick(1000);
  assert.deepEqual(kit.calls.posted, []);
  assert.deepEqual(kit.calls.resize, []);
  assert.equal(kit.calls.set.length, 0);
});

test('a second install replaces the first listener and its timers', async () => {
  const kit = boot();
  kit.install();
  kit.install({ mode: 'resizable' });
  assert.equal(kit.listeners.length, 1);
  assert.equal(kit.calls.showUI.length, 2);
  kit.clock.tick(2999);
  assert.equal(kit.calls.show, 0);
  kit.clock.tick(1);
  assert.equal(kit.calls.show, 1, 'only the second window\'s 3 s fallback fires');

  // The first UI's kit:ready started its 800 ms delay; the second install cancels it.
  const ready = boot();
  ready.install();
  await ready.handshake();
  ready.install({ mode: 'fixed' });
  ready.clock.tick(900);
  assert.equal(ready.calls.show, 0, 'the first window\'s 800 ms delay is gone');
  await ready.handshake();
  assert.equal(ready.calls.show, 1, 'the second window is shown after its own kit:init');
  assert.equal(ready.clock.pending, 0);
});

test('a second install drops the first one\'s storage read and kit:init reply', async () => {
  // The first read resolves after the second install: it must not resize the fixed window.
  const fixed = boot({ stored: record(500, 600) });
  fixed.install();
  fixed.install({ mode: 'fixed', size: { width: 400, height: 300 } });
  await flush();
  assert.deepEqual(fixed.calls.showUI.map((c) => c.options), [
    { width: 320, height: 360, themeColors: true, visible: false },
    { width: 400, height: 300, themeColors: true, visible: false },
  ]);
  assert.deepEqual(fixed.calls.resize, []);
  assert.deepEqual(fixed.calls.posted, []);

  // Held storage: the second install does not read, and handshakes before the first read lands.
  const held = boot({ stored: record(500, 600), holdGet: true });
  held.install({ mode: 'resizable' });
  held.install({ mode: 'resizable', persist: false, size: { width: 300, height: 200 } });
  const init = await held.handshake();
  assert.deepEqual(init.size, { width: 300, height: 200 });
  held.releaseGet();
  await flush();
  assert.deepEqual(held.calls.resize, [], 'the first read lands after the second install and is dropped');

  // The first UI's kit:ready reached the first install, whose reply waited on storage.
  const stale = boot({ stored: record(500, 600), holdGet: true });
  stale.install({ mode: 'resizable' });
  stale.emit({ type: 'kit:ready', protocol: 1 });
  await flush();
  stale.install({ mode: 'fixed', size: { width: 400, height: 300 } });
  stale.releaseGet();
  await flush();
  stale.clock.tick(900);
  await flush();
  assert.equal(stale.calls.show, 0, 'the first install\'s 800 ms show delay went with it');
  assert.equal(stale.clock.pending, 1, 'only the second install\'s 3 s fallback is left');
  stale.clock.tick(2100);
  assert.equal(stale.calls.show, 1);
  assert.deepEqual(stale.calls.posted, [], 'no stale kit:init (wrong mode, chrome on) reaches the new UI');
  assert.deepEqual(stale.calls.resize, []);
  assert.equal(stale.clock.pending, 0, 'no timer of the first install is left');
});

// ---- KitWindow.fit (kit:fit, kit 0.3.0) ----

test('fit() posts exactly { type: "kit:fit" } in fit-content and resizable, before and after the handshake', async () => {
  for (const mode of ['fit-content', 'resizable']) {
    const kit = boot();
    const win = kit.install({ mode });
    assert.deepEqual(Object.keys(win), ['mode', 'chrome', 'editorType', 'fit'], mode);
    assert.ok(Object.isFrozen(win));
    win.fit(); // before the UI has loaded: Figma queues it, and the runtime applies it on its first fit
    assert.deepEqual(kit.calls.posted, [{ type: 'kit:fit' }], mode);
    await kit.handshake();
    win.fit();
    win.fit();
    assert.deepEqual(kit.calls.posted.map((m) => m.type), ['kit:fit', 'kit:init', 'kit:fit', 'kit:fit'], mode);
    await flush();
    kit.clock.tick(1000);
    // The UI measures and answers with kit:resize; main never resizes or saves on its own.
    assert.deepEqual(kit.calls.resize, [], mode);
    assert.equal(kit.calls.set.length, 0, mode);
    assert.deepEqual(kit.calls.warn, [], mode);
  }
});

test('fit() does nothing in fixed mode, or once a later install has replaced the window', () => {
  const fixed = boot();
  const win = fixed.install({ mode: 'fixed' });
  win.fit();
  assert.deepEqual(fixed.calls.posted, [], 'a fixed window never fits');

  const kit = boot();
  const first = kit.install();
  const second = kit.install({ mode: 'resizable' });
  first.fit();
  assert.deepEqual(kit.calls.posted, [], 'a replaced window cannot reach the new UI');
  second.fit();
  assert.deepEqual(kit.calls.posted, [{ type: 'kit:fit' }]);
});

test('fit() on a plugin that is closing does not throw or warn', () => {
  const kit = boot();
  const win = kit.install({ mode: 'resizable' });
  kit.figma.ui.postMessage = () => { throw new Error('The plugin is closed'); };
  assert.doesNotThrow(() => win.fit());
  assert.deepEqual(kit.calls.warn, []);
});

test('a kit:fit sent from the UI side is not main\'s business: ignored like any unknown kit:* type', async () => {
  const kit = boot();
  kit.install({ mode: 'resizable' });
  kit.emit({ type: 'kit:fit' });
  await flush();
  kit.clock.tick(1000);
  assert.deepEqual(kit.calls.posted, []);
  assert.deepEqual(kit.calls.resize, []);
});

// ---- the whole file, host demo included ----
// These run the starter's "Create shapes" demo. Once a plugin replaces it (no 'create-shapes'
// handler left in code.js), they skip, and the kit block tests above still cover the kit.

const HAS_DEMO = CODE_JS.includes("'create-shapes'");
const DEMO = { skip: HAS_DEMO ? false : "the starter's Create-shapes demo is not in code.js (replaced by a plugin)" };

function demoFigma(kit, { failCreate = false } = {}) {
  const created = [];
  const scrolled = [];
  const handlers = {};
  const make = (type) => () => {
    if (failCreate) throw new Error('Cannot create nodes in Dev Mode');
    const node = { type, x: 0, y: 0, fills: [] };
    created.push(node);
    return node;
  };
  Object.assign(kit.figma, {
    currentPage: { selection: [] },
    viewport: { center: { x: 10.4, y: 20.6 }, scrollAndZoomIntoView: (nodes) => scrolled.push(nodes.length) },
    createRectangle: make('RECTANGLE'),
    createEllipse: make('ELLIPSE'),
    on: (type, fn) => { handlers[type] = fn; },
    notify: (message, options) => kit.calls.notify.push({ message, options: plain(options) }),
    closePlugin: () => { kit.calls.closed = (kit.calls.closed ?? 0) + 1; },
  });
  return { created, scrolled, handlers };
}

function bootWholeFile(demoOptions) {
  // Build the stub first, then run all of code.js in it.
  const env = makeFigma();
  const clock = makeClock();
  const kit = { ...env, clock };
  const demo = demoFigma(kit, demoOptions);
  const context = vm.createContext({
    figma: env.figma,
    __html__: '<p>ui</p>',
    console: { warn: (...a) => env.calls.warn.push(a.join(' ')), log: (...a) => env.calls.log.push(a.join(' ')) },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  vm.runInContext(CODE_JS, context, { filename: 'code.js' });
  return { ...kit, ...demo, context };
}

test('the whole code.js (kit + host demo) loads against the stub', DEMO, async () => {
  const app = bootWholeFile();
  assert.equal(app.calls.showUI.length, 1);
  assert.equal(app.listeners.length, 2, 'the kit listener and the host listener coexist');
  assert.equal(typeof app.handlers.selectionchange, 'function');
  assert.deepEqual(app.calls.posted, [{ type: 'selection', count: 0 }], 'posted right away; Figma queues it');

  app.emit({ type: 'kit:ready', protocol: 1 });
  await flush();
  assert.equal(app.calls.posted.at(-1).type, 'kit:init', 'the host listener ignores kit messages');
  assert.equal(app.calls.posted.at(-1).mode, 'fit-content');

  app.emit({ type: 'create-shapes', count: 3, shape: 'ellipse' });
  assert.equal(app.created.length, 3);
  assert.ok(app.created.every((node) => node.type === 'ELLIPSE'));
  assert.deepEqual(app.created.map((node) => [node.x, node.y]), [[10, 21], [160, 21], [310, 21]]);
  assert.equal(app.figma.currentPage.selection.length, 3);
  assert.deepEqual(app.scrolled, [3]);
  assert.deepEqual(app.calls.posted.at(-1), { type: 'created', count: 3 });
  assert.deepEqual(app.calls.resize, [], 'the kit ignores host messages');

  app.handlers.selectionchange();
  assert.deepEqual(app.calls.posted.at(-1), { type: 'selection', count: 3 });
  assert.equal(app.calls.log.length, 0);
});

test('host demo: count is clamped, junk is ignored, a failed create still answers', DEMO, () => {
  const app = bootWholeFile();
  app.emit({ type: 'create-shapes', count: 1000, shape: 'triangle' });
  assert.equal(app.created.length, 50, 'clamped to the UI count field\'s 1-50 range');
  assert.ok(app.created.every((node) => node.type === 'RECTANGLE'));
  const before = app.calls.posted.length;
  app.emit({ type: 'create-shapes', count: 'many' });
  app.emit({ type: 'create-shapes' });
  app.emit(null);
  assert.equal(app.calls.posted.length, before);

  const readOnly = bootWholeFile({ failCreate: true });
  assert.doesNotThrow(() => readOnly.emit({ type: 'create-shapes', count: 2, shape: 'rectangle' }));
  assert.deepEqual(readOnly.calls.posted.at(-1), { type: 'created', count: 0 });
  assert.equal(readOnly.calls.notify.length, 1);
  assert.equal(readOnly.calls.notify[0].options.error, true);
});

test('host demo: the UI\'s Close button closes the plugin, nothing else does', DEMO, () => {
  const app = bootWholeFile();
  for (const msg of [{ type: 'kit:close' }, { type: 'Close' }, 'close', null]) app.emit(msg);
  assert.equal(app.calls.closed, undefined);
  app.emit({ type: 'close' });
  assert.equal(app.calls.closed, 1);
  assert.equal(app.created.length, 0);
});
