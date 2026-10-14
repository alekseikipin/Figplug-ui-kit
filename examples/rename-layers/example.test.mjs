// Golden tests for examples/rename-layers: the compiled code.js (the whole file, kit block and
// plugin, as Figma loads it) runs in a node:vm context against a small scene-graph stub of the
// figma API. They pin what the example promises: the new names for a prefix, find and replace
// (plain and regular expression) and numbering; the numbering order (Layers panel, rows,
// columns); preview = apply (Rename writes exactly the previewed names, as one undo step);
// stale, skipped and failed renames; message validation; and that a big selection reads each
// parent's children once per preview.
// Run: node --test examples/rename-layers/example.test.mjs (after tsc -p examples/rename-layers)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE_JS = readFileSync(new URL('./code.js', import.meta.url), 'utf8');
// vm objects come from another realm, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const DEFAULTS = {
  prefix: '', find: '', replace: '', matchCase: false, regex: false,
  numbering: false, start: 1, digits: 1, place: 'after', separator: 'space', order: 'layers',
};

/** Timers the test runs by hand, so the plugin's "refresh once per burst" is deterministic. */
function makeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = next++; pending.set(id, { fn, ms: ms || 0 }); return id; },
    clearTimeout(id) { pending.delete(id); },
    /** Runs every timer due within `upTo` ms, including ones they schedule (the kit's are 300 ms and up). */
    run(upTo = 0) {
      for (let guard = 0; guard < 100; guard++) {
        const due = [...pending].filter(([, t]) => t.ms <= upTo);
        if (due.length === 0) return;
        for (const [id, t] of due) { pending.delete(id); t.fn(); }
      }
    },
  };
}

/**
 * A scene: nodes with ids, names, parents and children, positions and absoluteBoundingBox.
 * `children` builds a new array on every read, as Figma's does, and counts the reads.
 */
function makeScene() {
  let count = 0;
  const reads = new Map(); // node id -> children reads
  const renames = [];
  function node(type, name, { x = 0, y = 0, width = 100, height = 100, readOnly = false } = {}) {
    const kids = [];
    let current = name;
    const n = {
      id: `${type === 'DOCUMENT' ? 0 : 1}:${count++}`, type, x, y, width, height, parent: null, removed: false,
      get name() { return current; },
      set name(value) {
        if (readOnly) throw new Error('figma stub: this layer cannot be renamed');
        current = String(value);
        renames.push([n.id, current]);
      },
      get children() { reads.set(n.id, (reads.get(n.id) || 0) + 1); return kids.slice(); },
      get absoluteBoundingBox() {
        if (type === 'DOCUMENT' || type === 'PAGE') return null;
        let ax = x; let ay = y;
        for (let p = n.parent; p && p.type !== 'PAGE'; p = p.parent) { ax += p.x; ay += p.y; }
        return { x: ax, y: ay, width, height };
      },
      append(...children) { for (const c of children) { c.parent = n; kids.push(c); } return n; },
      /** Renames without telling anyone, like an edit the plugin did not watch. */
      setNameQuietly(value) { current = value; },
    };
    return n;
  }
  return { node, reads, renames, childReads: (n) => reads.get(n.id) || 0 };
}

/**
 * The fixture most tests use. The Layers panel, top to bottom:
 *   Cards (frame at 0,0): Card C (200,0), Card B (100,0), Card A (0,0)
 *   Icons (frame at 0,500): icon-star (0,40), icon-heart (0,0)
 * Child order is bottom to top, as in Figma: Card A is Cards' first child.
 */
