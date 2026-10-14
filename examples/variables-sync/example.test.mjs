// Tests for examples/variables-sync (the variables-sync archetype, kit 0.3.0).
// They run the example's COMPILED code.js, the file Figma loads, whole: the kit:window block and
// the plugin below it, in a node:vm context against a figma stub whose figma.variables models
// collections, modes, aliases, extended collections and Figma's write rules (a mode must belong
// to the collection, a COLOR takes RGB/RGBA, a read-only file refuses). They pin the core
// behaviour with golden cases: the window mode, hex parsing and validation, the values each mode
// shows (aliases followed per mode and across collections), writes per mode, aliases kept or
// replaced, failures, and the message contract.
// Run: tsc -p examples/variables-sync && node --test examples/variables-sync/example.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE_JS = readFileSync(new URL('./code.js', import.meta.url), 'utf8');

// Settles every pending promise in the vm (it shares this realm's microtask queue; the stub uses
// no timers, so one macrotask turn drains every await chain).
const flush = () => new Promise((resolve) => setImmediate(resolve));
// vm objects have another realm's Object.prototype, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const rgb = (r, g, b, a) => (a === undefined ? { r, g, b } : { r, g, b, a });
const byte = (n) => n / 255;
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });
const TYPES = ['BOOLEAN', 'COLOR', 'EASING', 'FLOAT', 'STRING', 'TIMING'];

/**
 * A file's variables. collection({ id, name, modes: [[modeId, name], ...], remote, parent }) makes
 * a collection (with parent: an extended collection whose modes inherit the parent's in order);
 * variable({ id, name, type, collection, values, remote }) adds a variable to its collection.
 * calls counts the by-id getters; writes records every accepted setValueForMode.
 */
function makeFile({ readOnly = false } = {}) {
  const collections = new Map();
  const variables = new Map();
  const writes = [];
  const calls = { variableById: 0, collectionById: 0, localVariables: [] };

  const isColor = (v) => v && typeof v === 'object' && ['r', 'g', 'b'].every((k) => typeof v[k] === 'number' && v[k] >= 0 && v[k] <= 1) &&
    (v.a === undefined || (typeof v.a === 'number' && v.a >= 0 && v.a <= 1));
  const isAlias = (v) => v && v.type === 'VARIABLE_ALIAS' && typeof v.id === 'string';

  function collection({ id, name, modes, remote = false, parent = null }) {
    const base = parent ? collections.get(parent) : null;
    const own = [];
    const c = {
      id,
      name,
      remote,
      isExtension: !!base,
      modes: base
        ? base.modes.map((m, i) => ({ modeId: modes[i][0], name: modes[i][1], parentModeId: m.modeId }))
        : modes.map(([modeId, modeName]) => ({ modeId, name: modeName })),
      get variableIds() { return base ? [...base.variableIds, ...own] : own.slice(); },
      variableOverrides: {},
      own,
    };
    c.defaultModeId = c.modes[0].modeId;
    collections.set(id, c);
    return c;
  }

  function variable({ id, name, type = 'COLOR', collection: collectionId, values, remote = false }) {
    const home = collections.get(collectionId);
    const stored = structuredClone(values);
    const v = {
      id,
      name,
      resolvedType: type,
      variableCollectionId: collectionId,
      remote,
      get valuesByMode() { return structuredClone(stored); },
      async valuesByModeForCollectionAsync(c) {
        if (!c.isExtension) return structuredClone(stored);
        const out = {};
        for (const m of c.modes) {
          const override = c.variableOverrides[id] && c.variableOverrides[id][m.modeId];
          out[m.modeId] = structuredClone(override !== undefined ? override : stored[m.parentModeId]);
        }
        return out;
      },
      setValueForMode(modeId, value) {
        if (readOnly) throw new Error('in setValueForMode: Cannot edit variables in a read-only file');
        if (type === 'COLOR' && !isColor(value) && !isAlias(value)) throw new Error('in setValueForMode: Expected a color');
        if (home.modes.some((m) => m.modeId === modeId)) {
          stored[modeId] = structuredClone(value);
        } else {
          const ext = [...collections.values()].find((c) => c.isExtension && c.variableIds.includes(id) && c.modes.some((m) => m.modeId === modeId));
          if (!ext) throw new Error('in setValueForMode: Invalid mode for this variable');
          (ext.variableOverrides[id] = ext.variableOverrides[id] || {})[modeId] = structuredClone(value);
        }
        writes.push({ id, modeId, value: structuredClone(value) });
      },
    };
    variables.set(id, v);
    home.own.push(id);
    return v;
  }

  const api = {
    async getLocalVariableCollectionsAsync() { return [...collections.values()].filter((c) => !c.remote); },
    async getLocalVariablesAsync(type) {
      calls.localVariables.push(type === undefined ? 'all' : type);
      if (type !== undefined && !TYPES.includes(type)) throw new Error('invalid type');
      return [...variables.values()].filter((v) => !v.remote && (type === undefined || v.resolvedType === type));
    },
    async getVariableByIdAsync(id) { calls.variableById++; return variables.get(id) || null; },
    async getVariableCollectionByIdAsync(id) { calls.collectionById++; return collections.get(id) || null; },
  };
  return { api, collection, variable, collections, variables, writes, calls };
}

