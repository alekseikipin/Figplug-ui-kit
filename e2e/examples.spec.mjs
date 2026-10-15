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
// Home and its eight pages (each opens from its row, Back returns focus there, Next walks them in
// order, the window refits to every screen, each near its height in a table at 360 and at 280),
// the count of the 20 parts and what follows it, Show me, one toast at a time, each page's demo (the live button, the fields' errors, All going mixed, the menu, dialog and
// Undo toast in its lane, the notices, the list that grows the window, Create's create-shapes and
// its result, Copy link and Open GitHub), the swatches in each theme, 280px in Buzz, and axe on
// every screen and overlay.
// examples/ is optional: you may delete it, or any one example, when you start your own plugin.
// The tests of a missing example skip (with the reason), and the Plugin picker checks adapt to
// the examples that are there.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import {
  test, expect, openPreview, pluginFrame, waitForPlugin, mark, messagesSince, resizesSince, frameSize,
  contentHeight, drag, waitForFinal, host, callsSince, writesSince, patchFile,
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
/** fit-content examples whose content grows with the sample selection (kit-tour's changes text on pages Home doesn't show). */
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

  /** The pages in Next's order, with their titles. */
  const PAGES = { buttons: 'Buttons', fields: 'Fields', choices: 'Choices', popups: 'Pop-ups', feedback: 'Feedback', window: 'Window', create: 'Create shapes', files: 'Get the files' };
  const ORDER = Object.keys(PAGES);
  /** Home's six groups: 20 parts in all. */
  const GROUPS = [
    { id: 'buttons', name: 'Buttons', teaser: 'Button, icon button, tooltip', parts: ['Button', 'Icon button', 'Tooltip'] },
    { id: 'fields', name: 'Fields', teaser: 'Text, number, colour, textarea', parts: ['Text input', 'Number field', 'Colour field', 'Textarea'] },
    { id: 'choices', name: 'Choices', teaser: 'Select, checkbox, radio, tabs', parts: ['Select', 'Checkbox', 'Radio', 'Tabs'] },
    { id: 'popups', name: 'Pop-ups', teaser: 'Menu, dialog, toast', parts: ['Menu', 'Dialog', 'Toast'] },
    { id: 'feedback', name: 'Feedback', teaser: 'Notice, empty state', parts: ['Notice', 'Empty state'] },
    { id: 'window', name: 'Window', teaser: 'Header, list, footer, corner', parts: ['Section header', 'List', 'Sticky footer', 'Resize handle'] },
  ];
  const GITHUB = 'https://github.com/alekseikipin/Figplug-ui-kit';
  /**
   * Each screen's height, measured in the preview with macOS's system font (Inter is not installed
   * there): at 360 (Figma Design, light) and at 280 (Buzz, dark). Lines and leads are measured to fit
   * with room to spare, but a wider fallback font can still wrap one more line (16px), so a height may
   * be off by HEIGHT_SLACK; a layout that drifts further (a control 24px taller, a lost section) fails.
   */
  const HEIGHTS = {
    360: { home: 473, buttons: 401, fields: 476, choices: 360, popups: 296, feedback: 232, window: 290, create: 309, files: 478 },
    280: { home: 473, buttons: 409, fields: 492, choices: 368, popups: 288, feedback: 264, window: 418, create: 325, files: 558 },
  };
  const HEIGHT_SLACK = 20;
  const nearHeight = (actual, expected, what) => expect(Math.abs(actual - expected), `${what}: ${actual}px, the table says ${expected}px`).toBeLessThanOrEqual(HEIGHT_SLACK);

  /** Opens the tour with its whole window in the page's view. */
  async function openTour(page, query = {}) {
    const frame = await openExample(page, 'kit-tour', query);
    await page.locator('#live-window').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    return frame;
  }

  /** The screen on show (one at a time), and the parts of its bar. */
  const shown = (frame) => frame.locator('.tour-screen:not([hidden])');
  const back = (frame) => shown(frame).locator('.tour-bar [data-go="home"]');
  const next = (frame) => shown(frame).locator('.tour-next');
  /** A legend item of the page on show, by its part's slug ("icon-button"). */
  const legend = (frame, slug) => shown(frame).locator(`.tour-part[value="${slug}"]`);
  /** Home's way into a page: its group row, the Create row, or the footer's Get the files. */
  const opener = (frame, id) => frame.locator(id === 'files' ? '#home-files' : id === 'create' ? '.tour-group[data-go="create"]' : `#group-${id}`);
  async function openPage(frame, id) {
    await opener(frame, id).click();
    await expect(frame.locator(`#screen-${id}`)).toBeVisible();
    await expect(frame.locator(`#title-${id}`)).toBeFocused();
  }
  async function goNext(frame, id) {
    await next(frame).click();
    await expect(frame.locator(`#screen-${id}`)).toBeVisible();
  }
  /** Home's footer line, which follows every part tried on any page. */
  const count = (frame) => frame.locator('#screen-home .tour-count');
  const tried = (n) => (n === 20 ? 'You’ve tried all 20 parts' : `You’ve tried ${n} of 20 parts`);
  /** The one polite region that says what was tried, and where Show me points. */
  const said = (frame) => frame.locator('#tour-say');
  /** Waits until the window is as tall as its content again, and returns that height. */
  async function fitted(page, frame) {
    const { bounds } = await kitInit(page);
    await expect.poll(async () => (await frameSize(page)).height - clamp(await contentHeight(frame), bounds.minHeight, bounds.maxHeight)).toBe(0);
    return (await frameSize(page)).height;
  }
  /** The text of each toast in the window (one at most: the kit shows one at a time). */
  const toasts = (frame) => frame.locator('.kit-toast .kit-toast-text').allTextContents();
  const dismissToast = (frame) => frame.locator('.kit-toast [aria-label="Dismiss"]').click();
  /** The messages the UI sent since a mark, other than the kit's own. */
  const sentSince = async (page, at) => (await messagesSince(page, at)).filter((m) => m.dir === 'ui' && !String(m.msg.type).startsWith('kit:')).map((m) => m.msg);
  const createsSince = async (page, at) => (await sentSince(page, at)).filter((m) => m.type === 'create-shapes');
  /** Holds Enter down: the first keydown, then `repeats` auto-repeated ones, as a held key sends them. */
  async function holdEnter(page, repeats = 10) {
    for (let i = 0; i <= repeats; i++) { await page.keyboard.down('Enter'); await page.waitForTimeout(30); }
    await page.keyboard.up('Enter');
  }
  /** An element's box in the plugin window. */
  const rect = (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });

  test('opens on Home: the title, six groups with a ring per part, Create apart, 0 of 20 tried, in quirks mode', async ({ page }) => {
    const frame = await openTour(page);
    // Figma runs plugin UIs in quirks mode (docs/surfaces.md#in-every-editor), and so does the preview.
    expect(await frame.evaluate(() => document.compatMode)).toBe('BackCompat');
    await expect(frame.locator('.tour-screen')).toHaveCount(9);
    expect(await frame.locator('.tour-screen').evaluateAll((els) => els.map((s) => s.getAttribute('data-screen')))).toEqual(['home', ...ORDER]);
    await expect(shown(frame)).toHaveCount(1);
    await expect(shown(frame)).toHaveAttribute('data-screen', 'home');
    // Figma's title bar names the plugin, so the h1 is visually hidden.
    await expect(frame.locator('h1')).toHaveText('Figplug');
    await expect(frame.locator('h1')).toHaveClass(/kit-visually-hidden/);
    await expect(frame.locator('#title-home')).toHaveText('20 parts for your Figma plugin');
    await expect(frame.locator('#home-intro p')).toHaveText(/^They look and work like Figma’s own panels\.\s*This plugin is built with them\.$/);
    // Six group rows in a named list, each with its teaser and an empty ring per part.
    const rows = frame.getByRole('list', { name: 'Parts, by group' }).locator('.tour-group');
    await expect(rows).toHaveCount(GROUPS.length);
    for (const [i, g] of GROUPS.entries()) {
      const row = rows.nth(i);
      await expect(row, g.name).toHaveAttribute('id', `group-${g.id}`);
      await expect(row.locator('b > span').first(), g.name).toHaveText(g.name);
      await expect(row.locator('i > span').first(), g.name).toHaveText(g.teaser);
      await expect(row.locator('.tour-rings > span'), g.name).toHaveCount(g.parts.length);
      await expect(row.locator('.tour-rings'), g.name).toHaveAttribute('aria-hidden', 'true');
      // The count is hidden text, so the row reads "Buttons. Button, icon button, tooltip. 0 of 3 tried".
      await expect(row, g.name).toHaveAccessibleName(new RegExp(`^${g.name}\\s*\\.\\s*${g.teaser}\\s*\\.\\s*0 of ${g.parts.length} tried$`));
    }
    expect(GROUPS.reduce((n, g) => n + g.parts.length, 0)).toBe(20);
    await expect(frame.locator('.tour-rings > span')).toHaveCount(20);
    await expect(frame.locator('.tour-rings > [data-tried]')).toHaveCount(0);
    // Create shapes sits apart, under its own divider, with the only brand tile and no rings.
    const create = frame.getByRole('list', { name: 'On the canvas' }).locator('.tour-group');
    await expect(create).toHaveCount(1);
    await expect(create).toHaveAccessibleName(/^Create shapes\s*\.\s*Adds real shapes to this page$/);
    await expect(create.locator('.tour-rings')).toHaveCount(0);
    await expect(frame.locator('.tour-tile.tour-brand')).toHaveCount(1);
    // The footer: the count and Get the files.
    await expect(count(frame)).toHaveText(tried(0));
    await expect(frame.locator('#home-files')).toHaveText('Get the files');
    await expect(frame.locator('#home-files')).toHaveClass(/kit-button-primary/);
    await expect(frame.locator('#home-done')).toHaveCount(0);
    // A fit-content window: 360 wide, as tall as Home, nothing scrolls sideways.
    const height = await fitted(page, frame);
    expect((await frameSize(page)).width).toBe(360);
    expect(height).toBeLessThan(720);
    expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });

  test('each page opens from Home with focus on its title, the window refits to every screen, and Back returns focus to the row it came from', async ({ page }) => {
    const frame = await openTour(page);
    // A screen slides in 8px from the right: it must never make the window scroll sideways.
    const widest = await frame.evaluate(async () => {
      const seen = [];
      /** @type {HTMLElement} */ (document.getElementById('group-buttons')).click();
      for (let i = 0; i < 12; i++) { seen.push(document.documentElement.scrollWidth - innerWidth); await new Promise((r) => setTimeout(r, 20)); }
      /** @type {HTMLElement} */ (document.querySelector('#screen-buttons [data-go="home"]')).click();
      return Math.max(...seen);
    });
    expect(widest, 'sideways overflow during the slide').toBe(0);
    await expect(shown(frame)).toHaveAttribute('data-screen', 'home');
    const at = await mark(page);
    const heights = { home: await fitted(page, frame) };
    nearHeight(heights.home, HEIGHTS[360].home, 'home');
    for (const id of ORDER) {
      await openPage(frame, id);
      await expect(frame.locator(`#title-${id}`), id).toHaveText(PAGES[id]);
      heights[id] = await fitted(page, frame);
      expect(heights[id], `${id} stays under the 720px maximum`).toBeLessThan(720);
      nearHeight(heights[id], HEIGHTS[360][id], id);
      expect((await frameSize(page)).width, id).toBe(360);
      // Back is the bar's first control: an icon button with a name and a tooltip.
      await expect(back(frame), id).toHaveAccessibleName('Back to all parts');
      await expect(back(frame), id).toHaveAccessibleDescription('All parts');
      await back(frame).click();
      await expect(shown(frame)).toHaveAttribute('data-screen', 'home');
      expect(await fitted(page, frame), `Home again after ${id}`).toBe(heights.home);
      await expect(opener(frame, id), `focus goes back to ${id}'s way in`).toBeFocused();
      if (id === 'files') continue; // the footer button is not a row
      await expect(opener(frame, id), id).toHaveAttribute('aria-current', 'true');
      await expect(frame.locator('#screen-home [aria-current]'), 'one current row').toHaveCount(1);
    }
    // The window followed each screen.
    const fits = await resizesSince(page, at);
    expect(fits.length).toBeGreaterThanOrEqual(ORDER.length * 2);
    // Content fits are never saved: each was a kit:resize with user: false.
    expect(fits.every((m) => m.user === false)).toBe(true);
    expect(await callsSince(page, at, 'clientStorage.setAsync')).toEqual([]);
    // Navigation never counts as trying a part.
    await expect(count(frame)).toHaveText(tried(0));
  });

  test('Next walks the pages in order; it is always there, tertiary until the page is complete', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'buttons');
    for (const [i, id] of ORDER.entries()) {
      await expect(shown(frame)).toHaveAttribute('data-screen', id);
      await expect(frame.locator(`#title-${id}`), id).toBeFocused();
      const to = ORDER[i + 1];
      if (!to) {
        await expect(next(frame), 'Get the files is the end: no Next').toHaveCount(0);
        break;
      }
      await expect(next(frame), id).toHaveText(`Next: ${PAGES[to]}`);
      await expect(next(frame), id).toHaveClass(/kit-button-tertiary/);
      await goNext(frame, to);
    }
    await expect(count(frame)).toHaveText(tried(0));
  });

  test('every part counts once, on any page: the legend rings, the count, the announcement, Next and Home follow, up to all 20', async ({ page }) => {
    const frame = await openTour(page);
    const homeHeight = await fitted(page, frame);
    /** One step: the parts it tries, and the count after it. */
    const step = async (text, n) => {
      await expect(said(frame)).toHaveText(text);
      await expect(count(frame)).toHaveText(tried(n));
    };
    const complete = async (id) => {
      await expect(next(frame), `${id} complete: Next turns secondary`).toHaveClass(/kit-button-secondary/);
      await expect(next(frame)).not.toHaveClass(/kit-button-tertiary/);
    };

    // Buttons. Pressing the button (busy, then a toast), its icon's tooltip, a select, Reset.
    await openPage(frame, 'buttons');
    await frame.locator('#specimen').click();
    await step('Tried: Button. 1 of 20.', 1);
    await expect(legend(frame, 'button')).toHaveAttribute('data-tried', '');
    await expect(legend(frame, 'button')).toHaveAccessibleName('Button, tried');
    await expect(next(frame)).toHaveClass(/kit-button-tertiary/);
    await expect.poll(() => toasts(frame), { timeout: 3000 }).toEqual(['Pressed Save']);
    await step('Tried: Toast. 2 of 20.', 2);
    await frame.locator('#reset').hover();
    await step('Tried: Tooltip. 3 of 20.', 3);
    await frame.locator('#p-variant').selectOption('secondary');
    await step('Tried: Select. 4 of 20.', 4);
    // Reset is an icon button in a section header: one press, two parts, said together.
    await frame.locator('#reset').click();
    await step('Tried: Icon button. 5 of 20. Tried: Section header. 6 of 20.', 6);
    await expect(shown(frame).locator('.tour-part[data-tried]')).toHaveCount(3);
    await complete('buttons');
    await frame.locator('#p-label').fill('Export');
    await step('Tried: Text input. 7 of 20.', 7);

    // Fields.
    await goNext(frame, 'fields');
    await expect(next(frame)).toHaveClass(/kit-button-tertiary/);
    await expect(legend(frame, 'text-input'), 'tried on Buttons, filled here too').toHaveAttribute('data-tried', '');
    await frame.locator('#f-w').fill('1200');
    await step('Tried: Number field. 8 of 20.', 8);
    await frame.locator('#f-fill').fill('33CC99');
    await step('Tried: Colour field. 9 of 20.', 9);
    await frame.locator('#f-notes').fill('Check the copy');
    await step('Tried: Textarea. 10 of 20.', 10);
    await complete('fields');

    // Choices (Select was tried on Buttons).
    await goNext(frame, 'choices');
    const layers = frame.locator('.tour-find').first();
    await layers.getByLabel('Hidden').check();
    await step('Tried: Checkbox. 11 of 20.', 11);
    await layers.getByLabel('All pages').check();
    await step('Tried: Radio. 12 of 20.', 12);
    await frame.locator('.kit-tab', { hasText: 'Styles' }).click();
    await step('Tried: Tabs. 13 of 20.', 13);
    await complete('choices');

    // Pop-ups (Toast was tried on Buttons).
    await goNext(frame, 'popups');
    await frame.locator('#frames > li').first().locator('.kit-icon-button').click();
    await step('Tried: Menu. 14 of 20.', 14);
    await frame.locator('.kit-menu:popover-open').getByRole('menuitem', { name: 'Rename…' }).click();
    await step('Tried: Dialog. 15 of 20.', 15);
    await page.keyboard.press('Escape');
    await expect(frame.locator('#rename')).toBeHidden();
    await complete('popups');

    // Feedback.
    await goNext(frame, 'feedback');
    await frame.getByRole('radio', { name: 'Danger' }).check();
    await step('Tried: Notice. 16 of 20.', 16);
    await frame.locator('#fb-dismiss').click();
    await step('Tried: Empty state. 17 of 20.', 17);
    await complete('feedback');

    // Window (Section header was tried on Buttons).
    await goNext(frame, 'window');
    await frame.locator('#win-add').click();
    await step('Tried: List. 18 of 20.', 18);
    await frame.locator('#win-reset').click();
    await step('Tried: Sticky footer. 19 of 20.', 19);
    await frame.locator('[data-kit-resize]').focus();
    await page.keyboard.press('ArrowRight');
    await step('Tried: Resize handle. 20 of 20.', 20);
    await complete('window');
    await expect(frame.locator('#screen-files .tour-count')).toHaveText(tried(20));

    // Home: every ring full, every tile tinted, and the notice that points at Get the files.
    await back(frame).click();
    await expect(shown(frame)).toHaveAttribute('data-screen', 'home');
    await expect(frame.locator('.tour-rings > [data-tried]')).toHaveCount(20);
    await expect(frame.locator('#groups .tour-group[data-done]')).toHaveCount(6);
    await expect(frame.locator('#group-buttons')).toHaveAccessibleName(/3 of 3 tried$/);
    await expect(frame.locator('#home-done')).toHaveText('That’s the whole kit. Get the files and build your own.');
    await expect(frame.locator('#home-done')).toHaveAttribute('role', 'status');
    await expect(frame.locator('#home-done')).toHaveAttribute('data-kit-tone', 'success');
    expect(await fitted(page, frame), 'the notice grows Home').toBeGreaterThan(homeHeight);
  });

  test('Home after a visit: the rings earned fill, a finished group is marked done, and its row is current', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'feedback');
    await frame.getByRole('radio', { name: 'Info' }).check();
    await frame.locator('#fb-dismiss').click();
    await back(frame).click();
    await expect(frame.locator('#group-feedback .tour-rings > [data-tried]')).toHaveCount(2);
    await expect(frame.locator('#group-feedback')).toHaveAttribute('data-done', '');
    await expect(frame.locator('#group-feedback')).toHaveAttribute('aria-current', 'true');
    await expect(frame.locator('#group-feedback')).toHaveAccessibleName(/2 of 2 tried$/);
    // The radio and the dismiss button count for their own groups too.
    await expect(frame.locator('#group-choices .tour-rings > [data-tried]')).toHaveCount(1);
    await expect(frame.locator('#group-buttons .tour-rings > [data-tried]')).toHaveCount(1);
    await expect(frame.locator('#group-buttons')).not.toHaveAttribute('data-done', '');
    await expect(count(frame)).toHaveText(tried(4)); // radio, notice, icon button, empty state
    // Opening another row moves the current mark.
    await openPage(frame, 'buttons');
    await back(frame).click();
    await expect(frame.locator('#group-buttons')).toHaveAttribute('aria-current', 'true');
    await expect(frame.locator('#group-feedback')).not.toHaveAttribute('aria-current', 'true');
  });

  test('Show me: a legend item rings its part, focuses it and says where, and never counts', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'buttons');
    // Tooltip: Reset gets the ring and focus, so its tooltip shows.
    await legend(frame, 'tooltip').click();
    await expect(frame.locator('#reset')).toBeFocused();
    await expect(frame.locator('#reset')).toHaveClass(/tour-ring/);
    await expect(frame.locator('#tip-reset')).toBeVisible();
    await expect(said(frame)).toHaveText('Reset’s tooltip');
    await expect(frame.locator('#reset'), 'the ring goes after 1.2 s').not.toHaveClass(/tour-ring/, { timeout: 3000 });
    // Number field and Radio say plainly where they are.
    await goNext(frame, 'fields');
    await legend(frame, 'number-field').click();
    await expect(frame.locator('#f-w')).toBeFocused();
    await expect(said(frame)).toHaveText('The width field');
    await goNext(frame, 'choices');
    await legend(frame, 'radio').click();
    await expect(said(frame)).toHaveText('Look in, on the right');
    await expect(frame.locator('.tour-find').first().getByLabel('This page')).toBeFocused();
    // Dialog and Toast live behind a menu: Show me opens the first frame's menu on Rename… or Delete.
    await goNext(frame, 'popups');
    for (const [slug, item, where] of [['dialog', 'Rename…', 'Rename… in the frame’s menu'], ['toast', 'Delete', 'Delete in the frame’s menu']]) {
      await legend(frame, slug).click();
      const menu = frame.locator('.kit-menu:popover-open');
      await expect(menu, slug).toHaveCount(1);
      await expect(menu.getByRole('menuitem', { name: item }), slug).toBeFocused();
      await expect(menu.getByRole('menuitem', { name: item }), slug).toHaveClass(/tour-ring/);
      await expect(said(frame), slug).toHaveText(where);
      // Escape closes it and gives the ⋯ button keyboard focus: its tooltip shows, and still counts nothing.
      await page.keyboard.press('Escape');
      await expect(frame.locator('.kit-menu:popover-open'), slug).toHaveCount(0);
      await expect(frame.locator('#frames > li').first().locator('.kit-icon-button'), slug).toBeFocused();
      await page.waitForTimeout(100);
    }
    // Resize handle: the grip is focused and the footer lists its keys.
    for (const id of ['feedback', 'window']) await goNext(frame, id);
    await legend(frame, 'resize-handle').click();
    await expect(frame.locator('[data-kit-resize]')).toBeFocused();
    await expect(frame.locator('[data-kit-resize]')).toHaveClass(/tour-ring/);
    await expect(frame.locator('#win-size')).toHaveText('← → 8 px · Shift 32 px · Enter: next width');
    await expect(said(frame)).toHaveText('The corner at the bottom right');
    // A ring on a part that spans the window is drawn inside it, so all four sides show.
    await legend(frame, 'section-header').click();
    const header = frame.locator('#screen-window .kit-section-header:not(.tour-bar)');
    await expect(header).toHaveClass(/tour-ring/);
    expect(await header.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('-2px');
    // Nothing above counted: not the legend, not the menus it opened, not the tooltips it showed.
    await expect(count(frame)).toHaveText(tried(0));
    await expect(frame.locator('.tour-part[data-tried]')).toHaveCount(0);
    // List: the current row is focused and scrolled into view, also when the list has scrolled away from it.
    for (let i = 0; i < 6; i++) await frame.locator('#win-add').click();
    // Let what those presses (and the + tooltip under the pointer) say finish first: words said within
    // 100ms of each other are read together.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(600);
    await frame.locator('#screen-window .kit-scroll').evaluate((el) => { el.scrollTop = 0; });
    await legend(frame, 'list').click();
    const row = frame.locator('#win-list [aria-current="true"]');
    await expect(row).toBeFocused();
    await expect(row).toHaveText(/^Frame 9/);
    await expect(said(frame)).toHaveText('The frames list');
    const [r, box] = [await rect(row), await rect(frame.locator('#screen-window .kit-scroll'))];
    expect(r.top >= box.top - 1 && r.bottom <= box.bottom + 1, 'the focused row is in view').toBe(true);
  });

  test('Show me on the live button hides its canvas selection while the ring is up', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'buttons');
    const sel = frame.locator('#screen-buttons .tour-sel');
    await legend(frame, 'button').click();
    await expect(frame.locator('#specimen')).toHaveClass(/tour-ring/);
    expect(await sel.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await sel.locator('i, .tour-badge').evaluateAll((els) => els.map((el) => getComputedStyle(el).visibility))).toEqual(Array(5).fill('hidden'));
    await expect(frame.locator('#specimen')).not.toHaveClass(/tour-ring/, { timeout: 3000 });
    expect(await sel.locator('i, .tour-badge').evaluateAll((els) => els.map((el) => getComputedStyle(el).visibility))).toEqual(Array(5).fill('visible'));
    // A second Show me within 1.2s keeps the ring its full 1.2s.
    await legend(frame, 'button').click();
    await page.waitForTimeout(800);
    await legend(frame, 'button').click();
    await page.waitForTimeout(800);
    await expect(frame.locator('#specimen')).toHaveClass(/tour-ring/);
  });

  test('Buttons: Variant, Size, State and Label drive the live button, its badge is its real size, and Reset says why it is off', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'buttons');
    const spec = frame.locator('#specimen');
    const reset = frame.locator('#reset');
    const badge = frame.locator('#specimen-size');
    const measured = async () => { const r = await rect(spec); return `${Math.round(r.width)} × ${Math.round(r.height)}`; };
    // The defaults: a primary Save button, 24 tall, and nothing to reset.
    await expect(spec).toHaveText('Save');
    await expect(spec).toHaveClass('kit-button kit-button-primary');
    await expect(badge).toHaveText(/^\d+ × 24$/);
    expect(await badge.textContent()).toBe(await measured());
    await expect(reset).toHaveAttribute('aria-disabled', 'true');
    await expect(reset).toHaveAccessibleDescription('Nothing to reset');
    // Variant.
    for (const variant of ['secondary', 'tertiary', 'danger', 'primary']) {
      await frame.locator('#p-variant').selectOption(variant);
      await expect(spec, variant).toHaveClass(`kit-button kit-button-${variant}`);
    }
    // Size: Large is 32 tall, and the badge says so.
    await frame.locator('#p-size').selectOption('large');
    await expect(spec).toHaveClass('kit-button kit-button-primary kit-button-large');
    await expect(badge).toHaveText(/^\d+ × 32$/);
    expect(await badge.textContent()).toBe(await measured());
    await expect(reset).toHaveAttribute('aria-disabled', 'false');
    await expect(reset).toHaveAccessibleDescription('Back to the defaults');
    // Label: the button and its measured width follow; an empty label shows "Button".
    const before = await badge.textContent();
    await frame.locator('#p-label').fill('Export all');
    await expect(spec).toHaveText('Export all');
    await expect(badge).not.toHaveText(/** @type {string} */ (before));
    expect(await badge.textContent()).toBe(await measured());
    await frame.locator('#p-label').fill('');
    await expect(spec).toHaveText('Button');
    // State.
    await frame.locator('#p-state').selectOption('disabled');
    await expect(spec).toBeDisabled();
    await frame.locator('#p-state').selectOption('busy');
    await expect(spec).toBeEnabled();
    await expect(spec).toHaveAttribute('aria-busy', 'true');
    await frame.locator('#p-state').selectOption('toggled');
    await expect(spec).not.toHaveAttribute('aria-busy', 'true');
    await expect(spec).toHaveAttribute('aria-pressed', 'true');
    // A toggle: each press flips it, and the State select follows, between Toggled on and Toggled off.
    await spec.click();
    await expect(spec).toHaveAttribute('aria-pressed', 'false');
    await expect(frame.locator('#p-state')).toHaveValue('off');
    await expect(frame.locator('#p-state option:checked')).toHaveText('Toggled off');
    await spec.click();
    await expect(spec).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.locator('#p-state')).toHaveValue('toggled');
    // Reset: back to the defaults, and off again.
    await reset.click();
    await expect(frame.locator('#p-variant')).toHaveValue('primary');
    await expect(frame.locator('#p-size')).toHaveValue('default');
    await expect(frame.locator('#p-state')).toHaveValue('default');
    await expect(frame.locator('#p-label')).toHaveValue('Save');
    await expect(spec).toHaveClass('kit-button kit-button-primary');
    await expect(spec).not.toHaveAttribute('aria-pressed', /.*/);
    await expect(reset).toHaveAttribute('aria-disabled', 'true');
    await expect(reset).toHaveAccessibleDescription('Nothing to reset');
    // A plain press: busy for a moment, then a toast named after the label; a second press meanwhile does nothing.
    await frame.locator('#p-label').fill('Publish');
    await spec.click();
    await expect(spec).toHaveAttribute('aria-busy', 'true');
    await spec.press('Enter');
    await expect(spec).not.toHaveAttribute('aria-busy', 'true', { timeout: 3000 });
    await expect.poll(() => toasts(frame)).toEqual(['Pressed Publish']);
    await dismissToast(frame);
    await page.waitForTimeout(1500);
    expect(await toasts(frame), 'one press, one toast').toEqual([]);
    // Leaving while it is busy: no toast follows to the next screen.
    await spec.click();
    await back(frame).click();
    await page.waitForTimeout(1500);
    expect(await toasts(frame), 'no Pressed toast on Home').toEqual([]);
  });

  test('Fields: the frame follows its name, size and fill; each field shows its error and keeps the last valid value', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'fields');
    const name = frame.locator('#f-name');
    const w = frame.locator('#f-w');
    const h = frame.locator('#f-h');
    const hex = frame.locator('#f-fill');
    const swatch = frame.locator('#f-swatch');
    await expect(frame.locator('#frame-name')).toHaveText('Hero banner');
    await expect(frame.locator('#frame-size')).toHaveText('1440 × 720');
    const start = await fitted(page, frame);
    // Name: empty is an error; the canvas keeps the last valid name.
    await name.fill('');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription('Give the frame a name.');
    await expect(frame.locator('#frame-name')).toHaveText('Hero banner');
    await name.fill('Landing');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription('Shown above the frame on the canvas.');
    await expect(frame.locator('#frame-name')).toHaveText('Landing');
    // Size: 1 to 10,000; outside it the help shows under the row and the preview keeps its size.
    for (const bad of ['0', '10001', '1440.5', '']) {
      await w.fill(bad);
      await expect(w, bad).toHaveAttribute('aria-invalid', 'true');
      await expect(frame.locator('#f-size-help'), bad).toBeVisible();
      await expect(frame.locator('#f-size-help'), bad).toHaveText('Enter a whole number from 1 to 10,000.');
      await expect(frame.locator('#frame-size'), bad).toHaveText('1440 × 720');
    }
    expect(await fitted(page, frame), 'the error line grows the window').toBeGreaterThan(start);
    await w.fill('1200');
    await expect(w).not.toHaveAttribute('aria-invalid', 'true');
    await expect(frame.locator('#f-size-help')).toBeHidden();
    await expect(frame.locator('#frame-size')).toHaveText('1200 × 720');
    expect(await fitted(page, frame), 'and shrinks back').toBe(start);
    // The box fits 128 × 40 at the frame's ratio.
    const box = await rect(frame.locator('.tour-frame'));
    expect(Math.round(box.height)).toBe(40);
    expect(box.width / box.height).toBeCloseTo(1200 / 720, 1);
    // The ratio lock: off at first; while on, one side moves the other.
    const lock = frame.locator('#f-lock');
    await expect(lock).toHaveAttribute('aria-pressed', 'false');
    await expect(lock).toHaveAccessibleName('Keep the ratio');
    await lock.click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await w.fill('2400');
    await expect(h).toHaveValue('1440');
    await expect(frame.locator('#frame-size')).toHaveText('2400 × 1440');
    await h.fill('360');
    await expect(w).toHaveValue('600');
    await lock.click();
    await expect(lock).toHaveAttribute('aria-pressed', 'false');
    await w.fill('800');
    await expect(h).toHaveValue('360');
    await expect(frame.locator('#frame-size')).toHaveText('800 × 360');
    // Fill: six digits apply while typing, three expand on change, anything else is an error.
    const frameFill = () => frame.locator('.tour-frame').evaluate((el) => getComputedStyle(el).backgroundColor);
    await hex.fill('33CC99');
    await expect(swatch).toHaveValue('#33cc99');
    expect(await frameFill()).toBe('rgb(51, 204, 153)');
    await hex.fill('F0A');
    await hex.blur();
    await expect(hex).toHaveValue('FF00AA');
    await expect(swatch).toHaveValue('#ff00aa');
    await expect(frame.locator('#f-fill-help')).toBeHidden();
    for (const bad of ['nope', '12345']) {
      await hex.fill(bad);
      await hex.blur();
      await expect(hex, bad).toHaveAttribute('aria-invalid', 'true');
      await expect(frame.locator('#f-fill-help'), bad).toBeVisible();
      await expect(hex, bad).toHaveAccessibleDescription('Use a hex code, like FF7262.');
      await expect(swatch, bad).toHaveValue('#ff00aa');
    }
    expect(await frameFill()).toBe('rgb(255, 0, 170)');
    // Typing in the middle applies six digits without moving the caret; the text is tidied on change.
    await hex.fill('ff7262');
    await hex.evaluate((el) => /** @type {HTMLInputElement} */ (el).setSelectionRange(2, 3));
    await page.keyboard.type('a');
    expect(await hex.evaluate((el) => [/** @type {HTMLInputElement} */ (el).value, /** @type {HTMLInputElement} */ (el).selectionStart])).toEqual(['ffa262', 3]);
    await expect(swatch).toHaveValue('#ffa262');
    await hex.blur();
    await expect(hex).toHaveValue('FFA262');
    // The swatch writes the code back, and clears the error.
    await swatch.fill('#123456');
    await expect(hex).toHaveValue('123456');
    await expect(hex).not.toHaveAttribute('aria-invalid', 'true');
    await expect(frame.locator('#f-fill-help')).toBeHidden();
    expect(await fitted(page, frame)).toBe(start);
    await expect(frame.locator('#f-notes')).toHaveAttribute('placeholder', 'Anything your team should know');
  });

  test('Choices: All goes mixed, the summary says what it finds, Selection wakes up with a selection, and the tabs switch', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'choices');
    const panels = frame.locator('.tour-find');
    const layers = panels.nth(0);
    const all = layers.locator('[data-all]');
    const summary = layers.locator('[role="status"]');
    const mixed = () => all.evaluate((el) => /** @type {HTMLInputElement} */ (el).indeterminate);
    await expect(frame.getByRole('radiogroup', { name: 'Find' })).toBeVisible();
    await expect(layers).toBeVisible();
    await expect(panels.nth(1)).toBeHidden();
    // All is mixed while only some types are ticked.
    expect(await mixed()).toBe(true);
    await expect(summary).toHaveText('Finds frames and text on this page, in layer order.');
    await all.check();
    expect(await mixed()).toBe(false);
    await expect(layers.locator('[data-type]:checked')).toHaveCount(3);
    await expect(summary).toHaveText('Finds frames, text and hidden layers on this page, in layer order.');
    await all.uncheck();
    expect(await mixed()).toBe(false);
    await expect(layers.locator('[data-type]:checked')).toHaveCount(0);
    await expect(summary).toHaveText('Finds nothing. Tick a layer type.');
    await layers.getByLabel('Frames').check();
    expect(await mixed()).toBe(true);
    await expect(summary).toHaveText('Finds frames on this page, in layer order.');
    await frame.locator('#c-sort').selectOption({ label: 'Name' });
    await expect(summary).toHaveText('Finds frames on this page, by name.');
    await layers.getByLabel('All pages').check();
    await expect(summary).toHaveText('Finds frames on all pages, by name.');
    // Selection is off, with its reason, until main says something is selected.
    const sel = frame.locator('#c-sel');
    await expect(sel).toBeDisabled();
    await expect(sel).toHaveAccessibleDescription('Nothing selected');
    await host(page, () => window.kitPreviewHost.select('sample'));
    await expect(sel).toBeEnabled();
    await expect(frame.locator('#c-sel-help')).toBeHidden();
    await sel.check();
    await expect(summary).toHaveText('Finds frames in the selection, by name.');
    // Select nothing again: the radio goes off and the choice falls back to This page.
    await host(page, () => window.kitPreviewHost.select(0));
    await expect(sel).toBeDisabled();
    await expect(frame.locator('#c-sel-help')).toBeVisible();
    await expect(layers.getByLabel('This page')).toBeChecked();
    await expect(summary).toHaveText('Finds frames on this page, by name.');
    // The other tabs: the same shape, their own summary.
    const before = await fitted(page, frame);
    await frame.locator('.kit-tab', { hasText: 'Styles' }).click();
    await expect(panels.nth(1)).toBeVisible();
    await expect(layers).toBeHidden();
    await expect(panels.nth(1).locator('[role="status"]')).toHaveText('Finds every style in this file.');
    await panels.nth(1).getByLabel('Effects').uncheck();
    await expect(panels.nth(1).locator('[role="status"]')).toHaveText('Finds colour and text styles in this file.');
    expect(await panels.nth(1).locator('[data-all]').evaluate((el) => /** @type {HTMLInputElement} */ (el).indeterminate)).toBe(true);
    await frame.locator('.kit-tab', { hasText: 'Variables' }).click();
    await expect(panels.nth(2)).toBeVisible();
    await expect(panels.nth(2).locator('[role="status"]')).toHaveText('Finds every variable, in the current mode.');
    // Styles and Variables have no Sort by, so the window refits shorter.
    expect(await fitted(page, frame)).toBeLessThan(before);
  });

  test('Pop-ups: a menu per row, the rename dialog, Duplicate, and Delete with an Undo toast in its own lane', async ({ page }) => {
    test.slow(); // about 15 s here and 40 s on CI's runners: three times the default timeout
    const frame = await openTour(page);
    await openPage(frame, 'popups');
    const rows = frame.locator('#frames > li');
    const labels = () => rows.locator('.kit-list-row-label').allTextContents();
    const more = (label) => rows.filter({ has: frame.locator('.kit-list-row-label', { hasText: new RegExp(`^${label}$`) }) }).locator('.kit-icon-button');
    const menu = frame.locator('.kit-menu:popover-open');
    const dialog = frame.locator('#rename');
    const field = frame.locator('#rename-name');
    expect(await labels()).toEqual(['Cover', 'Hero banner', 'Features', 'Pricing', 'Footer']);
    expect(await rows.locator('.kit-list-row-meta').allTextContents()).toEqual(['1920 × 1080', '1440 × 720', '1440 × 960', '1440 × 880', '1440 × 320']);
    await expect(more('Hero banner')).toHaveAccessibleName('Hero banner: more actions');
    await expect(more('Hero banner')).toHaveAccessibleDescription('More actions');
    // The last row's tooltip opens above, so it never leaves the window (Buzz has no bottom padding).
    const above = () => frame.locator('#frames .kit-tooltip').evaluateAll((els) => els.map((el) => el.matches('.kit-tooltip-above')));
    expect(await above()).toEqual([false, false, false, false, true]);
    // One menu per row, so only the opener in use is marked expanded.
    const targets = await frame.locator('#frames .kit-icon-button').evaluateAll((els) => els.map((el) => el.getAttribute('popovertarget')));
    expect(new Set(targets).size).toBe(5);
    await more('Hero banner').click();
    await expect(menu).toHaveCount(1);
    await expect(more('Hero banner')).toHaveAttribute('aria-expanded', 'true');
    await expect(frame.locator('#frames [aria-expanded="true"]')).toHaveCount(1);
    await expect(menu.locator('.kit-menu-item')).toHaveText(['Rename…', 'Duplicate', 'Delete']);
    await expect(menu.locator('.kit-menu-item').first()).toBeFocused();
    // A menu and its opener's tooltip are never up together, even with the pointer still on ⋯.
    await page.waitForTimeout(600);
    expect(await more('Hero banner').evaluate((el) => getComputedStyle(/** @type {Element} */ (el.nextElementSibling)).visibility)).toBe('hidden');

    // Rename…: a modal dialog, the name selected; empty is an error and Rename turns off; Enter renames.
    await menu.getByRole('menuitem', { name: 'Rename…' }).click();
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
    await expect(dialog).toHaveAccessibleName('Rename frame');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('Hero banner');
    expect(await field.evaluate((el) => [/** @type {HTMLInputElement} */ (el).selectionStart, /** @type {HTMLInputElement} */ (el).selectionEnd])).toEqual([0, 11]);
    await expect(field).toHaveAccessibleDescription('Shown in the list.');
    await field.fill('  ');
    await expect(frame.locator('#rename-ok')).toBeDisabled();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription('A frame needs a name.');
    await field.press('Enter');
    await expect(dialog, 'Enter does nothing while the name is empty').toBeVisible();
    await field.fill('Pricing page');
    await expect(frame.locator('#rename-ok')).toBeEnabled();
    await field.press('Enter');
    await expect(dialog).toBeHidden();
    expect(await labels()).toEqual(['Cover', 'Pricing page', 'Features', 'Pricing', 'Footer']);
    await expect(more('Pricing page')).toHaveAccessibleName('Pricing page: more actions');
    await expect.poll(() => toasts(frame)).toEqual(['Renamed to “Pricing page”']);
    await expect(frame.locator('.kit-toast')).toHaveAttribute('data-kit-tone', 'success');
    await dismissToast(frame);
    // Cancel, Escape and the close button rename nothing and show no toast.
    for (const close of ['cancel', 'escape', 'x']) {
      await more('Cover').click();
      await menu.getByRole('menuitem', { name: 'Rename…' }).click();
      await expect(dialog, close).toBeVisible();
      await field.fill('Nope');
      if (close === 'cancel') await dialog.getByRole('button', { name: 'Cancel' }).click();
      else if (close === 'escape') await page.keyboard.press('Escape');
      else await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog, close).toBeHidden();
      expect(await labels(), close).toEqual(['Cover', 'Pricing page', 'Features', 'Pricing', 'Footer']);
      expect(await toasts(frame), close).toEqual([]);
    }

    // Duplicate: a copy under the row, and the window grows by a row.
    const five = await fitted(page, frame);
    await more('Cover').click();
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    expect(await labels()).toEqual(['Cover', 'Cover copy', 'Pricing page', 'Features', 'Pricing', 'Footer']);
    await expect.poll(() => toasts(frame)).toEqual(['Duplicated Cover']);
    await dismissToast(frame);
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
    const six = await fitted(page, frame);
    expect(six - five, 'one row').toBe(32);

    // Delete: the row goes, focus moves to the next row's menu button, and the toast offers Undo.
    await more('Features').click();
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    expect(await labels()).toEqual(['Cover', 'Cover copy', 'Pricing page', 'Pricing', 'Footer']);
    await expect(more('Pricing')).toBeFocused();
    await expect.poll(() => toasts(frame)).toEqual(['Deleted Features']);
    // The toast lane: the screen makes room under its last row, so the toast covers nothing.
    expect(await fitted(page, frame), 'a row less, plus the lane').toBe(six - 32 + 16);
    const last = await rect(rows.last());
    const toast = await rect(frame.locator('.kit-toast'));
    expect(toast.top, 'the toast sits under the last row').toBeGreaterThanOrEqual(last.bottom);
    expect(toast.bottom).toBeLessThanOrEqual((await frameSize(page)).height);
    // Undo has no timer: it waits for the person.
    await page.waitForTimeout(4600);
    expect(await toasts(frame), 'duration 0: the Undo toast waits').toEqual(['Deleted Features']);
    await frame.locator('.kit-toast').getByRole('button', { name: 'Undo' }).click();
    expect(await labels()).toEqual(['Cover', 'Cover copy', 'Pricing page', 'Features', 'Pricing', 'Footer']);
    await expect.poll(() => toasts(frame)).toEqual(['Restored Features']);
    await expect(more('Features'), 'focus goes to the restored row').toBeFocused();
    await dismissToast(frame);
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
    expect(await fitted(page, frame), 'no toast, no lane').toBe(six);

    // Another toast takes the Undo toast away at once, and so does leaving the page.
    await more('Footer').click();
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect.poll(() => toasts(frame)).toEqual(['Deleted Footer']);
    await more('Cover').click();
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect.poll(() => toasts(frame), { timeout: 1500 }).toEqual(['Duplicated Cover']);
    await dismissToast(frame);
    await more('Cover').click();
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect.poll(() => toasts(frame)).toEqual(['Deleted Cover']);
    // And a Delete right after another toast gets its Undo at once: toasts never wait in a queue.
    await more('Pricing').click();
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect.poll(() => toasts(frame), { timeout: 1500 }).toEqual(['Duplicated Pricing']);
    await more('Pricing copy').click();
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect.poll(() => toasts(frame), { timeout: 1500 }).toEqual(['Deleted Pricing copy']);
    await expect(frame.locator('.kit-toast').getByRole('button', { name: 'Undo' })).toBeVisible();
    await goNext(frame, 'feedback');
    await expect(frame.locator('.kit-toast')).toHaveCount(0);

    // Delete every row: the empty state, and Put them back.
    await back(frame).click();
    await openPage(frame, 'popups');
    for (let n = await rows.count(); n > 0; n--) {
      await rows.first().locator('.kit-icon-button').click();
      await menu.getByRole('menuitem', { name: 'Delete' }).click();
      await expect(rows).toHaveCount(n - 1);
    }
    await expect(frame.locator('#frames-empty')).toBeVisible();
    await expect(frame.locator('#frames-empty .kit-empty-title')).toHaveText('No frames left');
    await expect(frame.locator('#frames-empty .kit-empty-text')).toHaveText('You deleted every sample frame.');
    await expect(frame.locator('#frames-back')).toBeFocused();
    await frame.locator('#frames-back').click();
    await expect(frame.locator('#frames-empty')).toBeHidden();
    expect(await labels()).toEqual(['Cover', 'Hero banner', 'Features', 'Pricing', 'Footer']);
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
    await expect(rows.first().locator('.kit-icon-button')).toBeFocused();
    expect(await fitted(page, frame)).toBe(five);
    // Eight rows at most, so the window never has to scroll: then Duplicate is off, and says why.
    for (let n = 5; n < 8; n++) {
      await rows.first().locator('.kit-icon-button').click();
      await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
      await expect(rows).toHaveCount(n + 1);
    }
    await rows.first().locator('.kit-icon-button').click();
    await expect(menu.locator('[data-action="duplicate"]')).toBeDisabled();
    await expect(menu.locator('[data-action="duplicate"]')).toHaveText('Duplicate (list is full)');
    await page.keyboard.press('Escape');
    await rows.last().locator('.kit-icon-button').click();
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(rows).toHaveCount(7);
    expect(await above(), 'the new last row').toEqual([false, false, false, false, false, false, true]);
    await rows.first().locator('.kit-icon-button').click();
    await expect(menu.locator('[data-action="duplicate"]')).toBeEnabled();
    await expect(menu.locator('[data-action="duplicate"]')).toHaveText('Duplicate');
    await page.keyboard.press('Escape');
  });

  test('Feedback: a notice in each tone, the same message as a toast, and the empty state after dismissing', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'feedback');
    const notice = frame.locator('#fb-notice');
    await expect(frame.getByRole('radiogroup', { name: 'Tone' })).toBeVisible();
    await expect(frame.getByRole('radio', { name: 'Warning' })).toBeChecked();
    await expect(notice).toHaveAttribute('data-kit-tone', 'warning');
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(notice).toHaveText('3 names are duplicates.');
    for (const [label, tone, text, role] of [
      ['Info', 'info', 'Hidden layers are skipped.', 'status'],
      ['Success', 'success', 'Renamed 12 layers.', 'status'],
      ['Danger', 'danger', '2 layers are locked, so they were skipped.', 'alert'],
      ['Warning', 'warning', '3 names are duplicates.', 'status'],
    ]) {
      await frame.getByRole('radio', { name: label }).check();
      await expect(notice, label).toHaveAttribute('data-kit-tone', tone);
      await expect(notice, label).toHaveText(text);
      await expect(notice, label).toHaveAttribute('role', role);
      await expect(notice.locator('> svg > use'), label).toHaveAttribute('href', `#i-${tone}`);
    }
    // The toast says the same, in the same tone, and goes on its own.
    await frame.getByRole('radio', { name: 'Success' }).check();
    await frame.getByRole('button', { name: 'Show it as a toast' }).click();
    await expect.poll(() => toasts(frame)).toEqual(['Renamed 12 layers.']);
    await expect(frame.locator('.kit-toast')).toHaveAttribute('data-kit-tone', 'success');
    // Another tone, another toast: it replaces the first at once instead of waiting behind it.
    await frame.getByRole('radio', { name: 'Info' }).check();
    await frame.getByRole('button', { name: 'Show it as a toast' }).click();
    await expect.poll(() => toasts(frame), { timeout: 1000 }).toEqual(['Hidden layers are skipped.']);
    await dismissToast(frame);
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
    await frame.getByRole('radio', { name: 'Success' }).check();
    // Dismissing leaves the empty state, which grows the window; Bring it back returns focus to the dismiss button.
    const before = await fitted(page, frame);
    await expect(frame.locator('#fb-dismiss')).toHaveAccessibleName('Dismiss notice');
    await frame.locator('#fb-dismiss').click();
    await expect(frame.locator('#fb-stack')).toBeHidden();
    await expect(frame.locator('#fb-empty')).toBeVisible();
    await expect(frame.locator('#fb-empty')).toHaveAttribute('role', 'status');
    await expect(frame.locator('#fb-empty .kit-empty-title')).toHaveText('No notices');
    await expect(frame.locator('#fb-empty .kit-empty-text')).toHaveText('You dismissed the last one.');
    await expect(frame.locator('#fb-back')).toBeFocused();
    expect(await fitted(page, frame)).toBeGreaterThan(before);
    await frame.locator('#fb-back').click();
    await expect(frame.locator('#fb-stack')).toBeVisible();
    await expect(frame.locator('#fb-empty')).toBeHidden();
    await expect(frame.locator('#fb-dismiss')).toBeFocused();
    await expect(notice).toHaveText('Renamed 12 layers.');
    expect(await fitted(page, frame)).toBe(before);
    // A toast about this page doesn't follow to Home: it goes, and Home keeps its height.
    await frame.getByRole('button', { name: 'Show it as a toast' }).click();
    await expect.poll(() => toasts(frame)).toEqual(['Renamed 12 layers.']);
    await back(frame).click();
    await expect(frame.locator('.kit-toast')).toHaveCount(0);
    nearHeight(await fitted(page, frame), HEIGHTS[360].home, 'home with no toast lane');
  });

  test('Window: each new frame grows the window until the list reaches its cap; the footer reads the live size; Start over', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'window');
    const rows = frame.locator('#win-list .kit-list-row');
    const list = frame.locator('#screen-window .kit-scroll');
    const readout = frame.locator('#win-size');
    await expect(rows.locator('.kit-list-row-label')).toHaveText(['Cover', 'Hero banner', 'Features']);
    const heights = { 3: await fitted(page, frame) };
    await expect(readout).toHaveText(`This window: 360 × ${heights[3]}`);
    await expect(frame.locator('#win-add')).toHaveAccessibleName('Add a frame');
    await expect(frame.locator('#win-add')).toHaveAccessibleDescription('Add a frame');
    for (let n = 4; n <= 8; n++) {
      await frame.locator('#win-add').click();
      await expect(rows).toHaveCount(n);
      await expect(rows.last()).toHaveText(new RegExp(`^Frame ${n}`));
      await expect(rows.last()).toHaveAttribute('aria-current', 'true');
      await expect(frame.locator('#win-list [aria-current]')).toHaveCount(1);
      heights[n] = await fitted(page, frame);
      await expect(readout).toHaveText(`This window: 360 × ${heights[n]}`);
      // The new row is in view, inside the list.
      const [row, box] = [await rect(rows.last()), await rect(list)];
      expect(row.bottom, `Frame ${n} is in view`).toBeLessThanOrEqual(box.bottom + 1);
    }
    expect(heights[4] - heights[3], 'a row grows the window by 32').toBe(32);
    expect(heights[5] - heights[4]).toBe(32);
    // The list stops at 5.5 rows and scrolls; the window stops growing.
    expect(heights[6] - heights[5]).toBeLessThan(32);
    expect(heights[7]).toBe(heights[6]);
    expect(heights[8]).toBe(heights[6]);
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // Scrolled to the new row, the row cut at the top sits under a line, so it reads as scrolled.
    await expect(list).toHaveAttribute('data-scrolled', '');
    expect(await list.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('1px');
    await list.evaluate((el) => { el.scrollTop = 0; });
    await expect(list).not.toHaveAttribute('data-scrolled', '');
    expect(heights[8], 'the line takes no height').toBe(await fitted(page, frame));
    // A row press makes it current.
    await rows.filter({ hasText: 'Hero banner' }).click();
    await expect(rows.filter({ hasText: 'Hero banner' })).toHaveAttribute('aria-current', 'true');
    await expect(frame.locator('#win-list [aria-current]')).toHaveCount(1);
    // Start over: three frames, and the window shrinks back.
    await frame.locator('#win-reset').click();
    await expect(rows).toHaveCount(3);
    expect(await fitted(page, frame)).toBe(heights[3]);
    await expect(readout).toHaveText(`This window: 360 × ${heights[3]}`);
  });

  test('Window: dragging the corner says the width is kept for next time; the keys show while the corner has keyboard focus', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'window');
    const readout = frame.locator('#win-size');
    const height = await fitted(page, frame);
    // A drag to 412 wide: the kit saves the width, and the footer says so.
    let at = await mark(page);
    await drag(page, frame, 52, 0);
    await waitForFinal(page, at);
    expect((await frameSize(page)).width).toBe(412);
    await expect(readout).toHaveText('Opens at 412 px wide next time');
    expect((await writesSince(page, at)).at(-1)).toMatchObject({ width: 412 });
    await expect(legend(frame, 'resize-handle')).toHaveAttribute('data-tried', '');
    // A new frame: the readout shows the live size again.
    await frame.locator('#win-add').click();
    await expect(readout).toHaveText(`This window: 412 × ${height + 32}`);
    // The keys: listed while the corner has keyboard focus; an arrow moves 8 px.
    at = await mark(page);
    await frame.locator('[data-kit-resize]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(readout).toHaveText('← → 8 px · Shift 32 px · Enter: next width');
    await expect.poll(async () => (await frameSize(page)).width).toBe(404);
    await frame.locator('#win-reset').focus();
    await expect(readout).toHaveText('Opens at 404 px wide next time');
    // The toast lane on a screen with a footer: the toast sits between the list and the footer.
    const before = await fitted(page, frame);
    await frame.evaluate(() => { kit.toast('Saved'); });
    await expect.poll(() => toasts(frame)).toEqual(['Saved']);
    expect(await fitted(page, frame), 'the lane').toBe(before + 40);
    const toast = await rect(frame.locator('.kit-toast'));
    expect(toast.top).toBeGreaterThanOrEqual((await rect(frame.locator('#screen-window .kit-scroll'))).bottom);
    expect(toast.bottom).toBeLessThanOrEqual((await rect(frame.locator('#screen-window .kit-footer'))).top);
    await dismissToast(frame);
    expect(await fitted(page, frame)).toBe(before);
  });

  test('resizable (the preview\'s mode switch): each screen change fits the height with kit.fit(); in a short window the bar stays on top and focus never hides under it', async ({ page }) => {
    const frame = await openTour(page, { mode: 'resizable' });
    const { bounds, mode } = await kitInit(page);
    expect(mode).toBe('resizable');
    const fits = async () => clamp(await contentHeight(frame), bounds.minHeight, bounds.maxHeight);
    for (const id of ['fields', 'feedback']) {
      await openPage(frame, id);
      await expect.poll(async () => (await frameSize(page)).height - (await fits()), id).toBe(0);
      await back(frame).click();
      await expect.poll(async () => (await frameSize(page)).height - (await fits()), `home after ${id}`).toBe(0);
    }
    // Drag Fields shorter than its content: the page scrolls under the sticky bar.
    await openPage(frame, 'fields');
    await expect.poll(async () => (await frameSize(page)).height - (await fits())).toBe(0);
    await page.locator('#live-frame').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const at = await mark(page);
    await drag(page, frame, 0, -220);
    await waitForFinal(page, at);
    expect((await frameSize(page)).height).toBeLessThan(await contentHeight(frame));
    await frame.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barTop = () => frame.evaluate(() => Math.round(/** @type {Element} */ (document.querySelector('#screen-fields .tour-bar')).getBoundingClientRect().top));
    expect(await barTop(), 'stuck to the top').toBe(0);
    // Shift+Tab from the last field back up to the bar: no control gets focus under the sticky bar
    // (WCAG 2.4.11), because the page's scroll-padding-top keeps scrolled-to controls below it.
    await frame.locator('#f-notes').focus();
    const hidden = [];
    let steps = 0;
    for (; steps < 30; steps++) {
      await page.keyboard.press('Shift+Tab');
      const r = await frame.evaluate(() => {
        const el = /** @type {HTMLElement} */ (document.activeElement);
        const bar = /** @type {Element} */ (document.querySelector('#screen-fields .tour-bar'));
        return { name: el.id || el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24) || el.tagName, top: el.getBoundingClientRect().top, barBottom: bar.getBoundingClientRect().bottom, inBar: bar.contains(el) };
      });
      if (r.inBar) break;
      if (r.top < r.barBottom) hidden.push(`${r.name} at ${Math.round(r.top)} (the bar ends at ${Math.round(r.barBottom)})`);
    }
    expect(steps, 'reached the bar').toBeLessThan(30);
    expect(hidden).toEqual([]);
    expect(await barTop()).toBe(0);
  });

  test('fixed (the preview\'s mode switch): no corner, and the Window page says why', async ({ page }) => {
    const frame = await openTour(page, { mode: 'fixed' });
    expect(await frame.evaluate(() => document.documentElement.dataset.kitChrome)).toBe('off');
    await openPage(frame, 'window');
    await expect(frame.locator('#win-lead')).toHaveText('Add frames to the list.');
    await expect(frame.locator('#win-drag')).toBeHidden();
    await expect(frame.locator('#win-note')).toHaveText('This window keeps the size it opened at, so there’s no corner to drag here.');
    await expect(legend(frame, 'resize-handle')).toHaveText(/^Resize handle: not here/);
    await expect(legend(frame, 'resize-handle')).toHaveAttribute('data-tried', '');
  });

  test('280px, as in Figma Buzz: no corner, every screen fits the panel, and the Window page explains why the handle counts', async ({ page }) => {
    const frame = await openTour(page, { editor: 'buzz', theme: 'dark' });
    expect(await frame.evaluate(() => document.documentElement.dataset.kitChrome)).toBe('off');
    await expect(frame.locator('[data-kit-resize]')).toBeHidden();
    // Buzz docks the plugin in a 280px panel; the preview's width control stands in for it.
    await page.locator('#live-width').fill('280');
    await expect.poll(async () => (await frameSize(page)).width).toBe(280);
    const scrollsSideways = () => frame.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(await fitted(page, frame)).toBeLessThan(720);
    expect(await scrollsSideways(), 'home').toBe(false);
    nearHeight(await fitted(page, frame), HEIGHTS[280].home, 'home at 280');
    for (const id of ORDER) {
      await openPage(frame, id);
      const fit = await fitted(page, frame);
      expect(fit, id).toBeLessThan(720);
      nearHeight(fit, HEIGHTS[280][id], `${id} at 280`);
      expect(await scrollsSideways(), id).toBe(false);
      if (id === 'popups') {
        // The last row's tooltip opens above its ⋯, inside the panel (there's no bottom padding in Buzz).
        const last = frame.locator('#frames > li').last();
        await last.locator('.kit-icon-button').focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab'); // keyboard focus, so the tooltip shows
        const tip = last.locator('.kit-tooltip');
        await expect(tip).toBeVisible();
        expect((await rect(tip)).bottom).toBeLessThanOrEqual(await frame.evaluate(() => innerHeight));
        expect(await frame.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'nothing scrolls').toBe(0);
      }
      if (id === 'window') {
        const height = (await frameSize(page)).height;
        // The docked panel keeps its size (Figma ignores resize there), so the lead doesn't promise it grows.
        await expect(frame.locator('#win-lead')).toHaveText('Add frames to the list.');
        await expect(frame.locator('#win-drag')).toBeHidden();
        await expect(frame.locator('#win-notice')).toBeVisible();
        await expect(frame.locator('#win-note')).toHaveText('Buzz docks this panel, so it keeps its size and has no corner to drag. In Figma Design, FigJam and Slides the corner is at the bottom right.');
        await expect(legend(frame, 'resize-handle')).toHaveText('Resize handle: not in Buzz');
        await expect(legend(frame, 'resize-handle')).toHaveAttribute('data-absent', '');
        await expect(frame.locator('#win-size')).toHaveText(`This panel: 280 × ${height}`);
        // Showing this page counts the handle, so the count is always out of 20.
        await expect(legend(frame, 'resize-handle')).toHaveAttribute('data-tried', '');
        await expect(legend(frame, 'resize-handle')).toHaveAccessibleName('Resize handle: not in Buzz, tried');
        await expect(frame.locator('#screen-window .tour-legend')).toHaveAccessibleName('Parts on this page. Press one to see where it is.');
        // Show me rings the notice that explains it.
        await legend(frame, 'resize-handle').click();
        await expect(frame.locator('#win-notice')).toHaveClass(/tour-ring/);
        await expect(said(frame)).toHaveText('There’s no corner here. The notice says why.');
      }
      if (id === 'files') await expect(frame.locator('#theme-line')).toHaveText('Right now: Buzz, dark theme.');
      await back(frame).click();
    }
    await expect(frame.locator('#group-window')).toHaveAccessibleName(/1 of 4 tried$/);
    // Two parts tried on this walk: the handle (its page was shown) and the tooltip that keyboard focus showed.
    await expect(count(frame)).toHaveText(tried(2));
  });

  test('Create shapes: the label and the preview follow Count and Shape; Create sends create-shapes and shows the result', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'create');
    const countField = frame.locator('#cr-count');
    const create = frame.locator('#cr-create');
    const status = frame.locator('#cr-status');
    const shapes = frame.locator('#shapes .tour-shape');
    const badge = frame.locator('#shapes-size');
    await expect(status).toHaveText('Nothing selected');
    await host(page, () => window.kitPreviewHost.select('sample'));
    await expect(status).toHaveText('2 layers selected');
    await expect(create).toHaveText('Create 5 rectangles');
    await expect(shapes).toHaveCount(5);
    await expect(badge).toHaveText('700 × 100');
    await expect(countField).toHaveAccessibleDescription('From 1 to 50.');
    // The shapes are drawn in main's fill: { r: 1, g: 0.5, b: 0 } in code.ts.
    expect(await shapes.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 128, 0)');
    // Invalid counts: the error, a plain "Create", and a press sends nothing and goes back to the field.
    for (const bad of ['0', '51', '2.5', '']) {
      await countField.fill(bad);
      await expect(countField, bad).toHaveAttribute('aria-invalid', 'true');
      await expect(countField, bad).toHaveAccessibleDescription('Enter a whole number from 1 to 50.');
      await expect(create, bad).toHaveText('Create');
      const at = await mark(page);
      await create.click();
      await expect(countField, bad).toBeFocused();
      expect(await createsSince(page, at), `${bad} sends nothing`).toEqual([]);
    }
    // One, six, seven: up to six are drawn, past six five and "+N"; the badge is the real size.
    for (const [n, label, drawn, more, size] of [['1', 'Create 1 rectangle', 1, null, '100 × 100'], ['6', 'Create 6 rectangles', 6, null, '850 × 100'], ['7', 'Create 7 rectangles', 5, '+2', '1000 × 100'], ['50', 'Create 50 rectangles', 5, '+45', '7450 × 100']]) {
      await countField.fill(String(n));
      await expect(countField, n).not.toHaveAttribute('aria-invalid', 'true');
      await expect(create, n).toHaveText(String(label));
      await expect(shapes, n).toHaveCount(Number(drawn));
      await expect(frame.locator('#shapes .tour-more'), n).toHaveCount(more ? 1 : 0);
      if (more) await expect(frame.locator('#shapes .tour-more'), n).toHaveText(String(more));
      await expect(badge, n).toHaveText(String(size));
    }
    await countField.fill('3');
    await frame.locator('#cr-shape').selectOption('ellipse');
    await expect(create).toHaveText('Create 3 ellipses');
    await expect(frame.locator('#shapes')).toHaveAttribute('data-shape', 'ellipse');
    await expect(badge).toHaveText('400 × 100');
    await expect(next(frame)).toHaveClass(/kit-button-tertiary/);
    const before = await fitted(page, frame);
    // Create: one message with the count and the shape; main makes them, selects them and answers.
    let at = await mark(page);
    await create.click();
    await expect(frame.locator('#cr-result')).toHaveText('Added 3 ellipses to this page.');
    await expect(frame.locator('#cr-result')).toHaveAttribute('data-kit-tone', 'success');
    await expect(frame.locator('#cr-result')).toHaveAttribute('role', 'status');
    await expect(status).toHaveText('3 layers selected');
    await expect(create).not.toHaveAttribute('aria-busy', 'true');
    expect(await createsSince(page, at)).toEqual([{ type: 'create-shapes', count: 3, shape: 'ellipse' }]);
    expect(await callsSince(page, at, 'createEllipse')).toHaveLength(3);
    // A successful Create completes the page, and the notice grows the window.
    await expect(next(frame)).toHaveClass(/kit-button-secondary/);
    expect(await fitted(page, frame)).toBeGreaterThan(before);
    // Enter in Count creates, once; held down, still once, in the field and on Create.
    await frame.locator('#cr-shape').selectOption('rectangle');
    await countField.fill('2');
    at = await mark(page);
    await countField.press('Enter');
    await expect(frame.locator('#cr-result')).toHaveText('Added 2 rectangles to this page.');
    expect(await createsSince(page, at)).toHaveLength(1);
    await expect(frame.locator('#cr-result'), 'one result notice at a time').toHaveCount(1);
    for (const target of ['#cr-count', '#cr-create']) {
      at = await mark(page);
      await frame.locator(target).focus();
      await holdEnter(page);
      await page.waitForTimeout(200);
      expect(await createsSince(page, at), `Enter held on ${target}`).toHaveLength(1);
      expect(await callsSince(page, at, 'createRectangle'), `Enter held on ${target}`).toHaveLength(2);
    }
    expect(await hostErrors(page)).toEqual([]);
  });

  test('Create shapes: busy until main answers, and a second press meanwhile sends nothing', async ({ page }) => {
    // Main answers 500 ms late here, so the second press lands while the first is still running.
    await patchFile(page, 'examples/kit-tour/code.js', [["tourPost({ type: 'created', count: nodes.length, shape });", "setTimeout(() => tourPost({ type: 'created', count: nodes.length, shape }), 500);"]]);
    const frame = await openTour(page);
    await openPage(frame, 'create');
    const create = frame.locator('#cr-create');
    const at = await mark(page);
    await create.click();
    await expect(create).toHaveAttribute('aria-busy', 'true');
    // aria-busy stops the pointer (Playwright's click would wait it out), not the keyboard.
    await create.press('Enter');
    await create.press(' ');
    await frame.locator('#cr-count').press('Enter');
    await expect(frame.locator('#cr-result')).toHaveText('Added 5 rectangles to this page.');
    await expect(create).not.toHaveAttribute('aria-busy', 'true');
    expect(await createsSince(page, at)).toEqual([{ type: 'create-shapes', count: 5, shape: 'rectangle' }]);
  });

  test('Create shapes: when main cannot create, a danger notice says so and Create is not left busy', async ({ page }) => {
    // As an editor that can't create the node would: the first create call throws.
    await patchFile(page, 'examples/kit-tour/code.js', [['figma.createRectangle()', "(() => { throw new Error('stub: no rectangles here'); })()"]]);
    const frame = await openTour(page);
    await openPage(frame, 'create');
    const at = await mark(page);
    await frame.locator('#cr-create').click();
    await expect(frame.locator('#cr-result')).toHaveText('Couldn’t add shapes here.');
    await expect(frame.locator('#cr-result')).toHaveAttribute('data-kit-tone', 'danger');
    await expect(frame.locator('#cr-result')).toHaveAttribute('role', 'alert');
    await expect(frame.locator('#cr-create')).not.toHaveAttribute('aria-busy', 'true');
    await expect(next(frame), 'nothing made: the page is not complete').toHaveClass(/kit-button-tertiary/);
    expect((await callsSince(page, at, 'notify')).map((c) => c.args[0])).toEqual(['Couldn’t add shapes: stub: no rectangles here']);
  });

  test('Get the files: the steps, Copy link (and its fallback), and Open GitHub, which asks main to open the page', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'files');
    const screen = frame.locator('#screen-files');
    await expect(screen.locator('.tour-title')).toHaveText('Build your own plugin');
    await expect(screen.locator('.tour-intro p')).toHaveText(/^Free starter code with all 20 parts\.\s*Describe your plugin, and an AI agent builds it with them\.$/);
    await expect(screen.locator('.tour-steps > li b')).toHaveText(['Get the files', 'Describe your plugin', 'Import it into Figma']);
    await expect(screen.locator('.tour-steps > li').nth(1)).toContainText('Open the folder in an AI agent that can edit files on your computer, and say what your plugin should do.');
    await expect(screen.locator('.tour-subtitle')).toHaveText('Colours from Figma');
    await expect(frame.locator('#files-url')).toHaveText('github.com/alekseikipin/Figplug-ui-kit');
    // Copy link: the copy event puts the full address on the clipboard, focus never leaves the button
    // (a screen reader hears nothing extra), and the toast says so. The stub plays the browser's part.
    await frame.evaluate(() => {
      /** @type {any} */ (window).tourFocus = [];
      document.addEventListener('focusin', (e) => /** @type {any} */ (window).tourFocus.push(/** @type {Element} */ (e.target).id), true);
      document.execCommand = (command) => {
        const clipboardData = new DataTransfer();
        document.activeElement?.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }));
        /** @type {any} */ (window).tourCopied = [command, clipboardData.getData('text/plain'), document.activeElement?.id];
        return true;
      };
    });
    await frame.locator('#copy-link').click();
    await expect.poll(() => toasts(frame)).toEqual(['Link copied']);
    expect(await frame.evaluate(() => /** @type {any} */ (window).tourCopied)).toEqual(['copy', GITHUB, 'copy-link']);
    expect(await frame.evaluate(() => /** @type {any} */ (window).tourFocus)).toEqual(['copy-link']);
    await expect(frame.locator('#copy-link')).toBeFocused();
    expect(await frame.evaluate(() => String(getSelection())), 'nothing left selected').toBe('');
    await dismissToast(frame);
    // A blocked clipboard: the address is selected instead, and the toast says how to copy it.
    await frame.evaluate(() => { document.execCommand = () => false; });
    await frame.locator('#copy-link').click();
    await expect.poll(() => toasts(frame)).toEqual([expect.stringMatching(/^Link selected\. Press (⌘C|Ctrl\+C) to copy\.$/)]);
    expect(await frame.evaluate(() => String(getSelection()))).toBe('github.com/alekseikipin/Figplug-ui-kit');
    await dismissToast(frame);
    // Open GitHub: one typed message, no address in it; main opens the kit's page.
    const at = await mark(page);
    await frame.locator('#open-github').click();
    await expect.poll(async () => (await callsSince(page, at, 'openExternal')).map((c) => c.args)).toEqual([[GITHUB]]);
    expect(await sentSince(page, at)).toEqual([{ type: 'open-github' }]);
    expect(await callsSince(page, at, 'notify')).toEqual([]);
    // The footer's count is Home's.
    await expect(screen.locator('.tour-count')).toHaveText(await count(frame).textContent() || '');
    await expect(next(frame)).toHaveCount(0);
  });

  // The swatches read their hex codes from the tokens on the page; the preview injects
  // tokens.figma-fallback.css's palette for the theme, as Figma injects its own.
  const PALETTES = (() => {
    const css = readFileSync(new URL('tokens.figma-fallback.css', ROOT), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = Object.fromEntries([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]));
    const hex = (value) => {
      const short = /^#([0-9a-f]{3})$/i.exec(value);
      if (short) return short[1].replace(/./g, (d) => d + d).toUpperCase();
      const long = /^#([0-9a-f]{6})$/i.exec(value);
      if (long) return long[1].toUpperCase();
      const rgb = /^rgba?\(([^)]*)\)$/.exec(value);
      if (rgb) return rgb[1].split(',').slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
      throw new Error(`unexpected colour ${value}`);
    };
    const read = (selector) => {
      const body = blocks[selector];
      const value = (token) => hex(/** @type {RegExpExecArray} */ (new RegExp(`--figma-color-${token}:\\s*([^;]+);`).exec(body))[1].trim());
      return { css: `:root {${body}}`, hexes: ['bg-brand', 'bg', 'bg-secondary', 'border', 'bg-inverse'].map(value) };
    };
    return { light: read(':where(:root)'), dark: read(':where(:root.figma-dark)'), figjam: read(':where(:root[data-kit-surface="figjam"])') };
  })();
  const LINES = { light: 'Right now: light theme.', dark: 'Right now: dark theme.', figjam: 'Right now: FigJam, always light.' };

  for (const theme of ['light', 'dark', 'figjam']) {
    test(`Get the files: the five swatches show this theme's colours, read live from the tokens (${theme})`, async ({ page }) => {
      const frame = await openTour(page, theme === 'figjam' ? { theme, editor: 'figjam' } : { theme });
      await openPage(frame, 'files');
      const items = frame.locator('#swatches > li');
      await expect(frame.getByRole('list', { name: 'Colours from Figma' })).toBeVisible();
      await expect(items.locator('span > span')).toHaveText(['Brand', 'Panel', 'Field', 'Border', 'Tooltip']);
      await expect(items.locator('small')).toHaveText(PALETTES[theme].hexes);
      // Each tile is painted with the colour its code names.
      const painted = await items.locator('i').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
      expect(painted).toEqual(PALETTES[theme].hexes.map((h) => `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4), 16)})`));
      await expect(frame.locator('#theme-line')).toHaveText(LINES[theme]);
    });
  }

  test('Get the files: when Figma switches between light and dark, the swatches change on the spot and a toast says so, once', async ({ page }) => {
    const frame = await openTour(page);
    await openPage(frame, 'files');
    await expect(frame.locator('#swatches small')).toHaveText(PALETTES.light.hexes);
    await page.waitForTimeout(1100); // the theme set at load is not a switch
    // What Figma does on a theme switch: new values in its injected style, a new class on <html>.
    const switchTo = (to) => frame.evaluate(({ css, from, cls }) => {
      /** @type {HTMLElement} */ (document.getElementById('figma-style')).textContent = css;
      document.documentElement.classList.replace(from, cls);
    }, { css: PALETTES[to].css, from: to === 'dark' ? 'figma-light' : 'figma-dark', cls: to === 'dark' ? 'figma-dark' : 'figma-light' });
    await switchTo('dark');
    await expect(frame.locator('#swatches small')).toHaveText(PALETTES.dark.hexes);
    await expect(frame.locator('#theme-line')).toHaveText(LINES.dark);
    await expect.poll(() => toasts(frame)).toEqual(['Switched to dark, like Figma. Every colour changed with it.']);
    await expect(count(frame), 'the theme toast counts nothing').toHaveText(tried(0));
    await dismissToast(frame);
    await switchTo('light');
    await expect(frame.locator('#swatches small')).toHaveText(PALETTES.light.hexes);
    await expect(frame.locator('#theme-line')).toHaveText(LINES.light);
    await page.waitForTimeout(300);
    expect(await toasts(frame), 'once per session').toEqual([]);
  });

  for (const theme of ['light', 'dark', 'figjam']) {
    test(`axe: no WCAG 2.1 A/AA violations on any screen, or with the menu, the dialog, a toast or an empty state (${theme})`, async ({ page }) => {
      test.slow(); // nine screens and four overlays: about 15 s here and 40 s on CI's runners
      const frame = await openTour(page, theme === 'figjam' ? { theme, editor: 'figjam' } : { theme });
      const check = async (what) => {
        await page.waitForTimeout(250); // past the screen's 200 ms slide
        const { violations } = await axe(page).include('#live-frame').analyze();
        expect(summary(violations), what).toEqual([]);
      };
      await check('home');
      await openPage(frame, 'buttons');
      for (const [i, id] of ORDER.entries()) {
        if (i) await goNext(frame, id);
        await check(id);
        if (id === 'popups') {
          await frame.locator('#frames > li').nth(1).locator('.kit-icon-button').click();
          await expect(frame.locator('.kit-menu:popover-open')).toHaveCount(1);
          await check('menu open');
          await frame.locator('.kit-menu:popover-open').getByRole('menuitem', { name: 'Rename…' }).click();
          await expect(frame.locator('#rename')).toBeVisible();
          await frame.locator('#rename-name').fill('');
          await check('dialog open, its name in error');
          await page.keyboard.press('Escape');
          for (let n = 5; n > 0; n--) {
            await frame.locator('#frames > li').first().locator('.kit-icon-button').click();
            await frame.locator('.kit-menu:popover-open').getByRole('menuitem', { name: 'Delete' }).click();
            await expect(frame.locator('#frames > li')).toHaveCount(n - 1);
          }
          await expect(frame.locator('.kit-toast')).toHaveCount(1);
          await check('no frames left, with the Undo toast');
        }
        if (id === 'feedback') {
          await frame.locator('#fb-dismiss').click();
          await check('no notices');
        }
        if (id === 'create') {
          await frame.locator('#cr-create').click();
          await expect(frame.locator('#cr-result')).toBeVisible();
          await check('after Create');
        }
      }
      await back(frame).click();
      await check('home, with progress and a current row');
    });
  }
});
