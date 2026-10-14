// The examples/ plugins, end to end in preview.html's fake Figma host (?plugin=examples/<name>):
// each one boots in the mode its own installKitWindow call asks for, in every editor its manifest
// lists, with no console error or warning and no host error; its window behaves as that mode
// promises (fit-content: the height is the content's; resizable: a size the person drags to
// stays, through content changes and a reopen; fixed: the UI never asks for a size); and axe finds
// no WCAG 2.1 A/AA violation in its window, empty and with the stub's sample selection, except
// 'color-contrast' (decision in docs/accessibility.md, as in e2e/a11y.spec.mjs). Between them the
// examples use all three modes, so this is also PLAN.md's "every mode has a demo".
// Each example's own behaviour is pinned by its golden tests in examples/<name>/example.test.mjs.
// kit-tour, the curated tour the Community listing runs, has a describe of its own at the end:
// its tabs refit the fit-content window, focus never hides under its sticky tab bar, its menu,
// dialog and toasts work (the Undo toast waits), its components and the Create flow react (a held
// Enter acts once), its Window tab tells the truth in each mode and in Buzz, and axe passes on
// every tab and with each overlay open.
// examples/ is optional: you may delete it, or any one example, when you start your own plugin.
// The tests of a missing example skip (with the reason), and the Plugin picker checks adapt to
// the examples that are there.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import {
  test, expect, openPreview, pluginFrame, waitForPlugin, mark, messagesSince, resizesSince, frameSize,
  contentHeight, drag, waitForFinal, host, callsSince, patchFile,
} from './helpers.mjs';

/** Each example and the window mode it is the demo of. */
const EXAMPLES = {
  'a11y-contrast': 'fit-content',
  'content-fill': 'fixed',
  'export-selection': 'resizable',
  'kit-tour': 'fit-content',
  'rename-layers': 'fit-content',
  'variables-sync': 'resizable',
};
/** Examples whose main thread answers a selection change (variables-sync lists variables, not layers). */
const FOLLOWS_SELECTION = new Set(['a11y-contrast', 'content-fill', 'export-selection', 'kit-tour', 'rename-layers']);
/** fit-content examples whose content grows with the sample selection (kit-tour's changes a line of text; its tabs change its height). */
const GROWS_WITH_SELECTION = new Set(['a11y-contrast', 'rename-layers']);

const ROOT = new URL('../', import.meta.url);
const manifestOf = (name) => JSON.parse(readFileSync(new URL(`examples/${name}/manifest.json`, ROOT), 'utf8'));
/** The examples/ folders with a manifest.json in this repo (none once examples/ is deleted). */
const FOLDERS = existsSync(new URL('examples/', ROOT))
  ? readdirSync(new URL('examples/', ROOT)).filter((name) => existsSync(new URL(`examples/${name}/manifest.json`, ROOT))).sort()
  : [];
const PRESENT = Object.keys(EXAMPLES).filter((name) => FOLDERS.includes(name));
const gone = (name) => `examples/${name} is not in this repo (deleted when starting a plugin), so its tests are skipped`;
/** The picker's values, '' being the starter. */
const offered = (page) => page.locator('#live-plugin option').evaluateAll((options) => options.map((o) => /** @type {HTMLOptionElement} */ (o).value));

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

test('the known examples cover every window mode, and every examples/ folder is one of them', () => {
  expect([...new Set(Object.values(EXAMPLES))].sort()).toEqual(['fit-content', 'fixed', 'resizable']);
  expect(FOLDERS.filter((name) => !(name in EXAMPLES)), 'every examples/ folder with a manifest has a row in EXAMPLES (and in preview.html\'s picker)').toEqual([]);
});

