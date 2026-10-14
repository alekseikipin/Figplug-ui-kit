"use strict";
// Opens a window that follows the Figma theme and that the user can resize from
// its bottom-right corner (see ui.html). The size is saved with
// figma.clientStorage and restored the next time the plugin runs.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// clientStorage is scoped to the plugin id, so a short key is enough.
const STORAGE_KEY = "window-size";
const DEFAULT_SIZE = { width: 320, height: 240 };
// Figma documents a minimum window size (70 x 0) but no maximum. These limits
// keep the window usable and on screen.
const MIN_SIZE = { width: 240, height: 160 };
const MAX_SIZE = { width: 1200, height: 900 };
// Saved data and messages can hold anything: accept only finite numbers, then
// clamp them to the limits and round them to whole pixels.
function toWindowSize(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const { width, height } = value;
    if (typeof width !== "number" || !Number.isFinite(width))
        return undefined;
    if (typeof height !== "number" || !Number.isFinite(height))
        return undefined;
    return {
        width: Math.round(Math.min(Math.max(width, MIN_SIZE.width), MAX_SIZE.width)),
        height: Math.round(Math.min(Math.max(height, MIN_SIZE.height), MAX_SIZE.height)),
    };
}
function loadSavedSize() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            return (_a = toWindowSize(yield figma.clientStorage.getAsync(STORAGE_KEY))) !== null && _a !== void 0 ? _a : DEFAULT_SIZE;
        }
        catch (error) {
            console.warn("Could not read the saved size", error);
            return DEFAULT_SIZE;
        }
    });
}
function onMessage(message) {
    if (message.type === "resize") {
        const size = toWindowSize(message);
        if (!size)
            return;
        figma.ui.resize(size.width, size.height);
        // The UI asks to save when a drag ends or a key is pressed, not on every move.
        if (message.save) {
            figma.clientStorage.setAsync(STORAGE_KEY, size).catch((error) => console.warn("Could not save the size", error));
        }
    }
    else if (message.type === "reset") {
        figma.ui.resize(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
        figma.clientStorage.deleteAsync(STORAGE_KEY).catch((error) => console.warn("Could not forget the size", error));
    }
}
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        const size = yield loadSavedSize();
        // themeColors: Figma adds a figma-light or figma-dark class to <html> and
        // defines the --figma-color-* CSS variables, which follow theme changes live.
        figma.showUI(__html__, { themeColors: true, width: size.width, height: size.height });
        figma.ui.onmessage = onMessage;
    });
}
void start();