/** The main scene: a two-mode theme, primitives with two modes, numbers only, a remote library. */
function themeFile(options) {
  const f = makeFile(options);
  f.collection({ id: 'C:theme', name: 'Theme', modes: [['m:light', 'Light'], ['m:dark', 'Dark']] });
  f.collection({ id: 'C:prim', name: 'Primitives', modes: [['m:p1', 'Default'], ['m:p2', 'Alt']] });
  f.collection({ id: 'C:num', name: 'Numbers', modes: [['m:n', 'Mode 1']] });
  f.collection({ id: 'C:lib', name: 'Library', modes: [['m:lib', 'Value']], remote: true });
  f.variable({ id: 'V:brand', name: 'brand/primary', collection: 'C:theme', values: { 'm:light': rgb(byte(0x0d), byte(0x99), 1, 1), 'm:dark': rgb(byte(0x1a), byte(0x2b), byte(0x3c)) } });
  f.variable({ id: 'V:overlay', name: 'brand/overlay', collection: 'C:theme', values: { 'm:light': rgb(0, 0, 0, 0.5), 'm:dark': rgb(1, 1, 1, 0.25) } });
  f.variable({ id: 'V:space', name: 'space/s', type: 'FLOAT', collection: 'C:theme', values: { 'm:light': 4, 'm:dark': 8 } });
  f.variable({ id: 'V:link', name: 'text/link', collection: 'C:theme', values: { 'm:light': alias('V:brand'), 'm:dark': alias('V:brand') } });
  f.variable({ id: 'V:hover', name: 'text/link-hover', collection: 'C:theme', values: { 'm:light': alias('V:link'), 'm:dark': alias('V:overlay') } });
  f.variable({ id: 'V:gone', name: 'text/missing', collection: 'C:theme', values: { 'm:light': alias('V:deleted'), 'm:dark': rgb(0.2, 0.2, 0.2) } });
  f.variable({ id: 'V:surface', name: 'bg/surface', collection: 'C:theme', values: { 'm:light': alias('V:blue'), 'm:dark': alias('V:n1') } });
  f.variable({ id: 'V:tint', name: 'brand/tint', collection: 'C:theme', values: { 'm:light': { color: rgb(1, 0, 0), opacity: alias('V:space') }, 'm:dark': { color: alias('V:blue'), opacity: 0.5 } } });
  f.variable({ id: 'V:loopA', name: 'loop/a', collection: 'C:theme', values: { 'm:light': alias('V:loopB'), 'm:dark': alias('V:loopB') } });
  f.variable({ id: 'V:loopB', name: 'loop/b', collection: 'C:theme', values: { 'm:light': alias('V:loopA'), 'm:dark': rgb(0, 1, 0) } });
  f.variable({ id: 'V:libuse', name: 'brand/library', collection: 'C:theme', values: { 'm:light': alias('V:libred'), 'm:dark': alias('V:libred') } });
  f.variable({ id: 'V:blue', name: 'blue/500', collection: 'C:prim', values: { 'm:p1': rgb(0, byte(0x80), 1), 'm:p2': rgb(0, 0, 0) } });
  f.variable({ id: 'V:n1', name: 'size/1', type: 'FLOAT', collection: 'C:num', values: { 'm:n': 1 } });
  f.variable({ id: 'V:libred', name: 'red/500', collection: 'C:lib', values: { 'm:lib': rgb(1, 0, 0) }, remote: true });
  return f;
}

