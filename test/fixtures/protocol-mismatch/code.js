"use strict";
// Test fixture (main thread). scripts/audit.mjs only reads the KIT_PROTOCOL line.
const KIT_PROTOCOL = 2;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });
