// Golden tests for examples/content-fill (the content-fill archetype, PLAN.md §5 item 1).
// They run the example's COMPILED code.js, whole, in a node:vm context against a figma stub with
// a small scene: text layers made of styled character ranges, frames and groups with
// findAllWithCriteria, a FigJam sticky, fonts that load, fonts that are missing and fonts that
// fail to load. The stub enforces Figma's text rules: editing characters needs every font of the
// affected characters loaded first, and loadFontAsync takes a FontName, never figma.mixed.
// Run: node_modules/.bin/tsc -p examples/content-fill && node --test examples/content-fill/example.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DIR = new URL('./', import.meta.url);
const CODE_JS = readFileSync(new URL('code.js', DIR), 'utf8');
const UI_HTML = readFileSync(new URL('ui.html', DIR), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'));

// vm objects have another realm's prototypes, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
// Settles pending promises and the stub's font loads (each one resolves on a later macrotask).
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve)); };

const INTER = { family: 'Inter', style: 'Regular' };
const INTER_BOLD = { family: 'Inter', style: 'Bold' };
const SERIF = { family: 'Source Serif', style: 'Italic' };
const BROKEN = { family: 'Broken Sans', style: 'Regular' }; // installed, but loadFontAsync rejects
const GONE = { family: 'Gone Grotesk', style: 'Regular' }; // missing from the machine: hasMissingFont
const key = (font) => `${font.family}/${font.style}`;

// ---- The figma stub ----------------------------------------------------------------------------

