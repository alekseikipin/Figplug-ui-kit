// ==== kit:window:start · kit v0.4.0 · protocol 1 · paste this block unchanged · https://github.com/alekseikipin/Figplug-ui-kit ====
// Main-thread half of the kit window: opens the UI, keeps the window inside per-editor bounds,
// remembers the size the person chose, and answers the runtime in ui.html (docs/messages.md,
// docs/window-chrome.md). Paste the whole block above your own code and call installKitWindow()
// once (a plain-JavaScript plugin copies the same block from code.js). Every name is prefixed
// kit/Kit because code.ts shares one global namespace with Figma's typings. To upgrade, replace
// everything between the start and end lines.

const KIT_PROTOCOL = 1;
const KIT_STORAGE_KEY = 'kit:window';
// Figma's documented minimum window size is 70 x 0.
const KIT_MIN_WIDTH = 70;
const KIT_DEFAULT_SIZE: KitSize = { width: 320, height: 360 };
const KIT_DEFAULT_BOUNDS: KitBounds = { minWidth: 240, maxWidth: 960, minHeight: 120, maxHeight: 900 };
// Mid-drag sizes are written at most this often; a finished gesture is written at once.
const KIT_SAVE_DELAY_MS = 400;
// A UI that never asks for a size (a broken page, a missing runtime) still becomes visible.
const KIT_SHOW_DELAY_MS = 500;
// A saved-size read slower than this stops holding kit:init back, and its answer is then ignored:
// the window has started at its default size, and moving it later would be a jump. Shorter than
// KIT_SHOW_DELAY_MS, so a restore lands before the show cap.
const KIT_READ_TIMEOUT_MS = 300;
const KIT_MODES: ReadonlyArray<string> = ['fit-content', 'resizable', 'fixed'];

// Lets a second installKitWindow() call detach the first one (see its JSDoc).
let kitUninstallPrevious: (() => void) | undefined;

// Untrusted input: messages, stored values, options from plain JS. The fields the kit reads are
// named so dot access compiles under any tsconfig (even noPropertyAccessFromIndexSignature);
// each one is still checked before use.
interface KitUnknownObject {
  readonly [key: string]: unknown;
  readonly type?: unknown;
  readonly protocol?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly user?: unknown;
  readonly final?: unknown;
}

function kitIsObject(value: unknown): value is KitUnknownObject {
  return typeof value === 'object' && value !== null;
}

function kitIsFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function kitIsMode(value: unknown): value is KitMode {
  return typeof value === 'string' && KIT_MODES.indexOf(value) >= 0;
}

/** True only for a record this kit wrote. Storage outlives code versions, so never trust its shape. */
function kitIsSizeRecord(value: unknown): value is KitSizeRecord {
  if (!kitIsObject(value)) return false;
  const { v, editorType, width, height } = value;
  return v === 1 && typeof editorType === 'string' &&
    kitIsFinite(width) && width > 0 && kitIsFinite(height) && height > 0;
}

/**
 * Per-editor defaults. The resize handle only makes sense where the window floats over the
 * canvas; Dev Mode and Buzz dock the UI in a panel that the person sizes themselves. Any other
 * editorType (an editor newer than this kit) gets the handle off and the default bounds, until a
 * kit release adds it here once its window type is known.
 */
function kitSurface(editorType: string): { chrome: boolean; bounds: KitBounds } {
  const chrome = editorType === 'figma' || editorType === 'figjam' || editorType === 'slides';
  // Figma's Dev Mode guide says Inspect panel UIs are "optimized around" a 300px minimum width.
  const minWidth = editorType === 'dev' ? 300 : KIT_DEFAULT_BOUNDS.minWidth;
  return { chrome, bounds: { ...KIT_DEFAULT_BOUNDS, minWidth } };
}

/**
 * Merges host bounds over the surface defaults, then repairs them so clamping can never produce
 * a size Figma rejects: integers, finite, min <= max, width >= 70, height >= 0.
 */