function makeFixture() {
  const scene = makeScene();
  const doc = scene.node('DOCUMENT', 'Document');
  const page = scene.node('PAGE', 'Page 1');
  doc.append(page);
  const icons = scene.node('FRAME', 'Icons', { x: 0, y: 500, width: 400, height: 100 });
  const cards = scene.node('FRAME', 'Cards', { x: 0, y: 0, width: 400, height: 100 });
  page.append(icons, cards); // Cards is drawn above Icons: it is the page's last child
  const n = {
    cardA: scene.node('FRAME', 'Card A', { x: 0, y: 0 }),
    cardB: scene.node('FRAME', 'Card B', { x: 100, y: 0 }),
    cardC: scene.node('FRAME', 'Card C', { x: 200, y: 0 }),
    heart: scene.node('VECTOR', 'icon-heart', { x: 0, y: 0, width: 24, height: 24 }),
    star: scene.node('VECTOR', 'icon-star', { x: 0, y: 40, width: 24, height: 24 }),
  };
  cards.append(n.cardA, n.cardB, n.cardC);
  icons.append(n.heart, n.star);
  return { scene, doc, page, icons, cards, n };
}

/** Boots code.js against the fixture's document. `pageOn` replaces PageNode.on (to make it throw). */
function boot(fixture = makeFixture(), { pageOn } = {}) {
  const timers = makeTimers();
  const posted = [];
  const warnings = [];
  const uiHandlers = [];
  const events = {};
  const pageEvents = new Map(); // page -> { nodechange: [] }
  let undo = 0;
  let selection = [];
  let current = fixture.page;
  const watch = (page) => {
    if (!pageEvents.has(page)) pageEvents.set(page, []);
    return pageEvents.get(page);
  };
  const decorate = (page) => {
    Object.defineProperty(page, 'selection', { configurable: true, get: () => selection.slice(), set: (v) => { selection = v.slice(); } });
    page.on = pageOn || ((type, cb) => { if (type === 'nodechange') watch(page).push(cb); });
    page.off = (type, cb) => { const list = watch(page); const i = list.indexOf(cb); if (i >= 0) list.splice(i, 1); };
  };
  decorate(fixture.page);
  const figma = {
    editorType: 'figma',
    mixed: Symbol('figma.mixed'),
    root: fixture.doc,
    get currentPage() { return current; },
    showUI() {},
    ui: {
      on(type, cb) { if (type === 'message') uiHandlers.push(cb); },
      off(type, cb) { const i = uiHandlers.indexOf(cb); if (i >= 0) uiHandlers.splice(i, 1); },
      postMessage(msg) { posted.push(plain(msg)); },
      resize() {},
      show() {},
    },
    clientStorage: { getAsync: async () => undefined, setAsync: async () => {} },
    on(type, cb) { (events[type] = events[type] || []).push(cb); },
    off() {},
    once() {},
    commitUndo() { undo++; },
    notify() {},
  };
  const context = vm.createContext({
    figma, __html__: '<html></html>',
    console: { warn: (...args) => warnings.push(args.map(String).join(' ')), log() {}, error() {} },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  });
  vm.runInContext(CODE_JS, context, { filename: 'examples/rename-layers/code.js' });

  let seq = 0;
  const fire = (type) => { for (const cb of events[type] || []) cb(); timers.run(); };
  const ofType = (type) => posted.filter((m) => m.type === type);
  const last = (type) => ofType(type).at(-1);
  const send = (msg) => { for (const h of uiHandlers.slice()) h(msg); };
  return {
    fixture, posted, warnings, timers, ofType, last, send,
    get undo() { return undo; },
    watchers: (page = current) => watch(page).length,
    select(nodes) { selection = nodes.slice(); fire('selectionchange'); },
    switchPage(page) { decorate(page); current = page; selection = []; fire('currentpagechange'); },
    /** Sends a rename-preview the way the UI does and returns main's answer. */
    preview(options = {}) {
      const before = ofType('rename-preview-result').length;
      send({ type: 'rename-preview', seq: ++seq, options: { ...DEFAULTS, ...options } });
      const results = ofType('rename-preview-result');
      assert.equal(results.length, before + 1, 'main answers every rename-preview at once');
      return results.at(-1);
    },
    apply(token) {
      const before = ofType('rename-applied').length;
      send({ type: 'rename-apply', token });
      const applied = ofType('rename-applied');
      assert.equal(applied.length, before + 1, 'main always answers rename-apply');
      return applied.at(-1);
    },
    nodeChange(changes) {
      for (const cb of watch(current).slice()) cb({ nodeChanges: changes });
      timers.run();
    },
  };
}