function makeFigma({ stored } = {}) {
  const MIXED = Object.freeze({ mixed: true });
  const loaded = new Set();
  const loads = [];
  const calls = { showUI: [], posted: [], set: [], undo: 0, closed: 0, warn: [] };
  const handlers = [];
  const events = {};
  const store = new Map();
  if (stored !== undefined) store.set('content-fill:settings', stored);
  let nextId = 1;
  let selection = [];

  const needLoaded = (fonts) => {
    for (const font of fonts) if (!loaded.has(key(font))) throw new Error(`stub: font ${key(font)} is not loaded`);
  };
  const distinct = (fonts) => {
    const seen = new Map();
    for (const font of fonts) if (!seen.has(key(font))) seen.set(key(font), font);
    return [...seen.values()];
  };

  /**
   * A text model: one { ch, font } per UTF-16 unit, as Figma stores range styles. `emptyFont` is
   * the font of an empty layer. Setting `characters` resets every range style ("Setting this
   * property will reset styles applied to character ranges"); which style survives is not
   * documented, so the stub keeps the LAST range's, and a plugin that wants a predictable result
   * has to say which style it keeps.
   */
  function textModel(ranges, { emptyFont = INTER, missing = false, readOnly = false } = {}) {
    let chars = [];
    for (const [text, font] of ranges) for (const ch of text.split('')) chars.push({ ch, font });
    const guard = () => { if (readOnly) throw new Error('stub: this layer is read-only'); };
    return {
      hasMissingFont: missing,
      get characters() { return chars.map((c) => c.ch).join(''); },
      set characters(value) {
        guard();
        needLoaded(chars.map((c) => c.font));
        const font = chars.length ? chars[chars.length - 1].font : emptyFont;
        needLoaded([font]);
        chars = String(value).split('').map((ch) => ({ ch, font }));
      },
      get fontName() {
        const fonts = distinct(chars.map((c) => c.font));
        if (fonts.length === 0) return emptyFont;
        return fonts.length === 1 ? fonts[0] : MIXED;
      },
      getRangeAllFontNames(start, end) {
        if (!(start >= 0 && end <= chars.length && start < end)) throw new Error('stub: bad range');
        return distinct(chars.slice(start, end).map((c) => c.font));
      },
      insertCharacters(start, text, useStyle = 'BEFORE') {
        guard();
        if (!(start >= 0 && start <= chars.length)) throw new Error('stub: bad insert position');
        let from;
        if (chars.length === 0) from = emptyFont;
        else if (useStyle === 'BEFORE') from = chars[start > 0 ? start - 1 : 0].font;
        else from = chars[start < chars.length ? start : chars.length - 1].font;
        needLoaded([from]);
        chars.splice(start, 0, ...String(text).split('').map((ch) => ({ ch, font: from })));
      },
      deleteCharacters(start, end) {
        guard();
        if (!(start >= 0 && end <= chars.length && start <= end)) throw new Error('stub: bad delete range');
        needLoaded(chars.slice(start, end).map((c) => c.font));
        chars.splice(start, end - start);
      },
      /** Test helper: the styled ranges, e.g. [['Olivia Martinez', 'Inter/Bold']]. */
      ranges() {
        const out = [];
        for (const c of chars) {
          const last = out[out.length - 1];
          if (last && last[1] === key(c.font)) last[0] += c.ch;
          else out.push([c.ch, key(c.font)]);
        }
        return out;
      },
    };
  }

  const base = (type, name, { visible = true, locked = false } = {}) => ({ id: `1:${nextId++}`, type, name, visible, locked, parent: null });

  const scene = {
    text(name, ranges, options = {}) {
      return Object.assign(textModel(ranges, options), base('TEXT', name, options));
    },
    sticky(name, ranges, options = {}) {
      return Object.assign(base('STICKY', name, options), { text: textModel(ranges, options) });
    },
    frame(name, children, options = {}) {
      const node = Object.assign(base(options.type || 'FRAME', name, options), { children });
      for (const child of children) child.parent = node;
      node.findAllWithCriteria = ({ types }) => {
        const found = [];
        const walk = (n) => {
          for (const child of n.children || []) {
            if (types.includes(child.type)) found.push(child);
            walk(child);
          }
        };
        walk(node);
        return found;
      };
      return node;
    },
    select(nodes) {
      selection = nodes.slice();
      for (const h of events.selectionchange || []) h();
    },
  };

  const figma = {
    editorType: 'figma',
    mixed: MIXED,
    showUI(html, options) { calls.showUI.push({ html, options: plain(options) }); },
    ui: {
      on(type, fn) { assert.equal(type, 'message'); handlers.push(fn); },
      once(type, fn) { assert.equal(type, 'message'); handlers.push(fn); },
      off(type, fn) { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); },
      postMessage(msg) { calls.posted.push(plain(msg)); },
      resize(width, height) { if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('resize: not finite'); },
      show() {},
      hide() {},
    },
    clientStorage: {
      async getAsync(k) { return store.get(k); },
      async setAsync(k, value) { calls.set.push({ key: k, value: plain(value) }); store.set(k, plain(value)); },
    },
    currentPage: {
      id: '0:1',
      type: 'PAGE',
      get selection() { return selection.slice(); },
    },
    on(type, fn) { (events[type] = events[type] || []).push(fn); },
    loadFontAsync(font) {
      if (font === MIXED || !font || typeof font.family !== 'string' || typeof font.style !== 'string') {
        return Promise.reject(new Error('stub: loadFontAsync needs a FontName'));
      }
      loads.push(key(font));
      return new Promise((resolve, reject) => setImmediate(() => {
        if (font.family === BROKEN.family || font.family === GONE.family) reject(new Error(`stub: ${key(font)} is not available`));
        else { loaded.add(key(font)); resolve(); }
      }));
    },
    commitUndo() { calls.undo += 1; },
    closePlugin() { calls.closed += 1; },
  };

  return { figma, scene, calls, loads, store, handlers };
}

/** Runs the whole compiled code.js, as Figma does when the plugin starts. */
function boot(options) {
  const stub = makeFigma(options);
  const context = vm.createContext({
    figma: stub.figma,
    __html__: '<p>ui</p>',
    setTimeout: () => 0, // the kit's show timers; a 'fixed' window opens hidden and shows after kit:init
    clearTimeout: () => {},
    console: { warn: (...args) => stub.calls.warn.push(args.map(String).join(' ')), log: () => {}, error: () => {} },
  });
  vm.runInContext(CODE_JS, context, { filename: 'examples/content-fill/code.js' });
  const send = (msg) => { for (const h of stub.handlers.slice()) h(msg); };
  const replies = (type) => stub.calls.posted.filter((m) => m.type === type);
  const run = (code) => vm.runInContext(code, context);
  return { ...stub, context, send, replies, run };
}

