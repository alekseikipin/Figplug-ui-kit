// kit.d.ts · kit v0.4.0 · protocol 1
// Shared types for the kit window protocol between code.ts (main thread) and ui.html (iframe).
// Export-free on purpose: code.ts is a plain script (any import/export breaks the no-bundler
// build), so everything here is global. ui.html's runtime mirrors these names in JSDoc and
// `npm run check:ui` type-checks that mirror. Keep this file DOM-free so it compiles in code.ts.

/** How the plugin window is sized. Set in code.ts via installKitWindow({ mode }). */
type KitMode = 'fit-content' | 'resizable' | 'fixed';

interface KitSize {
  width: number;
  height: number;
}

interface KitBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

/** Stored by installKitWindow in figma.clientStorage under the key 'kit:window'. */
interface KitSizeRecord {
  v: 1;
  editorType: string;
  width: number;
  height: number;
}

// ---- UI -> main (sent as parent.postMessage({ pluginMessage: msg }, '*')) ----

/**
 * Sent once by the UI runtime when the page has loaded. Main then shows a window that is still
 * hidden 800 ms later, unless a kit:resize shows it first; in 'fixed' mode, right after its reply.
 */
interface KitReadyMessage {
  type: 'kit:ready';
  protocol: number;
}

/**
 * Ask the main thread to resize the window.
 * user:  the size came from the person (drag, keyboard, snap), not from fitting content.
 * final: the gesture is finished; persist now instead of debouncing.
 * The kit runtime always sends both; main treats a missing one as false. Main clamps the size to
 * the bounds and rounds it to whole pixels (Figma rejects a fractional size), and the first one
 * shows the window. Main ignores this message in 'fixed' mode.
 */
interface KitResizeMessage {
  type: 'kit:resize';
  width: number;
  height: number;
  user?: boolean;
  final?: boolean;
}

type KitUiToMainMessage = KitReadyMessage | KitResizeMessage;

// ---- main -> UI (sent as figma.ui.postMessage(msg)) ----

/** Reply to kit:ready. Carries the single source of truth for mode and bounds. */
interface KitInitMessage {
  type: 'kit:init';
  protocol: number;
  mode: KitMode;
  /**
   * false on surfaces where the window chrome (resize handle) is turned off, e.g. Dev Mode, Buzz,
   * or an editorType the kit does not know yet.
   */
  chrome: boolean;
  editorType: string;
  bounds: KitBounds;
  /** Current window size after any restore. */
  size: KitSize;
  /** Size installKitWindow was asked for; Home on the resize handle returns to its width. */
  defaultSize: KitSize;
  /** true when a saved size was applied. */
  restored: boolean;
}

/**
 * Ask the UI to measure [data-kit-root] again and fit the window height to it, keeping the width
 * (the same as kit.fit() in the UI). Sent by KitWindow.fit(). 'fit-content' and 'resizable' fit;
 * 'fixed' ignores it. One that arrives before the UI's first size request is applied by that
 * request. Added in kit 0.3.0 within protocol 1: an older UI ignores it, like any kit:* type it
 * does not know. The fitted size is never saved.
 */
interface KitFitMessage {
  type: 'kit:fit';
}

type KitMainToUiMessage = KitInitMessage | KitFitMessage;

// ---- main-thread API (code.ts) ----

interface KitWindowOptions {
  /** HTML to show. Default: __html__ (the manifest's ui file). */
  html?: string;
  /** Window title. Default: the plugin name. */
  title?: string;
  /** Default: 'fit-content'. An unknown value falls back to it with one console.warn. */
  mode?: KitMode;
  /** Starting size before any saved size or content fit. Default: 320 x 360. */
  size?: Partial<KitSize>;
  /** Merged over the defaults for the current editor. */
  bounds?: Partial<KitBounds>;
  /** Remember the size the person chose between runs. Default: true. */
  persist?: boolean;
}

/** What installKitWindow() returns. */
interface KitWindow {
  readonly mode: KitMode;
  /** false where the resize handle is off: Dev Mode, Buzz, editors the kit does not know yet. */
  readonly chrome: boolean;
  readonly editorType: string;
  /**
   * Fit the window height to the UI's content now, keeping the width (posts kit:fit). Call it
   * after a message that changes what the UI shows, in 'resizable' mode; 'fit-content' already
   * follows its content. Does nothing in 'fixed' mode, or after a later installKitWindow() call
   * has replaced this window. Safe to call before the UI has loaded.
   */
  fit(): void;
}

// ---- UI-side API (window.kit, created by the runtime in ui.html) ----

/** Options for kit.toast(). Added in kit 0.4.0. */
interface KitToastOptions {
  /** The leading icon; 'danger' is also announced at once (role="alert"). Default: no icon. */
  tone?: 'info' | 'success' | 'warning' | 'danger';
  /** Milliseconds shown, not counting time under the pointer or with focus inside. Default 4000; 0 keeps it until dismissed. */
  duration?: number;
  /** One button in the toast: onClick runs, then the toast is dismissed. */
  action?: { label: string; onClick(): void };
}

/** What kit.toast() returns. */
interface KitToastHandle {
  /** Removes the toast, or takes it out of the queue if it has not been shown yet. Safe to call twice. */
  dismiss(): void;
}

/** The part of a <dialog> element that kit.dialog() uses (kept DOM-free so code.ts compiles this file). */
interface KitDialogLike {
  showModal(): void;
  close(returnValue?: string): void;
  readonly returnValue: string;
}

interface KitUiApi {
  readonly version: string;
  readonly protocol: number;
  /** Re-measure [data-kit-root] and fit the window height to it (fit-content and resizable). */
  fit(): void;
  /**
   * Opens a <dialog class="kit-dialog"> (its id, or the element) as a modal and resolves with its
   * returnValue when it closes: a [data-kit-dialog-close] button's value, or '' after Escape. Rejects
   * when there is no such dialog. Added in kit 0.4.0.
   */
  dialog(target: string | KitDialogLike): Promise<string>;
  /** Queues a toast at the bottom of the window; one shows at a time. Added in kit 0.4.0. */
  toast(message: string, options?: KitToastOptions): KitToastHandle;
}
