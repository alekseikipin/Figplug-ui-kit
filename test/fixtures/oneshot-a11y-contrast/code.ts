// Regression fixture from the Phase 1 one-shot run "a11y-contrast" (docs/prompts.md). The kit:window block
// is cut to a stand-in; everything after it is the plugin code the agent wrote, verbatim.
const KIT_PROTOCOL = 1;
// ==== kit:window:end ====

// ---- Your plugin starts here ----
// Contrast check. Measures every selected text layer (and the text inside selected frames)
// against the fills painted behind it, and flags anything below WCAG 2.1 AA: 4.5:1 for normal
// text, 3:1 for large text (24px and up, or 18.66px and up at weight 700 or more). All document
// reads happen here; the UI gets plain data back and only renders it.

installKitWindow({ mode: 'fit-content', size: { width: 360 } });

// Invisible layers inside instances are never shown, so skipping them makes findAll much faster.
figma.skipInvisibleInstanceChildren = true;

// A huge frame must not freeze the file: at most this many text layers per check.
const CONTRAST_LIMIT = 300;
// Gradients multiply the candidate colours; this many are kept per stack.
const CONTRAST_MAX_SAMPLES = 32;
const CONTRAST_AA_TEXT = 4.5;
const CONTRAST_AA_LARGE = 3;
// WCAG's large text: 18pt (24px), or 14pt (18.66px) bold.
const CONTRAST_LARGE_SIZE = 24;
const CONTRAST_LARGE_BOLD_SIZE = 18.66;
const CONTRAST_BOLD_WEIGHT = 700;
const CONTRAST_SELECTION_DELAY_MS = 80;
const CONTRAST_EDIT_DELAY_MS = 400;
// Slack for floating-point noise in bounding boxes, in px.
const CONTRAST_EPSILON = 0.5;
// Layer types whose fill covers their whole box (corner radius aside).
const CONTRAST_BOX_TYPES: ReadonlyArray<string> = ['RECTANGLE', 'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'];
const CONTRAST_CLEAR: RGBA = { r: 0, g: 0, b: 0, a: 0 };
const CONTRAST_WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const CONTRAST_EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 };

type ContrastStatus = 'pass' | 'fail' | 'check';
// Context for a result; the UI owns the wording. The ones in CONTRAST_MANUAL turn a result into
// "check by eye", because the maths can't see what the person sees.
type ContrastNote =
  | 'canvas' | 'partial' | 'gradient' | 'image' | 'blend' | 'mixed-styles'
  | 'text-gradient' | 'text-image' | 'no-fill';
const CONTRAST_MANUAL: ReadonlyArray<ContrastNote> = ['gradient', 'image', 'blend', 'text-gradient', 'text-image', 'no-fill'];

/** One text layer's result, sent to the UI as plain data. */
interface ContrastItem {
  id: string;
  name: string;
  status: ContrastStatus;
  /** The lowest ratio found, or null when nothing could be measured. */
  ratio: number | null;
  /** The highest ratio found; above `ratio` only over gradients or partial layers. */
  maxRatio: number | null;
  required: number;
  large: boolean;
  fontSize: number;
  fontWeight: number;
  /** The text and background as rendered (opacity included) for the lowest ratio. */
  textHex: string | null;
  backgroundHex: string | null;
  notes: ContrastNote[];
}

/** main -> UI: the result of one check. */
interface ContrastReportMessage {
  type: 'contrast-report';
  /** Layers in the selection that was checked. */
  selected: number;
  /** Hidden, empty or fully clipped text layers that were left out. */
  skipped: number;
  truncated: boolean;
  limit: number;
  items: ContrastItem[];
}

/** Something painted behind the text, bottom to top. */
type ContrastStep =
  | { kind: 'fill'; paints: ReadonlyArray<Paint>; opacity: number; blend: boolean; partial: boolean }
  | { kind: 'unknown' };

/** A stack of paints flattened to the colours it can show. */
interface ContrastFlat {
  colors: RGBA[];
  gradient: boolean;
  image: boolean;
  blend: boolean;
}

// ---- colour maths ----

