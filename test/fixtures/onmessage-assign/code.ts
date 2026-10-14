// Test fixture (main thread): minimal, so only what a case adds can trigger the audit.
const KIT_PROTOCOL = 1;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });

figma.ui.onmessage = (msg: { type?: unknown }) => {
  if (msg.type === 'close') figma.closePlugin();
};