/** Sends a fill and waits for its answer. */
async function fill(app, kind, nested = false) {
  const before = app.replies('cf-filled').length;
  app.send({ type: 'cf-fill', kind, nested });
  await settle();
  const after = app.replies('cf-filled');
  assert.equal(after.length, before + 1, 'exactly one cf-filled answer per cf-fill');
  return after[after.length - 1];
}

/** A deterministic Math.random inside the vm (a small LCG), or a constant. */
function seed(app, value) {
  if (typeof value === 'number' && value < 1) { app.run(`Math.random = () => ${value};`); return; }
  app.run(`(() => { let s = ${value >>> 0}; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();`);
}

const TODAY = Date.UTC(2026, 9, 13); // 13 October 2026, UTC midnight
const DAY = 86400000;

// ---- The example's files -----------------------------------------------------------------------

test('manifest: the example id and name, dynamic-page, no network, every editor that edits text (no Dev Mode)', () => {
  assert.equal(MANIFEST.name, 'Content fill (kit example)');
  assert.equal(MANIFEST.id, 'kit-example-content-fill');
  assert.equal(MANIFEST.main, 'code.js');
  assert.equal(MANIFEST.ui, 'ui.html');
  assert.equal(MANIFEST.documentAccess, 'dynamic-page');
  assert.deepEqual(MANIFEST.networkAccess, { allowedDomains: ['none'] });
  assert.deepEqual(MANIFEST.editorType, ['figma', 'figjam', 'slides', 'buzz']);
});

test('ui.html: the select offers exactly the kinds code.js accepts, and has no HTML comment', () => {
  const app = boot();
  const kinds = plain(app.run('CF_KINDS'));
  const options = [...UI_HTML.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, kinds);
  assert.ok(!UI_HTML.includes('<!--'));
});

test('boot: a fixed 320 x 249 window, opened hidden, the selection posted, saved settings restored', async () => {
  const app = boot({ stored: { kind: 'email', nested: true } });
  assert.equal(app.calls.showUI.length, 1);
  assert.deepEqual(app.calls.showUI[0].options, { width: 320, height: 249, themeColors: true, visible: false });
  assert.deepEqual(app.replies('cf-selection'), [{ type: 'cf-selection', direct: 0, nested: 0 }]);
  await settle();
  assert.deepEqual(app.replies('cf-settings'), [{ type: 'cf-settings', kind: 'email', nested: true }]);
});

test('boot: saved settings of the wrong shape are ignored', async () => {
  for (const stored of [{ kind: 'emails', nested: true }, { kind: 'email', nested: 'yes' }, 'email', null]) {
    const app = boot({ stored });
    await settle();
    assert.deepEqual(app.replies('cf-settings'), [], JSON.stringify(stored));
  }
});

// ---- Fonts: mixed text and figma.mixed -----------------------------------------------------------

test('mixed fonts: every font of the layer is loaded first, figma.mixed never reaches loadFontAsync, and the new text takes the first character\'s style', async () => {
  const app = boot();
  const label = app.scene.text('Label', [['Name: ', INTER_BOLD], ['Olivia', INTER], [' (she/her)', SERIF]]);
  assert.equal(label.fontName, app.figma.mixed, 'the stub reports figma.mixed for a layer with several fonts');
  app.scene.select([label]);
  seed(app, 0);
  const reply = await fill(app, 'full-name');
  assert.deepEqual(reply, { type: 'cf-filled', kind: 'full-name', filled: 1, missingFonts: 0, failed: 0, error: null });
  assert.deepEqual(label.ranges(), [['Olivia Martinez', 'Inter/Bold']]);
  assert.deepEqual([...app.loads].sort(), ['Inter/Bold', 'Inter/Regular', 'Source Serif/Italic']);
  assert.equal(app.calls.undo, 1, 'one undo step for the whole fill');
});

