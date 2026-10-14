// Test fixture (main thread): minimal, so only what a case adds can trigger the audit.
const KIT_PROTOCOL = 1;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });

figma.ui.on('message', (msg: { type?: unknown }) => {
  if (msg.type !== 'fill') return;
  for (const node of figma.currentPage.selection) {
    if (node.type !== 'TEXT' || node.fontName === figma.mixed) continue;
    figma.loadFontAsync(node.fontName);
    node.characters = 'Placeholder';
  }
});
