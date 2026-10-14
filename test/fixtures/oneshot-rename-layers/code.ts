// Regression fixture from the Phase 1 one-shot run "rename-layers" (docs/prompts.md). The kit:window block
// is cut to a stand-in; everything after it is the plugin code the agent wrote, verbatim.
const KIT_PROTOCOL = 1;
// ==== kit:window:end ====

// ---- Your plugin starts here ----
// Rename layers. Main owns the document: it lists the selected layers (in layers-panel order, with
// their canvas position) for the UI, and applies renames. The UI builds every new name from the
// person's rules (prefix, find and replace, numbering), shows them as the preview, and Rename sends
// back exactly the previewed list, so what is applied is what was shown.
//
// Messages. Main to UI: { type: 'selection', layers } at startup, on every selection or page
// change and when a selected layer's name changes; { type: 'renamed', renamed, renamedIds,
// skipped, failed, error } after every rename request, also when it failed. UI to main:
// { type: 'rename', renames: [{ id, from, to }] }.

// fit-content: the window grows and shrinks with the preview. Below 280 px wide the three
// numbering fields would cut their labels short.
installKitWindow({ mode: 'fit-content', bounds: { minWidth: 280 } });

/** One selected layer, as plain data: a node itself can't be posted to the UI. */
interface RenameLayerInfo {
  id: string;
  name: string;
  /** Top-left corner on the canvas, for "Left to right" and "Top to bottom" numbering. */
  x: number;
  y: number;
}

/** One rename from the preview. `from` is the name the preview was built from. */
interface RenameRequestItem {
  id: string;
  from: string;
  to: string;
}

/** Ids of the layers last posted to the UI, so name changes elsewhere refresh the preview. */
let renameSelectedIds = new Set<string>();
let renameWatchedPage: PageNode | null = null;
let renameRefreshPending = false;

// Read the message by shape, not instanceof: an error thrown by the host can come from another
// realm, where it is not an instance of this script's Error.
function renameErrorText(error: unknown): string {
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' && message !== '' ? message : String(error);
}

/**
 * The selection in the order the layers panel lists it, top row first: a parent above its
 * children, and among siblings the frontmost (last child) first. figma.currentPage.selection has
 * no documented order, so numbering never depends on it.
 */
function renameInLayerOrder(nodes: ReadonlyArray<SceneNode>): SceneNode[] {
  const childIndexes = new Map<string, Map<string, number>>();
  const indexIn = (parent: BaseNode & ChildrenMixin, child: BaseNode): number => {
    let indexes = childIndexes.get(parent.id);
    if (!indexes) {
      const map = new Map<string, number>();
      parent.children.forEach((node, i) => map.set(node.id, i));
      childIndexes.set(parent.id, map);
      indexes = map;
    }
    return indexes.get(child.id) ?? -1;
  };
  const paths = new Map<string, number[]>();
  for (const node of nodes) {
    const path: number[] = [];
    let current: BaseNode = node;
    while (current.parent && current.type !== 'PAGE') {
      path.push(indexIn(current.parent, current));
      current = current.parent;
    }
    paths.set(node.id, path.reverse());
  }
  const comparePaths = (a: number[], b: number[]): number => {
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return a.length - b.length; // an ancestor comes before its descendants
  };
  return nodes.slice().sort((a, b) => comparePaths(paths.get(a.id) || [], paths.get(b.id) || []));
}

function renamePosition(node: SceneNode): { x: number; y: number } {
  if (!('absoluteTransform' in node)) return { x: 0, y: 0 };
  const box = node.absoluteBoundingBox;
  if (box) return { x: box.x, y: box.y };
  return { x: node.absoluteTransform[0][2], y: node.absoluteTransform[1][2] };
}

function postSelection(): void {
  let layers: RenameLayerInfo[] = [];
  try {
    // Under "documentAccess": "dynamic-page" the current page is always loaded, so reading its
    // selection synchronously is allowed.
    layers = renameInLayerOrder(figma.currentPage.selection).map((node) => {
      const { x, y } = renamePosition(node);
      return { id: node.id, name: node.name, x, y };
    });
  } catch (error) {
    console.warn('Rename layers: could not read the selection: ' + renameErrorText(error));
  }
  renameSelectedIds = new Set(layers.map((layer) => layer.id));
  figma.ui.postMessage({ type: 'selection', layers });
}