/** Boots code.js against this file (variables: null leaves figma.variables out). */
async function boot({ file = themeFile(), variables } = {}) {
  const posted = [];
  const warned = [];
  const shown = [];
  const handlers = [];
  let undo = 0;
  const figma = {
    editorType: 'figma',
    showUI(html, options) { shown.push({ html, options: plain(options) }); },
    ui: {
      on(type, fn) { if (type === 'message') handlers.push(fn); },
      once(type, fn) { if (type === 'message') handlers.push(fn); },
      off(type, fn) { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); },
      postMessage(msg) { posted.push(msg); },
      resize() {},
      show() {},
      hide() {},
    },
    clientStorage: { async getAsync() { return undefined; }, async setAsync() {} },
    commitUndo() { undo++; },
  };
  if (variables !== null) figma.variables = file.api;
  const context = vm.createContext({
    figma,
    __html__: '<html></html>',
    console: { warn: (...args) => warned.push(args.map(String).join(' ')), log() {}, error() {} },
    // The kit's show timers (800 ms after kit:ready, 3 s fallback) and 300 ms read timeout never need to fire here.
    setTimeout: () => 0,
    clearTimeout() {},
  });
  vm.runInContext(CODE_JS, context, { filename: 'examples/variables-sync/code.js' });
  await flush();

  const emit = async (msg) => {
    for (const fn of handlers.slice()) fn(msg, { origin: 'null' });
    await flush();
  };
  const ofType = (type) => posted.filter((m) => m && m.type === type);
  const lastList = () => plain(ofType('vars-list').at(-1));
  /** Sends one vars-set-color and returns the vars-list and vars-set-result it produced. */
  const set = async (variableId, modeId, hex, collectionId = 'C:theme') => {
    const before = posted.length;
    await emit({ type: 'vars-set-color', variableId, collectionId, modeId, hex });
    const replies = posted.slice(before).map(plain);
    return { replies, list: replies.find((m) => m.type === 'vars-list'), result: replies.find((m) => m.type === 'vars-set-result') };
  };
  return { context, figma, file, posted, warned, shown, emit, ofType, lastList, set, undo: () => undo };
}

const collectionOf = (list, id) => list.collections.find((c) => c.id === id);
const rowOf = (list, collectionId, variableId) => collectionOf(list, collectionId).variables.find((v) => v.id === variableId);
const valueOf = (list, variableId, modeId, collectionId = 'C:theme') => rowOf(list, collectionId, variableId).values[modeId];

test('opens a resizable 360 x 540 window: one showUI, and kit:init answers kit:ready with mode "resizable"', async () => {
  const env = await boot();
  assert.equal(env.shown.length, 1);
  assert.equal(env.shown[0].html, '<html></html>');
  assert.deepEqual(env.warned, [], 'installKitWindow got only options it knows');
  await env.emit({ type: 'kit:ready', protocol: 1 });
  const init = plain(env.ofType('kit:init'));
  assert.equal(init.length, 1);
  assert.equal(init[0].mode, 'resizable');
  assert.equal(init[0].chrome, true);
  assert.deepEqual(init[0].size, { width: 360, height: 540 });
  assert.deepEqual(init[0].bounds, { minWidth: 280, maxWidth: 960, minHeight: 420, maxHeight: 900 });
});

