// Test fixture (main thread): minimal, so only what a case adds can trigger the audit.
const KIT_PROTOCOL = 1;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });

// Later: load the word lists lazily with import('./words') once Figma supports it.