test('fonts: each font is loaded once however many layers use it; an empty layer uses its own font', async () => {
  const app = boot();
  const a = app.scene.text('A', [['One', INTER]]);
  const b = app.scene.text('B', [['Two', INTER], ['!', INTER_BOLD]]);
  const empty = app.scene.text('Empty', [], { emptyFont: SERIF });
  app.scene.select([a, b, empty]);
  seed(app, 7);
  const reply = await fill(app, 'first-name');
  assert.equal(reply.filled, 3);
  assert.deepEqual([...app.loads].sort(), ['Inter/Bold', 'Inter/Regular', 'Source Serif/Italic']);
  assert.equal(empty.ranges().length, 1);
  assert.equal(empty.ranges()[0][1], 'Source Serif/Italic');
  assert.equal(b.ranges().length, 1, 'the mixed layer ends in one style');
  assert.equal(b.ranges()[0][1], 'Inter/Regular', 'the style of its first character');
});

test('missing fonts: hasMissingFont layers and fonts that fail to load are skipped and counted; the rest are filled', async () => {
  const app = boot();
  const gone = app.scene.text('Gone', [['Old', GONE]], { missing: true });
  const broken = app.scene.text('Broken', [['Mixed ', INTER], ['old', BROKEN]]);
  const ok = app.scene.text('OK', [['Old', INTER]]);
  app.scene.select([gone, broken, ok]);
  const reply = await fill(app, 'email');
  assert.deepEqual(reply, { type: 'cf-filled', kind: 'email', filled: 1, missingFonts: 2, failed: 0, error: null });
  assert.equal(gone.characters, 'Old');
  assert.equal(broken.characters, 'Mixed old');
  assert.match(ok.characters, /@example\.(com|org|net)$/);
  assert.ok(!app.loads.includes('Gone Grotesk/Regular'), 'a layer with a missing font is not even loaded');
});

test('a layer Figma refuses to change is counted as failed (one warning), the others are filled', async () => {
  const app = boot();
  const locked = app.scene.text('Read-only', [['Old', INTER]], { readOnly: true });
  const a = app.scene.text('A', [['Old', INTER]]);
  const b = app.scene.text('B', [['Old', INTER]]);
  app.scene.select([locked, a, b]);
  const reply = await fill(app, 'number');
  assert.deepEqual(reply, { type: 'cf-filled', kind: 'number', filled: 2, missingFonts: 0, failed: 1, error: null });
  assert.equal(locked.characters, 'Old');
  assert.equal(app.calls.warn.filter((w) => w.includes('could not change a text layer')).length, 1);
});

test('nothing filled: no undo step, and the answer still comes', async () => {
  const app = boot();
  const gone = app.scene.text('Gone', [['Old', GONE]], { missing: true });
  app.scene.select([gone]);
  const reply = await fill(app, 'price');
  assert.deepEqual(reply, { type: 'cf-filled', kind: 'price', filled: 0, missingFonts: 1, failed: 0, error: null });
  assert.equal(app.calls.undo, 0);
});

// ---- Scope: direct and nested -------------------------------------------------------------------

function nestedScene(app) {
  const s = app.scene;
  const t = {
    shown: s.text('Shown', [['a', INTER]]),
    inHidden: s.text('In hidden group', [['b', INTER]]),
    hidden: s.text('Hidden', [['c', INTER]], { visible: false }),
    locked: s.text('Locked', [['d', INTER]], { locked: true }),
    inLocked: s.text('In locked group', [['e', INTER]]),
    deep: s.text('Deep', [['f', INTER]]),
    picked: s.text('Picked though hidden and locked', [['g', INTER]], { visible: false, locked: true }),
    both: s.text('Selected and inside', [['h', INTER]]),
  };
  const sticky = s.sticky('Sticky', [['note', INTER]]);
  const card = s.frame('Card', [
    t.shown,
    s.frame('Hidden group', [t.inHidden], { type: 'GROUP', visible: false }),
    t.hidden,
    t.locked,
    s.frame('Locked group', [t.inLocked], { type: 'GROUP', locked: true }),
    s.frame('Inner', [s.frame('Innermost', [t.deep])]),
    sticky,
  ]);
  const other = s.frame('Other', [t.both]);
  return { t, sticky, card, other };
}