const pairs = (result) => result.rows.map((r) => [r.oldName, r.newName]);

test('boots: no warnings, watches the current page, posts nothing until the UI sends its options', () => {
  const p = boot();
  p.select([p.fixture.n.cardA]);
  assert.deepEqual(p.ofType('rename-preview-result'), []);
  assert.equal(p.watchers(), 1);
  assert.deepEqual(p.warnings, []);
});

test('golden names: prefix, then find and replace (case-insensitive by default), then the number after it', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA, n.cardC, n.cardB]);
  const r = p.preview({ prefix: 'UI/', find: 'card', replace: 'Tile', numbering: true, start: 1, digits: 2, separator: 'hyphen' });
  assert.deepEqual(pairs(r), [
    ['Card C', 'UI/Tile C-01'],
    ['Card B', 'UI/Tile B-02'],
    ['Card A', 'UI/Tile A-03'],
  ]);
  assert.deepEqual({ total: r.total, changed: r.changed, findInvalid: r.findInvalid }, { total: 3, changed: 3, findInvalid: false });
});

test('golden names: Match case, every occurrence replaced, and a plain replacement keeps $ literally', () => {
  const p = boot();
  const { n } = p.fixture;
  n.cardA.setNameQuietly('Card card CARD');
  p.select([n.cardA]);
  assert.deepEqual(pairs(p.preview({ find: 'card', replace: 'x' })), [['Card card CARD', 'x x x']]);
  assert.deepEqual(pairs(p.preview({ find: 'card', replace: 'x', matchCase: true })), [['Card card CARD', 'Card x CARD']]);
  // Plain text: no regular-expression syntax in find, no replacement patterns in replace.
  assert.deepEqual(pairs(p.preview({ find: 'D c', replace: '$& ($1)' })), [['Card card CARD', 'Car$& ($1)ar$& ($1)ARD']]);
  n.cardB.setNameQuietly('a.b (c)');
  p.select([n.cardB]);
  assert.deepEqual(pairs(p.preview({ find: '.', replace: '-' })), [['a.b (c)', 'a-b (c)']]);
  assert.deepEqual(pairs(p.preview({ find: '(c)', replace: '[c]' })), [['a.b (c)', 'a.b [c]']]);
});

test('golden names: a regular expression keeps groups and replacement patterns', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA, n.heart]);
  const r = p.preview({ find: '^(\\w+)[ -](\\w+)$', replace: '$2/$1', regex: true });
  assert.deepEqual(pairs(r), [['Card A', 'A/Card'], ['icon-heart', 'heart/icon']]);
  // An empty match at the end appends, as String.replace does.
  assert.deepEqual(pairs(p.preview({ find: '$', replace: ' copy', regex: true })), [['Card A', 'Card A copy'], ['icon-heart', 'icon-heart copy']]);
});

test('an invalid regular expression changes nothing, prefix and numbers included, and says so', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA, n.cardB]);
  const r = p.preview({ prefix: 'UI/', find: '(', regex: true, numbering: true });
  assert.equal(r.findInvalid, true);
  assert.equal(r.changed, 0);
  assert.ok(r.rows.every((row) => !row.changed && row.newName === row.oldName));
  // The same text as plain find is fine.
  assert.equal(p.preview({ find: '(', regex: false }).findInvalid, false);
});

