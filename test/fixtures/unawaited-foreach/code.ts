// Test fixture (main thread): minimal, so only what a case adds can trigger the audit.
const KIT_PROTOCOL = 1;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });

// The shape agents write: each callback awaits its font, but forEach returns at once, so the
// notification (and a closePlugin after it) runs before any text is filled, and errors are lost.
figma.ui.on('message', (msg: { type?: unknown; text?: unknown }) => {
  if (msg.type !== 'fill' || typeof msg.text !== 'string') return;
  const text = msg.text;
  const texts = figma.currentPage.selection.filter((node): node is TextNode => node.type === 'TEXT');
  texts.forEach(async (node) => {
    if (node.fontName === figma.mixed) return;
    await figma.loadFontAsync(node.fontName);
    node.characters = text;
  });
  figma.notify(`Filled ${texts.length} text layers`);
});