test('scope: direct counts the selected text layers; nested adds only visible, unlocked layers inside, each once', () => {
  const app = boot();
  const { t, card, other } = nestedScene(app);
  app.scene.select([card, t.picked, other, t.both]);
  const last = app.replies('cf-selection').pop();
  // direct: picked, both. nested: + shown, deep, the sticky (card); both is inside `other` too, counted once.
  assert.deepEqual(last, { type: 'cf-selection', direct: 2, nested: 5 });
});

test('scope: a nested fill leaves hidden and locked layers (and those inside hidden or locked groups) alone', async () => {
  const app = boot();
  const { t, sticky, card } = nestedScene(app);
  app.scene.select([card, t.picked]);
  seed(app, 3);
  const reply = await fill(app, 'last-name', true);
  assert.equal(reply.filled, 4); // shown, deep, sticky, picked
  for (const node of [t.shown, t.deep, t.picked]) assert.notEqual(node.characters.length, 1, node.name);
  assert.notEqual(sticky.text.characters, 'note', 'the FigJam sticky\'s text is filled');
  assert.deepEqual([t.inHidden, t.hidden, t.locked, t.inLocked].map((n) => n.characters), ['b', 'c', 'd', 'e']);
});

test('scope: a direct fill ignores the layers inside selected frames', async () => {
  const app = boot();
  const { t, card } = nestedScene(app);
  app.scene.select([card]);
  assert.deepEqual(app.replies('cf-selection').pop(), { type: 'cf-selection', direct: 0, nested: 3 });
  const reply = await fill(app, 'full-name', false);
  assert.deepEqual(reply, { type: 'cf-filled', kind: 'full-name', filled: 0, missingFonts: 0, failed: 0, error: null });
  assert.equal(t.shown.characters, 'a');
});

// ---- Values ---------------------------------------------------------------------------------------

test('golden values: the lowest and highest draws of every kind', () => {
  const app = boot();
  const values = (r) => {
    seed(app, r);
    return Object.fromEntries(plain(app.run('CF_KINDS')).map((k) => [k, plain(app.run(`cfValues(${JSON.stringify(k)}, 1, ${TODAY})`))[0]]));
  };
  assert.deepEqual(values(0), {
    'full-name': 'Olivia Martinez', 'first-name': 'Olivia', 'last-name': 'Martinez', email: 'olivia.martinez@example.com',
    'date-short': 'Oct 13, 2025', 'date-long': '13 October 2025', 'date-iso': '2025-10-13',
    number: '1', price: '$1.99', percent: '0%',
  });
  assert.deepEqual(values(0.999999), {
    'full-name': 'Esther Lindqvist', 'first-name': 'Esther', 'last-name': 'Lindqvist', email: 'esther@example.net',
    'date-short': 'Oct 13, 2027', 'date-long': '13 October 2027', 'date-iso': '2027-10-13',
    number: '99,998', price: '$999.99', percent: '100%',
  });
});

