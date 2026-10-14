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
// Content fill (kit example): fills the selected text layers with realistic names, emails, dates
// or numbers, one kind at a time, picked from the UI's dropdown. Each layer gets a different value
// where the kind has enough of them, and one Cmd+Z undoes a whole fill.
//
// UI -> main: 'cf-fill' { kind, nested } and 'cf-close'.
// Main -> UI: 'cf-selection' { direct, nested }, 'cf-filled' { ... } and 'cf-settings' { kind, nested }.
// 'fixed': the UI is one small form whose height never changes (the result line keeps its room),
// so there is nothing to fit or resize. The height is the form's measured height in the preview.
installKitWindow({ mode: 'fixed', size: { width: 320, height: 249 } });
const CF_KINDS = [
    'full-name', 'first-name', 'last-name', 'email', 'date-short', 'date-long', 'date-iso', 'number', 'price', 'percent',
];
function cfIsKind(value) {
    return typeof value === 'string' && CF_KINDS.indexOf(value) >= 0;
}
// Messages arrive untyped from another window: check the type and every field before trusting one.
function cfReadMessage(msg) {
    if (typeof msg !== 'object' || msg === null)
        return null;
    const fields = msg;
    if (fields.type === 'cf-close')
        return { type: 'cf-close' };
    if (fields.type === 'cf-fill' && cfIsKind(fields.kind) && typeof fields.nested === 'boolean') {
        return { type: 'cf-fill', kind: fields.kind, nested: fields.nested };
    }
    return null; // kit:* and anything else
}
function cfPost(msg) {
    figma.ui.postMessage(msg);
}
function cfErrorText(error) {
    return error instanceof Error ? error.message : String(error);
}
// ---- Content ----
// Plain ASCII names, so every font has the glyphs. Emails use the reserved example.* domains
// (RFC 2606), so a filled design never holds a real person's address.
const CF_FIRST_NAMES = [
    'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Mateo', 'Sofia', 'Lucas', 'Mia', 'Ethan',
    'Amara', 'Kenji', 'Priya', 'Arjun', 'Hana', 'Omar', 'Leila', 'Diego', 'Chloe', 'Samuel',
    'Isabella', 'Daniel', 'Grace', 'Wei', 'Mei', 'Yusuf', 'Fatima', 'Aaliyah', 'Jamal', 'Nora',
    'Elijah', 'Maya', 'Julian', 'Ingrid', 'Lars', 'Freya', 'Hugo', 'Elena', 'Marco', 'Aisha',
    'Kwame', 'Zara', 'Ravi', 'Sakura', 'Tomas', 'Anya', 'Felix', 'Ruby', 'Oscar', 'Ines',
    'Kai', 'Layla', 'Theo', 'Camila', 'Gabriel', 'Naomi', 'Adrian', 'Sienna', 'Nikolai', 'Esther',
];
const CF_LAST_NAMES = [
    'Martinez', 'Johnson', 'Nguyen', 'Patel', 'Kim', 'Garcia', 'Smith', 'Chen', 'Okafor', 'Rossi',
    'Becker', 'Kowalski', 'Tanaka', 'Silva', 'Haddad', 'Andersson', "O'Brien", 'Dubois', 'Petrov', 'Khan',
    'Mensah', 'Rahman', 'Lopez', 'Brown', 'Wilson', 'Taylor', 'Moreau', 'Schmidt', 'Novak', 'Yilmaz',
    'Sato', 'Park', 'Singh', 'Cohen', 'Murphy', 'Walker', 'Hughes', 'Carter', 'Reyes', 'Torres',
    'Bennett', 'Fischer', 'Larsen', 'Costa', 'Romano', 'Adeyemi', 'Wong', 'Ali', 'Hernandez', 'Mitchell',
    'Sullivan', 'Jensen', 'Ortiz', 'Ward', 'Brooks', 'Price', 'Diaz', 'Foster', 'Hayes', 'Lindqvist',
];
const CF_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];
const CF_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const CF_DAY_MS = 24 * 60 * 60 * 1000;
function cfRandomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}
function cfPick(list) {
    return list[Math.floor(Math.random() * list.length)];
}
/** Spread over orders of magnitude, so small values are as common as large ones (7, 84, 1,203). */
function cfLogUniform(min, max) {
    return Math.exp(Math.log(min) + Math.random() * (Math.log(max) - Math.log(min)));
}
// Grouped by hand: the plugin sandbox may have no Intl or toLocaleString.
function cfGroupThousands(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function cfPad2(n) {
    return n < 10 ? '0' + n : String(n);
}
function cfEmailPart(name) {
    return name.toLowerCase().replace(/[^a-z]/g, '');
}
function cfEmail() {
    const first = cfEmailPart(cfPick(CF_FIRST_NAMES));
    const last = cfEmailPart(cfPick(CF_LAST_NAMES));
    const local = cfPick([
        first + '.' + last,
        first + '.' + last,
        first + '.' + last + cfRandomInt(1, 99),
        first.charAt(0) + last,
        first + last.charAt(0),
        first + '_' + last,
        first,
    ]);
    return local + '@' + cfPick(CF_EMAIL_DOMAINS);
}
/** Today's date as UTC midnight in ms, so date maths never crosses a daylight-saving change. */
function cfToday() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}
/** A random day within a year either side of `today` (UTC midnight, in ms). */
function cfDate(format, today) {
    const date = new Date(today + cfRandomInt(-365, 365) * CF_DAY_MS);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    if (format === 'date-iso')
        return year + '-' + cfPad2(month + 1) + '-' + cfPad2(day);
    if (format === 'date-long')
        return day + ' ' + CF_MONTHS[month] + ' ' + year;
    return CF_MONTHS[month].slice(0, 3) + ' ' + day + ', ' + year;
}
function cfPrice() {
    const dollars = Math.min(999, Math.max(1, Math.round(cfLogUniform(1, 999))));
    const cents = cfPick(['99', '99', '95', '49', '50', '00', cfPad2(cfRandomInt(0, 99))]);
    return '$' + dollars + '.' + cents;
}
const CF_GENERATORS = {
    'full-name': () => cfPick(CF_FIRST_NAMES) + ' ' + cfPick(CF_LAST_NAMES),
    'first-name': () => cfPick(CF_FIRST_NAMES),
    'last-name': () => cfPick(CF_LAST_NAMES),
    email: () => cfEmail(),
    'date-short': (today) => cfDate('date-short', today),
    'date-long': (today) => cfDate('date-long', today),
    'date-iso': (today) => cfDate('date-iso', today),
    number: () => cfGroupThousands(Math.min(99999, Math.max(1, Math.round(cfLogUniform(1, 99999))))),
    price: () => cfPrice(),
    percent: () => cfRandomInt(0, 100) + '%',
};
/** `count` values of one kind, all different while the kind has enough of them. */
function cfValues(kind, count, today = cfToday()) {
    const make = CF_GENERATORS[kind];
    const seen = new Set();
    const values = [];
    for (let i = 0; i < count; i++) {
        let value = make(today);
        for (let tries = 0; seen.has(value) && tries < 25; tries++)
            value = make(today);
        seen.add(value);
        values.push(value);
    }
    return values;
}
// ---- The selection ----
const CF_TEXT_TYPES = ['TEXT', 'STICKY', 'SHAPE_WITH_TEXT'];
function cfTextOf(node) {
    if (node.type === 'TEXT')
        return node;
    if (node.type === 'STICKY' || node.type === 'SHAPE_WITH_TEXT')
        return node.text;
    return null;
}
/**
 * Whether a layer found inside `root` is one the person can see and edit: neither it nor a layer
 * between it and `root` is hidden or locked. (findAllWithCriteria also returns layers inside a
 * hidden group; checking only the layer's own `visible` would fill those.)
 */
