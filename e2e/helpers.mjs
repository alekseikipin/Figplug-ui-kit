// Shared helpers for the e2e specs. Not a spec itself (playwright.config.mjs matches *.spec.mjs).
// The specs drive preview.html, whose fake Figma host runs the repo's real code.js and ui.html and
// exposes test hooks on window.kitPreviewHost (see the script at the end of preview.html).
// Kit-level specs call useKitFixture(page) first, so they run a small kit-shaped plugin instead of
// the starter's demo; specs about the demo itself skip when it is gone (HAS_DEMO, NO_DEMO).

import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

/**
 * `test` with one automatic check: no console error and no uncaught exception, in the preview page
 * or in the plugin iframe, for the whole test. That is also where a 'use strict' slip (an
 * undeclared variable, a write to a frozen object) would surface.
 */
export const test = base.extend({
  consoleErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
    await use(errors);
    expect(errors, 'console errors or uncaught exceptions').toEqual([]);
  }, { auto: true }],
});
export { expect };

const repoFile = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

/**
 * Whether the starter's "Create shapes" demo is still in place: its 'create-shapes' handler in
 * code.js and its #count field in ui.html. Specs about the demo skip with NO_DEMO when it is gone,
 * so replacing the demo with your plugin leaves `npm run test:e2e` green.
 */
export const HAS_DEMO = repoFile('code.js').includes("'create-shapes'") && repoFile('ui.html').includes('id="count"');
export const NO_DEMO = 'the starter\'s Create-shapes demo is not in code.js and ui.html (replaced by a plugin), so its tests are skipped';

/** Per page, the files useKitFixture serves in place of the repo's (patchFile edits these). */
const served = new WeakMap();

async function serve(page, file, body) {
  // The newest route wins, so a later patch of the same file replaces an earlier one.
  await page.route(`**/${file}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body });
  });
}

/**
 * The kit fixture as the fake host should load it: e2e/fixtures/kit-ui.html as ui.html (its kit
 * blocks are byte copies of ui.html's, checked by test/blocks.test.mjs), and as code.js the real
 * code.js's kit:window block followed by e2e/fixtures/kit-plugin.js.
 */
export function kitFixtureFiles() {
  const code = repoFile('code.js');
  const end = code.indexOf('// ==== kit:window:end ====');
  if (end < 0) throw new Error('code.js has no "// ==== kit:window:end ====" line (run npm run build)');
  return {
    'ui.html': repoFile('e2e/fixtures/kit-ui.html'),
    'code.js': code.slice(0, code.indexOf('\n', end) + 1) + '\n' + repoFile('e2e/fixtures/kit-plugin.js'),
  };
}

/** Serves the kit fixture (kitFixtureFiles) to this page in place of ui.html and code.js. */
export async function useKitFixture(page) {
  const files = kitFixtureFiles();
  served.set(page, files);
  for (const [file, body] of Object.entries(files)) await serve(page, file, body);
}

/** Opens preview.html with query settings ({ theme, plugin, mode, editor, inter, config }) and waits for the plugin. */
export async function openPreview(page, query = {}) {
  const q = new URLSearchParams(query).toString();
  await page.goto(`/preview.html${q ? `?${q}` : ''}`);
  await waitForPlugin(page);
}

/** Waits until the current plugin run has shown its window (its first kit:resize, or kit:init in fixed mode). */
export async function waitForPlugin(page) {
  await page.waitForFunction(() => {
    const host = window.kitPreviewHost;
    if (!host || !host.isReady() || !host.isRunning()) return false;
    const id = host.runId();
    const mine = host.messages().filter((m) => m.run === id);
    const fixed = mine.some((m) => m.msg && m.msg.type === 'kit:init' && m.msg.mode === 'fixed');
    return fixed || mine.some((m) => m.msg && m.msg.type === 'kit:resize');
  });
  const frame = pluginFrame(page);
  await frame.waitForFunction(() => document.documentElement.dataset.kitChrome !== undefined);
  await page.waitForTimeout(100); // let the first fit's reflow settle
  return frame;
}

/** The plugin's iframe (a new Frame after every reload). */
export function pluginFrame(page) {
  const frame = page.frame({ name: 'kit-plugin' });
  if (!frame) throw new Error('no plugin frame');
  return frame;
}

export const host = (page, fn, arg) => page.evaluate(fn, arg);
export const runId = (page) => host(page, () => window.kitPreviewHost.runId());
export const frameSize = (page) => host(page, () => window.kitPreviewHost.frameSize());

/** A position in the host's records, for "everything since" checks. */
export const mark = (page) => host(page, () => ({ messages: window.kitPreviewHost.messages().length, calls: window.kitPreviewHost.calls().length }));
/** UI -> main and main -> UI messages since a mark: [{ dir: 'ui' | 'main', msg, run, t }]. */
export const messagesSince = (page, at) => host(page, (n) => window.kitPreviewHost.messages().slice(n), at.messages);
/** kit:resize messages the UI sent since a mark. */
export const resizesSince = async (page, at) => (await messagesSince(page, at)).filter((m) => m.dir === 'ui' && m.msg.type === 'kit:resize').map((m) => m.msg);
/** figma.* calls since a mark, optionally only one name: [{ name, args }]. */
export const callsSince = async (page, at, name) => (await host(page, (n) => window.kitPreviewHost.calls().slice(n), at.calls)).filter((c) => !name || c.name === name);
/** clientStorage writes since a mark, as the written values. */
export const writesSince = async (page, at) => (await callsSince(page, at, 'clientStorage.setAsync')).map((c) => c.args[1]);

/** Waits until the UI has sent a final kit:resize since the mark, then lets stragglers land. */
export async function waitForFinal(page, at, settle = 150) {
  await page.waitForFunction((n) => window.kitPreviewHost.messages().slice(n).some((m) => m.dir === 'ui' && m.msg && m.msg.final === true), at.messages);
  await page.waitForTimeout(settle);
}

/**
 * Serves the repo file `file` (as preview.html fetches it) with each [from, to] text replacement
 * applied, for this page only; the file on disk is untouched. After useKitFixture the fixture's
 * version of the file is patched instead. Each call starts from the unpatched file and replaces
 * the previous patch. Throws at once when a `from` is missing, so a stale patch fails loudly
 * instead of quietly testing the unpatched file.
 */
export async function patchFile(page, file, edits) {
  const fixture = served.get(page);
  let body = fixture && fixture[file] !== undefined ? fixture[file] : repoFile(file);
  for (const [from, to] of edits) {
    if (!body.includes(from)) throw new Error(`patchFile: ${JSON.stringify(from)} not found in ${fixture && fixture[file] !== undefined ? `the kit fixture's ${file}` : file}`);
    body = body.replace(from, to);
  }
  await serve(page, file, body);
}

/** The height the plugin's content needs, measured the way the runtime measures it. */
export const contentHeight = (frame) => frame.evaluate(() => Math.ceil(document.querySelector('[data-kit-root]').getBoundingClientRect().bottom + scrollY));

export async function handleCenter(frame) {
  const handle = frame.locator('[data-kit-resize]');
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error('resize handle not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Presses the handle, moves by (dx, dy) in steps, runs beforeUp while still pressed, releases. */
export async function drag(page, frame, dx, dy, { steps = 8, button = 'left', beforeUp } = {}) {
  const p = await handleCenter(frame);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(p.x + (dx * i) / steps, p.y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  if (beforeUp) await beforeUp();
  await page.mouse.up({ button });
}

/**
 * Counts event listeners on the plugin's resize handle, window and document through CDP
 * (DOMDebugger.getEventListeners), evaluated in the plugin frame's default execution context.
 * Playwright's own injected scripts register listeners too (one of them is named
 * __playwright_global_listeners_check__); every listener from a script that registered a
 * __playwright* listener is left out. Works whether the sandboxed iframe shares the page's
 * process (headless shell) or runs out of process.
 */
export async function listenerCounter(page) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = new Map(); // frameId -> default execution context id
  cdp.on('Runtime.executionContextCreated', ({ context }) => {
    if (context.auxData && context.auxData.isDefault) contexts.set(context.auxData.frameId, context.id);
  });
  cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
    for (const [frameId, id] of contexts) if (id === executionContextId) contexts.delete(frameId);
  });
  await cdp.send('Runtime.enable'); // replays the contexts that already exist
  const playwrightScripts = new Set();

  async function target() {
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const child = (frameTree.childFrames || []).find((c) => c.frame.name === 'kit-plugin');
    const contextId = child && contexts.get(child.frame.id);
    if (contextId !== undefined) return { session: cdp, contextId, own: false };
    const session = await page.context().newCDPSession(pluginFrame(page)); // out-of-process frame
    await session.send('Runtime.enable');
    return { session, contextId: undefined, own: true };
  }

  return async function count() {
    const { session, contextId, own } = await target();
    const out = {};
    try {
      for (const [key, expression] of [['handle', "document.querySelector('[data-kit-resize]')"], ['window', 'window'], ['document', 'document']]) {
        const { result } = await session.send('Runtime.evaluate', { expression, contextId });
        if (!result.objectId) throw new Error(`no object for ${expression}`);
        const { listeners } = await session.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
        for (const l of listeners) if (l.type.startsWith('__playwright')) playwrightScripts.add(l.scriptId);
        out[key] = listeners.filter((l) => !playwrightScripts.has(l.scriptId))
          .map((l) => `${l.type}${l.useCapture ? '(capture)' : ''}${l.once ? '(once)' : ''}`).sort();
        await session.send('Runtime.releaseObject', { objectId: result.objectId });
      }
    } finally {
      if (own) await session.detach();
    }
    return out;
  };
}