test('hex parsing (golden): 3, 6 or 8 digits, # optional, trimmed, any case; 3 and 6 keep the opacity, 8 set it', () => {
  const ctx = vm.createContext({ figma: { editorType: 'figma', showUI() {}, ui: { on() {}, off() {}, postMessage() {}, resize() {}, show() {} }, clientStorage: { async getAsync() {}, async setAsync() {} } }, __html__: '', console: { warn() {} }, setTimeout: () => 0, clearTimeout() {} });
  vm.runInContext(CODE_JS, ctx);
  const parse = (text, keep = 1) => plain(ctx.varsParseHex(text, keep));
  assert.deepEqual(parse('#0D9'), { r: 0, g: byte(0xdd), b: byte(0x99), a: 1 });
  assert.deepEqual(parse('0d99ff', 0.5), { r: byte(0x0d), g: byte(0x99), b: 1, a: 0.5 });
  assert.deepEqual(parse('0D99FF80', 0.25), { r: byte(0x0d), g: byte(0x99), b: 1, a: byte(0x80) });
  assert.deepEqual(parse('  #0d99ff00 '), { r: byte(0x0d), g: byte(0x99), b: 1, a: 0 });
  assert.deepEqual(parse('fff', 0.3), { r: 1, g: 1, b: 1, a: 0.3 });
  for (const bad of ['', '#', '0D9F', '0D99F', '0D99FF8', '0D99FF800', 'GG0000', '##0D99FF', '0x0D99FF', '0D 99 FF', '#0D99FF;', 'red']) {
    assert.equal(ctx.varsParseHex(bad, 1), null, `"${bad}" is not a hex code`);
  }
  // What the UI shows and the reply carries: RRGGBB, plus AA only when not opaque (at byte precision).
  assert.equal(ctx.varsHexText({ r: 1, g: 1, b: 1, a: 0.999 }), 'FFFFFF');
  assert.equal(ctx.varsHexText({ r: 0, g: 0, b: 0, a: 0.5 }), '00000080');
  assert.equal(ctx.varsHexText({ r: byte(0x0d), g: byte(0x99), b: 1, a: 1 }), '0D99FF');
});

test('vars-list at startup: only collections with local color variables, in variableIds order, every mode', async () => {
  const env = await boot();
  const lists = env.ofType('vars-list');
  assert.equal(lists.length, 1);
  const list = plain(lists[0]);
  assert.equal(list.reason, 'load');
  assert.equal(list.error, null);
  assert.deepEqual(list.collections.map((c) => [c.id, c.name, c.defaultModeId]), [['C:theme', 'Theme', 'm:light'], ['C:prim', 'Primitives', 'm:p1']],
    'Numbers (no colour variables) and the remote Library are left out');
  assert.deepEqual(collectionOf(list, 'C:theme').modes, [{ modeId: 'm:light', name: 'Light' }, { modeId: 'm:dark', name: 'Dark' }]);
  assert.deepEqual(collectionOf(list, 'C:theme').variables.map((v) => v.name),
    ['brand/primary', 'brand/overlay', 'text/link', 'text/link-hover', 'text/missing', 'bg/surface', 'brand/tint', 'loop/a', 'loop/b', 'brand/library'],
    'the FLOAT space/s is skipped');
  // Messages are plain data (structured-clone safe).
  assert.deepEqual(plain(lists[0]), list);
});

test('fixed colours per mode (golden): hex, the field code with AA when not opaque, opacity in %', async () => {
  const list = (await boot()).lastList();
  assert.deepEqual(valueOf(list, 'V:brand', 'm:light'), { kind: 'color', hex: '0D99FF', code: '0D99FF', opacity: 100, target: null });
  assert.deepEqual(valueOf(list, 'V:brand', 'm:dark'), { kind: 'color', hex: '1A2B3C', code: '1A2B3C', opacity: 100, target: null }, 'RGB without a is opaque');
  assert.deepEqual(valueOf(list, 'V:overlay', 'm:light'), { kind: 'color', hex: '000000', code: '00000080', opacity: 50, target: null });
  assert.deepEqual(valueOf(list, 'V:overlay', 'm:dark'), { kind: 'color', hex: 'FFFFFF', code: 'FFFFFF40', opacity: 25, target: null });
  assert.deepEqual(valueOf(list, 'V:blue', 'm:p2', 'C:prim'), { kind: 'color', hex: '000000', code: '000000', opacity: 100, target: null });
});

