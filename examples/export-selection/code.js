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
// Export selection (kit example): exports the selected layers as PNG files at 1x, 2x or 3x. The
// main thread renders the bytes with exportAsync and posts them as a Uint8Array; the UI turns each
// file into a Blob and starts its download, because Blob and downloads exist only in the iframe
// (docs/pitfalls.md#15-blob-exists-only-in-the-ui).
// Resizable: the layer list can be any length, so the person sizes the window and the kit
// remembers it. The page scrolls under the sticky footer, and Home on the grip fits the list.
installKitWindow({ mode: 'resizable' });
/** The most layers one export takes, so a stray select-all can't start hundreds of downloads. */
const PNG_MAX_LAYERS = 100;
/** figma.clientStorage key for the last scale the person picked. */
const PNG_SCALE_KEY = 'export-png:scale';
/** Longest file name kept from a layer name, in characters (before " 2" and "@2x.png"). */
const PNG_MAX_NAME = 100;
function postToUi(message) {
    figma.ui.postMessage(message);
}
// Messages arrive untyped from another window: check every field before trusting one.
function isPngScale(value) {
    return value === 1 || value === 2 || value === 3;
}
function isPngExportMessage(msg) {
    if (typeof msg !== 'object' || msg === null)
        return false;
    const { type, ids, scale } = msg;
    return (type === 'png-export' &&
        isPngScale(scale) &&
        Array.isArray(ids) &&
        ids.length > 0 &&
        ids.length <= PNG_MAX_LAYERS &&
        ids.every((id) => typeof id === 'string'));
}
function isPngSaveScaleMessage(msg) {
    if (typeof msg !== 'object' || msg === null)
        return false;
    const { type, scale } = msg;
    return type === 'png-save-scale' && isPngScale(scale);
}
/**
 * The area a PNG export covers, at 1x. A slice draws nothing itself (its render bounds can be
 * null): it exports the area it marks, so its bounding box is the size. Every other layer exports
 * its render bounds, which include shadows and thick strokes and are null when nothing is drawn.
 */
function pngBounds(node) {
    if (node.type === 'SLICE')
        return node.absoluteBoundingBox;
    if ('absoluteRenderBounds' in node)
        return node.absoluteRenderBounds;
    if ('absoluteBoundingBox' in node)
        return node.absoluteBoundingBox;
    return 'width' in node ? node : null;
}
function pngLayer(node) {
    const box = pngBounds(node);
    return { id: node.id, name: node.name, width: box ? box.width : 0, height: box ? box.height : 0 };
}
function postPngSelection() {
    // Under dynamic-page the current page is always loaded, so its selection can be read directly.
    const selection = figma.currentPage.selection;
    const layers = selection.length <= PNG_MAX_LAYERS ? selection.map(pngLayer) : [];
    postToUi({ type: 'png-selection', count: selection.length, max: PNG_MAX_LAYERS, layers });
}
/**
 * The exportAsync settings for one layer. A slice exports what lies under it, so it needs
 * contentsOnly: false (true, the default, exports only a layer's own contents).
 */
function pngExportSettings(node, scale) {
    const settings = { format: 'PNG', constraint: { type: 'SCALE', value: scale } };
    return node.type === 'SLICE' ? { ...settings, contentsOnly: false } : settings;
}
/**
 * The download name for a layer: its name without the characters file systems refuse and
 * without a ".png" it already ends in, then "@2x" or "@3x". Names already used in this export get
 * " 2", " 3" ... so no file replaces another (compared without case, as macOS and Windows do).
 */
function pngFileName(layerName, scale, used) {
    // Whitespace first, so a line break in a text layer's name becomes a space, not a "-".
    const cleaned = layerName
        .replace(/\s+/g, ' ')
        .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-')
        .trim()
        .replace(/\.png$/i, '');
    // Cut by code points, so an emoji at the cut is kept or dropped whole, never split in half.
    const base = Array.from(cleaned).slice(0, PNG_MAX_NAME).join('').replace(/^[\s.]+|[\s.]+$/g, '') || 'Layer';
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++)
        name = base + ' ' + n;
    used.add(name.toLowerCase());
    return name + (scale === 1 ? '' : '@' + scale + 'x') + '.png';
}
async function exportPng(ids, scale) {
    const used = new Set();
    const failed = [];
    let exported = 0;
    try {
        for (const id of ids) {
            let label = 'a deleted layer';
            try {
                const node = await figma.getNodeByIdAsync(id);
                if (node)
                    label = node.name;
                if (!node || !('exportAsync' in node)) {
                    failed.push(label);
                    continue;
                }
                const bytes = await node.exportAsync(pngExportSettings(node, scale));
                // One message per file, so the UI can start each download (and drop its bytes) at once.
                postToUi({ type: 'png-file', name: pngFileName(node.name, scale, used), bytes });
                exported++;
            }
            catch (error) {
                // A hidden or empty layer, or one too large to render: skip it and say so at the end.
                console.warn('Export selection: could not export "' + label + '"', error);
                failed.push(label);
            }
        }
    }
    finally {
        // Always answer, so the UI's busy Export button never gets stuck.
        postToUi({ type: 'png-done', exported, failed });
        if (failed.length > 0) {
            figma.notify('Could not export ' + failed.length + ' layer' + (failed.length === 1 ? '' : 's'), { error: true });
        }
    }
}
async function loadPngScale() {
    try {
        const saved = await figma.clientStorage.getAsync(PNG_SCALE_KEY);
        if (isPngScale(saved))
            postToUi({ type: 'png-settings', scale: saved });
    }
    catch (error) {
        console.warn('Export selection: could not read the saved scale', error); // 2x stays selected
    }
}
async function savePngScale(scale) {
    try {
        await figma.clientStorage.setAsync(PNG_SCALE_KEY, scale);
    }
    catch (error) {
        console.warn('Export selection: could not save the scale', error);
    }
}
function handlePngMessage(msg) {
    if (msg.type === 'png-export') {
        exportPng(msg.ids, msg.scale).catch((error) => console.warn('Export selection failed', error));
    }
    else {
        void savePngScale(msg.scale);
    }
}
figma.ui.on('message', (msg) => {
    // kit:* messages and anything else fall through.
    if (isPngExportMessage(msg) || isPngSaveScaleMessage(msg))
        handlePngMessage(msg);
});
figma.on('selectionchange', postPngSelection);
figma.on('currentpagechange', postPngSelection);
postPngSelection();
void loadPngScale();
