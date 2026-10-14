// preview.html itself: the three themes, the gallery's components and forced states, real
// keyboard focus on invalid and aria-disabled fields, search fields, the live frame booting and
// fitting, the "Simulate no Inter" toggle, the editor and mode switches, the figma stub, the
// file:// note, and the copied kit blocks staying byte-identical to ui.html's. Nothing here needs
// the starter's demo: the live-frame tests run the kit fixture (useKitFixture) or only read what
// any kit plugin has.

import { readFileSync } from 'node:fs';
import { test, expect, openPreview, pluginFrame, waitForPlugin, frameSize, contentHeight, patchFile, useKitFixture } from './helpers.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Each component row and the six states it must show.
const COMPONENTS = {
  'button-primary': ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
  'button-secondary': ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
  'button-selected': ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  'button-tertiary': ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  'button-danger': ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
  'button-icon': ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  'button-large': ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
  input: ['default', 'hover', 'focus', 'active', 'disabled', 'error'],
  'input-icon': ['default', 'hover', 'focus', 'active', 'disabled', 'error'],
  select: ['default', 'hover', 'focus', 'active', 'disabled', 'error'],
  'resize-handle': ['default', 'hover', 'focus', 'active', 'disabled', 'hidden'],
  // Phase 2
  empty: ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
  list: ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  footer: ['default', 'hover', 'focus', 'active', 'disabled', 'sticky'],
  notice: ['default', 'hover', 'focus', 'active', 'disabled', 'danger'],
  checkbox: ['default', 'hover', 'focus', 'active', 'disabled', 'checked'],
  radio: ['default', 'hover', 'focus', 'active', 'disabled', 'checked'],
  textarea: ['default', 'hover', 'focus', 'active', 'disabled', 'error'],
  'section-header': ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  'icon-button': ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  number: ['default', 'hover', 'focus', 'active', 'disabled', 'error'],
  color: ['default', 'hover', 'focus', 'active', 'disabled', 'error'],
  tooltip: ['default', 'hover', 'focus', 'active', 'disabled', 'open'],
  tabs: ['default', 'hover', 'focus', 'active', 'disabled', 'selected'],
  menu: ['default', 'hover', 'focus', 'active', 'disabled', 'open'],
};

const BG = { light: 'rgb(255, 255, 255)', dark: 'rgb(44, 44, 44)', figjam: 'rgb(255, 255, 255)' };
const BRAND = { light: 'rgb(13, 153, 255)', dark: 'rgb(12, 140, 233)', figjam: 'rgb(151, 71, 255)' };

for (const theme of ['light', 'dark', 'figjam']) {
  test(`renders in the ${theme} theme, page and plugin alike`, async ({ page }) => {
    await openPreview(page, { theme });
    const look = await page.evaluate(() => ({
      cls: document.documentElement.className, surface: document.documentElement.dataset.kitSurface,
      bg: getComputedStyle(document.body).backgroundColor,
      brand: getComputedStyle(/** @type {Element} */ (document.querySelector('[data-preview-component="button-primary"] [data-state="default"] button'))).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(look).toEqual({
      cls: theme === 'dark' ? 'figma-dark' : 'figma-light', surface: theme === 'figjam' ? 'figjam' : 'design',
      bg: BG[theme], brand: BRAND[theme], scheme: theme === 'dark' ? 'dark' : 'light',
    });
    // Read from a probe element, so this holds for any plugin's ui.html, not just the demo's.
    const inside = await pluginFrame(page).evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--figma-color-bg-brand)';
      document.body.append(probe);
      const brand = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { cls: document.documentElement.className, bg: getComputedStyle(document.body).backgroundColor, brand };
    });
    expect(inside).toEqual({ cls: theme === 'dark' ? 'figma-dark' : 'figma-light', bg: BG[theme], brand: BRAND[theme] });
  });
}