test('a name that would be empty is kept and flagged; with numbers on, the number stands alone', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA]);
  assert.deepEqual(plain(p.preview({ find: 'Card A', replace: '' }).rows), [{ oldName: 'Card A', newName: 'Card A', changed: false, empty: true }]);
  assert.deepEqual(pairs(p.preview({ find: 'Card A', replace: '', numbering: true, start: 5, digits: 2, separator: 'hyphen' })), [['Card A', '05']]);
});

test('numbering before the name, any start, 3 digits, every separator', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA, n.cardB]); // Layers panel order: Card B, then Card A
  const expected = { space: ' ', hyphen: '-', underscore: '_', slash: '/', period: '.', none: '' };
  for (const [separator, s] of Object.entries(expected)) {
    const r = p.preview({ prefix: 'P ', numbering: true, place: 'before', start: 7, digits: 3, separator });
    assert.deepEqual(pairs(r), [['Card B', `P 007${s}Card B`], ['Card A', `P 008${s}Card A`]], separator);
  }
  // More digits than asked for are never cut.
  assert.deepEqual(pairs(p.preview({ numbering: true, start: 999, digits: 2 })), [['Card B', 'Card B 999'], ['Card A', 'Card A 1000']]);
});

test('numbering order: Layers panel (top to bottom, across frames), rows and columns', () => {
  const p = boot();
  const { n, cards } = p.fixture;
  p.select([n.heart, n.cardA, n.cardC, n.star, n.cardB]);
  const names = (r) => r.rows.map((row) => row.newName);
  assert.deepEqual(names(p.preview({ numbering: true, order: 'layers' })), ['Card C 1', 'Card B 2', 'Card A 3', 'icon-star 4', 'icon-heart 5']);
  assert.deepEqual(names(p.preview({ numbering: true, order: 'rows' })), ['Card A 1', 'Card B 2', 'Card C 3', 'icon-heart 4', 'icon-star 5']);
  assert.deepEqual(names(p.preview({ numbering: true, order: 'columns' })), ['Card A 1', 'icon-heart 2', 'icon-star 3', 'Card B 4', 'Card C 5']);
  // Without numbers the preview lists the Layers panel order, whatever Order says.
  assert.deepEqual(names(p.preview({ prefix: 'x', order: 'rows' })), ['xCard C', 'xCard B', 'xCard A', 'xicon-star', 'xicon-heart']);
  // A parent comes before its children, as in the Layers panel.
  p.select([n.cardB, cards]);
  assert.deepEqual(names(p.preview({ numbering: true })), ['Cards 1', 'Card B 2']);
});

test('preview = apply: Rename writes exactly the previewed names, in one undo step, then previews again', () => {
  const p = boot();
  const { n, scene } = p.fixture;
  p.select([n.heart, n.cardA, n.cardC, n.star, n.cardB]);
  const shown = p.preview({ prefix: 'UI/', find: 'icon-', replace: '', numbering: true, digits: 2, separator: 'underscore', order: 'rows' });
  const applied = p.apply(shown.token);
  assert.deepEqual(applied, { type: 'rename-applied', renamed: 5, skipped: 0, failed: 0, stale: false });
  assert.equal(p.undo, 1);
  const byId = Object.fromEntries(Object.values(n).map((node) => [node.name, node.id]));
  assert.deepEqual(scene.renames, shown.rows.map((row) => [byId[row.newName], row.newName]), 'same layers, same names, same order as the preview');
  assert.deepEqual(shown.rows.map((row) => row.newName), ['UI/Card A_01', 'UI/Card B_02', 'UI/Card C_03', 'UI/heart_04', 'UI/star_05']);
  // The follow-up preview starts from the new names.
  const next = p.last('rename-preview-result');
  assert.ok(next.token > shown.token);
  assert.deepEqual(next.rows.map((row) => row.oldName), shown.rows.map((row) => row.newName));
});