function cfReachable(node, root) {
    for (let current = node; current && current.id !== root.id; current = current.parent) {
        if ('visible' in current && (!current.visible || current.locked))
            return false;
    }
    return true;
}
/**
 * Both scopes from one read of the selection, in selection order, each layer once: `direct`
 * holds the selected text layers (filled even when hidden or locked: the person picked them),
 * `nested` adds the reachable ones inside the selected frames, groups, sections and instances.
 */
function cfScopes() {
    const direct = [];
    const nested = [];
    const seen = new Set();
    const add = (node, list) => {
        const text = cfTextOf(node);
        if (text && !seen.has(node.id)) {
            seen.add(node.id);
            list.push(text);
        }
    };
    // Under "documentAccess": "dynamic-page" the current page is always loaded, so its selection
    // and the subtrees under it can be read synchronously.
    const selection = figma.currentPage.selection;
    for (const node of selection)
        add(node, direct);
    for (const text of direct)
        nested.push(text);
    for (const node of selection) {
        if (!('findAllWithCriteria' in node))
            continue;
        for (const child of node.findAllWithCriteria({ types: CF_TEXT_TYPES })) {
            if (cfReachable(child, node))
                add(child, nested);
        }
    }
    return { direct, nested };
}
function cfPostSelection() {
    try {
        const scopes = cfScopes();
        cfPost({ type: 'cf-selection', direct: scopes.direct.length, nested: scopes.nested.length });
    }
    catch (error) {
        console.warn('Content fill: could not read the selection', error);
    }
}
// ---- Filling ----
function cfFontKey(font) {
    return font.family + '\u0000' + font.style;
}
/** Every font the layer uses (fontName is figma.mixed when there are several); an empty layer has one. */
function cfFontsOf(text) {
    const length = text.characters.length;
    if (length > 0)
        return text.getRangeAllFontNames(0, length);
    const font = text.fontName;
    return font === figma.mixed ? [] : [font];
}
/**
 * Replaces the whole text. Setting `characters` resets every range style, so a layer with mixed
 * fonts would end up in whichever style Figma picks; inserting the value before the first
 * character with that character's style, then deleting the old text, makes the rule explicit:
 * the new text takes the style of the layer's first character. Every font the layer uses must be
 * loaded first (the deleted ranges need theirs too).
 */
