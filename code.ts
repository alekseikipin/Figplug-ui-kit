// Load saved size or use defaults
const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

// Feature flags
const PERSIST_WINDOW_SIZE = true; // Toggle to false to disable size persistence

type UiMessage =
  | { type: 'ready' }
  | { type: 'resize'; width: number; height: number }
  | { type: 'persist-size'; width: number; height: number };

type SizeInfo = { width: number; height: number; hasSaved: boolean };

function clampSize(width: number, height: number) {
  const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
  const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
  return { width: w, height: h };
}

let initialSizeInfo: SizeInfo = { width: 320, height: 345, hasSaved: false };

async function loadPluginSize(): Promise<SizeInfo> {
  if (!PERSIST_WINDOW_SIZE) {
    return { width: 320, height: 345, hasSaved: false };
  }
  try {
    const savedSize = await figma.clientStorage.getAsync('plugin-size');
    if (savedSize && savedSize.width && savedSize.height) {
        const { width, height } = clampSize(savedSize.width, savedSize.height);
        return { width, height, hasSaved: true };
    }
  } catch (error) {
    console.log('No saved size found, using defaults');
  }
  return { width: 320, height: 345, hasSaved: false };
}

// Initialize plugin with saved or default size
loadPluginSize().then(info => {
  initialSizeInfo = info;
  figma.showUI(__html__, { 
    width: info.width, 
    height: info.height, 
    themeColors: true 
  });
});

figma.ui.onmessage = async (msg: UiMessage) => {
  if (msg.type === 'ready') {
    // Send initial info to UI so it can decide on auto-size behavior
    figma.ui.postMessage({
      type: 'init',
      hasSavedSize: PERSIST_WINDOW_SIZE && initialSizeInfo.hasSaved,
      width: initialSizeInfo.width,
      height: initialSizeInfo.height,
      persistenceEnabled: PERSIST_WINDOW_SIZE,
    });
    return;
  }

  if (msg.type === 'resize') {
    const { width, height } = clampSize(msg.width, msg.height);
    figma.ui.resize(width, height);
    return;
  }

  else if (msg.type === 'persist-size') {
    if (!PERSIST_WINDOW_SIZE) {
      return;
    }
    try {
      const { width, height } = clampSize(msg.width, msg.height);
      await figma.clientStorage.setAsync('plugin-size', { width, height });
    } catch (error) {
      console.log('Failed to save size:', error);
      figma.notify('Failed to save plugin size');
    }
  } else {
    console.warn('Unknown UI message', msg);
  }
};
