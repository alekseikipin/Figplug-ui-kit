// Test fixture (main thread): minimal, so only what a case adds can trigger the audit.
const KIT_PROTOCOL = 1;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });

figma.ui.on('message', (msg: { type?: unknown; id?: unknown }) => {
  if (msg.type !== 'select' || typeof msg.id !== 'string') return;
  const node = figma.getNodeById(msg.id);
  if (node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') figma.currentPage.selection = [node as SceneNode];
});