test('rows that do not change are not written and cost no undo step', () => {
  const p = boot();
  const { n, scene } = p.fixture;
  p.select([n.cardA, n.heart]);
  const shown = p.preview({ find: 'icon', replace: 'glyph' });
  assert.deepEqual(plain(shown.rows.map((r) => r.changed)), [false, true]);
  assert.equal(p.apply(shown.token).renamed, 1);
  assert.deepEqual(scene.renames, [[n.heart.id, 'glyph-heart']]);
  const none = p.preview({});
  assert.equal(none.changed, 0);
  assert.deepEqual(p.apply(none.token), { type: 'rename-applied', renamed: 0, skipped: 0, failed: 0, stale: false });
  assert.equal(p.undo, 1);
});

test('stale: a preview the UI shows after the selection changed renames nothing', () => {
  const p = boot();
  const { n, scene } = p.fixture;
  p.select([n.cardA]);
  const shown = p.preview({ prefix: 'x' });
  p.select([n.cardA, n.cardB]); // main posts a newer preview; the UI hasn't shown it yet
  assert.deepEqual(p.apply(shown.token), { type: 'rename-applied', renamed: 0, skipped: 0, failed: 0, stale: true });
  assert.deepEqual(scene.renames, []);
  assert.equal(p.undo, 0);
  // The newer preview is the one to apply.
  assert.equal(p.apply(p.last('rename-preview-result').token).renamed, 2);
});

test('layers renamed or deleted after the preview are skipped; layers that refuse a name are counted', () => {
  const fixture = makeFixture();
  const locked = fixture.scene.node('FRAME', 'Locked', { readOnly: true });
  fixture.cards.append(locked);
  const p = boot(fixture);
  const { n, scene } = fixture;
  p.select([n.cardA, n.cardB, n.cardC, locked]);
  const shown = p.preview({ prefix: 'x' });
  n.cardA.setNameQuietly('Renamed by hand');
  n.cardB.removed = true;
  const applied = p.apply(shown.token);
  assert.deepEqual(applied, { type: 'rename-applied', renamed: 1, skipped: 2, failed: 1, stale: false });
  assert.deepEqual(scene.renames, [[n.cardC.id, 'xCard C']]);
  assert.equal(n.cardA.name, 'Renamed by hand');
  assert.equal(p.undo, 1);
  assert.equal(p.warnings.length, 1);
});

test('the preview echoes the last seq and counts selection and page changes', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA]);
  const first = p.preview({ prefix: 'a' });
  assert.deepEqual({ seq: first.seq, selection: first.selection }, { seq: 1, selection: 1 });
  const second = p.preview({ prefix: 'ab' });
  assert.deepEqual({ seq: second.seq, selection: second.selection }, { seq: 2, selection: 1 });
  p.select([n.cardA, n.cardB]);
  const third = p.last('rename-preview-result');
  assert.deepEqual({ seq: third.seq, selection: third.selection, total: third.total }, { seq: 2, selection: 2, total: 2 });
  // A burst of selection changes is one refresh.
  const before = p.ofType('rename-preview-result').length;
  p.send({ type: 'noise' });
  const page2 = p.fixture.scene.node('PAGE', 'Page 2');
  p.fixture.doc.append(page2);
  p.switchPage(page2);
  assert.equal(p.ofType('rename-preview-result').length, before + 1);
  assert.deepEqual({ selection: p.last('rename-preview-result').selection, total: p.last('rename-preview-result').total }, { selection: 3, total: 0 });
  // The watch moved to the new page.
  assert.equal(p.watchers(p.fixture.page), 0);
  assert.equal(p.watchers(page2), 1);
});

