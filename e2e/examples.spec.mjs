// The examples/ plugins, end to end in preview.html's fake Figma host (?plugin=examples/<name>):
// each one boots in the mode its own installKitWindow call asks for, in every editor its manifest
// lists, with no console error or warning and no host error; its window behaves as that mode
// promises (fit-content: the height is the content's; resizable: a size the person drags to
// stays, through content changes and a reopen; fixed: the UI never asks for a size); and axe finds
// no WCAG 2.1 A/AA violation in its window, empty and with the stub's sample selection, except
// 'color-contrast' (decision in docs/accessibility.md, as in e2e/a11y.spec.mjs). Between them the
// examples use all three modes, so this is also PLAN.md's "every mode has a demo".
// Each example's own behaviour is pinned by its golden tests in test/example-<name>.test.mjs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import {
  test, expect, openPreview, pluginFrame, waitForPlugin, mark, messagesSince, resizesSince, frameSize,
  contentHeight, drag, waitForFinal, host,
} from './helpers.mjs';

/** Each example and the window mode it is the demo of. */
const EXAMPLES = {
  'a11y-contrast': 'fit-content',
  'content-fill': 'fixed',
  'export-selection': 'resizable',
  'rename-layers': 'fit-content',
  'variables-sync': 'resizable',
};
/** Examples whose main thread answers a selection change (variables-sync lists variables, not layers). */
const FOLLOWS_SELECTION = new Set(['a11y-contrast', 'content-fill', 'export-selection', 'rename-layers']);

const ROOT = new URL('../', import.meta.url);
const manifestOf = (name) => JSON.parse(readFileSync(new URL(`examples/${name}/manifest.json`, ROOT), 'utf8'));
const FOLDERS = readdirSync(new URL('examples/', ROOT)).filter((name) => existsSync(new URL(`examples/${name}/manifest.json`, ROOT))).sort();

const axe = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']);
const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

/** Console warnings from the page and the plugin frame (the auto fixture already fails on errors). */
function collectWarnings(page) {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  return warnings;
}

/** This run's messages, in order. */
const runMessages = (page) => host(page, () => window.kitPreviewHost.messages().filter((m) => m.run === window.kitPreviewHost.runId()));
const kitInit = async (page) => (await runMessages(page)).find((m) => m.msg.type === 'kit:init').msg;
const hostErrors = (page) => page.locator('#live-log li[data-dir="error"]').allTextContents();

/** Opens one example; the theme follows the editor as the preview's own switch does (FigJam is light only). */
async function openExample(page, name, query = {}) {
  await openPreview(page, { plugin: `examples/${name}`, ...(query.editor === 'figjam' && !query.theme ? { theme: 'figjam' } : {}), ...query });
  return pluginFrame(page);
}

