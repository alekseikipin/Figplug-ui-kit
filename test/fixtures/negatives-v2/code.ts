// Test fixture (main thread): valid code that looks suspicious to the audit v2 rules.
// Mentions in comments never count: figma.getNodeById(id), figma.ui.onmessage = handler,
// figma.loadFontAsync(font); and no SES markers either.
const KIT_PROTOCOL = 1;
figma.showUI(__html__, { themeColors: true });
figma.ui.postMessage({ type: 'fixture', protocol: KIT_PROTOCOL });

declare namespace FixtureTypes {
  export interface Row { id: string; name: string }
}

const exportsCount = 0;
const importance = { import: (n: number) => n };
importance.import(exportsCount);

const NOTE = 'figma.getNodeById( and figma.ui.onmessage = in a string are text, not calls';

async function loadRows(ids: string[]): Promise<FixtureTypes.Row[]> {
  const nodes = await Promise.all(ids.map((id) => figma.getNodeByIdAsync(id)));
  const rows: FixtureTypes.Row[] = [];
  for (const node of nodes) if (node) rows.push({ id: node.id, name: node.name });
  return rows;
}

async function fill(node: TextNode): Promise<void> {
  if (node.fontName === figma.mixed) {
    await Promise.all(node.getRangeAllFontNames(0, node.characters.length).map(figma.loadFontAsync));
  } else {
    await figma.loadFontAsync(node.fontName);
  }
  node.characters = 'Placeholder';
}

function readSaved(): Promise<unknown> {
  return figma.clientStorage.getAsync('fixture:saved');
}

async function swap(instance: InstanceNode, component: ComponentNode): Promise<string> {
  const before = (await instance.getMainComponentAsync())?.name ?? '';
  instance.mainComponent = component;
  return before;
}

async function everything(): Promise<number> {
  await figma.loadAllPagesAsync();
  figma.on('documentchange', () => {});
  return figma.root.findAll((n) => n.type === 'TEXT').length;
}

figma.ui.on('message', (msg: { type?: unknown; ids?: unknown }) => {
  if (msg.type === 'rows' && Array.isArray(msg.ids)) {
    loadRows(msg.ids.filter((id): id is string => typeof id === 'string'))
      .then((rows) => figma.ui.postMessage({ type: 'rows', rows }))
      .catch(() => figma.ui.postMessage({ type: 'rows', rows: [] }));
  } else if (msg.type === 'fill') {
    const pending = figma.currentPage.selection.filter((n): n is TextNode => n.type === 'TEXT').map((n) => fill(n));
    void Promise.all(pending);
  } else if (msg.type === 'save') {
    figma.clientStorage.setAsync('fixture:saved', Date.now()).catch(() => {});
  } else if (msg.type === 'restore') {
    const saved = readSaved();
    saved.then((value) => figma.ui.postMessage({ type: 'restored', value }), () => {});
  } else if (msg.type === 'count') {
    void everything().then((n) => figma.ui.postMessage({ type: 'count', n }));
  }
});

let tries = 3;
while (tries-- > 0) figma.currentPage.selection = [];
void swap; void NOTE;