test('aliases (golden): same collection in the same mode, chains, other collections in their default mode, missing, cycles, non-colour', async () => {
  const list = (await boot()).lastList();
  // Same collection: follows the mode being shown.
  assert.deepEqual(valueOf(list, 'V:link', 'm:light'), { kind: 'alias', hex: '0D99FF', code: '0D99FF', opacity: 100, target: 'brand/primary' });
  assert.deepEqual(valueOf(list, 'V:link', 'm:dark'), { kind: 'alias', hex: '1A2B3C', code: '1A2B3C', opacity: 100, target: 'brand/primary' });
  // A chain (hover -> link -> brand), and an alias keeps its target's opacity.
  assert.deepEqual(valueOf(list, 'V:hover', 'm:light'), { kind: 'alias', hex: '0D99FF', code: '0D99FF', opacity: 100, target: 'text/link' });
  assert.deepEqual(valueOf(list, 'V:hover', 'm:dark'), { kind: 'alias', hex: 'FFFFFF', code: 'FFFFFF40', opacity: 25, target: 'brand/overlay' });
  // Another collection: its default mode (Primitives' Default, not Alt).
  assert.deepEqual(valueOf(list, 'V:surface', 'm:light'), { kind: 'alias', hex: '0080FF', code: '0080FF', opacity: 100, target: 'blue/500' });
  // A remote library variable, fetched by id, in its collection's default mode.
  assert.deepEqual(valueOf(list, 'V:libuse', 'm:light'), { kind: 'alias', hex: 'FF0000', code: 'FF0000', opacity: 100, target: 'red/500' });
  // Unresolvable: a deleted target, an alias to a FLOAT, a cycle (stopped, no hang).
  assert.deepEqual(valueOf(list, 'V:gone', 'm:light'), { kind: 'alias', hex: null, code: '', opacity: 100, target: null });
  assert.deepEqual(valueOf(list, 'V:gone', 'm:dark'), { kind: 'color', hex: '333333', code: '333333', opacity: 100, target: null });
  assert.deepEqual(valueOf(list, 'V:surface', 'm:dark'), { kind: 'alias', hex: null, code: '', opacity: 100, target: 'size/1' });
  assert.deepEqual(valueOf(list, 'V:loopA', 'm:light'), { kind: 'alias', hex: null, code: '', opacity: 100, target: 'loop/b' });
  assert.deepEqual(valueOf(list, 'V:loopA', 'm:dark'), { kind: 'alias', hex: '00FF00', code: '00FF00', opacity: 100, target: 'loop/b' });
  // Linked (colour + bound opacity): the colour part, resolved like an alias; the opacity is not.
  assert.deepEqual(valueOf(list, 'V:tint', 'm:light'), { kind: 'linked', hex: 'FF0000', code: 'FF0000', opacity: 100, target: null });
  assert.deepEqual(valueOf(list, 'V:tint', 'm:dark'), { kind: 'linked', hex: '0080FF', code: '0080FF', opacity: 100, target: null });
});

test('a read costs no by-id lookups for local variables, whatever their type (all locals seed the cache)', async () => {
  const file = themeFile();
  for (let i = 0; i < 50; i++) file.variable({ id: 'V:f' + i, name: 'number/' + i, type: 'FLOAT', collection: 'C:theme', values: { 'm:light': i, 'm:dark': i } });
  const env = await boot({ file });
  assert.deepEqual(file.calls.localVariables, ['all']);
  // Only the targets that are not local are fetched: V:deleted (missing) and V:libred (remote).
  assert.equal(file.calls.variableById, 2);
  assert.equal(collectionOf(env.lastList(), 'C:theme').variables.length, 10);
});

test('vars-set-color (golden): writes RGBA to that mode only, one undo step, then vars-list (update) before vars-set-result', async () => {
  const env = await boot();
  const { replies, list, result } = await env.set('V:brand', 'm:light', ' #ff0000 ');
  assert.deepEqual(replies.map((m) => m.type), ['vars-list', 'vars-set-result']);
  assert.equal(list.reason, 'update');
  assert.deepEqual(result, {
    type: 'vars-set-result', ok: true, changed: true, kind: 'color', variableId: 'V:brand', modeId: 'm:light',
    name: 'brand/primary', modeName: 'Light', hex: 'FF0000', error: null,
  });
  assert.deepEqual(env.file.writes, [{ id: 'V:brand', modeId: 'm:light', value: { r: 1, g: 0, b: 0, a: 1 } }]);
  assert.equal(env.undo(), 1);
  // The new value shows in that mode, the other mode is untouched, and aliases to it follow.
  assert.equal(valueOf(list, 'V:brand', 'm:light').code, 'FF0000');
  assert.equal(valueOf(list, 'V:brand', 'm:dark').code, '1A2B3C');
  assert.equal(valueOf(list, 'V:link', 'm:light').code, 'FF0000');
  assert.equal(valueOf(list, 'V:link', 'm:dark').code, '1A2B3C');
});