/** Selects the stub's sample (a card frame with two text layers, and a label), then lets the plugin answer and the UI settle. */
async function selectSample(page, name) {
  const at = await mark(page);
  await host(page, () => window.kitPreviewHost.select('sample'));
  if (FOLLOWS_SELECTION.has(name)) {
    await page.waitForFunction((n) => window.kitPreviewHost.messages().slice(n)
      .some((m) => m.dir === 'main' && typeof m.msg.type === 'string' && !m.msg.type.startsWith('kit:')), at.messages);
  }
  await page.waitForTimeout(300);
  return at;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

test('the examples cover every window mode, and the preview offers each of them', async ({ page }) => {
  expect(FOLDERS, 'every examples/ folder with a manifest has a row in EXAMPLES').toEqual(Object.keys(EXAMPLES).sort());
  expect([...new Set(Object.values(EXAMPLES))].sort()).toEqual(['fit-content', 'fixed', 'resizable']);
  await openPreview(page);
  const offered = await page.locator('#live-plugin option').evaluateAll((options) => options.map((o) => /** @type {HTMLOptionElement} */ (o).value));
  expect(offered, 'the Plugin picker lists the starter and every example').toEqual(['', ...FOLDERS.map((name) => `examples/${name}`)]);
  // The starter keeps running from the repo root, and the address only ever picks a listed plugin.
  expect(await host(page, () => window.kitPreviewHost.plugin())).toBe('');
  await page.goto('/preview.html?plugin=../package.json');
  await waitForPlugin(page);
  expect(await host(page, () => window.kitPreviewHost.plugin())).toBe('');
});

test('the Plugin picker switches plugins, keeps the address in step, and the mode switch still forces a mode', async ({ page }) => {
  await openPreview(page);
  await page.locator('#live-plugin').selectOption('examples/content-fill');
  await waitForPlugin(page);
  expect(new URL(page.url()).searchParams.get('plugin')).toBe('examples/content-fill');
  await expect(page.locator('#live-title')).toHaveText(manifestOf('content-fill').name);
  expect((await kitInit(page)).mode).toBe('fixed');
  await expect(page.locator('#live-status')).toHaveText("editorType figma · mode fixed (the plugin's own)");
  // A forced mode still wins over the plugin's own, as for the starter.
  await page.locator('#live-mode').selectOption('resizable');
  await waitForPlugin(page);
  expect((await kitInit(page)).mode).toBe('resizable');
  expect(new URL(page.url()).searchParams.get('mode')).toBe('resizable');
  await page.locator('#live-mode').selectOption('own');
  await page.locator('#live-plugin').selectOption('');
  await waitForPlugin(page);
  await expect(page.locator('#live-title')).toHaveText(JSON.parse(readFileSync(new URL('manifest.json', ROOT), 'utf8')).name);
  expect(new URL(page.url()).searchParams.get('plugin')).toBe(null);
  expect(await hostErrors(page)).toEqual([]);
});

for (const [name, mode] of Object.entries(EXAMPLES)) {
  const manifest = manifestOf(name);

  test.describe(`examples/${name} (${mode})`, () => {
    test(`boots in ${mode} in every editor its manifest lists (${manifest.editorType.join(', ')}), with no console error or warning`, async ({ page }) => {
      const warnings = collectWarnings(page);
      for (const editor of manifest.editorType) {
        const frame = await openExample(page, name, editor === 'figma' ? {} : { editor });
        const init = await kitInit(page);
        expect(init, editor).toMatchObject({ mode, editorType: editor });
        expect(await frame.evaluate(() => document.documentElement.dataset.kitMode), editor).toBe(mode);
        await expect(page.locator('#live-title')).toHaveText(manifest.name);
        await selectSample(page, name);
        expect(await hostErrors(page), editor).toEqual([]);
        expect((await frameSize(page)).state, editor).toBe('shown');
      }
      expect(warnings).toEqual([]);
    });

    if (mode === 'fit-content') {
      test('fit-content: the window is as tall as its content, before and after the selection grows it', async ({ page }) => {
        const frame = await openExample(page, name);
        const { bounds, defaultSize } = await kitInit(page);
        const fits = async () => clamp(await contentHeight(frame), bounds.minHeight, bounds.maxHeight);
        expect(await frameSize(page)).toEqual({ width: defaultSize.width, height: await fits(), state: 'shown' });
        const before = (await frameSize(page)).height;
        await selectSample(page, name);
        await expect.poll(async () => (await frameSize(page)).height - (await fits())).toBe(0);
        expect((await frameSize(page)).height, 'the sample selection changes the content').not.toBe(before);
        expect(await frame.evaluate(() => document.documentElement.dataset.kitChrome)).toBe('on');
      });
    }

    if (mode === 'resizable') {
      test('resizable: a size the person drags to stays through a content change and a reopen', async ({ page }) => {
        let frame = await openExample(page, name);
        const { bounds, defaultSize, restored } = await kitInit(page);
        expect(restored).toBe(false);
        expect(await frameSize(page)).toEqual({ ...defaultSize, state: 'shown' });
        const target = { width: clamp(defaultSize.width - 40, bounds.minWidth, bounds.maxWidth), height: clamp(defaultSize.height - 40, bounds.minHeight, bounds.maxHeight) };
        expect(target, 'the drag changes both sides').not.toEqual(defaultSize);
        // A tall window can end below the page's fold; the handle sits in its bottom-right corner.
        await page.locator('#live-frame').evaluate((el) => el.scrollIntoView({ block: 'center' }));
        let at = await mark(page);
        await drag(page, frame, target.width - defaultSize.width, target.height - defaultSize.height);
        await waitForFinal(page, at);
        expect((await resizesSince(page, at)).at(-1)).toMatchObject({ ...target, user: true, final: true });
        expect(await frameSize(page)).toEqual({ ...target, state: 'shown' });

        at = await selectSample(page, name);
        expect((await resizesSince(page, at)).filter((m) => m.width !== target.width || m.height !== target.height), 'no refit away from the chosen size').toEqual([]);
        expect(await frameSize(page)).toEqual({ ...target, state: 'shown' });

        const reopened = await mark(page);
        await host(page, () => window.kitPreviewHost.reload());
        frame = await waitForPlugin(page);
        expect((await messagesSince(page, reopened)).find((m) => m.msg.type === 'kit:init').msg).toMatchObject({ mode, restored: true, size: target });
        expect(await frameSize(page)).toEqual({ ...target, state: 'shown' });
        expect(await frame.evaluate(() => document.documentElement.dataset.kitChrome)).toBe('on');
      });
    }

    if (mode === 'fixed') {
      test('fixed: the window keeps its size, has no handle, and the UI never sends kit:resize', async ({ page }) => {
        const frame = await openExample(page, name);
        const { size } = await kitInit(page);
        await page.waitForTimeout(600); // past the runtime's 500 ms fallbacks
        expect(await frameSize(page)).toEqual({ ...size, state: 'shown' });
        expect(await frame.evaluate(() => ({
          chrome: document.documentElement.dataset.kitChrome,
          handleHidden: /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]')).hidden,
        }))).toEqual({ chrome: 'off', handleHidden: true });
        await selectSample(page, name);
        // A change inside the window (a checkbox that changes the text around it) asks for no size either.
        const box = frame.locator('input[type="checkbox"]').first();
        if (await box.count()) await box.click();
        await page.waitForTimeout(300);
        expect((await runMessages(page)).filter((m) => m.dir === 'ui' && m.msg.type === 'kit:resize')).toEqual([]);
        expect(await host(page, () => window.kitPreviewHost.calls().filter((c) => c.name === 'ui.resize'))).toEqual([]);
        expect(await frameSize(page)).toEqual({ ...size, state: 'shown' });
        // The content fits the fixed height: nothing scrolls out of reach under the footer.
        expect(await contentHeight(frame)).toBeLessThanOrEqual(size.height);
      });
    }

    const themes = ['light', 'dark', ...(manifest.editorType.includes('figjam') ? ['figjam'] : [])];
    for (const theme of themes) {
      test(`axe: no WCAG 2.1 A/AA violations in its window, empty and with a selection (${theme})`, async ({ page }) => {
        await openExample(page, name, theme === 'figjam' ? { theme, editor: 'figjam' } : { theme });
        let { violations } = await axe(page).include('#live-frame').analyze();
        expect(summary(violations), 'empty').toEqual([]);
        await selectSample(page, name);
        ({ violations } = await axe(page).include('#live-frame').analyze());
        expect(summary(violations), 'with the sample selection').toEqual([]);
      });
    }
  });
}