// Name changes made elsewhere (the layers panel, undo, a collaborator) don't change the selection,
// so watch the page for them and refresh the preview once per burst of changes.
function onRenamePageChange(event: NodeChangeEvent): void {
  if (renameRefreshPending) return;
  const touchesSelection = event.nodeChanges.some((change) =>
    change.type === 'PROPERTY_CHANGE' && change.properties.includes('name') && renameSelectedIds.has(change.id));
  if (!touchesSelection) return;
  renameRefreshPending = true;
  setTimeout(() => {
    renameRefreshPending = false;
    postSelection();
  }, 0);
}

function watchRenamePage(page: PageNode): void {
  if (renameWatchedPage === page) return;
  try {
    if (renameWatchedPage) renameWatchedPage.off('nodechange', onRenamePageChange);
    page.on('nodechange', onRenamePageChange);
    renameWatchedPage = page;
  } catch (error) {
    // Without the watcher (an editor that can't watch pages, or the browser preview's stub) the
    // plugin still works: names refresh on the next selection change instead.
    console.warn('Rename layers: cannot watch the page for name changes: ' + renameErrorText(error));
  }
}

function isRenameRequestItem(value: unknown): value is RenameRequestItem {
  if (typeof value !== 'object' || value === null) return false;
  const { id, from, to } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof from === 'string' && typeof to === 'string';
}

/** The renames of a { type: 'rename' } message, or null for any other message (kit:* included). */
function readRenameRequest(msg: unknown): RenameRequestItem[] | null {
  if (typeof msg !== 'object' || msg === null || (msg as { type?: unknown }).type !== 'rename') return null;
  const { renames } = msg as { renames?: unknown };
  return Array.isArray(renames) ? renames.filter(isRenameRequestItem) : [];
}

async function applyRenames(items: RenameRequestItem[]): Promise<void> {
  const renamedIds: string[] = [];
  let skipped = 0;
  let failed = 0;
  let error = '';
  try {
    // The previewed layers are normally still selected; look up only the others, and count a
    // lookup that fails as a missing layer instead of failing the whole batch.
    const selected = new Map(figma.currentPage.selection.map((node) => [node.id, node] as const));
    const nodes = await Promise.all(items.map((item) =>
      selected.get(item.id) || figma.getNodeByIdAsync(item.id).catch(() => null)));
    items.forEach((item, i) => {
      const node = nodes[i];
      // Deleted, not a layer, renamed since the preview was built, or a blank new name: leave it.
      if (!node || node.removed || node.type === 'DOCUMENT' || node.type === 'PAGE' ||
        node.name !== item.from || item.to.trim() === '') {
        skipped++;
        return;
      }
      try {
        node.name = item.to;
        renamedIds.push(node.id);
      } catch (renameError) {
        // For example a layer inside an instance, or a read-only editor.
        failed++;
        if (!error) error = renameErrorText(renameError);
      }
    });
  } catch (lookupError) {
    failed = items.length - renamedIds.length - skipped;
    error = renameErrorText(lookupError);
  }
  const renamed = renamedIds.length;
  if (renamed > 0) {
    // Close an undo step after each Rename, so two Renames in one run undo separately.
    try {
      figma.commitUndo();
    } catch (undoError) {
      console.warn('Rename layers: commitUndo failed: ' + renameErrorText(undoError));
    }
  }
  // Always answer, so the busy Rename button in the UI never gets stuck.
  figma.ui.postMessage({ type: 'renamed', renamed, renamedIds, skipped, failed, error });
  postSelection();
}

figma.ui.on('message', (msg: unknown) => {
  const items = readRenameRequest(msg);
  if (items === null) return; // kit:* and anything else falls through
  applyRenames(items).catch((error) => console.warn('Rename layers: ' + renameErrorText(error)));
});

figma.on('selectionchange', postSelection);
figma.on('currentpagechange', () => {
  watchRenamePage(figma.currentPage);
  postSelection();
});
postSelection();
watchRenamePage(figma.currentPage);