test('opacity: 6 and 3 digits keep the opacity the value shows, 8 digits set it', async () => {
  const env = await boot();
  let r = await env.set('V:overlay', 'm:light', '112233');
  assert.deepEqual(env.file.writes.at(-1).value, { r: byte(0x11), g: byte(0x22), b: byte(0x33), a: 0.5 });
  assert.equal(r.result.hex, '11223380');
  r = await env.set('V:overlay', 'm:dark', 'abc');
  assert.deepEqual(env.file.writes.at(-1).value, { r: byte(0xaa), g: byte(0xbb), b: byte(0xcc), a: 0.25 });
  assert.equal(r.result.hex, 'AABBCC40');
  r = await env.set('V:overlay', 'm:dark', '112233FF');
  assert.deepEqual(env.file.writes.at(-1).value, { r: byte(0x11), g: byte(0x22), b: byte(0x33), a: 1 });
  assert.equal(r.result.hex, '112233');
  assert.equal(valueOf(r.list, 'V:overlay', 'm:dark').code, '112233');
  // An alias to a half-transparent colour: 6 digits keep that 25%.
  r = await env.set('V:hover', 'm:dark', '000000');
  assert.equal(r.result.ok, true);
  assert.deepEqual(env.file.writes.at(-1), { id: 'V:hover', modeId: 'm:dark', value: { r: 0, g: 0, b: 0, a: 1 } }, 'overlay is opaque now');
});

test('the value it already shows writes nothing: a fixed colour, and an alias is kept rather than replaced by a copy', async () => {
  const env = await boot();
  let r = await env.set('V:brand', 'm:light', '0d99ff');
  assert.equal(r.result.ok, true);
  assert.equal(r.result.changed, false);
  assert.equal(r.result.hex, '0D99FF');
  r = await env.set('V:overlay', 'm:light', '000000', 'C:theme');
  assert.equal(r.result.changed, false, '6 digits keep 50%, so 000000 is 00000080: unchanged');
  // Apply on an alias with its own resolved colour (what the field shows when it is picked).
  r = await env.set('V:link', 'm:dark', '1A2B3C');
  assert.deepEqual([r.result.ok, r.result.changed, r.result.kind], [true, false, 'alias']);
  assert.equal(valueOf(r.list, 'V:link', 'm:dark').kind, 'alias');
  r = await env.set('V:tint', 'm:light', 'FF0000');
  assert.deepEqual([r.result.ok, r.result.changed, r.result.kind], [true, false, 'linked']);
  assert.deepEqual(env.file.writes, []);
  assert.equal(env.undo(), 0);
});

test('a different code replaces an alias (or a broken one) with a fixed colour in that mode only', async () => {
  const env = await boot();
  let r = await env.set('V:link', 'm:dark', '00FF00');
  assert.deepEqual([r.result.ok, r.result.changed, r.result.kind, r.result.hex], [true, true, 'alias', '00FF00']);
  assert.deepEqual(env.file.writes, [{ id: 'V:link', modeId: 'm:dark', value: { r: 0, g: 1, b: 0, a: 1 } }]);
  assert.deepEqual(valueOf(r.list, 'V:link', 'm:dark'), { kind: 'color', hex: '00FF00', code: '00FF00', opacity: 100, target: null });
  assert.equal(valueOf(r.list, 'V:link', 'm:light').kind, 'alias', 'Light still points at brand/primary');
  r = await env.set('V:gone', 'm:light', '123456');
  assert.deepEqual([r.result.ok, r.result.changed], [true, true], 'an alias that resolves to nothing is replaced');
  assert.equal(env.undo(), 2);
});