function kitSanitizeBounds(base: KitBounds, override: unknown): KitBounds {
  const pick = (key: keyof KitBounds): number => {
    const value = kitIsObject(override) ? override[key] : undefined;
    return Math.round(kitIsFinite(value) ? value : base[key]);
  };
  const minWidth = Math.max(KIT_MIN_WIDTH, pick('minWidth'));
  const minHeight = Math.max(0, pick('minHeight'));
  return {
    minWidth,
    maxWidth: Math.max(minWidth, pick('maxWidth')),
    minHeight,
    maxHeight: Math.max(minHeight, pick('maxHeight')),
  };
}

// Rounding after clamping stays inside integer bounds, and whole pixels keep sizes comparable
// for the save dedupe.
function kitClamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function kitClampSize(width: number, height: number, bounds: KitBounds): KitSize {
  return {
    width: kitClamp(width, bounds.minWidth, bounds.maxWidth),
    height: kitClamp(height, bounds.minHeight, bounds.maxHeight),
  };
}

/**
 * Names every option installKitWindow cannot use (an unknown key, or a value of the wrong type)
 * for one warning. undefined and null mean "use the default" and are never listed.
 */
function kitInvalidOptions(options: unknown): string[] {
  if (options === undefined || options === null) return [];
  if (!kitIsObject(options)) return ['the options argument (' + typeof options + ')'];
  const invalid: string[] = [];
  const numbers = (name: string, value: unknown, keys: ReadonlyArray<string>): void => {
    if (!kitIsObject(value)) {
      invalid.push(name);
      return;
    }
    for (const key of Object.keys(value)) {
      const item = value[key];
      const given = item !== undefined && item !== null;
      if (keys.indexOf(key) < 0 || (given && !kitIsFinite(item))) invalid.push(name + '.' + key);
    }
  };
  for (const key of Object.keys(options)) {
    const value = options[key];
    if (value === undefined || value === null) continue;
    if (key === 'mode') {
      if (!kitIsMode(value)) invalid.push("mode '" + String(value) + "'");
    } else if (key === 'html' || key === 'title') {
      if (typeof value !== 'string') invalid.push(key);
    } else if (key === 'persist') {
      if (typeof value !== 'boolean') invalid.push(key);
    } else if (key === 'size') numbers(key, value, ['width', 'height']);
    else if (key === 'bounds') numbers(key, value, ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']);
    else invalid.push(key);
  }
  return invalid;
}

// Figma's clearTimeout only takes a number, and a handle of 0 is not promised to mean "none".
function kitClearTimer(handle: number | undefined): void {
  if (handle !== undefined) clearTimeout(handle);
}

/** Resolves to the raw stored value, or rejects; callers validate and decide what to do. */
async function kitReadSize(): Promise<unknown> {
  return await figma.clientStorage.getAsync(KIT_STORAGE_KEY);
}

/** Resolves true when the record was written. Never rejects: a lost size is not worth a crash. */
async function kitWriteSize(record: KitSizeRecord): Promise<boolean> {
  try {
    await figma.clientStorage.setAsync(KIT_STORAGE_KEY, record);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the plugin window and wires it to the kit runtime in ui.html. Call it before your own
 * figma.ui.on('message', ...) handler; kit messages (type 'kit:*') are handled here and every
 * other message is left for your handler. Register yours with figma.ui.on too: assigning
 * figma.ui.onmessage may or may not replace this listener (unmeasured, see docs/messages.md).
 *
 * What it does:
 * - Calls figma.showUI right away with themeColors on, so you can postMessage immediately (Figma
 *   queues messages until the page loads). Remove your own showUI call: a second one closes this
 *   window. The window starts hidden in 'fit-content' and 'resizable' modes and is shown on the
 *   first size the UI asks for, or after 500 ms at most.
 * - Clamps every size to the bounds, so a bad message can never reach figma.ui.resize.
 * - Restores the size the person chose last time in this editor, and saves it when a resize
 *   gesture finishes (debounced while dragging). Nothing is written on close: Figma cannot await
 *   it. A storage read slower than 300 ms is skipped, so it never holds the UI back.
 * - Turns the resize handle off in Dev Mode and Buzz, where the UI lives in a docked panel, and
 *   in any editorType this kit does not know yet (default bounds there).
 * - Warns once (console.warn) about unknown options and values of the wrong type, and uses the
 *   default for each of them.
 *
 * Calling it again replaces the window: Figma closes the previous UI, and the previous kit
 * listener, timers and pending storage read are dropped so they cannot touch the new one.
 *
 * @param options.html     HTML to show. Default: __html__ (the manifest's "ui" file).
 * @param options.title    Window title. Default: the plugin name from the manifest.
 * @param options.mode     'fit-content' (default): the UI sets the height from its content and the
 *                         person drags the width, which is remembered. 'resizable': the person
 *                         drags both, both are remembered, Home on the handle re-fits the height.
 *                         'fixed': the window keeps options.size (kit:resize is ignored), no
 *                         handle, nothing remembered.
 * @param options.size     Starting { width, height } before any saved size or content fit,
 *                         clamped to the bounds. Default: 320 x 360. Home returns to its width.
 * @param options.bounds   { minWidth, maxWidth, minHeight, maxHeight } merged over the editor
 *                         defaults (240-960 x 120-900; min width 300 in Dev Mode). Missing or
 *                         invalid values fall back to the defaults; min width never goes below 70.
 * @param options.persist  Remember the chosen size between runs, in figma.clientStorage under
 *                         'kit:window'. One size is kept, tagged with the editor it was chosen
 *                         in, and only restored there. Default: true. Ignored in 'fixed' mode.
 * @returns The resolved { mode, chrome, editorType }; chrome is false where the handle is off.
 *          Its fit() asks the UI to fit the window height to its content now (kit:fit), keeping
 *          the width: call it in 'resizable' mode after a message that changes the UI's content.
 *          It does nothing in 'fixed' mode or once a later call has replaced this window.
 */
function installKitWindow(options: KitWindowOptions = {}): KitWindow {
  if (kitUninstallPrevious) kitUninstallPrevious();
  // Turned off when a later call replaces this window, so a storage read or a kit:init reply
  // still in flight from this call can never resize or message the new one.
  let active = true;
  const warned = new Set<string>();

  // At most one warning per kind: a broken storage would otherwise warn on every drag.
  const warnOnce = (kind: string, message: string): void => {
    if (warned.has(kind)) return;
    warned.add(kind);
    console.warn('kit: ' + message);
  };

  // Options can come from plain JS or an agent's guess, so read them defensively. Each value the
  // kit cannot use falls back to its default, and one warning names them all: a typo such as
  // mode: 'resizeable' must not quietly become 'fit-content'.
  const invalid = kitInvalidOptions(options);
  if (invalid.length > 0) {
    warnOnce('options', 'installKitWindow ignored ' + invalid.join(', ') +
      ' (unknown option or wrong type) and used the defaults instead.');
  }
  const opts: KitWindowOptions = kitIsObject(options) ? options : {};
  const mode: KitMode = kitIsMode(opts.mode) ? opts.mode : 'fit-content';
  const editorType: string = figma.editorType;
  const surface = kitSurface(editorType);
  const bounds = kitSanitizeBounds(surface.bounds, opts.bounds);
  const asked: unknown = opts.size;
  const askedWidth = kitIsObject(asked) ? asked.width : undefined;
  const askedHeight = kitIsObject(asked) ? asked.height : undefined;
  const defaultSize = kitClampSize(
    kitIsFinite(askedWidth) ? askedWidth : KIT_DEFAULT_SIZE.width,
    kitIsFinite(askedHeight) ? askedHeight : KIT_DEFAULT_SIZE.height,
    bounds,
  );
  const persist = opts.persist !== false && mode !== 'fixed';

  let size: KitSize = { ...defaultSize };
  // A fixed window has nothing to fit, so it can be visible from the start.
  let shown = mode === 'fixed';
  let restored = false;
  let userResized = false;
  // The last record known to be in storage, so an unchanged size is not written again.
  let saved: KitSizeRecord | undefined;
  let saveTimer: number | undefined;
  let showTimer: number | undefined;
  let readTimer: number | undefined;
  let readTimedOut = false;

  const showOptions: ShowUIOptions = {
    width: size.width,
    height: size.height,
    themeColors: true,
    visible: shown,
  };
  if (typeof opts.title === 'string') showOptions.title = opts.title;
  figma.showUI(typeof opts.html === 'string' ? opts.html : __html__, showOptions);

  const show = (): void => {
    if (shown) return;
    shown = true;
    kitClearTimer(showTimer);
    showTimer = undefined;
    figma.ui.show();
  };
  if (!shown) showTimer = setTimeout(show, KIT_SHOW_DELAY_MS);

  // False when Figma refused the size (a closed plugin, a surface without resize): the window keeps
  // its old size and the kit carries on, so a refusal never stops kit:init or a host listener.
  const applySize = (next: KitSize): boolean => {
    try {
      figma.ui.resize(next.width, next.height);
    } catch (error) {
      warnOnce('resize', 'figma.ui.resize failed: ' + String(error));
      return false;
    }
    size = next;
    return true;
  };

  // In fit-content mode only the width is the person's choice; the height follows the content.
  const isSaved = (next: KitSize): boolean =>
    saved !== undefined && saved.width === next.width &&
    (mode === 'fit-content' || saved.height === next.height);

  const save = (next: KitSize): void => {
    kitClearTimer(saveTimer);
    saveTimer = undefined;
    if (isSaved(next)) return;
    const record: KitSizeRecord = { v: 1, editorType, width: next.width, height: next.height };
    saved = record;
    void kitWriteSize(record).then((ok) => {
      if (ok) return;
      // Forget the failed record so the same size is tried again on the next gesture.
      if (saved === record) saved = undefined;
      warnOnce('storage', 'could not save the window size; it will not be remembered.');
    });
  };

  const scheduleSave = (next: KitSize): void => {
    kitClearTimer(saveTimer);
    saveTimer = setTimeout(() => save(next), KIT_SAVE_DELAY_MS);
  };

  const restore = async (): Promise<void> => {
    let value: unknown;
    try {
      value = await kitReadSize();
    } catch {
      warnOnce('storage', 'could not read the saved window size; using the default.');
      return;
    }
    if (!active) return;
    // One key serves every editor, so a size saved in FigJam must not resize a Design window.
    if (!kitIsSizeRecord(value) || value.editorType !== editorType) return;
    if (saved === undefined) saved = value;
    // The person already resized during this run (their newer choice wins), or the read took
    // longer than KIT_READ_TIMEOUT_MS and kit:init may already carry the default size.
    if (userResized || readTimedOut) return;
    const height = mode === 'resizable' ? value.height : size.height;
    restored = applySize(kitClampSize(value.width, height, bounds));
  };
  // Started right after showUI so the read overlaps the page load instead of following it.
  // Settles when the read does or after KIT_READ_TIMEOUT_MS, whichever is first, and never
  // rejects: a storage read that hangs or fails must not hold kit:init back.
  const ready: Promise<void> = !persist ? Promise.resolve() : new Promise<void>((resolve) => {
    readTimer = setTimeout(() => {
      readTimer = undefined;
      readTimedOut = true;
      resolve();
    }, KIT_READ_TIMEOUT_MS);
    const settle = (): void => {
      kitClearTimer(readTimer);
      readTimer = undefined;
      resolve();
    };
    void restore().then(settle, settle);
  });

  const onReady = (msg: KitUnknownObject): void => {
    if (msg.protocol !== KIT_PROTOCOL) {
      // A string is quoted, so "1" and 1 read differently in the warning.
      const theirs = typeof msg.protocol === 'string' ? JSON.stringify(msg.protocol) : String(msg.protocol);
      warnOnce('protocol', 'ui.html speaks protocol ' + theirs + ' but code.ts speaks ' +
        KIT_PROTOCOL + '. Re-paste the kit blocks of both files from the same release.');
    }
    // Waiting for storage means kit:init carries the restored size, so the UI fits only once.
    void ready.then(() => {
      // A later installKitWindow() call owns the window now and answers its own UI.
      if (!active) return;
      const init: KitInitMessage = {
        type: 'kit:init',
        protocol: KIT_PROTOCOL,
        mode,
        chrome: surface.chrome,
        editorType,
        bounds: { ...bounds },
        size: { ...size },
        defaultSize: { ...defaultSize },
        restored,
      };
      try {
        figma.ui.postMessage(init);
      } catch {
        // The host closed the plugin while the saved size was being read: no UI is left to answer.
      }
    });
  };

  const onResize = (msg: KitUnknownObject): void => {
    // A fixed window keeps options.size. The runtime never asks for a size in this mode, but a
    // runtime that gave up waiting for kit:init (its 500 ms timeout ran out while main was busy)
    // falls back to fitting its content, and that guess must not shrink the window.
    if (mode === 'fixed') return;
    const { width, height } = msg;
    // Negative sizes are as wrong as NaN: drop the message rather than guess what was meant.
    if (!kitIsFinite(width) || !kitIsFinite(height) || width < 0 || height < 0) return;
    const next = kitClampSize(width, height, bounds);
    const applied = applySize(next);
    show();
    // Only sizes the person chose are remembered; content fits are recomputed on every run.
    if (!applied || msg.user !== true) return;
    userResized = true;
    if (!persist) return;
    if (msg.final === true) save(next);
    else scheduleSave(next);
  };

  const onMessage = (msg: unknown): void => {
    // Anything that is not a kit:* object belongs to the host: return without touching it.
    if (!kitIsObject(msg) || typeof msg.type !== 'string' || !msg.type.startsWith('kit:')) return;
    if (msg.type === 'kit:ready') onReady(msg);
    else if (msg.type === 'kit:resize') onResize(msg);
  };
  figma.ui.on('message', onMessage);

  kitUninstallPrevious = () => {
    active = false;
    figma.ui.off('message', onMessage);
    kitClearTimer(showTimer);
    kitClearTimer(saveTimer);
    kitClearTimer(readTimer);
  };

  // The UI measures and asks for the size with kit:resize, as for any fit; nothing is saved.
  // Before the UI has loaded Figma queues the message, and the runtime applies it on its first fit.
  const fit = (): void => {
    if (!active || mode === 'fixed') return;
    const message: KitFitMessage = { type: 'kit:fit' };
    try {
      figma.ui.postMessage(message);
    } catch {
      // The plugin is closing: there is no UI left to fit.
    }
  };

  return Object.freeze({ mode, chrome: surface.chrome, editorType, fit });
}
// ==== kit:window:end ====

// ---- Your plugin starts here ----
// Rename layers (kit example): a prefix, find and replace, and optional numbering for the selected
// layers, with a preview of every new name before anything changes. The UI sends its options on
// every change; main works out the new names for the current selection and posts them as a
// preview. Rename applies exactly the layers and names of the preview on screen, as one undo step.

installKitWindow({ mode: 'fit-content', size: { width: 360 } });

// The UI's Start at field accepts the same range; this clamp is the backstop.
const RENAME_MAX_START = 999999;
// Rows sent per preview; the counts always cover the whole selection.
const RENAME_PREVIEW_LIMIT = 200;
// The separator keys the UI's select sends, and what each one puts between name and number.
const RENAME_SEPARATORS: { readonly [key: string]: string } = {
  space: ' ',
  hyphen: '-',
  underscore: '_',
  slash: '/',
  period: '.',
  none: '',
};
// Changes to a selected layer that can change its new name or its number.
const RENAME_WATCHED: ReadonlyArray<NodeChangeProperty> = ['name', 'parent', 'x', 'y', 'relativeTransform'];

type RenamePlace = 'before' | 'after';
/** layers: top to bottom as in the Layers panel; rows: by y, then x; columns: by x, then y. */
type RenameOrder = 'layers' | 'rows' | 'columns';

interface RenameOptions {
  prefix: string;
  find: string;
  replace: string;
  matchCase: boolean;
  regex: boolean;
  numbering: boolean;
  start: number;
  digits: number;
  place: RenamePlace;
  separator: string;
  order: RenameOrder;
}

// ---- UI -> main ----

/** Sent by the UI whenever an option changes; seq counts these requests, and the preview echoes it. */
interface RenamePreviewMessage {
  type: 'rename-preview';
  seq: number;
  options: RenameOptions;
}

/** Sent when the person presses Rename; token is the preview the UI is showing. */
interface RenameApplyMessage {
  type: 'rename-apply';
  token: number;
}

type RenameUiToMain = RenamePreviewMessage | RenameApplyMessage;

// ---- main -> UI ----

interface RenameRow {
  oldName: string;
  newName: string;
  changed: boolean;
  /** The options would leave the name empty; the layer keeps its name. */
  empty: boolean;
}

interface RenamePreviewResultMessage {
  type: 'rename-preview-result';
  /** The seq of the last rename-preview main had when it worked this out. */
  seq: number;
  /** Goes up with every selection or page change, so the UI announces those and not typing. */
  selection: number;
  token: number;
  total: number;
  changed: number;
  /** At most RENAME_PREVIEW_LIMIT rows, in numbering order. */
  rows: RenameRow[];
  /** The find text is not a valid regular expression; nothing changes until it is. */
  findInvalid: boolean;
}

interface RenameAppliedMessage {
  type: 'rename-applied';
  renamed: number;
  /** Layers renamed or deleted since the preview: left alone. */
  skipped: number;
  failed: number;
  /** The selection or the layers changed after the preview the UI showed: nothing was renamed. */
  stale: boolean;
}

type RenameMainToUi = RenamePreviewResultMessage | RenameAppliedMessage;

interface RenamePlanItem {
  node: SceneNode;
  row: RenameRow;
}

let renameOptions: RenameOptions | null = null;
let renameSeq = 0;
let renameSelection = 0;
let renameToken = 0;
let renamePlan: RenamePlanItem[] = [];
let renameRefreshPending = false;
let renameWatchedPage: PageNode | null = null;

function renamePost(message: RenameMainToUi): void {
  figma.ui.postMessage(message);
}

// Messages arrive untyped from another window: check every field before trusting it.
function renameMessageType(msg: unknown): unknown {
  return typeof msg === 'object' && msg !== null ? (msg as { type?: unknown }).type : undefined;
}

function isRenameOptions(value: unknown): value is RenameOptions {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.prefix === 'string' && typeof o.find === 'string' && typeof o.replace === 'string' &&
    typeof o.matchCase === 'boolean' && typeof o.regex === 'boolean' && typeof o.numbering === 'boolean' &&
    typeof o.start === 'number' && typeof o.digits === 'number' &&
    (o.place === 'before' || o.place === 'after') &&
    typeof o.separator === 'string' && Object.prototype.hasOwnProperty.call(RENAME_SEPARATORS, o.separator) &&
    (o.order === 'layers' || o.order === 'rows' || o.order === 'columns');
}

function isRenamePreviewMessage(msg: unknown): msg is RenamePreviewMessage {
  if (renameMessageType(msg) !== 'rename-preview') return false;
  const { seq, options } = msg as { seq?: unknown; options?: unknown };
  return typeof seq === 'number' && Number.isFinite(seq) && isRenameOptions(options);
}

function isRenameApplyMessage(msg: unknown): msg is RenameApplyMessage {
  return renameMessageType(msg) === 'rename-apply' && typeof (msg as { token?: unknown }).token === 'number';
}

function renameClamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function renameSanitize(options: RenameOptions): RenameOptions {
  return {
    ...options,
    start: renameClamp(options.start, 0, RENAME_MAX_START, 1),
    digits: renameClamp(options.digits, 1, 3, 1),
  };
}

function renameEscape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** null when there is nothing to find; 'invalid' when the regular expression doesn't parse. */
function renameMatcher(options: RenameOptions): RegExp | null | 'invalid' {
  if (options.find === '') return null;
  const flags = options.matchCase ? 'g' : 'gi';
  if (!options.regex) return new RegExp(renameEscape(options.find), flags);
  try {
    return new RegExp(options.find, flags);
  } catch {
    return 'invalid';
  }
}

/** The new name: prefix, then the (replaced) name with its number before or after it. */
function renameName(name: string, index: number, options: RenameOptions, matcher: RegExp | null): string {
  let base = name;
  if (matcher) {
    // Plain text replaces literally, so a $ in the replacement stays a $; a regular expression
    // keeps $1, $& and the other replacement patterns.
    base = options.regex ? name.replace(matcher, options.replace) : name.replace(matcher, () => options.replace);
  }
  if (options.numbering) {
    const number = String(options.start + index).padStart(options.digits, '0');
    const separator = base === '' ? '' : RENAME_SEPARATORS[options.separator];
    base = options.place === 'before' ? number + separator + base : base + separator + number;
  }
  return options.prefix + base;
}

/**
 * Child indexes from the document down to the node. `orders` keeps each parent's child order by
 * id for one preview, so a selection of n siblings reads their parent's children once, not n
 * times (each read of `children` builds a new array), and no node object identity is assumed.
 */
function renameLayerPath(node: BaseNode, orders: Map<string, Map<string, number>>): number[] {
  const path: number[] = [];
  let child: BaseNode = node;
  let parent = child.parent;
  while (parent) {
    let order = orders.get(parent.id);
    if (!order) {
      order = new Map();
      const children: ReadonlyArray<BaseNode> = parent.children;
      for (let i = 0; i < children.length; i++) order.set(children[i].id, i);
      orders.set(parent.id, order);
    }
    const index = order.get(child.id);
    path.unshift(index === undefined ? -1 : index);
    child = parent;
    parent = child.parent;
  }
  return path;
}

/** Top to bottom as the Layers panel shows it: the last child first, a parent before its children. */
function renameCompareLayers(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return a.length - b.length;
}

function renamePosition(node: SceneNode): { x: number; y: number } {
  if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
    return { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y };
  }
  if ('x' in node) return { x: node.x, y: node.y };
  return { x: 0, y: 0 };
}

function renameSort(nodes: ReadonlyArray<SceneNode>, order: RenameOrder): SceneNode[] {
  const orders = new Map<string, Map<string, number>>();
  const items = nodes.map((node) => {
    const { x, y } = order === 'layers' ? { x: 0, y: 0 } : renamePosition(node);
    return { node, path: renameLayerPath(node, orders), x: Math.round(x), y: Math.round(y) };
  });
  items.sort((a, b) => {
    if (order === 'rows' && a.y !== b.y) return a.y - b.y;
    if (order !== 'layers' && a.x !== b.x) return a.x - b.x;
    if (order === 'columns' && a.y !== b.y) return a.y - b.y;
    return renameCompareLayers(a.path, b.path);
  });
  return items.map((item) => item.node);
}

function renamePostPreview(): void {
  const options = renameOptions;
  if (!options) return; // the UI hasn't sent its options yet
  let plan: RenamePlanItem[] = [];
  let findInvalid = false;
  try {
    const matcher = renameMatcher(options);
    findInvalid = matcher === 'invalid';
    const nodes = renameSort(figma.currentPage.selection, options.numbering ? options.order : 'layers');
    plan = nodes.map((node, index) => {
      const oldName = node.name;
      const newName = matcher === 'invalid' ? oldName : renameName(oldName, index, options, matcher);
      const empty = newName === '';
      return { node, row: { oldName, newName: empty ? oldName : newName, changed: !empty && newName !== oldName, empty } };
    });
  } catch (error) {
    console.warn('rename: preview failed', error);
    plan = [];
  }
  renamePlan = plan;
  renameToken++;
  renamePost({
    type: 'rename-preview-result',
    seq: renameSeq,
    selection: renameSelection,
    token: renameToken,
    total: plan.length,
    changed: plan.filter((item) => item.row.changed).length,
    rows: plan.slice(0, RENAME_PREVIEW_LIMIT).map((item) => item.row),
    findInvalid,
  });
}

// Selection and layer changes can come in bursts (a drag): refresh once per burst.
function renameScheduleRefresh(): void {
  if (renameRefreshPending) return;
  renameRefreshPending = true;
  setTimeout(() => {
    renameRefreshPending = false;
    renamePostPreview();
  }, 0);
}

function renameApply(token: number): void {
  if (token !== renameToken) {
    // A newer preview is already on its way to the UI; let the person check it first.
    renamePost({ type: 'rename-applied', renamed: 0, skipped: 0, failed: 0, stale: true });
    return;
  }
  let renamed = 0;
  let skipped = 0;
  let failed = 0;
  for (const { node, row } of renamePlan) {
    if (!row.changed) continue;
    try {
      // Renamed or deleted since the preview: its new name was worked out from another name.
      if (node.removed || node.name !== row.oldName) {
        skipped++;
        continue;
      }
      node.name = row.newName;
      renamed++;
    } catch (error) {
      // Some layers can't be renamed: count it and go on, so the UI always gets an answer.
      console.warn('rename: could not rename a layer', error);
      failed++;
    }
  }
  // One undo step for the whole rename.
  if (renamed > 0) figma.commitUndo();
  renamePost({ type: 'rename-applied', renamed, skipped, failed, stale: false });
  renamePostPreview(); // the names are now different: show what Rename would do next
}

function renameOnNodeChange(event: NodeChangeEvent): void {
  if (renamePlan.length === 0) return;
  const ids = new Set(renamePlan.map((item) => item.node.id));
  const relevant = event.nodeChanges.some((change) => ids.has(change.id) &&
    (change.type !== 'PROPERTY_CHANGE' || change.properties.some((p) => RENAME_WATCHED.includes(p))));
  if (relevant) renameScheduleRefresh();
}

// Under "documentAccess": "dynamic-page" node changes are watched per page, so follow the
// current page: a name typed in the Layers panel then shows up in the preview. If an editor
// can't watch a page, the preview still follows the selection and every option.
function renameWatchCurrentPage(): void {
  try {
    if (renameWatchedPage) renameWatchedPage.off('nodechange', renameOnNodeChange);
    renameWatchedPage = figma.currentPage;
    renameWatchedPage.on('nodechange', renameOnNodeChange);
  } catch (error) {
    renameWatchedPage = null;
    console.warn('rename: cannot watch layer changes on this page', error);
  }
}

figma.ui.on('message', (msg: unknown) => {
  const message: RenameUiToMain | null = isRenamePreviewMessage(msg) || isRenameApplyMessage(msg) ? msg : null;
  if (!message) return; // kit:* and anything else falls through
  if (message.type === 'rename-preview') {
    renameSeq = message.seq;
    renameOptions = renameSanitize(message.options);
    renamePostPreview();
  } else {
    renameApply(message.token);
  }
});

figma.on('selectionchange', () => {
  renameSelection++;
  renameScheduleRefresh();
});
figma.on('currentpagechange', () => {
  renameSelection++;
  renameWatchCurrentPage();
  renameScheduleRefresh();
});
renameWatchCurrentPage();
