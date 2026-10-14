// preview.html itself: the three themes, the gallery's components and forced states, real
// keyboard focus on invalid and aria-disabled fields, search fields, the live frame booting and
// fitting, the window as wide as the frame at 240px, the "Simulate no Inter" toggle, the editor and mode switches, the figma stub, the
// file:// note, the copied kit blocks staying byte-identical to ui.html's, and every control in the
// gallery's default cells being what a click at its centre hits. Nothing here needs
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
  // Phase 3
  dialog: ['default', 'hover', 'focus', 'active', 'disabled', 'open'],
  toast: ['default', 'hover', 'focus', 'active', 'disabled', 'danger'],
};

// --figma-color-bg and --figma-color-bg-brand as captured in Figma desktop 126.9.13 (tokens.figma-fallback.css).
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
  // The palette captured in Figma gives brand-hover (#007be5) and brand-pressed (#0768cf) their own
  // colours; the docs table, which the fallback held before, gave both #007be5.
  expect(paint.primary[1], 'hover differs from default').not.toBe(paint.primary[0]);
  expect(paint.primary[2], 'pressed differs from default').not.toBe(paint.primary[0]);
  expect(paint.primary, 'default, hover and pressed: bg-brand, -hover, -pressed').toEqual(['rgb(13, 153, 255)', 'rgb(0, 123, 229)', 'rgb(7, 104, 207)']);
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

// A layout slip can leave a control looking right but out of reach of the pointer: a pseudo-element
// or a sibling painted over it, or a box squashed to nothing (a bad merge once made .kit-select's
// <select> unclickable, and every other check stayed green). So each interactive control in the
// gallery's default cells must have a size and be what a click at its own centre lands on.
for (const theme of ['light', 'dark']) {
  test(`every interactive control in the gallery's default cells has a size and is topmost at its centre (${theme})`, async ({ page }) => {
    await openPreview(page, { theme });
    const report = await page.evaluate(() => {
      const describe = (/** @type {Element | null} */ el) => {
        if (!el) return 'nothing';
        const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
      };
      const checked = [];
      const problems = [];
      for (const cell of document.querySelectorAll('[data-preview-component] > [data-state="default"]')) {
        const row = /** @type {Element} */ (cell.closest('[data-preview-component]')).getAttribute('data-preview-component');
        for (const el of cell.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')) {
          // Not live in the cell: inert demo copies (the toast), closed popovers and dialogs.
          if (el.closest('[inert], [hidden], [popover], dialog')) continue;
          const name = `${row}: ${describe(el)}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}`;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const r = el.getBoundingClientRect();
          checked.push(name);
          if (r.width < 1 || r.height < 1) { problems.push(`${name}: ${r.width}x${r.height}`); continue; }
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          // A hit on the control's own content (an icon inside a button) still clicks the control.
          if (!hit || !el.contains(hit)) problems.push(`${name}: covered by ${describe(hit)}`);
        }
      }
      return { checked, problems };
    });
    expect(report.problems, 'controls a click at their centre would miss').toEqual([]);
    // Every row's default cell has a control except the static ones (empty state, notice, toast copy).
    expect(report.checked.length, report.checked.join('\n')).toBeGreaterThanOrEqual(25);
    for (const row of ['select', 'input', 'checkbox', 'radio', 'tabs', 'number', 'color', 'tooltip', 'menu', 'dialog']) {
      expect(report.checked.some((name) => name.startsWith(`${row}: `)), `the ${row} row was checked`).toBe(true);
    }
  });
}

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
  // As in Figma: the host's <script> and <style id="figma-style"> come before the plugin's
  // <!doctype html>, so the page runs in quirks mode (docs/surfaces.md#in-every-editor).
  expect(await frame.evaluate(() => [document.compatMode, document.head.children[0].tagName, document.head.children[1].id]))
    .toEqual(['BackCompat', 'SCRIPT', 'figma-style']);
  await expect(page.locator('#live-title')).toHaveText(JSON.parse(read('../manifest.json')).name);
  await expect(page.locator('#live-size')).toHaveText(`320 × ${await contentHeight(frame)}`);
  await expect(page.locator('#live-log li')).not.toHaveCount(0);
  // The width control resizes the window from the host side; the kit refits the height and saves nothing.
  await page.locator('#live-width').fill('480');
  await page.waitForTimeout(300);
  expect(await frameSize(page)).toEqual({ width: 480, height: await contentHeight(frame), state: 'shown' });
  expect(await page.evaluate(() => window.kitPreviewHost.calls().filter((c) => c.name === 'clientStorage.setAsync'))).toEqual([]);
});

