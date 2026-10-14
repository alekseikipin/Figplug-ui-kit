// Golden tests for examples/a11y-contrast (the a11y-contrast archetype, PLAN.md §5 item 1).
// They run the example's COMPILED code.js, whole, in a node:vm context the way Figma would, on a
// small page of stub nodes (absolute transforms, fills, opacity, clipping, masks, styled text
// segments), and read the 'contrast-results' message it posts. The scenes pin the domain rules no
// audit can check: a frame's or group's opacity fading the group as a whole, overlapping text
// that is not a backdrop, layers above the text that cover it, clipping, masks, gradients,
// images and unreadable layers, mixed styles and figma.mixed, large text, Display P3, the
// selection round trip and the message contract. Expected ratios come from an independent WCAG
// implementation below, not from the plugin.
// Run: node_modules/.bin/tsc -p examples/a11y-contrast && node --test examples/a11y-contrast/example.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const DIR = new URL('./', import.meta.url);
const CODE_JS = readFileSync(new URL('code.js', DIR), 'utf8');
const CODE_TS = readFileSync(new URL('code.ts', DIR), 'utf8');
const UI_HTML = readFileSync(new URL('ui.html', DIR), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'));

// vm objects have another realm's prototypes, which deepStrictEqual rejects; compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const settle = async (rounds = 6) => { for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve)); };
const MIXED = Symbol('figma.mixed');

// ---- An independent WCAG 2 reference ------------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
/** Relative luminance; the P3 weights are the Y row of Display P3's RGB-to-XYZ (D65) matrix. */
function luminance({ r, g, b }, p3 = false) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [wr, wg, wb] = p3 ? [0.2289746, 0.6917385, 0.0792869] : [0.2126, 0.7152, 0.0722];
  return wr * f(r) + wg * f(g) + wb * f(b);
}
const grey = (v) => ({ r: v, g: v, b: v });
const ratioOf = (a, b, p3 = false) => {
  const [la, lb] = [luminance(a, p3), luminance(b, p3)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const ratio = (hexA, hexB, p3 = false) => ratioOf(hexToRgb(hexA), hexToRgb(hexB), p3);

// ---- The stub scene -------------------------------------------------------------------------------

let nextId = 1;
const solid = (hex, opacity = 1) => ({ type: 'SOLID', visible: true, opacity, blendMode: 'NORMAL', color: hexToRgb(hex) });
const image = () => ({ type: 'IMAGE', visible: true, opacity: 1, blendMode: 'NORMAL', imageHash: 'x', scaleMode: 'FILL' });
const linear = (fromHex, toHex) => ({
  type: 'GRADIENT_LINEAR', visible: true, opacity: 1, blendMode: 'NORMAL',
  gradientTransform: [[1, 0, 0], [0, 1, 0]],
  gradientStops: [{ position: 0, color: { ...hexToRgb(fromHex), a: 1 } }, { position: 1, color: { ...hexToRgb(toHex), a: 1 } }],
});
const shadow = () => ({ type: 'DROP_SHADOW', visible: true, radius: 8, offset: { x: 0, y: 4 }, color: { r: 0, g: 0, b: 0, a: 0.25 }, blendMode: 'NORMAL' });

function corners(t, w, h) {
  const pts = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [t[0][0] * x + t[0][1] * y + t[0][2], t[1][0] * x + t[1][1] * y + t[1][2]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

const CONTAINERS = new Set(['GROUP', 'FRAME', 'COMPONENT', 'INSTANCE', 'SECTION']);

/**
 * A stub node. x and y are absolute (the stub has no relative transforms); rotate is in degrees,
 * about the node's top-left corner, as Figma rotates. renderBounds overrides absoluteRenderBounds
 * (a drop shadow grows it past the layer's box).
 */
function node(type, props = {}, children = []) {
  const { x = 0, y = 0, width = 100, height = 100, rotate = 0, renderBounds, ...rest } = props;
  const rad = (rotate * Math.PI) / 180;
  const n = {
    id: `1:${nextId++}`,
    type,
    name: props.name ?? type,
    visible: true,
    removed: false,
    opacity: 1,
    blendMode: type === 'GROUP' || type === 'FRAME' ? 'PASS_THROUGH' : 'NORMAL',
    isMask: false,
    width,
    height,
    absoluteTransform: [[Math.cos(rad), Math.sin(rad), x], [-Math.sin(rad), Math.cos(rad), y]],
    fills: [],
    strokes: [],
    effects: [],
    parent: null,
    ...rest,
  };
  if (type === 'FRAME') n.clipsContent = rest.clipsContent ?? true;
  if (type !== 'TEXT' && type !== 'ELLIPSE' && n.cornerRadius === undefined) n.cornerRadius = 0;
  if (type === 'ELLIPSE') n.arcData = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0 };
  if (CONTAINERS.has(type)) {
    n.children = children;
    for (const child of children) child.parent = n;
    n.findAllWithCriteria = ({ types }) => {
      const out = [];
      const walk = (list) => { for (const c of list) { if (types.includes(c.type)) out.push(c); if (c.children) walk(c.children); } };
      walk(n.children);
      return out;
    };
  }
  Object.defineProperty(n, 'absoluteBoundingBox', { get: () => corners(n.absoluteTransform, n.width, n.height), enumerable: false });
  Object.defineProperty(n, 'absoluteRenderBounds', { get: () => (n.visible ? renderBounds || corners(n.absoluteTransform, n.width, n.height) : null), enumerable: false });
  return n;
}

/** A text layer: segments are [characters, fills, fontSize?, fontWeight?]; its own fills are figma.mixed when they differ. */
function text(props, segments = [['Label', [solid('#000000')]]]) {
  const segs = [];
  let start = 0;
  for (const [characters, fills, fontSize = 16, fontWeight = 400] of segments) {
    segs.push({ characters, start, end: start + characters.length, fills, fontSize, fontWeight });
    start += characters.length;
  }
  const same = segs.every((s) => JSON.stringify(s.fills) === JSON.stringify(segs[0].fills));
  const n = node('TEXT', { width: 80, height: 20, ...props });
  n.characters = segs.map((s) => s.characters).join('');
  n.fills = same ? segs[0].fills : MIXED;
  n.fontSize = segs.every((s) => s.fontSize === segs[0].fontSize) ? segs[0].fontSize : MIXED;
  n.getStyledTextSegments = (fields) => segs.map((s) => {
    const out = { characters: s.characters, start: s.start, end: s.end };
    for (const f of fields) {
      assert.ok(['fills', 'fontSize', 'fontWeight'].includes(f), `stub: unexpected segment field ${f}`);
      out[f] = s[f];
    }
    return out;
  });
  return n;
}

const card = (children, fill = '#FFFFFF') => node('FRAME', { width: 200, height: 100, fills: [solid(fill)] }, children);

/** Runs the example's code.js on a page; returns the stub, the posted results and helpers. */
function run(children, { select, background = '#FFFFFF', profile = 'SRGB' } = {}) {
  const posted = [];
  const listeners = [];
  const handlers = {};
  const pageHandlers = {};
  const showUI = [];
  const notified = [];
  let timers = [];
  let timerId = 0;
  const pageNode = {
    type: 'PAGE',
    id: '0:1',
    children,
    backgrounds: [solid(background)],
    on: (type, fn) => { pageHandlers[type] = fn; },
    off: (type) => { delete pageHandlers[type]; },
  };
  for (const child of children) child.parent = pageNode;
  let selection = select ?? [];
  Object.defineProperty(pageNode, 'selection', {
    get: () => selection,
    set: (nodes) => { selection = [...nodes]; timers.push({ id: ++timerId, fn: () => handlers.selectionchange && handlers.selectionchange() }); },
  });
  const viewport = { bounds: { x: -1000, y: -1000, width: 4000, height: 4000 }, center: { x: 0, y: 0 }, zoomed: 0, scrollAndZoomIntoView() { this.zoomed++; } };
  const figma = {
    editorType: 'figma',
    mixed: MIXED,
    root: { documentColorProfile: profile },
    currentPage: pageNode,
    viewport,
    skipInvisibleInstanceChildren: false,
    showUI: (html, options) => showUI.push(plain(options)),
    notify: (message, options) => notified.push({ message, options }),
    on: (type, fn) => { handlers[type] = fn; },
    ui: {
      on: (type, fn) => listeners.push(fn),
      off() {},
      postMessage: (msg) => posted.push(plain(msg)),
      resize() {},
      show() {},
    },
    clientStorage: { getAsync: async () => undefined, setAsync: async () => {} },
  };
  const context = vm.createContext({
    figma,
    __html__: '<html></html>',
    console: { warn() {}, log() {}, error() {} },
    setTimeout: (fn) => { timers.push({ id: ++timerId, fn }); return timerId; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
  });
  vm.runInContext(CODE_JS, context, { filename: 'examples/a11y-contrast/code.js' });
  const flush = () => { while (timers.length) timers.shift().fn(); };
  const results = () => posted.filter((m) => m.type === 'contrast-results');
  const last = () => results().at(-1);
  const emit = (msg) => { for (const fn of listeners) fn(msg, { origin: 'null' }); };
  return { figma, page: pageNode, posted, results, last, emit, flush, handlers, pageHandlers, viewport, showUI, notified };
}

const only = (app) => {
  const msg = app.last();
  assert.equal(msg.results.length, 1, JSON.stringify(msg));
  return msg.results[0];
};
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} vs ${expected}`);

// ---- The example's files ----------------------------------------------------------------------------

test('manifest: the example id, dynamic-page, no network, Design, FigJam, Slides and Buzz (no Dev Mode)', () => {
  assert.equal(MANIFEST.name, 'Contrast check (kit example)');
  assert.equal(MANIFEST.id, 'kit-example-a11y-contrast');
  assert.equal(MANIFEST.main, 'code.js');
  assert.equal(MANIFEST.ui, 'ui.html');
  assert.equal(MANIFEST.documentAccess, 'dynamic-page');
  assert.deepEqual(MANIFEST.networkAccess, { allowedDomains: ['none'] });
  assert.deepEqual(MANIFEST.editorType, ['figma', 'figjam', 'slides', 'buzz']);
});

test('the window is fit-content, the plugin answers kit:ready, and ui.html has no HTML comment', async () => {
  assert.match(CODE_TS, /installKitWindow\(\{ mode: 'fit-content'/);
  assert.ok(!UI_HTML.includes('<!' + '--'));
  const app = run([card([])]);
  assert.equal(app.showUI.length, 1);
  assert.equal(app.showUI[0].themeColors, true);
  app.emit({ type: 'kit:ready', protocol: 1 });
  await settle();
  app.flush();
  const init = app.posted.find((m) => m.type === 'kit:init');
  assert.equal(init && init.mode, 'fit-content');
  assert.equal(app.figma.skipInvisibleInstanceChildren, true, 'invisible instance children are skipped');
});

// ---- The maths ----------------------------------------------------------------------------------------

test('black on white is 21:1 and passes; the summary says so', () => {
  const t = text({ x: 10, y: 10 });
  const app = run([card([t])], { select: [t] });
  const r = only(app);
  assert.equal(r.status, 'pass');
  close(r.ratio, 21, 'ratio');
  assert.equal(r.textHex, '#000000');
  assert.equal(r.backgroundHex, '#FFFFFF');
  assert.equal(r.meta, '21.00:1');
  assert.deepEqual(app.last().summary, { tone: 'success', text: 'This text layer meets WCAG AA.' });
});

test('the AA line sits between #777777 (4.48:1, fails) and #767676 (4.54:1, passes); ratios round down', () => {
  const a = text({ x: 10, y: 10, name: 'A' }, [['Body', [solid('#777777')]]]);
  const b = text({ x: 10, y: 50, name: 'B' }, [['Body', [solid('#767676')]]]);
  const app = run([card([a, b])], { select: [a, b] });
  const [first, second] = app.last().results;
  assert.equal(first.name, 'A', 'failing first');
  assert.equal(first.status, 'fail');
  close(first.ratio, ratio('#777777', '#FFFFFF'), 'A');
  assert.equal(first.meta, '4.47:1', 'rounded down, never up to a pass');
  assert.equal(first.verdict, '4.47:1: below AA, which needs 4.5:1 for normal-size text.');
  assert.equal(second.status, 'pass');
  close(second.ratio, ratio('#767676', '#FFFFFF'), 'B');
  assert.deepEqual(app.last().summary, { tone: 'danger', text: '1 of 2 text layers is below WCAG AA.' });
});

test('large text needs 3:1: 24px, or 18.67px bold, but not 18px bold', () => {
  const g = [solid('#949494')]; // about 3.03:1 on white
  const big = text({ x: 0, y: 0, name: 'big' }, [['Title', g, 24, 400]]);
  const bold = text({ x: 0, y: 30, name: 'bold' }, [['Title', g, 18.67, 700]]);
  const small = text({ x: 0, y: 60, name: 'small' }, [['Title', g, 18, 700]]);
  const app = run([card([big, bold, small])], { select: [big, bold, small] });
  const by = Object.fromEntries(app.last().results.map((r) => [r.name, r]));
  assert.deepEqual([by.big.status, by.big.required, by.big.large], ['pass', 3, true]);
  assert.deepEqual([by.bold.status, by.bold.required], ['pass', 3]);
  assert.deepEqual([by.small.status, by.small.required, by.small.large], ['fail', 4.5, false]);
});

test('the fill behind is the sibling rectangle, not the frame', () => {
  const t = text({ x: 20, y: 20 }, [['OK', [solid('#FFFFFF')]]]);
  const button = node('RECTANGLE', { x: 10, y: 10, width: 100, height: 40, fills: [solid('#333333')], cornerRadius: 8 });
  const r = only(run([card([button, t])], { select: [t] }));
  assert.equal(r.status, 'pass');
  close(r.ratio, ratio('#FFFFFF', '#333333'), 'ratio');
  assert.equal(r.backgroundHex, '#333333');
});

test("a group's opacity fades the group as a whole, not each child", () => {
  // White text on a black rectangle, in a group at 50% over a white page: text pixels stay white,
  // the rectangle shows as #808080. Fading each child on its own would give about 2.2:1 instead.
  const t = text({ x: 10, y: 10 }, [['Hi', [solid('#FFFFFF')]]]);
  const group = node('GROUP', { width: 100, height: 40, opacity: 0.5 }, [node('RECTANGLE', { width: 100, height: 40, fills: [solid('#000000')] }), t]);
  const r = only(run([group], { select: [t] }));
  assert.equal(r.textHex, '#FFFFFF');
  assert.equal(r.backgroundHex, '#808080');
  close(r.ratio, ratioOf(grey(1), grey(0.5)), 'ratio');
});

test("a frame's opacity fades its own fill and its text together", () => {
  // Black text on a white frame at 50% over a black page. As a whole: text pixels stay black, the
  // frame shows as #808080, 5.28:1, a pass. Fading the fill and the text one by one would put
  // 25% grey text on 50% grey, 2.6:1, a false failure.
  const t = text({ x: 10, y: 10 });
  const frame = node('FRAME', { width: 200, height: 100, opacity: 0.5, fills: [solid('#FFFFFF')] }, [t]);
  const r = only(run([frame], { select: [t], background: '#000000' }));
  assert.equal(r.status, 'pass');
  assert.equal(r.textHex, '#000000');
  assert.equal(r.backgroundHex, '#808080');
  close(r.ratio, ratioOf(grey(0), grey(0.5)), 'ratio');
  assert.ok(ratioOf(grey(0.25), grey(0.5)) < 4.5, 'the per-child answer would have failed');
});

test('nested opacities multiply on the whole subtree: a 50% group in a 50% frame', () => {
  // White text on a black rectangle in a 50% group, in a 50% frame with no fill, on white: the
  // rectangle shows at 25% (#BFBFBF), the text stays white. 1.83:1.
  const t = text({ x: 10, y: 10 }, [['Hi', [solid('#FFFFFF')]]]);
  const group = node('GROUP', { width: 100, height: 40, opacity: 0.5 }, [node('RECTANGLE', { width: 100, height: 40, fills: [solid('#000000')] }), t]);
  const frame = node('FRAME', { width: 200, height: 100, opacity: 0.5 }, [group]);
  const r = only(run([frame], { select: [t] }));
  assert.equal(r.textHex, '#FFFFFF');
  assert.equal(r.backgroundHex, '#BFBFBF');
  close(r.ratio, ratioOf(grey(1), grey(0.75)), 'ratio');
  assert.equal(r.status, 'fail');
});

test('semi-transparent text is measured as it shows', () => {
  const t = text({ x: 10, y: 10 }, [['Hint', [solid('#000000', 0.5)]]]);
  const r = only(run([card([t])], { select: [t] }));
  assert.equal(r.textHex, '#808080');
  close(r.ratio, ratioOf(grey(0.5), grey(1)), 'ratio');
  assert.equal(r.status, 'fail');
});

test('overlapping sibling text is neither a backdrop nor a cover, selected or not', () => {
  // A big black text layer under the label and another over it: neither paints its whole box.
  const scene = () => {
    const under = text({ x: 0, y: 0, width: 200, height: 60, name: 'under' }, [['Big black words', [solid('#000000')]]]);
    const label = text({ x: 10, y: 10, name: 'label' }, [['Label', [solid('#000000')]]]);
    const over = text({ x: 5, y: 5, width: 150, height: 40, name: 'over' }, [['Overlapping', [solid('#FFFFFF')]]]);
    return { under, label, over, root: card([under, label, over]) };
  };
  const a = scene();
  const alone = only(run([a.root], { select: [a.label] }));
  assert.equal(alone.status, 'pass');
  close(alone.ratio, 21, 'the label alone, against the frame');
  assert.deepEqual(alone.notes, []);

  const b = scene();
  const all = run([b.root], { select: [b.under, b.label, b.over] }).last().results;
  const by = Object.fromEntries(all.map((r) => [r.name, r]));
  close(by.label.ratio, 21, 'label');
  close(by.under.ratio, 21, 'under');
  assert.equal(by.over.status, 'fail', 'white on the white frame, whatever text lies under it');
  close(by.over.ratio, 1, 'over');
});

test('text on a path is not a backdrop either', () => {
  const t = text({ x: 10, y: 10 });
  const onPath = node('TEXT_PATH', { x: 0, y: 0, width: 200, height: 100, fills: [solid('#000000')] });
  const r = only(run([card([onPath, t])], { select: [t] }));
  close(r.ratio, 21, 'the text on a path does not paint its box black');
});

// ---- Layers above the text ---------------------------------------------------------------------------

test('text covered by an opaque layer is not visible, not a 1:1 failure', () => {
  const t = text({ x: 10, y: 10 });
  const cover = node('RECTANGLE', { x: 0, y: 0, width: 200, height: 100, fills: [solid('#FFFFFF')] });
  const app = run([card([t, cover])], { select: [t] });
  const r = only(app);
  assert.equal(r.status, 'hidden');
  assert.equal(r.ratio, null);
  assert.equal(r.meta, '');
  assert.deepEqual(r.notes, ['Not visible on the canvas: a layer above it covers it, or it is at 0% opacity.']);
  assert.deepEqual(app.last().summary, { tone: 'warning', text: 'This text layer is not visible on the canvas.' });
});

test('text partly covered is measured on its visible part only', () => {
  // A black bar over the left half of black text on white: the visible half is 21:1.
  const t = text({ x: 10, y: 10, width: 80 });
  const bar = node('RECTANGLE', { x: 0, y: 0, width: 50, height: 100, fills: [solid('#000000')] });
  const r = only(run([card([t, bar])], { select: [t] }));
  assert.equal(r.status, 'pass');
  close(r.ratio, 21, 'ratio');
  assert.equal(r.backgroundHex, '#FFFFFF');
  assert.ok(r.notes.includes('Part of the text is covered by a layer above it; only the visible part was measured.'), r.notes.join(' | '));
});

test('a semi-transparent layer above the text lowers its contrast', () => {
  // White at 50% over black text on white: the text shows as #808080 on white, 3.98:1.
  const t = text({ x: 10, y: 10 });
  const veil = node('RECTANGLE', { x: 0, y: 0, width: 200, height: 100, fills: [solid('#FFFFFF', 0.5)] });
  const r = only(run([card([t, veil])], { select: [t] }));
  assert.equal(r.status, 'fail');
  assert.equal(r.textHex, '#808080');
  assert.equal(r.backgroundHex, '#FFFFFF');
  close(r.ratio, ratioOf(grey(0.5), grey(1)), 'ratio');
});

test('text at 0% opacity, or in a group at 0%, is not visible', () => {
  const t1 = text({ x: 10, y: 10, opacity: 0 });
  assert.equal(only(run([card([t1])], { select: [t1] })).status, 'hidden');
  const t2 = text({ x: 10, y: 10 });
  const group = node('GROUP', { width: 100, height: 40, opacity: 0 }, [t2]);
  assert.equal(only(run([card([group])], { select: [t2] })).status, 'hidden');
});

// ---- Clipping, masks, shapes, gradients, images -----------------------------------------------------

test('clipping: a clipped-away rectangle is not behind the text, and clipped-away text is not visible', () => {
  const t = text({ x: 10, y: 10 });
  const clipped = node('FRAME', { x: 300, y: 0, width: 50, height: 50, fills: [] }, [node('RECTANGLE', { x: 0, y: 0, width: 400, height: 100, fills: [solid('#000000')] })]);
  const r = only(run([card([clipped, t])], { select: [t] }));
  close(r.ratio, 21, 'the black rectangle is clipped to its frame at x 300');

  const lost = text({ x: 200, y: 200 });
  const box = node('FRAME', { width: 100, height: 100, fills: [solid('#FFFFFF')] }, [lost]);
  const hidden = only(run([box], { select: [lost] }));
  assert.equal(hidden.status, 'hidden');
  assert.equal(hidden.ratio, null);
  assert.deepEqual(hidden.notes, ['Not visible on the canvas: the layer or a parent is hidden, clipped or masked.']);
});

test('a mask hides the layers above it outside its shape', () => {
  const mask = node('RECTANGLE', { x: 300, y: 0, width: 50, height: 50, fills: [solid('#000000')], isMask: true });
  const dark = node('RECTANGLE', { x: 0, y: 0, width: 400, height: 100, fills: [solid('#000000')] });
  const t = text({ x: 10, y: 10 });
  const r = only(run([node('GROUP', { width: 400, height: 100 }, [mask, dark]), t], { select: [t] }));
  close(r.ratio, 21, 'the dark rectangle only shows inside the mask');
});

test('an ellipse covers only its oval, not its corners', () => {
  const t = text({ x: 0, y: 0, width: 10, height: 10 });
  const r = only(run([node('ELLIPSE', { width: 100, height: 100, fills: [solid('#000000')] }), t], { select: [t] }));
  assert.equal(r.status, 'pass', 'the text sits in the corner, outside the oval');
});

test('gradients are sampled where the text sits; the lowest point decides', () => {
  const t = text({ x: 0, y: 0, width: 200, height: 20 });
  const r = only(run([node('RECTANGLE', { width: 200, height: 20, fills: [linear('#000000', '#FFFFFF')] }), t], { select: [t] }));
  assert.equal(r.status, 'fail');
  assert.ok(r.ratio < 1.5, `near the black end: ${r.ratio}`);
});

test('an image behind the text cannot be measured, unless something opaque covers it', () => {
  const t = text({ x: 10, y: 10 });
  const bare = only(run([node('RECTANGLE', { width: 200, height: 100, fills: [image()] }), t], { select: [t] }));
  assert.equal(bare.status, 'unknown');
  assert.match(bare.notes.join(' '), /image/);

  const t2 = text({ x: 10, y: 10 });
  const covered = only(run([node('RECTANGLE', { width: 200, height: 100, fills: [image(), solid('#FFFFFF')] }), t2], { select: [t2] }));
  assert.equal(covered.status, 'pass');
});

test('media, embeds and widgets are opaque and unreadable: check by eye behind, not visible under', () => {
  for (const type of ['MEDIA', 'EMBED', 'LINK_UNFURL', 'WIDGET', 'CODE_BLOCK']) {
    const t = text({ x: 10, y: 10 });
    const media = node(type, { x: 0, y: 0, width: 200, height: 100 });
    const app = run([card([media, t])], { select: [t] });
    assert.equal(only(app).status, 'unknown', `${type} behind the text`);
    assert.deepEqual(app.last().summary, { tone: 'warning', text: 'This text layer could not be measured. Check it by eye.' });

    const t2 = text({ x: 10, y: 10 });
    const above = node(type, { x: 0, y: 0, width: 200, height: 100 });
    assert.equal(only(run([card([t2, above])], { select: [t2] })).status, 'hidden', `${type} above the text`);
  }
});

// ---- Text styles and bounds -------------------------------------------------------------------------

test('mixed styles (figma.mixed fills and sizes): the worst one decides, and the note says how many', () => {
  const t = text({ x: 10, y: 10 }, [['Dark ', [solid('#000000')], 24], ['light', [solid('#CCCCCC')], 12]]);
  assert.equal(t.fills, MIXED);
  assert.equal(t.fontSize, MIXED);
  const r = only(run([card([t])], { select: [t] }));
  assert.equal(r.status, 'fail');
  assert.equal(r.textHex, '#CCCCCC');
  assert.equal(r.required, 4.5);
  assert.equal(r.styles, 2);
  assert.ok(r.notes.includes('Lowest of 2 text styles in this layer.'));
});

test('a style with no visible fill, and a layer of only spaces, are not measured', () => {
  const blank = text({ x: 10, y: 10 }, [['   ', [solid('#000000')]]]);
  const r1 = only(run([card([blank])], { select: [blank] }));
  assert.deepEqual([r1.status, r1.notes], ['unknown', ['The layer has no visible characters.']]);
  const noFill = text({ x: 10, y: 10 }, [['Ghost', []]]);
  const r2 = only(run([card([noFill])], { select: [noFill] }));
  assert.deepEqual([r2.status, r2.notes], ['unknown', ['The text has no visible fill.']]);
});

test('rotated text is sampled in its own box', () => {
  // Rotated 90 degrees about (100, 100): the box runs upward from there, over the dark strip.
  const t = text({ x: 100, y: 100, width: 80, height: 20, rotate: 90 }, [['Up', [solid('#FFFFFF')]]]);
  const strip = node('RECTANGLE', { x: 95, y: 0, width: 30, height: 100, fills: [solid('#000000')] });
  const r = only(run([node('FRAME', { width: 300, height: 300, fills: [solid('#FFFFFF')] }, [strip, t])], { select: [t] }));
  close(r.ratio, 21, 'white on the black strip');
});

test("a drop shadow's wider render bounds don't move the samples off the text", () => {
  // White text on a dark card. The shadow grows the render bounds 30px to the right, over the
  // white page, where no glyph is: sampling there would report white on white.
  const t = text({ x: 10, y: 10, width: 80, height: 20, effects: [shadow()], renderBounds: { x: 10, y: 10, width: 110, height: 24 } }, [['Shadowed', [solid('#FFFFFF')]]]);
  const darkCard = node('RECTANGLE', { width: 100, height: 40, fills: [solid('#000000')] });
  const r = only(run([darkCard, t], { select: [t] }));
  assert.equal(r.status, 'pass');
  close(r.ratio, 21, 'white on the black card');
});

test('Display P3 files use P3 luminance', () => {
  const make = () => text({ x: 10, y: 10 }, [['Body', [solid('#00AA00')]]]);
  const t1 = make();
  const srgb = only(run([card([t1])], { select: [t1] }));
  const t2 = make();
  const p3 = only(run([card([t2])], { select: [t2], profile: 'DISPLAY_P3' }));
  close(srgb.ratio, ratio('#00AA00', '#FFFFFF'), 'sRGB');
  close(p3.ratio, ratio('#00AA00', '#FFFFFF', true), 'P3');
  assert.ok(p3.ratio > srgb.ratio, "P3's green primary carries less luminance than sRGB's");
});

// ---- Selection, summary and messages ------------------------------------------------------------------

test('selecting a frame checks its shown text layers; hidden ones are skipped', () => {
  const shown = text({ x: 10, y: 10, name: 'shown' });
  const hidden = text({ x: 10, y: 40, name: 'hidden', visible: false });
  const inHidden = text({ x: 10, y: 60, name: 'in hidden group' });
  const frame = card([shown, hidden, node('GROUP', { visible: false }, [inHidden])]);
  const app = run([frame], { select: [frame] });
  assert.equal(app.last().selection, 1);
  assert.equal(app.last().found, 1);
  assert.equal(only(app).name, 'shown');
});

test('nothing selected, or no text: an empty result and no summary', () => {
  const none = run([node('RECTANGLE', { fills: [solid('#000000')] })]);
  assert.deepEqual([none.last().selection, none.last().results, none.last().summary], [0, [], null]);
  const rect = node('RECTANGLE', { fills: [solid('#000000')] });
  const noText = run([rect], { select: [rect] });
  assert.deepEqual([noText.last().selection, noText.last().found, noText.last().summary], [1, 0, null]);
});

test('the summary tells failures, unmeasured and invisible layers apart', () => {
  const fail = text({ x: 10, y: 10, name: 'fail' }, [['Pale', [solid('#CCCCCC')]]]);
  const pass = text({ x: 10, y: 40, name: 'pass' });
  const onImage = text({ x: 110, y: 10, name: 'on image' });
  const coveredText = text({ x: 110, y: 60, name: 'covered' });
  const photo = node('RECTANGLE', { x: 100, y: 0, width: 100, height: 40, fills: [image()] });
  const lid = node('RECTANGLE', { x: 100, y: 50, width: 100, height: 50, fills: [solid('#EEEEEE')] });
  const app = run([card([photo, fail, pass, onImage, coveredText, lid])], { select: [fail, pass, onImage, coveredText] });
  assert.deepEqual(app.last().results.map((r) => [r.name, r.status]), [['fail', 'fail'], ['on image', 'unknown'], ['covered', 'hidden'], ['pass', 'pass']]);
  assert.deepEqual(app.last().summary, { tone: 'danger', text: '1 of 4 text layers is below WCAG AA. 1 could not be measured. Check it by eye. 1 is not visible.' });

  const ok = text({ x: 10, y: 40, name: 'ok' });
  const lost = text({ x: 110, y: 60, name: 'lost' });
  const lid2 = node('RECTANGLE', { x: 100, y: 50, width: 100, height: 50, fills: [solid('#EEEEEE')] });
  const app2 = run([card([ok, lost, lid2])], { select: [ok, lost] });
  assert.deepEqual(app2.last().summary, { tone: 'warning', text: '1 meets WCAG AA. 1 is not visible.' });
});

test('Select failing selects on the canvas and keeps the list; a new selection re-checks', () => {
  const a = text({ x: 10, y: 10, name: 'A' }, [['Body', [solid('#AAAAAA')]]]);
  const b = text({ x: 10, y: 50, name: 'B' });
  const app = run([card([a, b])], { select: [a, b] });
  const before = app.results().length;
  app.emit({ type: 'contrast-select', ids: [a.id, 'nope'] });
  assert.deepEqual(app.page.selection.map((n) => n.id), [a.id]);
  app.flush(); // delivers selectionchange
  assert.equal(app.results().length, before, "the plugin's own selection does not replace the list");

  app.page.selection = [b]; // the person selects something else
  app.flush();
  assert.equal(app.results().length, before + 1);
  assert.equal(only(app).name, 'B');
});

test('a viewport that cannot scroll leaves the selection made and the list in place', () => {
  const a = text({ x: 10, y: 10, name: 'A' }, [['Body', [solid('#AAAAAA')]]]);
  const b = text({ x: 10, y: 50, name: 'B' });
  const app = run([card([a, b])], { select: [a, b] });
  Object.defineProperty(app.viewport, 'bounds', { get() { throw new Error('no viewport here'); } });
  const before = app.results().length;
  app.emit({ type: 'contrast-select', ids: [b.id] });
  assert.deepEqual(app.page.selection.map((n) => n.id), [b.id]);
  app.flush();
  assert.equal(app.results().length, before, 'still the plugin\'s own selection');
  assert.deepEqual(app.notified, []);
});

test('edits re-check the same selection, and junk messages are ignored', () => {
  const fill = [solid('#AAAAAA')];
  const t = text({ x: 10, y: 10 }, [['Body', fill]]);
  const app = run([card([t])], { select: [t] });
  assert.equal(only(app).status, 'fail');
  fill[0] = solid('#222222'); // the person fixes the colour
  app.pageHandlers.nodechange({ nodeChanges: [] });
  app.flush();
  assert.equal(only(app).status, 'pass');

  const count = app.posted.length;
  for (const junk of [null, 'x', 42, { type: 'contrast-select', ids: [1] }, { type: 'contrast-select' }, { type: 'kit:resize' }, { type: 'other' }]) app.emit(junk);
  assert.equal(app.posted.length, count);
  app.emit({ type: 'contrast-check' });
  assert.equal(app.posted.length, count + 1, 'Check again always answers');
});

test('the results message is plain data with the shape the UI reads', () => {
  const t = text({ x: 10, y: 10, name: 'Caption' }, [['Fine print', [solid('#999999')]]]);
  const msg = run([card([t])], { select: [t] }).last();
  assert.deepEqual(Object.keys(msg).sort(), ['error', 'found', 'results', 'selection', 'summary', 'type']);
  assert.deepEqual(Object.keys(msg.results[0]).sort(), ['backgroundHex', 'colors', 'excerpt', 'id', 'large', 'meta', 'name', 'notes', 'ratio', 'required', 'status', 'styles', 'textHex', 'verdict']);
  assert.deepEqual(msg.results[0], {
    id: t.id, name: 'Caption', excerpt: 'Fine print', status: 'fail', ratio: msg.results[0].ratio, required: 4.5, large: false,
    textHex: '#999999', backgroundHex: '#FFFFFF', styles: 1, notes: [], meta: '2.84:1',
    verdict: '2.84:1: below AA, which needs 4.5:1 for normal-size text.', colors: 'Text #999999 on #FFFFFF, as they show on the canvas.',
  });
  close(msg.results[0].ratio, ratio('#999999', '#FFFFFF'), 'ratio');
});