test('extended collection: its own modes and overrides; a write overrides the extension, the parent keeps its value', async () => {
  const file = makeFile();
  file.collection({ id: 'C:base', name: 'Brand', modes: [['m:b1', 'Light']] });
  file.variable({ id: 'V:accent', name: 'accent', collection: 'C:base', values: { 'm:b1': rgb(1, 0, 0) } });
  file.variable({ id: 'V:accent2', name: 'accent-2', collection: 'C:base', values: { 'm:b1': alias('V:accent') } });
  const ext = file.collection({ id: 'C:ext', name: 'Sub-brand', modes: [['m:e1', 'Light']], parent: 'C:base' });
  ext.variableOverrides['V:accent'] = { 'm:e1': rgb(0, 1, 0) };
  const env = await boot({ file });
  let list = env.lastList();
  assert.deepEqual(list.collections.map((c) => c.id), ['C:base', 'C:ext']);
  assert.equal(valueOf(list, 'V:accent', 'm:b1', 'C:base').code, 'FF0000');
  assert.equal(valueOf(list, 'V:accent', 'm:e1', 'C:ext').code, '00FF00');
  assert.equal(valueOf(list, 'V:accent2', 'm:e1', 'C:ext').code, '00FF00', 'an alias inside the extension follows its override');
  const r = await env.set('V:accent', 'm:e1', '0000FF', 'C:ext');
  assert.equal(r.result.ok, true);
  list = r.list;
  assert.equal(valueOf(list, 'V:accent', 'm:e1', 'C:ext').code, '0000FF');
  assert.equal(valueOf(list, 'V:accent', 'm:b1', 'C:base').code, 'FF0000');
});

test('failures always answer, with the reason, and write nothing', async () => {
  const env = await boot();
  const cases = [
    [['V:nope', 'm:light', 'FF0000'], 'it is no longer in this file', 'the variable'],
    [['V:space', 'm:light', 'FF0000'], 'it is no longer in this file', 'the variable'],
    [['V:brand', 'm:p1', 'FF0000'], 'that mode is no longer in its collection', 'brand/primary'],
    [['V:brand', 'm:light', 'FF0000', 'C:prim'], 'its collection is no longer in this file', 'brand/primary'],
    [['V:libred', 'm:lib', 'FF0000', 'C:lib'], 'its collection is no longer in this file', 'red/500'],
    [['V:brand', 'm:light', 'GG0000'], '"GG0000" is not a hex code', 'brand/primary'],
    [['V:brand', 'm:light', '0D99F'], '"0D99F" is not a hex code', 'brand/primary'],
  ];
  for (const [args, error, name] of cases) {
    const r = await env.set(...args);
    assert.deepEqual(r.replies.map((m) => m.type), ['vars-list', 'vars-set-result'], args.join(' '));
    assert.deepEqual([r.result.ok, r.result.changed, r.result.error, r.result.name], [false, false, error, name], args.join(' '));
  }
  assert.deepEqual(env.file.writes, []);
  assert.equal(env.undo(), 0);
});

test('a read-only file: Figma refuses the write and the reply carries its message', async () => {
  const env = await boot({ file: themeFile({ readOnly: true }) });
  const r = await env.set('V:brand', 'm:light', 'FF0000');
  assert.equal(r.result.ok, false);
  assert.match(r.result.error, /read-only/);
  assert.equal(env.undo(), 0);
  assert.equal(valueOf(r.list, 'V:brand', 'm:light').code, '0D99FF');
});

test('messages: malformed or unknown ones get no answer; vars-refresh re-reads with reason "refresh"', async () => {
  const env = await boot();
  const before = env.posted.length;
  for (const msg of [null, 'vars-refresh', { type: 'vars-set-color', variableId: 'V:brand', modeId: 'm:light', hex: 'FF0000' },
    { type: 'vars-set-color', variableId: 'V:brand', collectionId: 'C:theme', modeId: 'm:light', hex: 0xff0000 },
    { type: 'kit:resize', width: 1, height: 1 }, { type: 'create-shapes', count: 5 }]) {
    await env.emit(msg);
  }
  assert.equal(env.posted.length, before);
  assert.deepEqual(env.file.writes, []);
  await env.emit({ type: 'vars-refresh' });
  const list = env.lastList();
  assert.equal(list.reason, 'refresh');
  assert.equal(list.collections.length, 2);
});

test('no figma.variables (an editor without them): vars-list says so instead of throwing', async () => {
  const env = await boot({ variables: null });
  const list = env.lastList();
  assert.deepEqual([list.reason, list.collections, list.error], ['load', [], 'this editor has no variables']);
  const r = await env.set('V:brand', 'm:light', 'FF0000');
  assert.deepEqual([r.result.ok, r.result.error], [false, 'this editor has no variables']);
});

test('an empty file: one vars-list with no collections and no error', async () => {
  const env = await boot({ file: makeFile() });
  assert.deepEqual(env.lastList(), { type: 'vars-list', reason: 'load', collections: [], error: null });
});