// The window around the live frame is as wide as the frame at every width: a long plugin name in
// the title bar must not widen it (it ends in an ellipsis), or a 240px plugin shows a blank strip.
const EXAMPLES = ['rename-layers', 'export-selection', 'content-fill', 'variables-sync', 'a11y-contrast', 'kit-tour']
  .filter((name) => { try { read(`../examples/${name}/manifest.json`); return true; } catch { return false; } });
for (const name of ['', ...EXAMPLES]) {
  test(`the preview window is exactly as wide as the plugin frame at the narrowest width (${name || 'kit fixture'})`, async ({ page }) => {
    if (!name) await useKitFixture(page);
    await openPreview(page, name ? { plugin: `examples/${name}` } : {});
    await page.evaluate(() => { /** @type {HTMLElement} */ (document.getElementById('live-title')).textContent = 'A plugin with a name far too long for a narrow window'; });
    await page.locator('#live-width').fill('240');
    await page.waitForTimeout(400);
    const w = await page.evaluate(() => ({
      window: /** @type {Element} */ (document.getElementById('live-window')).getBoundingClientRect().width,
      frame: /** @type {Element} */ (document.getElementById('live-frame')).getBoundingClientRect().width,
      titleClipped: (() => { const t = /** @type {Element} */ (document.getElementById('live-title')); return t.scrollWidth > t.clientWidth; })(),
    }));
    expect(w.frame, 'the frame took a width').toBeGreaterThan(0);
    expect(w.window, `the window hugs the ${w.frame}px frame`).toBeCloseTo(w.frame, 0);
    expect(w.titleClipped, 'the long title ends in an ellipsis instead').toBe(true);
  });
}

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

test('the figma stub: an assigned figma.ui.onmessage fires after the on() listeners, and ui.resize refuses fractions, as in Figma', async ({ page }) => {
  await useKitFixture(page);
  // Figma's template style next to the kit (tools/probe, 2026-10-14: both fire, on() listeners
  // first; = undefined removes only the assigned handler), and a host resize by fractions, which
  // Figma refuses with "Expected integer, received float".
  await patchFile(page, 'code.js', [["installKitWindow({ mode: 'fit-content' });", `installKitWindow({ mode: 'fit-content' });
const fired = [];
const record = (name) => (msg) => { if (msg && msg.type === 'stub-ping') fired.push(name + ':' + msg.n); };
figma.ui.onmessage = record('assign:B');
figma.ui.on('message', record('on:A'));
figma.ui.on('message', (msg) => {
  if (msg && msg.type === 'stub-assign') figma.ui.onmessage = msg.to === 'C' ? record('assign:C') : undefined;
  if (!msg || msg.type !== 'stub-check') return;
  let threw = null;
  try { figma.ui.resize(321.5, 200.25); } catch (error) { threw = error.message; }
  setTimeout(() => figma.ui.postMessage({ type: 'stub-report', fired: fired.slice(), assigned: typeof figma.ui.onmessage, threw }), 50);
});`]]);
  await openPreview(page);
  const before = await page.evaluate(() => window.kitPreviewHost.calls().filter((c) => c.name === 'ui.resize').length);
  const steps = [{ type: 'stub-ping', n: 1 }, { type: 'stub-assign', to: 'C' }, { type: 'stub-ping', n: 2 },
    { type: 'stub-assign', to: null }, { type: 'stub-ping', n: 3 }, { type: 'stub-check' }];
  for (const step of steps) await pluginFrame(page).evaluate((m) => parent.postMessage({ pluginMessage: m }, '*'), step);
  await expect.poll(() => page.evaluate(() => window.kitPreviewHost.messages().some((m) => m.msg.type === 'stub-report'))).toBe(true);
  const msg = await page.evaluate(() => window.kitPreviewHost.messages().find((m) => m.msg.type === 'stub-report').msg);
  expect(msg).toEqual({
    type: 'stub-report',
    // Ping 1: B fires after A, though assigned before A was added. Ping 2: C replaced B. Ping 3: cleared.
    fired: ['on:A:1', 'assign:B:1', 'on:A:2', 'assign:C:2', 'on:A:3'],
    assigned: 'undefined',
    threw: 'Property "resize width" failed validation: Expected integer, received float',
  });
  expect(await page.evaluate(() => window.kitPreviewHost.calls().filter((c) => c.name === 'ui.resize').length), 'the refused size never reached the window').toBe(before);
});

