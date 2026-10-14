"use strict";
// ==== kit:window:start · kit v0.3.0 · protocol 1 · paste this block unchanged · https://github.com/alekseikipin/Figplug-ui-kit ====
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
const KIT_DEFAULT_SIZE = { width: 320, height: 360 };
const KIT_DEFAULT_BOUNDS = { minWidth: 240, maxWidth: 960, minHeight: 120, maxHeight: 900 };
// Mid-drag sizes are written at most this often; a finished gesture is written at once.
const KIT_SAVE_DELAY_MS = 400;
// A UI that never asks for a size (a broken page, a missing runtime) still becomes visible.
const KIT_SHOW_DELAY_MS = 500;
// A saved-size read slower than this stops holding kit:init back, and its answer is then ignored:
// the window has started at its default size, and moving it later would be a jump. Shorter than
// KIT_SHOW_DELAY_MS, so a restore lands before the show cap.
const KIT_READ_TIMEOUT_MS = 300;
const KIT_MODES = ['fit-content', 'resizable', 'fixed'];
// Lets a second installKitWindow() call detach the first one (see its JSDoc).
let kitUninstallPrevious;
function kitIsObject(value) {
    return typeof value === 'object' && value !== null;
}
function kitIsFinite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function kitIsMode(value) {
    return typeof value === 'string' && KIT_MODES.indexOf(value) >= 0;
}
/** True only for a record this kit wrote. Storage outlives code versions, so never trust its shape. */
function kitIsSizeRecord(value) {
    if (!kitIsObject(value))
        return false;
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
function kitSurface(editorType) {
    const chrome = editorType === 'figma' || editorType === 'figjam' || editorType === 'slides';
    // Figma's Dev Mode guide says Inspect panel UIs are "optimized around" a 300px minimum width.
    const minWidth = editorType === 'dev' ? 300 : KIT_DEFAULT_BOUNDS.minWidth;
    return { chrome, bounds: { ...KIT_DEFAULT_BOUNDS, minWidth } };
}
/**
 * Merges host bounds over the surface defaults, then repairs them so clamping can never produce
 * a size Figma rejects: integers, finite, min <= max, width >= 70, height >= 0.
 */
function kitSanitizeBounds(base, override) {
    const pick = (key) => {
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
function kitClamp(value, min, max) {
    return Math.round(Math.min(max, Math.max(min, value)));
}
function kitClampSize(width, height, bounds) {
    return {
        width: kitClamp(width, bounds.minWidth, bounds.maxWidth),
        height: kitClamp(height, bounds.minHeight, bounds.maxHeight),
    };
}
/**
 * Names every option installKitWindow cannot use (an unknown key, or a value of the wrong type)
 * for one warning. undefined and null mean "use the default" and are never listed.
 */
function kitInvalidOptions(options) {
    if (options === undefined || options === null)
        return [];
    if (!kitIsObject(options))
        return ['the options argument (' + typeof options + ')'];
    const invalid = [];
    const numbers = (name, value, keys) => {
        if (!kitIsObject(value)) {
            invalid.push(name);
            return;
        }
        for (const key of Object.keys(value)) {
            const item = value[key];
            const given = item !== undefined && item !== null;
            if (keys.indexOf(key) < 0 || (given && !kitIsFinite(item)))
                invalid.push(name + '.' + key);
        }
    };
    for (const key of Object.keys(options)) {
        const value = options[key];
        if (value === undefined || value === null)
            continue;
        if (key === 'mode') {
            if (!kitIsMode(value))
                invalid.push("mode '" + String(value) + "'");
        }
        else if (key === 'html' || key === 'title') {
            if (typeof value !== 'string')
                invalid.push(key);
        }
        else if (key === 'persist') {
            if (typeof value !== 'boolean')
                invalid.push(key);
        }
        else if (key === 'size')
            numbers(key, value, ['width', 'height']);
        else if (key === 'bounds')
            numbers(key, value, ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']);
        else
            invalid.push(key);
    }
    return invalid;
}
// Figma's clearTimeout only takes a number, and a handle of 0 is not promised to mean "none".
function kitClearTimer(handle) {
    if (handle !== undefined)
        clearTimeout(handle);
}
/** Resolves to the raw stored value, or rejects; callers validate and decide what to do. */
async function kitReadSize() {
    return await figma.clientStorage.getAsync(KIT_STORAGE_KEY);
}
/** Resolves true when the record was written. Never rejects: a lost size is not worth a crash. */
async function kitWriteSize(record) {
    try {
        await figma.clientStorage.setAsync(KIT_STORAGE_KEY, record);
        return true;
    }
    catch {
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
function installKitWindow(options = {}) {
    if (kitUninstallPrevious)
        kitUninstallPrevious();
    // Turned off when a later call replaces this window, so a storage read or a kit:init reply
    // still in flight from this call can never resize or message the new one.
    let active = true;
    const warned = new Set();
    // At most one warning per kind: a broken storage would otherwise warn on every drag.
    const warnOnce = (kind, message) => {
        if (warned.has(kind))
            return;
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
    const opts = kitIsObject(options) ? options : {};
    const mode = kitIsMode(opts.mode) ? opts.mode : 'fit-content';
    const editorType = figma.editorType;
    const surface = kitSurface(editorType);
    const bounds = kitSanitizeBounds(surface.bounds, opts.bounds);
    const asked = opts.size;
    const askedWidth = kitIsObject(asked) ? asked.width : undefined;
    const askedHeight = kitIsObject(asked) ? asked.height : undefined;
    const defaultSize = kitClampSize(kitIsFinite(askedWidth) ? askedWidth : KIT_DEFAULT_SIZE.width, kitIsFinite(askedHeight) ? askedHeight : KIT_DEFAULT_SIZE.height, bounds);
    const persist = opts.persist !== false && mode !== 'fixed';
    let size = { ...defaultSize };
    // A fixed window has nothing to fit, so it can be visible from the start.
    let shown = mode === 'fixed';
    let restored = false;
    let userResized = false;
    // The last record known to be in storage, so an unchanged size is not written again.
    let saved;
    let saveTimer;
    let showTimer;
    let readTimer;
    let readTimedOut = false;
    const showOptions = {
        width: size.width,
        height: size.height,
        themeColors: true,
        visible: shown,
    };
    if (typeof opts.title === 'string')
        showOptions.title = opts.title;
    figma.showUI(typeof opts.html === 'string' ? opts.html : __html__, showOptions);
    const show = () => {
        if (shown)
            return;
        shown = true;
        kitClearTimer(showTimer);
        showTimer = undefined;
        figma.ui.show();
    };
    if (!shown)
        showTimer = setTimeout(show, KIT_SHOW_DELAY_MS);
    // False when Figma refused the size (a closed plugin, a surface without resize): the window keeps
    // its old size and the kit carries on, so a refusal never stops kit:init or a host listener.
    const applySize = (next) => {
        try {
            figma.ui.resize(next.width, next.height);
        }
        catch (error) {
            warnOnce('resize', 'figma.ui.resize failed: ' + String(error));
            return false;
        }
        size = next;
        return true;
    };
    // In fit-content mode only the width is the person's choice; the height follows the content.
    const isSaved = (next) => saved !== undefined && saved.width === next.width &&
        (mode === 'fit-content' || saved.height === next.height);
    const save = (next) => {
        kitClearTimer(saveTimer);
        saveTimer = undefined;
        if (isSaved(next))
            return;
        const record = { v: 1, editorType, width: next.width, height: next.height };
        saved = record;
        void kitWriteSize(record).then((ok) => {
            if (ok)
                return;
            // Forget the failed record so the same size is tried again on the next gesture.
            if (saved === record)
                saved = undefined;
            warnOnce('storage', 'could not save the window size; it will not be remembered.');
        });
    };
    const scheduleSave = (next) => {
        kitClearTimer(saveTimer);
        saveTimer = setTimeout(() => save(next), KIT_SAVE_DELAY_MS);
    };
    const restore = async () => {
        let value;
        try {
            value = await kitReadSize();
        }
        catch {
            warnOnce('storage', 'could not read the saved window size; using the default.');
            return;
        }
        if (!active)
            return;
        // One key serves every editor, so a size saved in FigJam must not resize a Design window.
        if (!kitIsSizeRecord(value) || value.editorType !== editorType)
            return;
        if (saved === undefined)
            saved = value;
        // The person already resized during this run (their newer choice wins), or the read took
        // longer than KIT_READ_TIMEOUT_MS and kit:init may already carry the default size.
        if (userResized || readTimedOut)
            return;
        const height = mode === 'resizable' ? value.height : size.height;
        restored = applySize(kitClampSize(value.width, height, bounds));
    };
    // Started right after showUI so the read overlaps the page load instead of following it.
    // Settles when the read does or after KIT_READ_TIMEOUT_MS, whichever is first, and never
    // rejects: a storage read that hangs or fails must not hold kit:init back.
    const ready = !persist ? Promise.resolve() : new Promise((resolve) => {
        readTimer = setTimeout(() => {
            readTimer = undefined;
            readTimedOut = true;
            resolve();
        }, KIT_READ_TIMEOUT_MS);
        const settle = () => {
            kitClearTimer(readTimer);
            readTimer = undefined;
            resolve();
        };
        void restore().then(settle, settle);
    });
    const onReady = (msg) => {
        if (msg.protocol !== KIT_PROTOCOL) {
            // A string is quoted, so "1" and 1 read differently in the warning.
            const theirs = typeof msg.protocol === 'string' ? JSON.stringify(msg.protocol) : String(msg.protocol);
            warnOnce('protocol', 'ui.html speaks protocol ' + theirs + ' but code.ts speaks ' +
                KIT_PROTOCOL + '. Re-paste the kit blocks of both files from the same release.');
        }
        // Waiting for storage means kit:init carries the restored size, so the UI fits only once.
        void ready.then(() => {
            // A later installKitWindow() call owns the window now and answers its own UI.
            if (!active)
                return;
            const init = {
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
            }
            catch {
                // The host closed the plugin while the saved size was being read: no UI is left to answer.
            }
        });
    };
    const onResize = (msg) => {
        // A fixed window keeps options.size. The runtime never asks for a size in this mode, but a
        // runtime that gave up waiting for kit:init (its 500 ms timeout ran out while main was busy)
        // falls back to fitting its content, and that guess must not shrink the window.
        if (mode === 'fixed')
            return;
        const { width, height } = msg;
        // Negative sizes are as wrong as NaN: drop the message rather than guess what was meant.
        if (!kitIsFinite(width) || !kitIsFinite(height) || width < 0 || height < 0)
            return;
        const next = kitClampSize(width, height, bounds);
        const applied = applySize(next);
        show();
        // Only sizes the person chose are remembered; content fits are recomputed on every run.
        if (!applied || msg.user !== true)
            return;
        userResized = true;
        if (!persist)
            return;
        if (msg.final === true)
            save(next);
        else
            scheduleSave(next);
    };
    const onMessage = (msg) => {
        // Anything that is not a kit:* object belongs to the host: return without touching it.
        if (!kitIsObject(msg) || typeof msg.type !== 'string' || !msg.type.startsWith('kit:'))
            return;
        if (msg.type === 'kit:ready')
            onReady(msg);
        else if (msg.type === 'kit:resize')
            onResize(msg);
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
    const fit = () => {
        if (!active || mode === 'fixed')
            return;
        const message = { type: 'kit:fit' };
        try {
            figma.ui.postMessage(message);
        }
        catch {
            // The plugin is closing: there is no UI left to fit.
        }
    };
    return Object.freeze({ mode, chrome: surface.chrome, editorType, fit });
}
// ==== kit:window:end ====
// ---- Your plugin starts here ----
// Contrast check. For each selected text layer, and each text layer inside a selected frame, group
// or component, it measures the contrast between the text and what Figma paints behind it, and
// flags anything below WCAG 2 AA: 4.5:1, or 3:1 for large text (24px, or 18.67px bold).
//
// How it measures: 15 points spread over the text's glyph bounds are rendered twice from a plain
// snapshot of the page, once with the text's fill painted there and once without, and the two
// colours are compared; a layer's result is its lowest ratio. Rendering follows Figma's order:
// fills bottom to top, children back to front, a frame's or group's opacity applied to the whole
// group (not to each child), clipping frames and masks respected. A point where the text can't
// show (an opaque layer above it, or 0% opacity) is left out, like a clipped one: only the visible
// part of a layer is measured, and a layer with no visible part is "not visible", not a failure.
// Other text layers (text on a path too) are left out of the backdrop, because their glyphs cover
// little of their box. Not measured: images, videos and shader fills, and layers whose content the
// API can't read (media, embeds, link previews, widgets, code blocks): text on them is reported as
// "check by eye". Strokes and effects are ignored. Blend modes count as Normal, and vectors, stars
// and polygons as their bounding box; a result that relied on either says so.
installKitWindow({ mode: 'fit-content', size: { width: 320, height: 360 } });
/** WCAG 2 AA minimums. Large text is 18pt, or 14pt bold; Figma sizes are px, and 1pt is 4/3 px. */
const CONTRAST_AA_TEXT = 4.5;
const CONTRAST_AA_LARGE = 3;
/** A selection can hold thousands of text layers: checking stops here so the file never freezes. */
const CONTRAST_MAX_LAYERS = 250;
/** Where each text layer is sampled, as fractions of its glyph bounds. */
const CONTRAST_SAMPLES_X = [0.1, 0.3, 0.5, 0.7, 0.9];
const CONTRAST_SAMPLES_Y = [0.25, 0.5, 0.75];
/** Selection changes come in bursts (shift-click, marquee); edits in long streams (a drag). */
const CONTRAST_SELECTION_DELAY_MS = 120;
const CONTRAST_EDIT_DELAY_MS = 400;
// Messages arrive untyped from another window: check the shape before trusting it.
function contrastMessageType(msg) {
    return typeof msg === 'object' && msg !== null ? msg.type : undefined;
}
function isContrastUiMessage(msg) {
    const type = contrastMessageType(msg);
    if (type === 'contrast-check')
        return true;
    if (type !== 'contrast-select')
        return false;
    const { ids } = msg;
    return Array.isArray(ids) && ids.every((id) => typeof id === 'string');
}
function contrastPost(msg) {
    figma.ui.postMessage(msg);
}
const CONTRAST_CLEAR = { r: 0, g: 0, b: 0, a: 0, unknown: false, approx: false, blend: false };
const CONTRAST_WHITE = { r: 1, g: 1, b: 1, a: 1, unknown: false, approx: false, blend: false };
/** Source-over: top painted on under. */
function contrastOver(top, under) {
    if (top.a <= 0)
        return under;
    const k = 1 - top.a;
    const shows = k > 1e-6; // does anything below still show through?
    return {
        r: top.r + under.r * k,
        g: top.g + under.g * k,
        b: top.b + under.b * k,
        a: top.a + under.a * k,
        unknown: top.unknown || (shows && under.unknown),
        approx: top.approx || (shows && under.approx),
        blend: top.blend || (shows && under.blend),
    };
}
/** A whole layer at an opacity: the layer is flattened first, then faded, as Figma draws groups. */
function contrastFade(color, opacity, blend) {
    if (color.a <= 0)
        return CONTRAST_CLEAR;
    const o = Math.min(1, Math.max(0, opacity));
    return { r: color.r * o, g: color.g * o, b: color.b * o, a: color.a * o, unknown: color.unknown, approx: color.approx, blend: color.blend || blend };
}
/** Relative luminance (WCAG 2). Display P3 files store P3 values, so they use P3's primaries. */
function contrastLuminance(color, p3) {
    const linear = (value) => {
        const v = Math.min(1, Math.max(0, value));
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const r = linear(color.r);
    const g = linear(color.g);
    const b = linear(color.b);
    return p3 ? 0.2289746 * r + 0.6917385 * g + 0.0792869 * b : 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(one, two, p3) {
    const a = contrastLuminance(one, p3);
    const b = contrastLuminance(two, p3);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** An opaque colour as #RRGGBB (rendered colours are opaque, so premultiplied equals straight). */
function contrastHex(color) {
    const byte = (value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0');
    return ('#' + byte(color.r) + byte(color.g) + byte(color.b)).toUpperCase();
}
function contrastIsLarge(fontSize, fontWeight) {
    const pt = fontSize * 0.75;
    return pt >= 18 || (pt >= 14 && fontWeight >= 700);
}
/** Node types with nothing to paint behind text (or only lines), left out of the snapshot. */
const CONTRAST_SKIP_TYPES = new Set(['SLICE', 'LINE', 'CONNECTOR']);
/** Shapes the renderer can't trace, measured as their bounding box (and flagged as approximate). */
const CONTRAST_BOX_TYPES = new Set(['POLYGON', 'STAR', 'VECTOR', 'BOOLEAN_OPERATION', 'SHAPE_WITH_TEXT', 'HIGHLIGHT', 'WASHI_TAPE', 'STAMP']);
/**
 * Layers that paint content the API can't read (a video, an embed, a link preview, a widget, a
 * code block, a slide poll): an opaque box of unknown colour, so text on one is "check by eye"
 * and text under one is covered.
 */
const CONTRAST_OPAQUE_TYPES = new Set(['MEDIA', 'EMBED', 'LINK_UNFURL', 'WIDGET', 'CODE_BLOCK', 'INTERACTIVE_SLIDE_ELEMENT']);
const CONTRAST_OPAQUE_FILL = [{ kind: 'unknown', a: 1, blend: false }];
function contrastFills(paints) {
    if (!Array.isArray(paints))
        return []; // figma.mixed, or no fills at all
    const fills = [];
    for (const paint of paints) {
        if (paint.visible === false)
            continue;
        const a = paint.opacity === undefined ? 1 : paint.opacity;
        if (!(a > 0))
            continue;
        const blend = paint.blendMode !== undefined && paint.blendMode !== 'NORMAL' && paint.blendMode !== 'PASS_THROUGH';
        switch (paint.type) {
            case 'SOLID':
                fills.push({ kind: 'solid', r: paint.color.r, g: paint.color.g, b: paint.color.b, a, blend });
                break;
            case 'GRADIENT_LINEAR':
            case 'GRADIENT_RADIAL':
            case 'GRADIENT_ANGULAR':
            case 'GRADIENT_DIAMOND': {
                const stops = paint.gradientStops
                    .map((stop) => ({ at: stop.position, r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }))
                    .sort((p, q) => p.at - q.at);
                if (stops.length > 0)
                    fills.push({ kind: 'gradient', shape: paint.type, m: paint.gradientTransform, stops, a, blend });
                break;
            }
            default:
                fills.push({ kind: 'unknown', a, blend }); // image, video, pattern, shader
        }
    }
    return fills;
}
function contrastInvert(m) {
    const [[a, c, e], [b, d, f]] = m;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12)
        return null;
    return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
function contrastRadii(node, w, h) {
    let radii = [0, 0, 0, 0];
    if ('topLeftRadius' in node)
        radii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
    else if ('cornerRadius' in node && typeof node.cornerRadius === 'number')
        radii = [node.cornerRadius, node.cornerRadius, node.cornerRadius, node.cornerRadius];
    const max = Math.min(w, h) / 2;
    const [tl, tr, br, bl] = radii.map((r) => (Number.isFinite(r) ? Math.min(max, Math.max(0, r)) : 0));
    return [tl, tr, br, bl];
}
/**
 * Copies the page into plain layers, keeping only what can paint at the sample areas: a layer
 * whose bounds miss every area is dropped, and so is a clipping frame's whole subtree. Children of
 * frames that don't clip are always visited, since they can hang outside their parent. Masks are
 * always kept: dropping one would unmask the layers above it.
 */
function contrastSnapshot(page, targets, areas) {
    const hits = (box) => box !== null && areas.some((r) => box.x <= r.x + r.width && r.x <= box.x + box.width && box.y <= r.y + r.height && r.y <= box.y + box.height);
    const copy = (nodes) => {
        const layers = [];
        for (const node of nodes) {
            try {
                const layer = copyNode(node);
                if (layer)
                    layers.push(layer);
            }
            catch (error) {
                console.warn('contrast check: left out a layer it could not read', node.id, error); // a layer type this code doesn't know
            }
        }
        return layers;
    };
    const copyNode = (node) => {
        if (!node.visible || CONTRAST_SKIP_TYPES.has(node.type))
            return null;
        const mask = 'isMask' in node && node.isMask;
        const target = node.type === 'TEXT' && targets.has(node.id);
        // Other text, on a path too: its glyphs are too sparse to be a backdrop (or a cover).
        if ((node.type === 'TEXT' || node.type === 'TEXT_PATH') && !target && !mask)
            return null;
        const opaque = CONTRAST_OPAQUE_TYPES.has(node.type);
        const hit = hits(node.absoluteBoundingBox);
        const clip = 'clipsContent' in node && node.clipsContent === true;
        const kids = 'children' in node && node.type !== 'BOOLEAN_OPERATION' ? node.children : [];
        const children = kids.length > 0 && (hit || !clip) ? copy(kids) : [];
        if (!hit && !mask && children.length === 0)
            return null;
        const inverse = contrastInvert(node.absoluteTransform);
        if (!inverse)
            return null;
        const w = node.width;
        const h = node.height;
        return {
            id: node.id,
            target,
            outline: node.type === 'ELLIPSE' ? 'ellipse' : opaque ? 'rect' : CONTRAST_BOX_TYPES.has(node.type) ? 'box' : 'rect',
            inverse,
            w,
            h,
            radii: opaque ? [0, 0, 0, 0] : contrastRadii(node, w, h),
            arc: node.type === 'ELLIPSE' ? node.arcData : null,
            fills: !hit || target ? [] : opaque ? CONTRAST_OPAQUE_FILL : 'fills' in node ? contrastFills(node.fills) : [],
            opacity: 'opacity' in node ? node.opacity : 1,
            blend: 'blendMode' in node && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH',
            clip,
            mask,
            children,
        };
    };
    let background = [];
    try {
        background = contrastFills(page.backgrounds);
    }
    catch {
        // An editor without page backgrounds: the render ends on white.
    }
    return { background, children: copy(page.children) };
}
function contrastInside(layer, x, y) {
    const { w, h } = layer;
    if (!(x >= 0 && y >= 0 && x <= w && y <= h))
        return false;
    if (layer.outline === 'box')
        return true;
    if (layer.outline === 'ellipse') {
        const rx = w / 2;
        const ry = h / 2;
        if (rx <= 0 || ry <= 0)
            return false;
        const dx = (x - rx) / rx;
        const dy = (y - ry) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1)
            return false;
        const arc = layer.arc;
        if (!arc)
            return true;
        if (arc.innerRadius > 0 && d < arc.innerRadius * arc.innerRadius)
            return false;
        const turn = 2 * Math.PI;
        const sweep = arc.endingAngle - arc.startingAngle;
        if (Math.abs(sweep) >= turn - 1e-6)
            return true;
        const angle = (((Math.atan2(dy, dx) - arc.startingAngle) % turn) + turn) % turn;
        return angle <= ((sweep % turn) + turn) % turn;
    }
    const [tl, tr, br, bl] = layer.radii;
    const corner = (cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
    if (x < tl && y < tl)
        return corner(tl, tl, tl);
    if (x > w - tr && y < tr)
        return corner(w - tr, tr, tr);
    if (x > w - br && y > h - br)
        return corner(w - br, h - br, br);
    if (x < bl && y > h - bl)
        return corner(bl, h - bl, bl);
    return true;
}
/** Where (u, v), in the layer's 0..1 box, falls along a gradient. gradientTransform maps the box to gradient space. */
function contrastGradientAt(fill, u, v) {
    const [[a, c, e], [b, d, f]] = fill.m;
    const gx = a * u + c * v + e;
    const gy = b * u + d * v + f;
    switch (fill.shape) {
        case 'GRADIENT_LINEAR':
            return gx;
        case 'GRADIENT_RADIAL':
            return Math.hypot(gx - 0.5, gy - 0.5) * 2;
        case 'GRADIENT_DIAMOND':
            return (Math.abs(gx - 0.5) + Math.abs(gy - 0.5)) * 2;
        default: {
            const turn = Math.atan2(gy - 0.5, gx - 0.5) / (2 * Math.PI);
            return turn - Math.floor(turn);
        }
    }
}
function contrastStopAt(stops, t) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (t <= first.at)
        return first;
    if (t >= last.at)
        return last;
    for (let i = 1; i < stops.length; i++) {
        const q = stops[i];
        if (t > q.at)
            continue;
        const p = stops[i - 1];
        const k = q.at > p.at ? (t - p.at) / (q.at - p.at) : 1;
        return { at: t, r: p.r + (q.r - p.r) * k, g: p.g + (q.g - p.g) * k, b: p.b + (q.b - p.b) * k, a: p.a + (q.a - p.a) * k };
    }
    return last;
}
function contrastFillsAt(fills, u, v) {
    let color = CONTRAST_CLEAR;
    for (const fill of fills) {
        let paint;
        if (fill.kind === 'unknown') {
            paint = { r: 0, g: 0, b: 0, a: fill.a, unknown: true, approx: false, blend: fill.blend };
        }
        else {
            const c = fill.kind === 'solid' ? fill : contrastStopAt(fill.stops, contrastGradientAt(fill, u, v));
            const a = fill.kind === 'solid' ? fill.a : c.a * fill.a;
            paint = { r: c.r * a, g: c.g * a, b: c.b * a, a, unknown: false, approx: false, blend: fill.blend };
        }
        color = contrastOver(paint, color);
    }
    return color;
}
/** Paints layers back to front over under. A mask hides the siblings above it outside its shape. */
function contrastRenderLayers(layers, x, y, pass, under) {
    let color = under;
    let masked = false;
    for (const layer of layers) {
        if (layer.mask) {
            const m = layer.inverse;
            masked = !contrastInside(layer, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
            continue;
        }
        if (!masked)
            color = contrastOver(contrastRenderLayer(layer, x, y, pass), color);
    }
    return color;
}
/** One layer and its children at (x, y), flattened on its own and then faded by its opacity. */
function contrastRenderLayer(layer, x, y, pass) {
    const m = layer.inverse;
    const lx = m[0] * x + m[2] * y + m[4];
    const ly = m[1] * x + m[3] * y + m[5];
    const inside = contrastInside(layer, lx, ly);
    if (layer.clip && !inside)
        return CONTRAST_CLEAR;
    const u = layer.w > 0 ? lx / layer.w : 0;
    const v = layer.h > 0 ? ly / layer.h : 0;
    if (layer.target) {
        if (layer.id !== pass.target)
            return CONTRAST_CLEAR; // another text layer being checked
        pass.reached = true;
        return pass.glyph ? contrastFade(contrastFillsAt(pass.glyph, u, v), layer.opacity, layer.blend) : CONTRAST_CLEAR;
    }
    let own = inside && layer.fills.length > 0 ? contrastFillsAt(layer.fills, u, v) : CONTRAST_CLEAR;
    if (layer.outline === 'box' && own.a > 0)
        own = { ...own, approx: true };
    return contrastFade(contrastRenderLayers(layer.children, x, y, pass, own), layer.opacity, layer.blend);
}
/** The colour the page shows at point, opaque. */
function contrastRenderAt(scene, point, pass) {
    const page = contrastFillsAt(scene.background, 0, 0);
    return contrastOver(contrastRenderLayers(scene.children, point.x, point.y, pass, page), CONTRAST_WHITE);
}
// ---- measuring text layers ----
/** Opaque black and white text, the two extremes: where they render alike, the text can't show. */
const CONTRAST_PROBE_DARK = [{ kind: 'solid', r: 0, g: 0, b: 0, a: 1, blend: false }];
const CONTRAST_PROBE_LIGHT = [{ kind: 'solid', r: 1, g: 1, b: 1, a: 1, blend: false }];
/** Less than half an 8-bit step apart, two colours are the same on screen. */
const CONTRAST_SHOW_STEP = 0.5 / 255;
/** Whether the text can change what the page shows at point: false under an opaque cover or at 0% opacity. */
function contrastShows(scene, point, target) {
    const dark = contrastRenderAt(scene, point, { target, glyph: CONTRAST_PROBE_DARK, reached: false });
    const light = contrastRenderAt(scene, point, { target, glyph: CONTRAST_PROBE_LIGHT, reached: false });
    return Math.max(Math.abs(dark.r - light.r), Math.abs(dark.g - light.g), Math.abs(dark.b - light.b)) > CONTRAST_SHOW_STEP;
}
/** The overlap of two boxes, or a when they don't overlap. */
function contrastClipBox(a, b) {
    if (!b)
        return a;
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : a;
}
/**
 * Sample points over the glyphs: the render bounds when the text is upright, else its rotated box.
 * The render bounds are the glyphs' ink, unless the text has a visible effect or stroke: a drop
 * shadow, a blur or a stroke grows them past the glyphs, so they are kept inside the layer's box.
 */
function contrastSamplePoints(node) {
    const m = node.absoluteTransform;
    const upright = Math.abs(m[0][1]) < 1e-9 && Math.abs(m[1][0]) < 1e-9 && m[0][0] > 0 && m[1][1] > 0;
    const grown = node.effects.some((effect) => effect.visible) || node.strokes.some((paint) => paint.visible !== false);
    const ink = node.absoluteRenderBounds;
    const box = !upright ? null : !ink ? node.absoluteBoundingBox : grown ? contrastClipBox(ink, node.absoluteBoundingBox) : ink;
    const points = [];
    for (const fy of CONTRAST_SAMPLES_Y) {
        for (const fx of CONTRAST_SAMPLES_X) {
            if (box) {
                points.push({ x: box.x + fx * box.width, y: box.y + fy * box.height });
            }
            else {
                const lx = fx * node.width;
                const ly = fy * node.height;
                points.push({ x: m[0][0] * lx + m[0][1] * ly + m[0][2], y: m[1][0] * lx + m[1][1] * ly + m[1][2] });
            }
        }
    }
    return points;
}
function contrastArea(points) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs) - 1;
    const y = Math.min(...ys) - 1;
    return { x, y, width: Math.max(...xs) + 1 - x, height: Math.max(...ys) + 1 - y };
}
/** The layer's distinct text styles that matter for contrast: fill, and normal or large size. */
function contrastStyles(node) {
    const styles = new Map();
    for (const segment of node.getStyledTextSegments(['fills', 'fontSize', 'fontWeight'])) {
        if (segment.characters.trim() === '')
            continue; // spaces and line breaks paint nothing
        const large = contrastIsLarge(segment.fontSize, segment.fontWeight);
        const key = JSON.stringify(segment.fills) + (large ? ' large' : ' normal');
        if (!styles.has(key))
            styles.set(key, { glyph: contrastFills(segment.fills), large });
    }
    return [...styles.values()];
}
function contrastBlank(node) {
    return {
        id: node.id,
        name: node.name,
        excerpt: node.characters.replace(/\s+/g, ' ').trim().slice(0, 80),
        status: 'unknown',
        ratio: null,
        required: CONTRAST_AA_TEXT,
        large: false,
        textHex: null,
        backgroundHex: null,
        styles: 0,
        notes: [],
        meta: '',
        verdict: '',
        colors: '',
    };
}
// ---- wording for the UI ----
/** WCAG compares ratios unrounded, so round down: 4.499 never shows as a passing 4.50. */
function contrastRatioText(ratio) {
    return (Math.floor(ratio * 100) / 100).toFixed(2) + ':1';
}
function contrastWord(result) {
    const need = result.large ? `${result.required}:1 for large text (24px, or 18.67px bold)` : `${result.required}:1 for normal-size text`;
    const ratio = result.ratio === null ? '' : contrastRatioText(result.ratio);
    const shown = result.status === 'fail' || result.status === 'pass';
    result.meta = shown ? ratio : '';
    if (result.status === 'fail')
        result.verdict = `${ratio}: below AA, which needs ${need}.`;
    else if (result.status === 'pass')
        result.verdict = `${ratio}: meets AA, which needs ${need}.`;
    else if (result.ratio !== null)
        result.verdict = `Lowest measured ${ratio}; AA needs ${need}.`;
    else
        result.verdict = result.status === 'hidden' ? 'Not measured: the layer is not visible.' : 'Not measured.';
    result.colors = result.textHex && result.backgroundHex ? `Text ${result.textHex} on ${result.backgroundHex}, as they show on the canvas.` : '';
    return result;
}
function contrastSummarize(message) {
    if (message.error !== null)
        return { tone: 'danger', text: `Could not check the selection: ${message.error}` };
    const total = message.results.length;
    if (total === 0)
        return null;
    const count = (status) => message.results.filter((r) => r.status === status).length;
    const fails = count('fail');
    const unsure = count('unknown');
    const hidden = count('hidden');
    const more = message.found > total ? ` Checked the first ${total} of ${message.found}.` : '';
    // "Could not be measured" (check it by eye) and "not visible" (nothing to check) are told apart.
    const eye = ` Check ${unsure === 1 ? 'it' : 'them'} by eye.`;
    const rest = (unsure > 0 ? ` ${unsure} could not be measured.${eye}` : '') + (hidden > 0 ? ` ${hidden} ${hidden === 1 ? 'is' : 'are'} not visible.` : '');
    if (fails > 0) {
        const head = total === 1 ? 'This text layer is below WCAG AA.' : `${fails} of ${total} text layers ${fails === 1 ? 'is' : 'are'} below WCAG AA.`;
        return { tone: 'danger', text: head + rest + more };
    }
    if (total === 1 && unsure === 1)
        return { tone: 'warning', text: `This text layer could not be measured.${eye}` };
    if (total === 1 && hidden === 1)
        return { tone: 'warning', text: 'This text layer is not visible on the canvas.' };
    if (unsure > 0 || hidden > 0) {
        const passes = total - unsure - hidden;
        return { tone: 'warning', text: `${passes} ${passes === 1 ? 'meets' : 'meet'} WCAG AA.${rest}${more}` };
    }
    return { tone: 'success', text: (total === 1 ? 'This text layer meets WCAG AA.' : `All ${total} text layers meet WCAG AA.`) + more };
}
function contrastMeasureText(node, scene, points, p3) {
    const result = contrastBlank(node);
    if (result.excerpt === '') {
        result.notes.push('The layer has no visible characters.');
        return result;
    }
    // The backdrop at each point, without the text. A point the text never reaches is clipped or
    // masked away; one where it can't show is covered by an opaque layer above it (or faded to 0%).
    // Both are left out: a covered point would otherwise compare the cover with itself, 1:1.
    let clipped = 0;
    let covered = 0;
    const behind = points.map((point) => {
        const pass = { target: node.id, glyph: null, reached: false };
        const color = contrastRenderAt(scene, point, pass);
        if (!pass.reached)
            clipped++;
        else if (!contrastShows(scene, point, node.id))
            covered++;
        else
            return color;
        return null;
    });
    if (behind.every((color) => color === null)) {
        result.status = 'hidden';
        result.notes.push(covered === 0
            ? 'Not visible on the canvas: the layer or a parent is hidden, clipped or masked.'
            : clipped === 0
                ? 'Not visible on the canvas: a layer above it covers it, or it is at 0% opacity.'
                : 'Not visible on the canvas: it is clipped, masked or covered by a layer above it.');
        return result;
    }
    if (covered > 0)
        result.notes.push('Part of the text is covered by a layer above it; only the visible part was measured.');
    const styles = contrastStyles(node);
    result.styles = styles.length;
    let worst = Infinity; // lowest ratio / required
    let measured = 0;
    let skipped = 0;
    let filled = 0;
    let approx = false;
    let blend = false;
    for (const style of styles) {
        if (style.glyph.length === 0)
            continue; // no visible fill in this style
        filled++;
        const required = style.large ? CONTRAST_AA_LARGE : CONTRAST_AA_TEXT;
        points.forEach((point, i) => {
            const under = behind[i];
            if (!under)
                return;
            const over = contrastRenderAt(scene, point, { target: node.id, glyph: style.glyph, reached: false });
            if (over.unknown || under.unknown) {
                skipped++;
                return;
            }
            measured++;
            approx = approx || over.approx || under.approx;
            blend = blend || over.blend || under.blend;
            const ratio = contrastRatio(over, under, p3);
            if (ratio / required < worst) {
                worst = ratio / required;
                result.ratio = ratio;
                result.required = required;
                result.large = style.large;
                result.textHex = contrastHex(over);
                result.backgroundHex = contrastHex(under);
            }
        });
    }
    if (filled === 0)
        result.notes.push('The text has no visible fill.');
    else if (measured === 0)
        result.notes.push('The text or what is behind it is an image, video or shader fill. Check it by eye.');
    else if (skipped > 0)
        result.notes.push('Part of the text is over an image, video or shader fill, which is not measured.');
    if (approx)
        result.notes.push('A vector, star or polygon behind the text was measured as its bounding box.');
    if (blend)
        result.notes.push('Blend modes were measured as Normal.');
    if (styles.length > 1 && measured > 0)
        result.notes.push(`Lowest of ${styles.length} text styles in this layer.`);
    if (measured > 0)
        result.status = worst < 1 ? 'fail' : skipped > 0 ? 'unknown' : 'pass';
    return result;
}
const CONTRAST_ORDER = { fail: 0, unknown: 1, hidden: 2, pass: 3 };
/** Failing first, then the ones to check by eye; lowest margin first within each. */
function contrastCompare(a, b) {
    const byStatus = CONTRAST_ORDER[a.status] - CONTRAST_ORDER[b.status];
    if (byStatus !== 0)
        return byStatus;
    const ma = a.ratio === null ? Infinity : a.ratio / a.required;
    const mb = b.ratio === null ? Infinity : b.ratio / b.required;
    if (ma !== mb)
        return ma < mb ? -1 : 1;
    return a.name.localeCompare(b.name);
}
function contrastIsP3() {
    try {
        return figma.root.documentColorProfile === 'DISPLAY_P3';
    }
    catch {
        return false;
    }
}
function contrastMeasure(texts) {
    if (texts.length === 0)
        return [];
    const p3 = contrastIsP3();
    const plans = texts.map((node) => ({ node, points: contrastSamplePoints(node) }));
    const scene = contrastSnapshot(figma.currentPage, new Set(texts.map((node) => node.id)), plans.map((plan) => contrastArea(plan.points)));
    const results = plans.map(({ node, points }) => {
        try {
            return contrastMeasureText(node, scene, points, p3);
        }
        catch (error) {
            const result = contrastBlank(node);
            result.notes.push('Could not read this layer: ' + (error instanceof Error ? error.message : String(error)));
            return result;
        }
    });
    return results.sort(contrastCompare).map(contrastWord);
}
// ---- what gets checked, and when ----
/** True when nothing between node and root (root excluded) is hidden. */
function contrastShownWithin(node, root) {
    for (let n = node; n !== null && n !== root; n = n.parent) {
        if ('visible' in n && !n.visible)
            return false;
    }
    return true;
}
/** The text layers in the selection: selected ones, and the shown ones inside selected containers. */
function contrastCollect(roots) {
    const seen = new Set();
    const texts = [];
    const add = (text) => {
        if (seen.has(text.id))
            return;
        seen.add(text.id);
        if (texts.length < CONTRAST_MAX_LAYERS)
            texts.push(text);
    };
    for (const root of roots) {
        if (root.removed)
            continue;
        if (root.type === 'TEXT')
            add(root);
        else if ('findAllWithCriteria' in root) {
            for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) {
                if (contrastShownWithin(text, root))
                    add(text);
            }
        }
    }
    return { texts, found: seen.size };
}
/** The layers the person selected: kept while the plugin itself changes the selection. */
let contrastRoots = [];
/** The text layers of the last check, by id, for the UI's select requests. */
const contrastChecked = new Map();
/** The selection the plugin set itself, as a key, so its selectionchange doesn't replace the list. */
let contrastOwnSelection = null;
let contrastTimer;
let contrastWatchedPage = null;
function contrastSelectionKey(nodes) {
    return nodes.map((node) => node.id).sort().join(' ');
}
function contrastCheck() {
    if (contrastTimer !== undefined)
        clearTimeout(contrastTimer);
    contrastTimer = undefined;
    const message = { type: 'contrast-results', selection: 0, found: 0, results: [], summary: null, error: null };
    contrastChecked.clear();
    try {
        contrastRoots = contrastRoots.filter((node) => !node.removed);
        message.selection = contrastRoots.length;
        const { texts, found } = contrastCollect(contrastRoots);
        message.found = found;
        for (const text of texts)
            contrastChecked.set(text.id, text);
        message.results = contrastMeasure(texts);
    }
    catch (error) {
        // Answer anyway, so the UI never shows a stale list as if it were current.
        message.error = error instanceof Error ? error.message : String(error);
    }
    message.summary = contrastSummarize(message);
    contrastPost(message);
}
function contrastSchedule(delay) {
    if (contrastTimer !== undefined)
        clearTimeout(contrastTimer);
    contrastTimer = setTimeout(contrastCheck, delay);
}
function contrastTakeSelection() {
    contrastRoots = figma.currentPage.selection.slice();
}
/** Brings the layers into view without changing the zoom, unless they don't fit at this zoom. */
function contrastReveal(nodes) {
    const boxes = nodes.map((node) => node.absoluteBoundingBox).filter((box) => box !== null);
    if (boxes.length === 0)
        return;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const view = figma.viewport.bounds;
    if (left >= view.x && top >= view.y && right <= view.x + view.width && bottom <= view.y + view.height)
        return;
    if (right - left <= view.width && bottom - top <= view.height)
        figma.viewport.center = { x: (left + right) / 2, y: (top + bottom) / 2 };
    else
        figma.viewport.scrollAndZoomIntoView(nodes);
}
function contrastSelect(ids) {
    const nodes = [];
    for (const id of ids) {
        const node = contrastChecked.get(id);
        if (node && !node.removed)
            nodes.push(node);
    }
    if (nodes.length === 0)
        return;
    try {
        contrastOwnSelection = contrastSelectionKey(nodes);
        figma.currentPage.selection = nodes;
    }
    catch (error) {
        contrastOwnSelection = null;
        figma.notify('Could not select the layers: ' + (error instanceof Error ? error.message : String(error)), { error: true });
        return;
    }
    // The selection is made: a viewport that can't move must not turn it into the person's own.
    try {
        contrastReveal(nodes);
    }
    catch (error) {
        console.warn('contrast check: could not scroll to the layers', error);
    }
}
function contrastOnEdit() {
    if (contrastRoots.length > 0)
        contrastSchedule(CONTRAST_EDIT_DELAY_MS);
}
/** Re-check after edits on the current page, so fixing a colour updates the list. */
function contrastWatchPage() {
    try {
        if (contrastWatchedPage)
            contrastWatchedPage.off('nodechange', contrastOnEdit);
        contrastWatchedPage = figma.currentPage;
        contrastWatchedPage.on('nodechange', contrastOnEdit);
    }
    catch (error) {
        contrastWatchedPage = null;
        console.warn('contrast check: edits will not re-check on their own here; use Check again', error);
    }
}
figma.ui.on('message', (msg) => {
    if (!isContrastUiMessage(msg))
        return; // kit:* and anything else falls through
    if (msg.type === 'contrast-check')
        contrastCheck();
    else
        contrastSelect(msg.ids);
});
figma.on('selectionchange', () => {
    const own = contrastOwnSelection;
    contrastOwnSelection = null;
    if (own !== null && own === contrastSelectionKey(figma.currentPage.selection))
        return; // the plugin selected these: keep the list
    contrastTakeSelection();
    contrastSchedule(CONTRAST_SELECTION_DELAY_MS);
});
figma.on('currentpagechange', () => {
    contrastOwnSelection = null;
    contrastWatchPage();
    contrastTakeSelection();
    contrastSchedule(0);
});
// Invisible layers inside instances never paint, so the walk can skip them (much faster on big files).
figma.skipInvisibleInstanceChildren = true;
contrastWatchPage();
contrastTakeSelection();
contrastCheck();