test('the theme buttons switch the page and rerun the plugin in that palette', async ({ page }) => {
  await openPreview(page);
  for (const theme of ['dark', 'figjam', 'light']) {
    await page.locator(`[data-preview-theme="${theme}"]`).click();
    await expect(page.locator(`[data-preview-theme="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
    await waitForPlugin(page);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(BG[theme]);
    expect(await pluginFrame(page).evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(BG[theme]);
    expect(new URL(page.url()).searchParams.get('theme')).toBe(theme === 'light' ? null : theme);
  }
});

test('every gallery component is present in all six states', async ({ page }) => {
  await openPreview(page);
  const found = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-preview-component]')]
    .map((row) => [row.getAttribute('data-preview-component'), [...row.querySelectorAll('[data-state]')].map((c) => c.getAttribute('data-state'))])));
  expect(found).toEqual(COMPONENTS);
  // The forced states are real kit rules: hover, pressed and focus differ from default.
  const paint = await page.evaluate(() => {
    const get = (row, state, prop) => getComputedStyle(/** @type {Element} */ (document.querySelector(`[data-preview-component="${row}"] [data-state="${state}"] button, [data-preview-component="${row}"] [data-state="${state}"] input`)))[prop];
    return {
      primary: ['default', 'hover', 'active'].map((s) => get('button-primary', s, 'backgroundColor')),
      focusRing: get('button-secondary', 'focus', 'outlineColor'),
      defaultRing: get('button-secondary', 'default', 'outlineColor'),
      inputHover: get('input', 'hover', 'outlineColor'),
      inputDefault: get('input', 'default', 'outlineColor'),
      disabledText: get('button-secondary', 'disabled', 'color'),
    };
  });
  // (The fallback's docs values give brand-hover and brand-pressed the same colour.)
  expect(paint.primary[1], 'hover differs from default').not.toBe(paint.primary[0]);
  expect(paint.primary[2], 'pressed differs from default').not.toBe(paint.primary[0]);
  expect(paint.focusRing).toBe(BRAND.light); // border-selected
  expect(paint.focusRing).not.toBe(paint.defaultRing);
  expect(paint.inputHover).not.toBe(paint.inputDefault);
  expect(paint.disabledText).toBe('rgba(0, 0, 0, 0.3)'); // text-disabled, not opacity
  expect(await page.evaluate(() => window.kitPreviewHost.demoStates())).toBeGreaterThanOrEqual(10);
  // The demo handles stay inside their boxes (the transform contains position: fixed).
  const inBox = await page.evaluate(() => [...document.querySelectorAll('.kit-demo-handle')].every((box) => {
    const handle = box.querySelector('.kit-resize-handle');
    if (!handle || /** @type {HTMLElement} */ (handle).hidden) return true;
    const a = box.getBoundingClientRect();
    const b = handle.getBoundingClientRect();
    return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
  }));
  expect(inBox).toBe(true);
});

test('keyboard focus shows the focus ring on invalid and aria-disabled fields too; search fields draw no native clear button', async ({ page }) => {
  await openPreview(page);
  // aria-disabled keeps a control focusable (components.md), so it needs the ring as much as any.
  await page.evaluate(() => document.getElementById('gallery').insertAdjacentHTML('beforeend',
    '<div id="probe"><input class="kit-input" id="probe-input" aria-disabled="true" aria-label="Probe input">'
    + '<div class="kit-select"><select id="probe-select" aria-disabled="true" aria-label="Probe select"><option>One</option></select></div></div>'));
  const ring = (id) => page.evaluate((i) => {
    const el = /** @type {Element} */ (document.getElementById(i));
    return { active: document.activeElement === el, focusVisible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineColor };
  }, id);
  for (const id of ['g-input-error', 'g-input-icon-error', 'g-select-error', 'probe-input', 'probe-select']) {
    const resting = (await ring(id)).outline;
    // Arrive by keyboard, as a keyboard user does.
    await page.locator(`#${id}`).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    expect(await ring(id), id).toEqual({ active: true, focusVisible: true, outline: BRAND.light }); // border-selected
    expect(resting, `${id}: the ring changes on focus`).not.toBe(BRAND.light);
  }
  await page.evaluate(() => document.getElementById('probe')?.remove());

  // Chromium (and so Figma's desktop app) draws its own clear button in search fields, in a
  // colour no token controls; the kit removes it, and a click at the field's end no longer clears it.
  const search = page.locator('[data-preview-component="input-icon"] [data-state="default"] input');
  await search.fill('Frame');
  expect(await search.evaluate((el) => getComputedStyle(el, '::-webkit-search-cancel-button').appearance)).toBe('none');
  const box = await search.boundingBox();
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  expect(await search.inputValue()).toBe('Frame');
});

test('the live frame boots, fits its content and shows the handle', async ({ page }) => {
  await useKitFixture(page);
  await openPreview(page);
  const frame = pluginFrame(page);
  expect(await frameSize(page)).toEqual({ width: 320, height: await contentHeight(frame), state: 'shown' });
  await expect(frame.locator('[data-kit-resize]')).toBeVisible();
  await expect(page.locator('#live-title')).toHaveText(JSON.parse(read('../manifest.json')).name);
  await expect(page.locator('#live-size')).toHaveText(`320 × ${await contentHeight(frame)}`);
  await expect(page.locator('#live-log li')).not.toHaveCount(0);
  // The width control resizes the window from the host side; the kit refits the height and saves nothing.
  await page.locator('#live-width').fill('480');
  await page.waitForTimeout(300);
  expect(await frameSize(page)).toEqual({ width: 480, height: await contentHeight(frame), state: 'shown' });
  expect(await page.evaluate(() => window.kitPreviewHost.calls().filter((c) => c.name === 'clientStorage.setAsync'))).toEqual([]);
});

test('"Simulate no Inter" drops Inter from the font stack in the gallery and in the plugin', async ({ page }) => {
  await openPreview(page);
  const font = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  const pluginFont = () => pluginFrame(page).evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(await font()).toMatch(/^Inter,/);
  expect(await pluginFont()).toMatch(/^Inter,/);
  await page.locator('#preview-no-inter').click();
  await expect(page.locator('#preview-no-inter')).toHaveAttribute('aria-pressed', 'true');
  await waitForPlugin(page);
  expect(await font()).not.toMatch(/Inter/);
  expect(await font()).toMatch(/^system-ui/);
  expect(await pluginFont()).not.toMatch(/Inter/);
  expect(new URL(page.url()).searchParams.get('inter')).toBe('0');
  await page.locator('#preview-no-inter').click();
  await waitForPlugin(page);
  expect(await pluginFont()).toMatch(/^Inter,/);
});

test('the editor switch reruns the plugin: Dev Mode turns the chrome off', async ({ page }) => {
  await useKitFixture(page);
  await openPreview(page);
  await page.locator('#live-editor').selectOption('dev');
  const frame = await waitForPlugin(page);
  const ui = await frame.evaluate(() => ({ chrome: document.documentElement.dataset.kitChrome, hidden: /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]')).hidden }));
  expect(ui).toEqual({ chrome: 'off', hidden: true });
  const init = await page.evaluate(() => window.kitPreviewHost.messages().filter((m) => m.run === window.kitPreviewHost.runId()).find((m) => m.msg.type === 'kit:init').msg);
  expect(init).toMatchObject({ editorType: 'dev', chrome: false, bounds: { minWidth: 300 } });
  // FigJam is light only: picking it switches the palette too.
  await page.locator('#live-editor').selectOption('figjam');
  await waitForPlugin(page);
  await expect(page.locator('[data-preview-theme="figjam"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the mode switch forces the mode whatever installKitWindow is passed', async ({ page }) => {
  await useKitFixture(page);
  // Other call shapes than the starter's: options in a variable, more than a mode, or none at all.
  const shapes = [
    "const options = { mode: 'fit-content', bounds: { minWidth: 260 } };\ninstallKitWindow(options);",
    "installKitWindow({ size: { width: 300, height: 340 }, mode: 'fit-content', persist: false });",
    'installKitWindow();',
  ];
  for (const call of shapes) {
    await patchFile(page, 'code.js', [["installKitWindow({ mode: 'fit-content' });", call]]);
    for (const mode of ['resizable', 'fixed', 'fit-content']) {
      await openPreview(page, { mode });
      const init = await page.evaluate(() => window.kitPreviewHost.messages().filter((m) => m.run === window.kitPreviewHost.runId()).find((m) => m.msg.type === 'kit:init').msg);
      expect(init.mode, `${call} in ${mode}`).toBe(mode);
      expect(await pluginFrame(page).evaluate(() => document.documentElement.dataset.kitMode), call).toBe(mode);
      if (call.includes('260')) expect(init.bounds.minWidth, 'the other options still apply').toBe(260);
      if (call.includes('340')) expect(init.defaultSize, 'the other options still apply').toEqual({ width: 300, height: 340 });
    }
  }
  expect(await page.locator('#live-log li[data-dir="error"]').count(), 'no mode-switch error logged').toBe(0);
});

test('the figma stub: currentPage.id, getNodeByIdAsync, node names, nodechange, commitUndo', async ({ page }) => {
  await useKitFixture(page);
  // A plugin that renames what it finds, as the one-shot rename-layers run did.
  await patchFile(page, 'code.js', [["installKitWindow({ mode: 'fit-content' });", `installKitWindow({ mode: 'fit-content' });
const seen = [];
figma.currentPage.on('nodechange', (event) => { for (const c of event.nodeChanges) seen.push(c.type + ' ' + c.id + (c.properties ? ' ' + c.properties.join(',') : '')); });
const quiet = () => {};
figma.currentPage.on('nodechange', quiet);
figma.currentPage.off('nodechange', quiet);
figma.ui.on('message', async (msg) => {
  if (!msg || msg.type !== 'stub-probe') return;
  const rect = figma.createRectangle();
  const found = await figma.getNodeByIdAsync(rect.id);
  const pageNode = await figma.getNodeByIdAsync(figma.currentPage.id);
  const missing = await figma.getNodeByIdAsync('9:9');
  found.name = 'Renamed ' + found.name;
  figma.commitUndo();
  setTimeout(() => figma.ui.postMessage({ type: 'stub-report', same: found === rect, page: pageNode && pageNode.type, pageId: figma.currentPage.id, missing, name: rect.name, seen }), 50);
});`]]);
  await openPreview(page);
  await pluginFrame(page).evaluate(() => parent.postMessage({ pluginMessage: { type: 'stub-probe' } }, '*'));
  await expect.poll(() => page.evaluate(() => window.kitPreviewHost.messages().some((m) => m.msg.type === 'stub-report'))).toBe(true);
  const msg = await page.evaluate(() => window.kitPreviewHost.messages().find((m) => m.msg.type === 'stub-report').msg);
  const id = msg.seen[0].split(' ')[1];
  expect(msg).toEqual({ type: 'stub-report', same: true, page: 'PAGE', pageId: '0:1', missing: null, name: expect.stringMatching(/^Renamed Rectangle \d+$/), seen: [`CREATE ${id}`, `PROPERTY_CHANGE ${id} name`] });
  const calls = await page.evaluate(() => window.kitPreviewHost.calls().map((c) => c.name));
  expect(calls).toEqual(expect.arrayContaining(['createRectangle', 'getNodeByIdAsync', 'node.name', 'commitUndo']));
  expect(await page.evaluate(() => window.kitPreviewHost.nodes().at(-1))).toEqual({ type: 'RECTANGLE', name: msg.name });
});

test('opened as a file, the gallery renders and the live panel explains how to run it', async ({ page }) => {
  await page.goto(new URL('../preview.html', import.meta.url).href);
  await expect(page.locator('#live-note')).toBeVisible();
  await expect(page.locator('#live-note')).toContainText('npm run preview');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(BG.light); // the fallback palette loaded
  expect(await page.locator('[data-preview-component]').count()).toBe(Object.keys(COMPONENTS).length);
});

test('the three kit blocks are byte-identical to ui.html', () => {
  const blocks = (html) => ['<style data-kit="tokens">', '<style data-kit="components">', '<script data-kit="runtime">'].map((open) => {
    const start = html.indexOf(open);
    const close = open.startsWith('<style') ? '</style>' : '</script>';
    expect(start, `${open} present`).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(open, start + 1), `${open} only once`).toBe(-1);
    return html.slice(start + open.length, html.indexOf(close, start));
  });
  const ui = read('../ui.html');
  const preview = read('../preview.html');
  const [a, b] = [blocks(ui), blocks(preview)];
  for (let i = 0; i < 3; i++) expect(b[i], `block ${i + 1} drifted from ui.html; copy it again`).toBe(a[i]);
  for (const text of b) expect(text.startsWith('\n') && text.endsWith('\n')).toBe(true);
  // Same order in both files, and the kit CSS never learns about the preview's demo states.
  const order = (html) => ['data-kit="tokens"', 'data-kit="components"', 'data-kit="runtime"'].map((s) => html.indexOf(s));
  expect(order(preview)).toEqual([...order(preview)].sort((x, y) => x - y));
  expect(b.join('')).not.toContain('data-kit-demo-state');
  expect(preview).not.toContain('<!--');
});
