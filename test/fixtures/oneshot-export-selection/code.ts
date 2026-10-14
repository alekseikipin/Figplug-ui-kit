// Regression fixture from the Phase 1 one-shot run "export-selection" (docs/prompts.md). The kit:window block
// is cut to a stand-in; everything after it is the plugin code the agent wrote, verbatim.
const KIT_PROTOCOL = 1;
// ==== kit:window:end ====

// ---- Your plugin starts here ----
// Export selection: exports every selected layer as a PNG at 1x, 2x or 3x. The main thread has no
// Blob and cannot download, so it posts each file's bytes (a Uint8Array) to the UI, which builds
// the file and downloads it.
//
// Messages, UI to main: { type: 'export-png', scale } and { type: 'close' }.
// Main to UI: { type: 'selection', count, stem } at startup and whenever the selection or the
// page changes; then, for one export, { type: 'export-progress', current, total } before each
// layer, { type: 'export-file', name, bytes } for each PNG, and always one
// { type: 'export-done', exported, failed, scale, error } at the end, also when nothing worked.

installKitWindow({ mode: 'fit-content' });

/** The scales the UI offers; anything else is refused. */
const PNG_SCALES: readonly number[] = [1, 2, 3];
/** Longest file name stem (before @2x and .png). File systems allow 255; long names are unreadable. */
const PNG_MAX_STEM = 120;

/** A layer that could not be exported, and why. */
interface PngExportFailure {
  name: string;
  reason: string;
}

let pngExporting = false;

// Messages arrive untyped from another window: check the shape before trusting it.
function messageType(msg: unknown): unknown {
  return typeof msg === 'object' && msg !== null ? (msg as { type?: unknown }).type : undefined;
}

function errorText(error: unknown): string {
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : String(error);
}

/** A file name stem from a layer name: no characters that macOS or Windows refuse, never empty. */
function pngFileStem(layerName: string): string {
  const cleaned = layerName
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, '-') // path separators and reserved characters
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '') // a leading dot hides the file on macOS
    .replace(/[. ]+$/, ''); // Windows drops trailing dots and spaces
  // Cut by code point, so an emoji at the limit is never split in half.
  const stem = Array.from(cleaned).slice(0, PNG_MAX_STEM).join('').trim();
  return stem || 'Layer';
}

/**
 * Figma's own naming: "Frame" at 1x, "Frame@2x" at 2x. Layers with the same name get " (2)",
 * " (3)" ... so one export never produces two files with the same name. `used` holds the names
 * already given in this export, lower-cased because macOS and Windows ignore case.
 */
function pngFileName(stem: string, scale: number, used: Set<string>): string {
  const suffix = scale === 1 ? '' : '@' + scale + 'x';
  let name = stem + suffix + '.png';
  for (let n = 2; used.has(name.toLowerCase()); n++) name = stem + ' (' + n + ')' + suffix + '.png';
  used.add(name.toLowerCase());
  return name;
}

function postSelection(): void {
  // Under "documentAccess": "dynamic-page" the current page is always loaded, so reading its
  // selection synchronously is allowed.
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection',
    count: selection.length,
    // The first layer's file name stem, so the UI can show what the download will be called.
    stem: selection.length > 0 ? pngFileStem(selection[0].name) : '',
  });
}

async function exportSelection(scale: number): Promise<void> {
  // The UI shows a busy button and sends one request at a time; this is the backstop. The running
  // export answers, so the UI is never left waiting.
  if (pngExporting) return;
  pngExporting = true;
  // Take the selection once: the person may change it while the layers render.
  const nodes = figma.currentPage.selection.slice();
  const used = new Set<string>();
  const failed: PngExportFailure[] = [];
  let exported = 0;
  let error = '';
  try {
    if (PNG_SCALES.indexOf(scale) === -1) {
      error = 'Choose a scale of 1x, 2x or 3x.';
    } else if (nodes.length === 0) {
      error = 'Select one or more layers to export.';
    } else {
      for (let i = 0; i < nodes.length; i++) {
        figma.ui.postMessage({ type: 'export-progress', current: i + 1, total: nodes.length });
        let layerName = 'Layer ' + (i + 1);
        try {
          // Reading a layer that was deleted mid-export throws too, so this stays inside the try.
          layerName = nodes[i].name;
          const bytes = await nodes[i].exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
          figma.ui.postMessage({ type: 'export-file', name: pngFileName(pngFileStem(layerName), scale, used), bytes });
          exported++;
        } catch (layerError) {
          // An empty group, a deleted layer, one too large to render: note it and carry on.
          console.warn('Export selection: could not export "' + layerName + '"', layerError);
          failed.push({ name: layerName, reason: errorText(layerError) });
        }
      }
    }
  } catch (unexpected) {
    console.warn('Export selection failed', unexpected);
    error = 'Export failed: ' + errorText(unexpected);
  } finally {
    pngExporting = false;
    // Always answer, so the busy button in the UI never gets stuck.
    figma.ui.postMessage({ type: 'export-done', exported, failed, scale, error });
  }
}

figma.ui.on('message', (msg: unknown) => {
  const type = messageType(msg);
  // Sent by the UI's Close button. closePlugin does not stop this function: return at once.
  if (type === 'close') {
    figma.closePlugin();
    return;
  }
  if (type !== 'export-png') return; // kit:* and anything else falls through
  const { scale } = msg as { scale?: unknown };
  // exportSelection catches everything itself and always answers the UI.
  void exportSelection(typeof scale === 'number' ? scale : NaN);
});

figma.on('selectionchange', postSelection);
figma.on('currentpagechange', postSelection);
postSelection();