test('values: formats and ranges hold over many draws', () => {
  const app = boot();
  seed(app, 12345);
  const many = (kind) => plain(app.run(`cfValues(${JSON.stringify(kind)}, 300, ${TODAY})`));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (const v of many('email')) assert.match(v, /^[a-z]+(?:[._]?[a-z]+)?\d{0,2}@example\.(?:com|org|net)$/);
  for (const v of many('date-iso')) {
    assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
    const t = Date.parse(v + 'T00:00:00Z');
    assert.ok(Math.abs(t - TODAY) <= 365 * DAY, v);
  }
  for (const v of many('date-short')) {
    const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(v);
    assert.ok(m, v);
    const t = Date.UTC(Number(m[3]), MONTHS.findIndex((x) => x.startsWith(m[1])), Number(m[2]));
    assert.ok(Math.abs(t - TODAY) <= 365 * DAY, v);
  }
  for (const v of many('date-long')) {
    const m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(v);
    assert.ok(m && MONTHS.includes(m[2]), v);
  }
  for (const v of many('number')) {
    assert.match(v, /^\d{1,3}(?:,\d{3})*$/);
    const n = Number(v.replace(/,/g, ''));
    assert.ok(n >= 1 && n <= 99999, v);
  }
  for (const v of many('price')) {
    assert.match(v, /^\$\d{1,3}\.\d{2}$/);
    const n = Number(v.slice(1));
    assert.ok(n >= 1 && n <= 999.99, v);
  }
  for (const v of many('percent')) {
    assert.match(v, /^\d{1,3}%$/);
    assert.ok(Number(v.slice(0, -1)) <= 100, v);
  }
});

test('values: all different while the kind has enough of them; more layers than values still get one each', () => {
  const app = boot();
  seed(app, 99);
  const names = plain(app.run(`cfValues('full-name', 50, ${TODAY})`));
  assert.equal(new Set(names).size, 50);
  const firsts = plain(app.run(`cfValues('first-name', 80, ${TODAY})`)); // 60 first names in the list
  assert.equal(firsts.length, 80);
  assert.equal(new Set(firsts).size, 60);
});

test('a fill gives every layer in scope a different value', async () => {
  const app = boot();
  const layers = Array.from({ length: 12 }, (_, i) => app.scene.text(`T${i}`, [['Old', INTER]]));
  app.scene.select(layers);
  seed(app, 5);
  const reply = await fill(app, 'email');
  assert.equal(reply.filled, 12);
  assert.equal(new Set(layers.map((l) => l.characters)).size, 12);
});

// ---- Messages -------------------------------------------------------------------------------------

test('messages: malformed fills and kit:* messages get no answer; cf-close closes the plugin', async () => {
  const app = boot();
  app.scene.select([app.scene.text('A', [['Old', INTER]])]);
  for (const msg of [null, 'cf-fill', { type: 'cf-fill' }, { type: 'cf-fill', kind: 'names', nested: false }, { type: 'cf-fill', kind: 'email', nested: 1 }, { type: 'kit:whatever', kind: 'email', nested: false }]) {
    app.send(msg);
  }
  await settle();
  assert.deepEqual(app.replies('cf-filled'), []);
  app.send({ type: 'cf-close' });
  assert.equal(app.calls.closed, 1);
});

test('messages: when the fill throws, the UI still gets an answer with the error', async () => {
  const app = boot();
  const error = app.run("new Error('selection unavailable')"); // an Error of the plugin's own realm, as Figma throws
  Object.defineProperty(app.figma.currentPage, 'selection', { get() { throw error; } });
  const reply = await fill(app, 'email');
  assert.deepEqual(reply, { type: 'cf-filled', kind: 'email', filled: 0, missingFonts: 0, failed: 0, error: 'selection unavailable' });
});

test('settings: the kind and scope of each fill are saved after it is answered', async () => {
  const app = boot();
  app.scene.select([app.scene.text('A', [['Old', INTER]])]);
  await fill(app, 'date-long', true);
  assert.deepEqual(app.calls.set, [{ key: 'content-fill:settings', value: { kind: 'date-long', nested: true } }]);
});

test('a second fill sent while one runs is dropped; the running one answers once', async () => {
  const app = boot();
  app.scene.select([app.scene.text('A', [['Old', INTER]])]);
  app.send({ type: 'cf-fill', kind: 'email', nested: false });
  app.send({ type: 'cf-fill', kind: 'price', nested: false });
  await settle();
  assert.deepEqual(app.replies('cf-filled').map((m) => m.kind), ['email']);
});