test('the preview offers the starter and each example that is there', async ({ page }) => {
  await openPreview(page);
  expect(await offered(page), 'the Plugin picker lists the starter and the examples in this repo').toEqual(['', ...FOLDERS.map((name) => `examples/${name}`)]);
  // With no example left there is nothing to pick, so the field goes.
  expect(await page.locator('#live-plugin').isVisible()).toBe(FOLDERS.length > 0);
  // The starter keeps running from the repo root, and the address only ever picks a listed plugin.
  expect(await host(page, () => window.kitPreviewHost.plugin())).toBe('');
  await page.goto('/preview.html?plugin=../package.json');
  await waitForPlugin(page);
  expect(await host(page, () => window.kitPreviewHost.plugin())).toBe('');
});

test('the Plugin picker leaves out examples the server does not have, and an address naming one runs the starter', async ({ page }) => {
  // As if examples/content-fill had been deleted: its files answer 404 (the probe's 404 in the
  // console is expected: helpers.mjs's isMissingExample lets exactly that one through).
  await page.route('**/examples/content-fill/**', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
  await openPreview(page, { plugin: 'examples/content-fill' });
  expect(await offered(page)).toEqual(['', ...FOLDERS.filter((name) => name !== 'content-fill').map((name) => `examples/${name}`)]);
  expect(await host(page, () => window.kitPreviewHost.plugin())).toBe('');
  expect(new URL(page.url()).searchParams.get('plugin'), 'the address drops the missing example').toBe(null);
  await expect(page.locator('#live-note')).toBeHidden();
  expect(await hostErrors(page)).toEqual([]);
  // As if examples/ had been deleted: only the starter is left and the field goes.
  await page.route('**/examples/**', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
  await openPreview(page);
  expect(await offered(page)).toEqual(['']);
  await expect(page.locator('#live-plugin')).toBeHidden();
  expect(await host(page, () => window.kitPreviewHost.plugin())).toBe('');
});

test('the Plugin picker switches plugins, keeps the address in step, and the mode switch still forces a mode', async ({ page }) => {
  // content-fill (fixed) when it is there, else whichever example is left.
  const name = PRESENT.includes('content-fill') ? 'content-fill' : PRESENT[0];
  test.skip(!name, 'no examples/ folder is left, so there is nothing to switch to');
  const own = EXAMPLES[name];
  const forced = own === 'resizable' ? 'fixed' : 'resizable';
  await openPreview(page);
  await page.locator('#live-plugin').selectOption(`examples/${name}`);
  await waitForPlugin(page);
  expect(new URL(page.url()).searchParams.get('plugin')).toBe(`examples/${name}`);
  await expect(page.locator('#live-title')).toHaveText(manifestOf(name).name);
  expect((await kitInit(page)).mode).toBe(own);
  await expect(page.locator('#live-status')).toHaveText(`editorType figma · mode ${own} (the plugin's own)`);
  // A forced mode still wins over the plugin's own, as for the starter.
  await page.locator('#live-mode').selectOption(forced);
  await waitForPlugin(page);
  expect((await kitInit(page)).mode).toBe(forced);
  expect(new URL(page.url()).searchParams.get('mode')).toBe(forced);
  await page.locator('#live-mode').selectOption('own');
  await page.locator('#live-plugin').selectOption('');
  await waitForPlugin(page);
  await expect(page.locator('#live-title')).toHaveText(JSON.parse(readFileSync(new URL('manifest.json', ROOT), 'utf8')).name);
  expect(new URL(page.url()).searchParams.get('plugin')).toBe(null);
  expect(await hostErrors(page)).toEqual([]);
});

for (const [name, mode] of Object.entries(EXAMPLES)) {
  if (!PRESENT.includes(name)) {
    test(`examples/${name} (${mode})`, () => test.skip(true, gone(name)));
    continue;
  }
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
      test('fit-content: the window is as tall as its content, before and after a selection', async ({ page }) => {
        const frame = await openExample(page, name);
        const { bounds, defaultSize } = await kitInit(page);
        const fits = async () => clamp(await contentHeight(frame), bounds.minHeight, bounds.maxHeight);
        expect(await frameSize(page)).toEqual({ width: defaultSize.width, height: await fits(), state: 'shown' });
        const before = (await frameSize(page)).height;
        await selectSample(page, name);
        await expect.poll(async () => (await frameSize(page)).height - (await fits())).toBe(0);
        if (GROWS_WITH_SELECTION.has(name)) expect((await frameSize(page)).height, 'the sample selection changes the content').not.toBe(before);
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

// ---- kit-tour: the tour itself ---------------------------------------------------------------

test.describe('examples/kit-tour: the tour', () => {
  test.skip(!PRESENT.includes('kit-tour'), gone('kit-tour'));
  // The tour's window is up to 720px tall: the page must show all of it, toasts at its bottom included.
  test.use({ viewport: { width: 1280, height: 1000 } });

  /** Opens the tour with its whole window in the page's view. */
  async function openTour(page, query = {}) {
    const frame = await openExample(page, 'kit-tour', query);
    await page.locator('#live-window').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    return frame;
  }

  const tab = (frame, label) => frame.locator('.kit-tab', { hasText: label });
  /** The text of each toast in the window (one at most: the kit shows one at a time). */
  const toasts = (frame) => frame.locator('.kit-toast .kit-toast-text').allTextContents();
  const dismissToast = (frame) => frame.locator('.kit-toast [aria-label="Dismiss"]').click();
  /** The create-shapes messages the UI sent since a mark. */
  const createsSince = async (page, at) => (await messagesSince(page, at)).filter((m) => m.dir === 'ui' && m.msg.type === 'create-shapes').map((m) => m.msg);
  /** Holds Enter down: the first keydown, then `repeats` auto-repeated ones, as a held key sends them. */
  async function holdEnter(page, repeats = 10) {
    for (let i = 0; i <= repeats; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(30); }
    await page.keyboard.up('Enter');
  }

  test('opens on Components; switching tabs refits the fit-content window to each tab, and saves nothing', async ({ page }) => {
    const frame = await openTour(page);
    const { bounds } = await kitInit(page);
    await expect(frame.locator('input[name="tour"][value="components"]')).toBeChecked();
    expect((await frameSize(page)).height, 'Components is taller than the window may be: it opens at maxHeight').toBe(bounds.maxHeight);
    // The tab bar is the first row: nothing above it but the visually hidden h1.
    expect(await frame.evaluate(() => Math.round(/** @type {Element} */ (document.querySelector('.kit-tablist')).getBoundingClientRect().top))).toBe(0);
    await expect(frame.locator('h1')).toHaveClass(/kit-visually-hidden/);
    const fits = async () => clamp(await contentHeight(frame), bounds.minHeight, bounds.maxHeight);
    const at = await mark(page);
    const heights = {};
    for (const label of ['Create', 'Components', 'Window']) {
      await tab(frame, label).click();
      await expect(frame.locator(`input[name="tour"][value="${label.toLowerCase()}"]`)).toBeChecked();
      await expect.poll(async () => (await frameSize(page)).height - (await fits()), label).toBe(0);
      heights[label] = (await frameSize(page)).height;
      expect((await frameSize(page)).width, label).toBe(360);
    }
    expect(heights.Create, 'Create is the shortest tab').toBeLessThan(heights.Window);
    expect(heights.Components).toBe(bounds.maxHeight);
    expect(heights.Window, 'Window fits under the maximum, with room to spare').toBeLessThan(bounds.maxHeight - 40);
    // The Window tab's readout is the window's own size, and fit-content is the mode in use.
    await expect(frame.locator('#size')).toHaveText(`360 × ${heights.Window}`);
    await expect(frame.locator('[data-tour-mode][aria-current="true"]')).toHaveAttribute('data-tour-mode', 'fit-content');
    await expect(frame.locator('#handle-part')).toBeVisible();
    // Back to Create: the same height as before.
    await tab(frame, 'Create').click();
    await expect.poll(async () => (await frameSize(page)).height).toBe(heights.Create);
    // Content fits are never saved; each tab's refit was a kit:resize with user: false.
    const fitsSent = await resizesSince(page, at);
    expect(fitsSent.length).toBeGreaterThanOrEqual(3);
    expect(fitsSent.every((m) => m.user === false)).toBe(true);
    expect(await callsSince(page, at, 'clientStorage.setAsync')).toEqual([]);
  });

  test('the tab bar stays in view while Components scrolls, and focus moving back up never hides under it', async ({ page }) => {
    const frame = await openTour(page);
    await page.waitForTimeout(300);
    await frame.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = await frame.evaluate(() => /** @type {Element} */ (document.querySelector('.kit-tablist')).getBoundingClientRect().top);
    expect(bar, 'stuck to the top').toBe(0);
    // The list at the end is reachable, inside the window.
    const last = await frame.evaluate(() => ({ bottom: /** @type {Element} */ (document.querySelector('.tour-list .kit-scroll')).getBoundingClientRect().bottom, height: window.innerHeight }));
    expect(last.bottom).toBeLessThanOrEqual(last.height);
    // Shift+Tab from the last list row back to the tabs: no control gets focus under the sticky bar
    // (WCAG 2.4.11), because the page's scroll-padding-top keeps scrolled-to controls below it.
    await frame.locator('#frames li:last-child .kit-list-row').focus();
    const hidden = [];
    let steps = 0;
    for (; steps < 80; steps++) {
      await page.keyboard.press('Shift+Tab');
      const r = await frame.evaluate(() => {
        const el = /** @type {HTMLElement} */ (document.activeElement);
        const box = el.getBoundingClientRect();
        const barBottom = /** @type {Element} */ (document.querySelector('.kit-tablist')).getBoundingClientRect().bottom;
        return { name: el.id || el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24) || el.tagName, top: box.top, barBottom, tab: el.matches('input[name="tour"]') };
      });
      if (r.tab) break;
      if (r.top < r.barBottom) hidden.push(`${r.name} at ${Math.round(r.top)} (bar ends at ${Math.round(r.barBottom)})`);
    }
    expect(steps, 'reached the tabs').toBeLessThan(80);
    expect(hidden).toEqual([]);
  });

  test('the menu, the dialog and the toasts work; the Undo toast waits for the person', async ({ page }) => {
    const frame = await openTour(page);

    // Menu: opens, focuses its first item, an item shows a toast and closes the menu.
    const trigger = frame.locator('[popovertarget="tour-menu"]');
    await trigger.click();
    await expect(frame.locator('#tour-menu')).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(frame.locator('#tour-menu .kit-menu-item').first()).toBeFocused();
    await frame.locator('#tour-menu .kit-menu-item', { hasText: 'Duplicate' }).click();
    await expect(frame.locator('#tour-menu')).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => toasts(frame)).toEqual(['Duplicated 3 layers']);
    await expect(frame.locator('.kit-toast')).toHaveAttribute('data-kit-tone', 'success');
    await dismissToast(frame);

    // Dialog: modal, the field has focus, Rename returns "rename" and the toast names the result.
    const dialog = frame.locator('#tour-dialog');
    await frame.locator('#open-dialog').click();
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
    await expect(frame.locator('#dialog-name')).toBeFocused();
    await frame.locator('#dialog-name').fill('Pricing');
    await frame.locator('#dialog-ok').click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => toasts(frame)).toEqual(['Renamed to “Pricing”']);
    await dismissToast(frame);
    // Enter in the field is Rename too.
    await frame.locator('#open-dialog').click();
    await frame.locator('#dialog-name').fill('Hero');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect.poll(() => toasts(frame)).toEqual(['Renamed to “Hero”']);
    await dismissToast(frame);
    // Cancel returns its value; Escape returns ''.
    await frame.locator('#open-dialog').click();
    await frame.locator('#tour-dialog [value="cancel"]').click();
    await expect.poll(() => toasts(frame)).toEqual(['Cancelled']);
    await dismissToast(frame);
    await frame.locator('#open-dialog').click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => toasts(frame)).toEqual(['Closed without renaming']);
    await dismissToast(frame);
    // A held Enter on the opener opens the dialog once and does not press Rename for the person.
    await frame.locator('#open-dialog').focus();
    await holdEnter(page);
    await expect(dialog).toBeVisible();
    expect(await toasts(frame)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect.poll(() => toasts(frame)).toEqual(['Closed without renaming']);
    await dismissToast(frame);

    // A toast per tone, each with its icon.
    for (const tone of ['info', 'success', 'warning', 'danger']) {
      await frame.locator(`#toast-${tone}`).click();
      await expect(frame.locator('.kit-toast'), tone).toHaveAttribute('data-kit-tone', tone);
      await dismissToast(frame);
    }
    // Undo has no timer: it is still there after the default 4 s.
    await frame.locator('#toast-undo').click();
    await expect.poll(() => toasts(frame)).toEqual(['Deleted 2 layers']);
    await page.waitForTimeout(4600);
    expect(await toasts(frame), 'duration 0: the Undo toast waits').toEqual(['Deleted 2 layers']);
    // Undo runs its action, then the toast that says so.
    await frame.locator('.kit-toast').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => toasts(frame)).toEqual(['Restored 2 layers']);
    await dismissToast(frame);
    // Another toast takes the Undo toast away at once, instead of queueing behind it for good.
    await frame.locator('#toast-undo').click();
    await expect.poll(() => toasts(frame)).toEqual(['Deleted 2 layers']);
    await frame.locator('#toast-warning').click();
    await expect.poll(() => toasts(frame), { timeout: 1500 }).toEqual(['3 names are duplicates']);
    await dismissToast(frame);
    // So does leaving the Components tab.
    await frame.locator('#toast-undo').click();
    await expect.poll(() => toasts(frame)).toEqual(['Deleted 2 layers']);
    await tab(frame, 'Window').click();
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
    await tab(frame, 'Components').click();
    // Two at once queue: one shows, the second follows.
    await frame.locator('#toast-queue').click();
    await expect.poll(() => toasts(frame)).toEqual(['First of two']);
    await dismissToast(frame);
    await expect.poll(() => toasts(frame)).toEqual(['Second of two']);
    await dismissToast(frame);
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
  });

  test('the components react: busy, toggles, indeterminate, colour sync, errors, notices, the list', async ({ page }) => {
    const frame = await openTour(page);
    await frame.locator('#save').click();
    await expect(frame.locator('#save')).toHaveAttribute('aria-busy', 'true');
    await expect(frame.locator('#save')).not.toHaveAttribute('aria-busy', 'true', { timeout: 3000 });
    await expect.poll(() => toasts(frame)).toEqual(['Saved']);
    await dismissToast(frame);
    await frame.locator('#snap').click();
    await expect(frame.locator('#snap')).toHaveAttribute('aria-pressed', 'false');
    await frame.locator('#lock').click();
    await expect(frame.locator('#lock')).toHaveAttribute('aria-pressed', 'true');
    // "All" is indeterminate while some parts are checked, and sets them all.
    const all = frame.locator('#include-all');
    expect(await all.evaluate((el) => /** @type {HTMLInputElement} */ (el).indeterminate)).toBe(true);
    await all.click();
    expect(await all.evaluate((el) => /** @type {HTMLInputElement} */ (el).indeterminate)).toBe(false);
    expect(await frame.locator('[data-tour-part]:checked').count()).toBe(3);
    // The swatch and the hex field stay in step, both ways.
    const hex = frame.locator('#fill-hex');
    const swatch = frame.locator('#fill-swatch');
    await swatch.fill('#33cc99');
    await expect(hex).toHaveValue('33CC99');
    await hex.fill('FF3366');
    await expect(swatch).toHaveValue('#ff3366');
    // On change the code is trimmed and written in upper case; three digits expand, '#' or not.
    for (const [typed, shown] of [[' ff3366 ', 'FF3366'], ['F0A', 'FF00AA'], ['#0d9', '00DD99']]) {
      await hex.fill(typed);
      await hex.blur();
      await expect(hex, typed).toHaveValue(shown);
      await expect(hex, typed).not.toHaveAttribute('aria-invalid', 'true');
      await expect(swatch, typed).toHaveValue(`#${shown.toLowerCase()}`);
    }
    // Eight digits (alpha) are an error with or without '#', never cut to six.
    for (const typed of ['#11223344', '0D99FF80', 'nope']) {
      await hex.fill(typed);
      await hex.blur();
      await expect(hex, typed).toHaveValue(typed);
      await expect(hex, typed).toHaveAttribute('aria-invalid', 'true');
      await expect(swatch, typed).toHaveValue('#00dd99');
    }
    await expect(frame.locator('#fill-help')).toHaveText('Enter a hex code, like 0D99FF or F0A.');
    // The prefix starts in its error state and leaves it once the value is valid.
    await expect(frame.locator('#prefix')).toHaveAttribute('aria-invalid', 'true');
    await frame.locator('#prefix').fill('Frame');
    await expect(frame.locator('#prefix')).not.toHaveAttribute('aria-invalid', 'true');
    // Only the info notice is a live region: the others are static samples.
    expect(await frame.locator('.kit-notice[role]').evaluateAll((els) => els.map((el) => `${el.id}:${el.getAttribute('role')}`))).toEqual(['notice-info:status']);
    // Dismissing the info notice enables the header's button that brings it back; focus follows
    // the step both ways, so it is never left on a hidden or an inert button.
    await expect(frame.locator('#restore')).toHaveAttribute('aria-disabled', 'true');
    await frame.locator('#dismiss-info').focus();
    await page.keyboard.press('Enter');
    await expect(frame.locator('#notice-info')).toBeHidden();
    await expect(frame.locator('#restore')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(frame.locator('#restore')).toBeFocused();
    await expect(frame.locator('#tip-restore')).toHaveText('1 notice is hidden');
    await page.keyboard.press('Enter');
    await expect(frame.locator('#notice-info')).toBeVisible();
    await expect(frame.locator('#restore')).toHaveAttribute('aria-disabled', 'true');
    await expect(frame.locator('#dismiss-info')).toBeFocused();
    // One current row in the list.
    await frame.locator('#frames .kit-list-row', { hasText: 'Pricing' }).click();
    await expect(frame.locator('#frames [aria-current="true"]')).toHaveText(/Pricing/);
    await expect(frame.locator('#frames [aria-current]')).toHaveCount(1);
    // The empty state's button goes to the Create tab.
    await frame.locator('#go-create').click();
    await expect(frame.locator('input[name="tour"][value="create"]')).toBeChecked();
    await expect(frame.locator('input[name="tour"][value="create"]')).toBeFocused();
  });

  test('Create: the selection line, validation, one create per press (Enter held too), busy until main answers', async ({ page }) => {
    const frame = await openTour(page);
    await tab(frame, 'Create').click();
    const status = frame.locator('#status');
    await expect(status).toHaveText('Nothing selected');
    await host(page, () => window.kitPreviewHost.select('sample'));
    await expect(status).toHaveText('2 layers selected');
    // 0 and 51 are errors and send nothing; Create puts focus back in the field.
    for (const bad of ['0', '51']) {
      await frame.locator('#count').fill(bad);
      await expect(frame.locator('#count'), bad).toHaveAttribute('aria-invalid', 'true');
      await expect(frame.locator('#count-help'), bad).toHaveText('Enter a whole number from 1 to 50.');
      const at = await mark(page);
      await frame.locator('#create').click();
      await expect(frame.locator('#count'), bad).toBeFocused();
      expect(await createsSince(page, at), `${bad} sends nothing`).toEqual([]);
    }
    await frame.locator('#count').fill('3');
    await expect(frame.locator('#count')).not.toHaveAttribute('aria-invalid', 'true');
    await frame.locator('#shape').selectOption('ellipse');
    let at = await mark(page);
    await frame.locator('#create').click();
    // Main selects what it made, so the selection line follows: the two lines, split by a <br>.
    await expect(status).toHaveText('3 layers selected' + 'Created 3 ellipses');
    await expect(status.locator('br')).toHaveCount(1);
    await expect(frame.locator('#create')).not.toHaveAttribute('aria-busy', 'true');
    expect(await createsSince(page, at)).toEqual([{ type: 'create-shapes', count: 3, shape: 'ellipse' }]);
    expect(await callsSince(page, at, 'createEllipse')).toHaveLength(3);
    // Enter in Count creates, once; held down, still once (repeats are ignored), in the field and on Create.
    await frame.locator('#shape').selectOption('rectangle');
    await frame.locator('#count').fill('2');
    at = await mark(page);
    await frame.locator('#count').press('Enter');
    await expect(status).toContainText('Created 2 rectangles');
    expect(await createsSince(page, at)).toHaveLength(1);
    for (const target of ['#count', '#create']) {
      at = await mark(page);
      await frame.locator(target).focus();
      await holdEnter(page);
      await page.waitForTimeout(200);
      expect(await createsSince(page, at), `Enter held on ${target}`).toHaveLength(1);
      expect(await callsSince(page, at, 'createRectangle'), `Enter held on ${target}`).toHaveLength(2);
    }
    expect(await hostErrors(page)).toEqual([]);
  });

  test('Create: busy until main answers, and a second press meanwhile sends nothing', async ({ page }) => {
    // Main answers 500 ms late here, so the second press lands while the first is still running.
    await patchFile(page, 'examples/kit-tour/code.js', [["tourPost({ type: 'created', count: nodes.length, shape });", "setTimeout(() => tourPost({ type: 'created', count: nodes.length, shape }), 500);"]]);
    const frame = await openTour(page);
    await tab(frame, 'Create').click();
    const at = await mark(page);
    await frame.locator('#create').click();
    await expect(frame.locator('#create')).toHaveAttribute('aria-busy', 'true');
    // aria-busy stops the pointer (Playwright's click would wait it out), not the keyboard.
    await frame.locator('#create').press('Enter');
    await frame.locator('#create').press(' ');
    await frame.locator('#count').press('Enter');
    await expect(frame.locator('#status')).toContainText('Created 5 rectangles');
    await expect(frame.locator('#create')).not.toHaveAttribute('aria-busy', 'true');
    expect(await createsSince(page, at)).toEqual([{ type: 'create-shapes', count: 5, shape: 'rectangle' }]);
  });

  test('Create: when main cannot create, the status says so and Create is not left busy', async ({ page }) => {
    // As an editor that can't create the node would: the first create call throws.
    await patchFile(page, 'examples/kit-tour/code.js', [['figma.createRectangle()', "(() => { throw new Error('stub: no rectangles here'); })()"]]);
    const frame = await openTour(page);
    await tab(frame, 'Create').click();
    const at = await mark(page);
    await frame.locator('#create').click();
    await expect(frame.locator('#status')).toContainText('Nothing created');
    await expect(frame.locator('#create')).not.toHaveAttribute('aria-busy', 'true');
    expect((await callsSince(page, at, 'notify')).map((c) => c.args[0])).toEqual(['Could not create shapes: stub: no rectangles here']);
  });

  test('Window: a line of content grows and shrinks the window on its own, and nothing is saved', async ({ page }) => {
    const frame = await openTour(page);
    await tab(frame, 'Window').click();
    const { bounds } = await kitInit(page);
    const fits = async () => clamp(await contentHeight(frame), bounds.minHeight, bounds.maxHeight);
    await expect.poll(async () => (await frameSize(page)).height - (await fits())).toBe(0);
    const before = (await frameSize(page)).height;
    const at = await mark(page);
    const grow = frame.locator('#grow');
    await grow.click();
    await expect(frame.locator('#grow-line')).toBeVisible();
    await expect(grow).toHaveText('Remove the line');
    await expect.poll(async () => (await frameSize(page)).height).toBeGreaterThan(before);
    await expect.poll(async () => (await frameSize(page)).height - (await fits())).toBe(0);
    await expect(frame.locator('#size')).toHaveText(`360 × ${(await frameSize(page)).height}`);
    await grow.click();
    await expect(frame.locator('#grow-line')).toBeHidden();
    await expect(grow).toHaveText('Add a line');
    await expect.poll(async () => (await frameSize(page)).height).toBe(before);
    expect((await resizesSince(page, at)).every((m) => m.user === false)).toBe(true);
    expect(await callsSince(page, at, 'clientStorage.setAsync')).toEqual([]);
  });

  test('Window, resizable (the preview\'s mode switch): the line calls kit.fit(), and the copy says so', async ({ page }) => {
    const frame = await openTour(page, { mode: 'resizable' });
    await tab(frame, 'Window').click();
    await expect(frame.locator('[data-tour-mode][aria-current="true"]')).toHaveAttribute('data-tour-mode', 'resizable');
    await expect(frame.locator('#window-note')).toHaveText('Drag the corner to change the size; the plugin remembers it for each editor.');
    const before = (await frameSize(page)).height;
    await frame.locator('#grow').click();
    await expect.poll(async () => (await frameSize(page)).height, 'kit.fit() fitted the height').not.toBe(before);
    expect((await frameSize(page)).height).toBe(clamp(await contentHeight(frame), (await kitInit(page)).bounds.minHeight, (await kitInit(page)).bounds.maxHeight));
  });

  test('Window in Buzz: no handle and no mode in use, and the note says Figma sizes the panel', async ({ page }) => {
    const frame = await openTour(page, { editor: 'buzz' });
    expect(await frame.evaluate(() => document.documentElement.dataset.kitChrome)).toBe('off');
    await tab(frame, 'Window').click();
    await expect(frame.locator('#window-note')).toHaveText('Figma docks the plugin in a panel here and sets its size, so the modes and the handle don’t apply.');
    await expect(frame.locator('#handle-part')).toBeHidden();
    await expect(frame.locator('#grow')).toBeHidden();
    await expect(frame.locator('[data-tour-mode][aria-current]')).toHaveCount(0);
    await expect(frame.locator('.tour-here:visible')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark', 'figjam']) {
    test(`axe: no WCAG 2.1 A/AA violations on any tab, or with the menu, the dialog or a toast open (${theme})`, async ({ page }) => {
      const frame = await openTour(page, theme === 'figjam' ? { theme, editor: 'figjam' } : { theme });
      const check = async (what) => {
        const { violations } = await axe(page).include('#live-frame').analyze();
        expect(summary(violations), what).toEqual([]);
      };
      for (const label of ['Components', 'Create', 'Window']) {
        await tab(frame, label).click();
        await page.waitForTimeout(150);
        await check(label);
      }
      await frame.locator('#grow').click();
      await check('Window with the added line');
      await tab(frame, 'Components').click();
      await frame.locator('[popovertarget="tour-menu"]').click();
      await expect(frame.locator('#tour-menu')).toBeVisible();
      await check('menu open');
      await page.keyboard.press('Escape');
      await frame.locator('#toast-undo').click();
      await expect(frame.locator('.kit-toast')).toHaveCount(1);
      await check('toast open');
      await dismissToast(frame);
      await frame.locator('#dismiss-info').click();
      await check('notice dismissed');
      await frame.locator('#open-dialog').click();
      await expect(frame.locator('#tour-dialog')).toBeVisible();
      await check('dialog open');
    });
  }
});