test('a name typed in the Layers panel refreshes the preview; unrelated changes do not', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA]);
  p.preview({ prefix: 'x' });
  const count = () => p.ofType('rename-preview-result').length;
  const before = count();
  p.nodeChange([{ id: n.cardB.id, type: 'PROPERTY_CHANGE', properties: ['name'] }]); // not selected
  p.nodeChange([{ id: n.cardA.id, type: 'PROPERTY_CHANGE', properties: ['fills'] }]); // can't change a name
  assert.equal(count(), before);
  n.cardA.setNameQuietly('Hero');
  p.nodeChange([{ id: n.cardA.id, type: 'PROPERTY_CHANGE', properties: ['name'] }, { id: n.cardA.id, type: 'PROPERTY_CHANGE', properties: ['x'] }]);
  assert.equal(count(), before + 1);
  assert.deepEqual(pairs(p.last('rename-preview-result')), [['Hero', 'xHero']]);
});

test('a big selection: counts cover every layer, 200 rows are sent, each parent is read once per preview', () => {
  const fixture = makeFixture();
  const many = fixture.scene.node('FRAME', 'Grid', { width: 2000, height: 2000 });
  fixture.page.append(many);
  for (let i = 0; i < 250; i++) many.append(fixture.scene.node('RECTANGLE', `Cell ${i}`, { x: (i % 10) * 10, y: Math.floor(i / 10) * 10 }));
  const p = boot(fixture);
  const cells = many.children;
  p.select(cells);
  const readsBefore = fixture.scene.childReads(many);
  const r = p.preview({ prefix: 'g/', numbering: true, order: 'layers' });
  assert.equal(fixture.scene.childReads(many) - readsBefore, 1, 'Grid.children read once, not once per selected layer');
  assert.deepEqual({ total: r.total, changed: r.changed, rows: r.rows.length }, { total: 250, changed: 250, rows: 200 });
  assert.deepEqual(pairs(r).slice(0, 2), [['Cell 249', 'g/Cell 249 1'], ['Cell 248', 'g/Cell 248 2']]);
  // Apply renames all 250, not just the 200 rows on screen.
  assert.equal(p.apply(r.token).renamed, 250);
  assert.equal(fixture.scene.renames.length, 250);
  assert.equal(many.children[0].name, 'g/Cell 0 250');
});

test('untrusted messages: malformed ones are ignored, numbers are clamped', () => {
  const p = boot();
  const { n } = p.fixture;
  p.select([n.cardA]);
  const count = () => p.posted.length;
  const before = count();
  const good = { type: 'rename-preview', seq: 1, options: { ...DEFAULTS } };
  for (const bad of [
    null, 'rename-preview', { type: 'rename-preview', options: DEFAULTS }, { ...good, seq: '1' },
    { ...good, options: { ...DEFAULTS, separator: 'tab' } }, { ...good, options: { ...DEFAULTS, order: 'random' } },
    { ...good, options: { ...DEFAULTS, place: 'middle' } }, { ...good, options: { ...DEFAULTS, prefix: 1 } },
    { ...good, options: { ...DEFAULTS, start: '1' } }, { ...good, options: { ...DEFAULTS, numbering: 'yes' } },
    { type: 'rename-apply', token: '1' }, { type: 'rename-apply' },
    { type: 'kit:ready-ish' },
  ]) p.send(bad);
  assert.equal(count(), before, 'nothing answered');
  const r = p.preview({ numbering: true, start: -4, digits: 9 });
  assert.deepEqual(pairs(r), [['Card A', 'Card A 000']]);
  assert.deepEqual(pairs(p.preview({ numbering: true, start: 2.6, digits: 0 })), [['Card A', 'Card A 3']]);
  assert.deepEqual(pairs(p.preview({ numbering: true, start: 5e9 })), [['Card A', 'Card A 999999']]);
});

test('an editor that cannot watch a page still previews and renames', () => {
  const p = boot(makeFixture(), { pageOn: () => { throw new Error('nodechange is not supported here'); } });
  const { n } = p.fixture;
  assert.equal(p.warnings.length, 1);
  p.select([n.cardA]);
  const r = p.preview({ prefix: 'x' });
  assert.equal(p.apply(r.token).renamed, 1);
  assert.equal(n.cardA.name, 'xCard A');
});