test('the figma stub: the sample scene, fonts before text edits, exportAsync, figma.mixed and figma.variables', async ({ page }) => {
  await useKitFixture(page);
  // What the examples/ plugins lean on, and the rules the stub keeps from Figma.
  await patchFile(page, 'code.js', [["installKitWindow({ mode: 'fit-content' });", `installKitWindow({ mode: 'fit-content' });
figma.ui.on('message', async (msg) => {
  if (!msg || msg.type !== 'stub-probe') return;
  const [card, label] = figma.currentPage.selection;
  const texts = card.findAllWithCriteria({ types: ['TEXT'] });
  const title = texts[0];
  let unloaded = null;
  try { title.characters = 'Too early'; } catch (error) { unloaded = String(error.message); }
  await figma.loadFontAsync(title.fontName);
  title.insertCharacters(0, 'Q3 ');
  title.deleteCharacters(3, 6);
  const bytes = await label.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
  const found = await figma.getNodeByIdAsync(title.id);
  const v = figma.variables;
  const [collection] = await v.getLocalVariableCollectionsAsync();
  const colors = await v.getLocalVariablesAsync('COLOR');
  colors[0].setValueForMode(collection.modes[1].modeId, { r: 1, g: 0, b: 0, a: 1 });
  figma.ui.postMessage({
    type: 'stub-report', unloaded, characters: title.characters, same: found === title,
    parents: [title.parent.id, card.parent === figma.currentPage, label.parent.type],
    boxes: [title.absoluteBoundingBox, label.absoluteRenderBounds, title.absoluteTransform],
    segments: title.getStyledTextSegments(['fontSize', 'fills']).map((s) => ({ characters: s.characters, fontSize: s.fontSize, fills: s.fills.length })),
    png: Array.from(bytes.slice(0, 8)), mixed: typeof figma.mixed, fontName: title.fontName,
    variables: { collection: collection.name, modes: collection.modes.map((m) => m.name), ids: collection.variableIds.length, colors: colors.map((c) => c.name), floats: (await v.getLocalVariablesAsync('FLOAT')).length },
  });
});`]]);
  await openPreview(page);
  await page.evaluate(() => window.kitPreviewHost.select('sample'));
  await page.waitForTimeout(50);
  await pluginFrame(page).evaluate(() => parent.postMessage({ pluginMessage: { type: 'stub-probe' } }, '*'));
  await expect.poll(() => page.evaluate(() => window.kitPreviewHost.messages().some((m) => m.msg.type === 'stub-report'))).toBe(true);
  const msg = await page.evaluate(() => window.kitPreviewHost.messages().find((m) => m.msg.type === 'stub-report').msg);
  expect(msg).toEqual({
    type: 'stub-report',
    unloaded: expect.stringContaining('figma.loadFontAsync'),
    characters: 'Q3 rterly report', same: true,
    parents: ['2:1', true, 'PAGE'],
    boxes: [{ x: 16, y: 16, width: 130, height: 19 }, { x: 264, y: 0, width: 42, height: 15 }, [[1, 0, 16], [0, 1, 16]]],
    segments: [{ characters: 'Q3 rterly report', fontSize: 16, fills: 1 }],
    png: [137, 80, 78, 71, 13, 10, 26, 10], mixed: 'symbol', fontName: { family: 'Inter', style: 'Bold' },
    variables: { collection: 'Colors', modes: ['Light', 'Dark'], ids: 3, colors: ['color/text', 'color/brand', 'color/link'], floats: 0 },
  });
  expect((await page.evaluate(() => window.kitPreviewHost.variables()))[0].values['3:1']).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  const calls = await page.evaluate(() => window.kitPreviewHost.calls().map((c) => c.name));
  expect(calls).toEqual(expect.arrayContaining(['loadFontAsync', 'text.characters', 'node.exportAsync', 'variable.setValueForMode']));

  // Slides has no variables, and Dev Mode reads them but cannot write.
  await patchFile(page, 'code.js', [["installKitWindow({ mode: 'fit-content' });", `installKitWindow({ mode: 'fit-content' });
(async () => {
  let write = 'none';
  if (figma.variables) {
    const [variable] = await figma.variables.getLocalVariablesAsync();
    try { variable.setValueForMode('3:0', { r: 0, g: 0, b: 0, a: 1 }); write = 'ok'; } catch (error) { write = String(error.message); }
  }
  figma.ui.postMessage({ type: 'stub-editor', editor: figma.editorType, variables: typeof figma.variables, write });
})();`]]);
  for (const editor of ['slides', 'dev', 'figjam']) {
    await openPreview(page, { editor });
    await expect.poll(() => page.evaluate(() => window.kitPreviewHost.messages().filter((m) => m.run === window.kitPreviewHost.runId()).some((m) => m.msg.type === 'stub-editor'))).toBe(true);
    const report = await page.evaluate(() => window.kitPreviewHost.messages().filter((m) => m.run === window.kitPreviewHost.runId()).find((m) => m.msg.type === 'stub-editor').msg);
    expect(report).toEqual({ type: 'stub-editor', editor, variables: editor === 'dev' ? 'object' : 'undefined', write: editor === 'dev' ? expect.stringContaining('read-only') : 'none' });
  }
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