function cfReplaceText(text, value) {
    const length = text.characters.length;
    if (length === 0) {
        text.characters = value;
        return;
    }
    text.insertCharacters(0, value, 'AFTER');
    text.deleteCharacters(value.length, value.length + length);
}
async function cfFill(kind, nested, today = cfToday()) {
    const result = { type: 'cf-filled', kind, filled: 0, missingFonts: 0, failed: 0, error: null };
    const scopes = cfScopes();
    const targets = nested ? scopes.nested : scopes.direct;
    // Collect the fonts first and load each one once, however many layers use it.
    const fonts = new Map();
    const ready = [];
    for (const text of targets) {
        if (text.hasMissingFont) {
            result.missingFonts++;
            continue;
        }
        const used = cfFontsOf(text);
        for (const font of used)
            fonts.set(cfFontKey(font), font);
        ready.push({ text, fontKeys: used.map(cfFontKey) });
    }
    const toLoad = Array.from(fonts.entries());
    const loaded = await Promise.allSettled(toLoad.map((entry) => figma.loadFontAsync(entry[1])));
    const unavailable = new Set();
    for (let i = 0; i < loaded.length; i++) {
        if (loaded[i].status === 'rejected')
            unavailable.add(toLoad[i][0]);
    }
    const values = cfValues(kind, ready.length, today);
    for (let i = 0; i < ready.length; i++) {
        const { text, fontKeys } = ready[i];
        if (fontKeys.some((key) => unavailable.has(key))) {
            result.missingFonts++;
            continue;
        }
        try {
            cfReplaceText(text, values[i]);
            result.filled++;
        }
        catch (error) {
            // A read-only layer, or one Figma refuses to change for another reason: leave it and count it.
            if (result.failed === 0)
                console.warn('Content fill: could not change a text layer', error);
            result.failed++;
        }
    }
    // One undo step per fill (plugin edits are otherwise merged until the plugin closes). The
    // layers are already filled, so a failure here costs only that.
    if (result.filled > 0) {
        try {
            figma.commitUndo();
        }
        catch (error) {
            console.warn('Content fill: could not mark the undo step', error);
        }
    }
    return result;
}
// ---- Settings: the kind and scope of the last fill, kept between runs ----
const CF_SETTINGS_KEY = 'content-fill:settings';
async function cfLoadSettings() {
    try {
        const saved = await figma.clientStorage.getAsync(CF_SETTINGS_KEY);
        if (typeof saved !== 'object' || saved === null)
            return;
        const { kind, nested } = saved;
        if (cfIsKind(kind) && typeof nested === 'boolean')
            cfPost({ type: 'cf-settings', kind, nested });
    }
    catch (error) {
        console.warn('Content fill: could not read the saved settings', error);
    }
}
async function cfSaveSettings(kind, nested) {
    try {
        await figma.clientStorage.setAsync(CF_SETTINGS_KEY, { kind, nested });
    }
    catch (error) {
        console.warn('Content fill: could not save the settings', error);
    }
}
// ---- Wiring ----
let cfBusy = false;
async function cfHandleFill(msg) {
    // The UI sends one fill at a time (its button is busy until this answers); this is the backstop,
    // and the running fill's answer is the one that frees the button.
    if (cfBusy)
        return;
    cfBusy = true;
    let reply;
    try {
        reply = await cfFill(msg.kind, msg.nested);
    }
    catch (error) {
        reply = { type: 'cf-filled', kind: msg.kind, filled: 0, missingFonts: 0, failed: 0, error: cfErrorText(error) };
    }
    finally {
        cfBusy = false;
    }
    // Always answer, so the busy Fill button never gets stuck.
    cfPost(reply);
    await cfSaveSettings(msg.kind, msg.nested);
}
figma.ui.on('message', (raw) => {
    const msg = cfReadMessage(raw);
    if (!msg)
        return;
    if (msg.type === 'cf-close') {
        // closePlugin does not stop this function: return at once.
        figma.closePlugin();
        return;
    }
    cfHandleFill(msg).catch((error) => console.warn('Content fill: the fill did not finish', error));
});
figma.on('selectionchange', cfPostSelection);
figma.on('currentpagechange', cfPostSelection);
cfPostSelection();
cfLoadSettings().catch((error) => console.warn('Content fill: could not read the saved settings', error));