/** Source-over compositing with straight alpha, as Figma blends NORMAL paints. */
function contrastOver(bottom: RGBA, top: RGBA): RGBA {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return CONTRAST_CLEAR;
  const mix = (t: number, b: number): number => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

function contrastByte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function contrastHex(color: RGB): string {
  return '#' + [color.r, color.g, color.b]
    .map((value) => contrastByte(value).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}

function contrastKey(color: RGBA): string {
  return contrastHex(color) + contrastByte(color.a);
}

/** WCAG 2.x relative luminance of the 8-bit colour that is actually displayed. */
function contrastLuminance(color: RGB): number {
  const channel = (value: number): number => {
    const s = contrastByte(value) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = contrastLuminance(a);
  const lb = contrastLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Drops duplicates and keeps an even spread by luminance, so the darkest and lightest survive. */
function contrastLimit(colors: RGBA[]): RGBA[] {
  const seen = new Set<string>();
  const unique: RGBA[] = [];
  for (const color of colors) {
    const key = contrastKey(color);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(color);
  }
  if (unique.length <= CONTRAST_MAX_SAMPLES) return unique;
  unique.sort((x, y) => contrastLuminance(x) - contrastLuminance(y));
  const kept: RGBA[] = [];
  for (let i = 0; i < CONTRAST_MAX_SAMPLES; i++) {
    kept.push(unique[Math.round((i * (unique.length - 1)) / (CONTRAST_MAX_SAMPLES - 1))]);
  }
  return kept;
}

/** Every top colour over every bottom colour. */
function contrastCombine(bottoms: RGBA[], tops: RGBA[]): RGBA[] {
  const out: RGBA[] = [];
  for (const bottom of bottoms) for (const top of tops) out.push(contrastOver(bottom, top));
  return contrastLimit(out);
}

/**
 * A gradient's stops plus three points between each pair, so a black-to-white gradient also
 * yields the greys in between (text can match one of them even when both ends pass).
 */
function contrastGradientSamples(stops: ReadonlyArray<ColorStop>, alpha: number): RGBA[] {
  const sorted = stops.slice().sort((x, y) => x.position - y.position);
  const out: RGBA[] = [];
  const at = (from: RGBA, to: RGBA, t: number): RGBA => ({
    r: from.r + (to.r - from.r) * t, g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t, a: (from.a + (to.a - from.a) * t) * alpha,
  });
  sorted.forEach((stop, i) => {
    out.push(at(stop.color, stop.color, 0));
    const next = sorted[i + 1];
    if (next) for (const t of [0.25, 0.5, 0.75]) out.push(at(stop.color, next.color, t));
  });
  return contrastLimit(out);
}

function contrastIsBlendMode(mode: BlendMode | undefined): boolean {
  return mode !== undefined && mode !== 'NORMAL' && mode !== 'PASS_THROUGH';
}

/**
 * Flattens one layer's paints over transparency. Paints are stored bottom to top, like children:
 * the last one is drawn on top. A gradient counts with each of its stops; an image, video,
 * pattern or shader can't be read, so it is only flagged.
 */
function contrastFlatten(paints: ReadonlyArray<Paint>, opacity: number): ContrastFlat {
  let colors: RGBA[] = [CONTRAST_CLEAR];
  let gradient = false;
  let image = false;
  let blend = false;
  for (const paint of paints) {
    const alpha = paint.opacity === undefined ? 1 : paint.opacity;
    if (paint.visible === false || alpha <= 0) continue;
    const blended = contrastIsBlendMode(paint.blendMode);
    if (paint.type === 'SOLID') {
      const top: RGBA = { r: paint.color.r, g: paint.color.g, b: paint.color.b, a: alpha };
      colors = colors.map((color) => contrastOver(color, top));
      // An opaque solid hides every paint below it in this layer.
      if (alpha >= 0.999 && !blended) {
        gradient = false;
        image = false;
        blend = false;
      }
    } else if ('gradientStops' in paint) {
      const stops = contrastGradientSamples(paint.gradientStops, alpha);
      if (stops.length > 0) {
        colors = contrastCombine(colors, stops);
        if (stops.every((stop) => stop.a >= 0.999) && !blended) image = false;
        gradient = true;
      }
    } else {
      image = true;
    }
    if (blended) blend = true;
  }
  return { colors: colors.map((color) => ({ ...color, a: color.a * opacity })), gradient, image, blend };
}

// ---- geometry ----

function contrastIntersect(a: Rect, clip: Rect | undefined): Rect | null {
  if (!clip) return a;
  const x = Math.max(a.x, clip.x);
  const y = Math.max(a.y, clip.y);
  const right = Math.min(a.x + a.width, clip.x + clip.width);
  const bottom = Math.min(a.y + a.height, clip.y + clip.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function contrastOverlaps(a: Rect, b: Rect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > CONTRAST_EPSILON &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > CONTRAST_EPSILON;
}

function contrastContains(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x + CONTRAST_EPSILON && outer.y <= inner.y + CONTRAST_EPSILON &&
    outer.x + outer.width >= inner.x + inner.width - CONTRAST_EPSILON &&
    outer.y + outer.height >= inner.y + inner.height - CONTRAST_EPSILON;
}

function contrastBox(node: SceneNode): Rect | null {
  return 'absoluteBoundingBox' in node ? node.absoluteBoundingBox : null;
}

function contrastOpacity(node: SceneNode): number {
  return 'opacity' in node ? node.opacity : 1;
}

function contrastClips(node: SceneNode): boolean {
  return 'clipsContent' in node && node.clipsContent === true;
}

/** True when the node's fill covers the whole of `textRect`, not just its bounding box. */
function contrastCovers(node: SceneNode, visibleBox: Rect, textRect: Rect): boolean {
  if (CONTRAST_BOX_TYPES.indexOf(node.type) < 0 || !('absoluteTransform' in node)) return false;
  const [[a, c], [b, d]] = node.absoluteTransform;
  // Rotated by something other than a quarter turn: the box is wider than the shape.
  const axisAligned = (Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6) || (Math.abs(a) < 1e-6 && Math.abs(d) < 1e-6);
  return axisAligned && contrastContains(visibleBox, textRect);
}

// ---- what is behind a text layer ----

function contrastIsShown(node: SceneNode): boolean {
  for (let current: BaseNode | null = node; current && current.type !== 'PAGE' && current.type !== 'DOCUMENT'; current = current.parent) {
    if ('visible' in current && !current.visible) return false;
  }
  return true;
}

function contrastPageOf(node: BaseNode): PageNode | null {
  for (let current: BaseNode | null = node; current; current = current.parent) {
    if (current.type === 'PAGE') return current;
  }
  return null;
}

/** The glyphs' ink, cut to the text box and to every clipping frame above it; null if none shows. */
function contrastTextRect(text: TextNode): Rect | null {
  const box = text.absoluteBoundingBox;
  if (!box) return null;
  let rect: Rect | null = (text.absoluteRenderBounds && contrastIntersect(text.absoluteRenderBounds, box)) || box;
  for (let parent = text.parent; parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT'; parent = parent.parent) {
    const scene = parent as SceneNode;
    const clip = contrastClips(scene) ? contrastBox(scene) : null;
    if (clip) rect = contrastIntersect(rect, clip);
    if (!rect) return null;
  }
  return rect;
}

function contrastAddFills(node: SceneNode, visibleBox: Rect, textRect: Rect, opacity: number, steps: ContrastStep[]): void {
  if (!('fills' in node) || !contrastOverlaps(visibleBox, textRect)) return;
  const fills = node.fills;
  // Only text has mixed fills, and text never covers a whole box.
  if (fills === figma.mixed) {
    steps.push({ kind: 'unknown' });
    return;
  }
  if (!fills.some((paint) => paint.visible !== false && paint.opacity !== 0)) return;
  steps.push({
    kind: 'fill',
    paints: fills,
    opacity,
    blend: contrastIsBlendMode('blendMode' in node ? node.blendMode : undefined),
    partial: !contrastCovers(node, visibleBox, textRect),
  });
}

/** Walks children[0 .. end) in paint order; returns the clip that applies after them (masks). */
function contrastWalk(children: ReadonlyArray<SceneNode>, end: number, clip: Rect | undefined, opacity: number, textRect: Rect, steps: ContrastStep[]): Rect | undefined {
  let siblingClip = clip;
  for (let i = 0; i < end; i++) {
    const child = children[i];
    if ('isMask' in child && child.isMask) {
      // A mask is not painted; it clips the layers above it in the same parent to its box.
      const box = child.visible ? contrastBox(child) : null;
      if (box) siblingClip = contrastIntersect(box, siblingClip) || CONTRAST_EMPTY;
      continue;
    }
    contrastCollect(child, siblingClip, opacity, textRect, steps);
  }
  return siblingClip;
}

function contrastCollect(node: SceneNode, clip: Rect | undefined, opacity: number, textRect: Rect, steps: ContrastStep[]): void {
  if (!node.visible) return;
  const own = opacity * contrastOpacity(node);
  if (own <= 0) return;
  const box = contrastBox(node);
  const visibleBox = box ? contrastIntersect(box, clip) : null;
  const overlaps = visibleBox !== null && contrastOverlaps(visibleBox, textRect);
  if (visibleBox && overlaps) contrastAddFills(node, visibleBox, textRect, own, steps);
  // A boolean's children are its geometry, painted with the boolean's own fills.
  if (!('children' in node) || node.type === 'BOOLEAN_OPERATION') return;
  const clips = contrastClips(node);
  // A group's box wraps its children and a clipping frame cuts them to its box, so when that
  // box misses the text nothing inside it can be behind the text.
  if (!overlaps && (clips || node.type === 'GROUP')) return;
  contrastWalk(node.children, node.children.length, clips ? visibleBox || CONTRAST_EMPTY : clip, own, textRect, steps);
}

/** Everything painted before the text that overlaps it, bottom to top, and the text's opacity. */
function contrastSteps(text: TextNode, textRect: Rect): { steps: ContrastStep[]; opacity: number } {
  const path: BaseNode[] = [];
  for (let node: BaseNode | null = text; node && node.type !== 'DOCUMENT'; node = node.parent) path.unshift(node);
  const steps: ContrastStep[] = [];
  let clip: Rect | undefined;
  let opacity = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const container = path[i];
    if (container.type !== 'PAGE') {
      // An ancestor paints its own fills under its children.
      const scene = container as SceneNode;
      opacity *= contrastOpacity(scene);
      const box = contrastBox(scene);
      const visibleBox = box ? contrastIntersect(box, clip) : null;
      if (visibleBox) contrastAddFills(scene, visibleBox, textRect, opacity, steps);
      if (box && contrastClips(scene)) clip = visibleBox || CONTRAST_EMPTY;
    }
    if (!('children' in container) || container.type === 'DOCUMENT') break;
    const children: ReadonlyArray<SceneNode> = container.children;
    clip = contrastWalk(children, children.indexOf(path[i + 1] as SceneNode), clip, opacity, textRect, steps);
  }
  return { steps, opacity: opacity * text.opacity };
}

/** The opaque colours that can be behind the text, starting from the canvas. */
function contrastBackdrop(steps: ContrastStep[]): { colors: RGBA[]; notes: Set<ContrastNote> } {
  const canvas = contrastFlatten(figma.currentPage.backgrounds, 1);
  let colors = contrastCombine([CONTRAST_WHITE], canvas.colors);
  const notes = new Set<ContrastNote>();
  let covered = false;
  for (const step of steps) {
    if (step.kind === 'unknown') {
      notes.add('partial');
      continue;
    }
    const flat = contrastFlatten(step.paints, step.opacity);
    if (!flat.image && flat.colors.every((color) => color.a <= 0)) continue;
    if (step.partial) {
      // Only part of the text is over this layer: keep both cases, and say so only when the
      // layer actually changes the colour.
      const over = contrastCombine(colors, flat.colors);
      const known = new Set(colors.map(contrastKey));
      if (flat.image || over.some((color) => !known.has(contrastKey(color)))) notes.add('partial');
      colors = contrastLimit(colors.concat(over));
      continue;
    }
    covered = true;
    const blend = step.blend || flat.blend;
    if (!flat.image && !blend && flat.colors.every((color) => color.a >= 0.999)) {
      // Opaque and covering: nothing below it shows any more.
      notes.clear();
      colors = flat.colors;
    } else {
      colors = contrastCombine(colors, flat.colors);
    }
    if (flat.gradient) notes.add('gradient');
    if (flat.image) notes.add('image');
    if (blend) notes.add('blend');
  }
  if (!covered) notes.add('canvas');
  return { colors, notes };
}

function contrastFormatSize(size: number): number {
  return Math.round(size * 100) / 100;
}

/** Measures one text layer, or returns null when none of it is visible. */
function contrastAnalyse(text: TextNode): ContrastItem | null {
  const textRect = contrastTextRect(text);
  if (!textRect) return null;
  const { steps, opacity } = contrastSteps(text, textRect);
  const backdrop = contrastBackdrop(steps);
  const notes = backdrop.notes;
  if (contrastIsBlendMode(text.blendMode)) notes.add('blend');

  const segments = text.getStyledTextSegments(['fills', 'fontSize', 'fontWeight'])
    .filter((segment) => segment.characters.trim() !== '');
  if (segments.length > 1) notes.add('mixed-styles');

  let worst: {
    score: number; ratio: number; maxRatio: number; required: number; large: boolean;
    fontSize: number; fontWeight: number; textHex: string; backgroundHex: string;
  } | null = null;
  let fallback = segments[0];
  for (const segment of segments) {
    const flat = contrastFlatten(segment.fills, opacity);
    if (flat.image) notes.add('text-image');
    if (flat.gradient) notes.add('text-gradient');
    if (flat.blend) notes.add('blend');
    const inks = flat.colors.filter((color) => color.a > 0);
    if (inks.length === 0) continue;
    const large = segment.fontSize >= CONTRAST_LARGE_SIZE ||
      (segment.fontSize >= CONTRAST_LARGE_BOLD_SIZE && segment.fontWeight >= CONTRAST_BOLD_WEIGHT);
    const required = large ? CONTRAST_AA_LARGE : CONTRAST_AA_TEXT;
    let min = Infinity;
    let max = 0;
    let minInk = inks[0];
    let minBackground = backdrop.colors[0];
    for (const background of backdrop.colors) {
      for (const ink of inks) {
        const shown = contrastOver(background, ink);
        const ratio = contrastRatio(shown, background);
        if (ratio < min) {
          min = ratio;
          minInk = shown;
          minBackground = background;
        }
        if (ratio > max) max = ratio;
      }
    }
    const score = min / required;
    if (!worst || score < worst.score) {
      worst = {
        score, ratio: min, maxRatio: max, required, large,
        fontSize: contrastFormatSize(segment.fontSize), fontWeight: segment.fontWeight,
        textHex: contrastHex(minInk), backgroundHex: contrastHex(minBackground),
      };
    }
    fallback = segment;
  }

  if (!worst) {
    if (!notes.has('text-image')) notes.add('no-fill');
    const size = fallback ? fallback.fontSize : CONTRAST_LARGE_SIZE;
    const weight = fallback ? fallback.fontWeight : 400;
    const large = size >= CONTRAST_LARGE_SIZE || (size >= CONTRAST_LARGE_BOLD_SIZE && weight >= CONTRAST_BOLD_WEIGHT);
    return {
      id: text.id, name: text.name, status: 'check', ratio: null, maxRatio: null,
      required: large ? CONTRAST_AA_LARGE : CONTRAST_AA_TEXT, large,
      fontSize: contrastFormatSize(size), fontWeight: weight,
      textHex: null, backgroundHex: null, notes: Array.from(notes),
    };
  }
  const passes = worst.ratio >= worst.required;
  // A partial layer is counted both ways, so a pass holds; a fail may sit where no glyph is.
  const manual = CONTRAST_MANUAL.some((note) => notes.has(note)) || (!passes && notes.has('partial'));
  return {
    id: text.id,
    name: text.name,
    status: manual ? 'check' : passes ? 'pass' : 'fail',
    ratio: worst.ratio,
    maxRatio: worst.maxRatio,
    required: worst.required,
    large: worst.large,
    fontSize: worst.fontSize,
    fontWeight: worst.fontWeight,
    textHex: worst.textHex,
    backgroundHex: worst.backgroundHex,
    notes: Array.from(notes),
  };
}

const CONTRAST_ORDER: { [status in ContrastStatus]: number } = { fail: 0, check: 1, pass: 2 };

function contrastReport(roots: SceneNode[]): ContrastReportMessage {
  const seen = new Set<string>();
  const texts: TextNode[] = [];
  let skipped = 0;
  let truncated = false;
  const add = (node: TextNode): void => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if (!contrastIsShown(node) || node.characters.trim() === '') {
      skipped++;
      return;
    }
    if (texts.length >= CONTRAST_LIMIT) truncated = true;
    else texts.push(node);
  };
  for (const root of roots) {
    if (truncated) break;
    if (root.type === 'TEXT') add(root);
    else if ('findAllWithCriteria' in root) {
      for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) add(node as TextNode);
    }
  }

  const items: ContrastItem[] = [];
  for (const text of texts) {
    try {
      const item = contrastAnalyse(text);
      if (item) items.push(item);
      else skipped++;
    } catch (error) {
      // One odd layer must not lose the whole report.
      console.warn('contrast check skipped ' + text.name + ': ' + String(error));
      skipped++;
    }
  }
  const score = (item: ContrastItem): number => (item.ratio === null ? 0 : item.ratio / item.required);
  items.sort((a, b) => CONTRAST_ORDER[a.status] - CONTRAST_ORDER[b.status] || score(a) - score(b));
  return { type: 'contrast-report', selected: roots.length, skipped, truncated, limit: CONTRAST_LIMIT, items };
}

// ---- wiring ----

// The layers the list is about: the selection, kept while the plugin itself selects one row's
// layer, so the list does not collapse to that one layer.
let contrastTargets: string[] = figma.currentPage.selection.map((node) => node.id);
let contrastOwnSelection: string | null = null;
let contrastTimer: number | undefined;
let contrastRun = 0;
let contrastPage: PageNode = figma.currentPage;

function contrastErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function contrastCheck(): Promise<void> {
  const run = ++contrastRun;
  try {
    const nodes = await Promise.all(contrastTargets.map((id) => figma.getNodeByIdAsync(id)));
    // A newer check started meanwhile; it answers the UI instead.
    if (run !== contrastRun) return;
    const roots: SceneNode[] = [];
    for (const node of nodes) {
      if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') continue;
      const page = contrastPageOf(node);
      if (page && page.id === figma.currentPage.id) roots.push(node);
    }
    figma.ui.postMessage(contrastReport(roots));
  } catch (error) {
    if (run !== contrastRun) return;
    figma.ui.postMessage({ type: 'contrast-failed', message: contrastErrorText(error) });
  }
}

function contrastSchedule(delay: number): void {
  if (contrastTimer !== undefined) clearTimeout(contrastTimer);
  contrastTimer = setTimeout(() => {
    contrastTimer = undefined;
    void contrastCheck();
  }, delay);
}

function contrastOnSelection(): void {
  const selection = figma.currentPage.selection;
  if (contrastOwnSelection !== null && selection.length === 1 && selection[0].id === contrastOwnSelection) return;
  contrastOwnSelection = null;
  contrastTargets = selection.map((node) => node.id);
  contrastSchedule(CONTRAST_SELECTION_DELAY_MS);
}

// Recolouring, moving or deleting a layer re-runs the check, debounced while the person drags.
function contrastOnNodeChange(): void {
  if (contrastTargets.length > 0) contrastSchedule(CONTRAST_EDIT_DELAY_MS);
}

async function contrastSelect(id: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(id);
    const page = node ? contrastPageOf(node) : null;
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE' || !page || page.id !== figma.currentPage.id) {
      figma.ui.postMessage({ type: 'contrast-selected', id, ok: false, message: 'That layer is no longer on this page.' });
      contrastSchedule(0);
      return;
    }
    contrastOwnSelection = node.id;
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    figma.ui.postMessage({ type: 'contrast-selected', id, ok: true });
  } catch (error) {
    figma.ui.postMessage({ type: 'contrast-selected', id, ok: false, message: 'Could not select the layer: ' + contrastErrorText(error) });
  }
}

// Messages arrive untyped from another window: check the shape before trusting it.
function contrastMessage(msg: unknown): { type?: unknown; id?: unknown } {
  return typeof msg === 'object' && msg !== null ? (msg as { type?: unknown; id?: unknown }) : {};
}

figma.ui.on('message', (raw: unknown) => {
  const msg = contrastMessage(raw);
  if (msg.type === 'contrast-check') contrastSchedule(0);
  else if (msg.type === 'contrast-select' && typeof msg.id === 'string') void contrastSelect(msg.id);
  // kit:* and anything else falls through.
});

figma.on('selectionchange', contrastOnSelection);
figma.on('currentpagechange', () => {
  contrastPage.off('nodechange', contrastOnNodeChange);
  contrastPage = figma.currentPage;
  contrastPage.on('nodechange', contrastOnNodeChange);
  contrastOwnSelection = null;
  contrastTargets = figma.currentPage.selection.map((node) => node.id);
  contrastSchedule(0);
});
contrastPage.on('nodechange', contrastOnNodeChange);
// The first report; Figma holds it until the UI has loaded.
contrastSchedule(0);
