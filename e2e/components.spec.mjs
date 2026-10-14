// Phase 2 components that behave, not just look, in the gallery of preview.html: forced colours
// (Windows high contrast: native checkboxes and radios come back, selected rows and the highlighted
// menu item get an outline, icons take their parent's forced colour), the tooltip (hover delay, pointer onto it, keyboard focus at once,
// never widening the page; Escape hides it until the pointer and focus leave, WCAG 1.4.13), the CSS-only tabs (click and arrow keys), and the popover menu's
// visuals in the top layer. Screenshots of the forced-colour rows for review only with
// UPDATE_SCREENSHOTS=1 (into this test's output folder under test-results/, or SHOTS_DIR).
// Behaviour notes: docs/components.md; the menu's keyboard and placement: e2e/menu.spec.mjs.

import { join } from 'node:path';
import { test, expect, openPreview } from './helpers.mjs';

const BRAND = 'rgb(13, 153, 255)'; // border-selected in the light fallback palette

test.use({ viewport: { width: 1200, height: 900 } });

test('forced colours: native checkboxes and radios, outlined selected rows and highlighted menu items', async ({ page }, testInfo) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openPreview(page);
  const look = await page.evaluate(() => {
    const style = (/** @type {string} */ selector) => getComputedStyle(/** @type {Element} */ (document.querySelector(selector)));
    return {
      checkbox: style('[data-preview-component="checkbox"] [data-state="checked"] input').appearance,
      radio: style('[data-preview-component="radio"] [data-state="checked"] input').appearance,
      selectedRow: style('[data-preview-component="list"] [data-state="selected"] .kit-list-row:is([aria-selected="true"], [aria-current="true"])').outlineStyle,
      menuHover: style('[data-preview-component="menu"] [data-state="hover"] .kit-menu-item[data-kit-demo-state="hover"]').outlineStyle,
      menuDisabledHover: style('[data-preview-component="menu"] [data-state="disabled"] .kit-menu-item[data-kit-demo-state="hover"]').outlineStyle,
    };
  });
  expect(look).toEqual({ checkbox: 'auto', radio: 'auto', selectedRow: 'solid', menuHover: 'solid', menuDisabledHover: 'none' });
  // Icons take the forced colour of what they sit in, whatever colour token the kit gives them
  // (an SVG keeps its own author colour otherwise: a white info icon on a white toast).
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme });
    const icons = await page.evaluate(async () => {
      const kit = /** @type {any} */ (window).kit;
      const handles = ['info', 'warning', 'success', 'danger'].map((tone) => kit.toast(`Forced ${tone}`, { tone, duration: 0 }));
      /** @param {Element} icon */
      const pair = (icon) => ({ icon: getComputedStyle(icon).color, parent: getComputedStyle(/** @type {Element} */ (icon.parentElement)).color });
      /** @type {Record<string, { icon: string, parent: string }>} */ const out = {};
      for (const [i, h] of handles.entries()) {
        const tone = ['info', 'warning', 'success', 'danger'][i];
        for (let t = 0; t < 50 && !document.querySelector(`.kit-toast[data-kit-tone="${tone}"]`); t++) await new Promise((r) => setTimeout(r, 20));
        out[`toast ${tone}`] = pair(/** @type {Element} */ (document.querySelector(`.kit-toast[data-kit-tone="${tone}"] > .kit-icon`)));
        h.dismiss();
      }
      out.list = pair(/** @type {Element} */ (document.querySelector('[data-preview-component="list"] .kit-list-row-icon')));
      out.input = pair(/** @type {Element} */ (document.querySelector('[data-preview-component="input-icon"] .kit-input-icon > .kit-icon')));
      out.empty = pair(/** @type {Element} */ (document.querySelector('[data-preview-component="empty"] .kit-empty > .kit-icon')));
      return out;
    });
    for (const [where, { icon, parent }] of Object.entries(icons)) expect(icon, `${scheme}: ${where} icon`).toBe(parent);
  }
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'light' });

  if (process.env.UPDATE_SCREENSHOTS) {
    for (const id of ['g-checkbox', 'g-radio', 'g-menu-states', 'g-list', 'g-tabs', 'g-icon-button']) {
      const box = await page.evaluate((i) => {
        const h = /** @type {Element} */ (document.getElementById(i));
        let el = h;
        let bottom = h.getBoundingClientRect().bottom;
        while ((el = /** @type {Element} */ (el.nextElementSibling)) && el.tagName !== 'HR') bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
        const top = h.getBoundingClientRect().top + scrollY;
        return { x: 0, y: top - 8, width: 1200, height: bottom + scrollY - top + 16 };
      }, id);
      await page.screenshot({ path: join(process.env.SHOTS_DIR || testInfo.outputPath(), `forced-${id}.png`), clip: box, fullPage: true, style: '.preview-toolbar { position: static !important; }' });
    }
  }
});

test('tooltip: shown after the hover delay, kept while the pointer is on it, at once on keyboard focus, never widening the page', async ({ page }) => {
  await openPreview(page);
  const hostEl = page.locator('[data-preview-component="tooltip"] [data-state="default"] .kit-tooltip-host');
  const tip = hostEl.locator('.kit-tooltip');
  const vis = () => tip.evaluate((el) => getComputedStyle(el).visibility);
  expect(await vis()).toBe('hidden');
  const widthBefore = await page.evaluate(() => document.documentElement.scrollWidth);
  // The delay is measured in the page (pointerenter to the start of the visibility transition), so a
  // busy test runner can't make it look shorter than it is.
  await hostEl.evaluate((h) => {
    const t = /** @type {any} */ (window).__tip = { enter: 0, start: 0 };
    h.addEventListener('pointerenter', () => { if (!t.enter) t.enter = performance.now(); });
    /** @type {Element} */ (h.querySelector('.kit-tooltip')).addEventListener('transitionstart', (e) => {
      if (/** @type {TransitionEvent} */ (e).propertyName === 'visibility' && !t.start) t.start = performance.now();
    });
  });
  await hostEl.locator('button').hover();
  const early = await tip.evaluate((el) => ({ vis: getComputedStyle(el).visibility, since: performance.now() - /** @type {any} */ (window).__tip.enter }));
  if (early.since < 300) expect(early.vis, 'still hidden during the delay').toBe('hidden');
  await expect.poll(vis, { timeout: 2000 }).toBe('visible');
  const t = await page.evaluate(() => /** @type {any} */ (window).__tip);
  expect(t.enter, 'pointerenter seen').toBeGreaterThan(0);
  expect(t.start - t.enter, 'shown after the 400 ms hover delay').toBeGreaterThanOrEqual(380);
  // The pointer can move onto the tooltip without losing it.
  const b = await tip.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.waitForTimeout(50);
  expect(await vis()).toBe('visible');
  await page.mouse.move(1, 1);
  await expect.poll(vis).toBe('hidden');
  // Keyboard: at once.
  await hostEl.locator('button').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await vis()).toBe('visible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(widthBefore);
  // The control's accessible description is the tooltip.
  await expect(hostEl.locator('button')).toHaveAccessibleDescription(/\S/);
  const described = await hostEl.locator('button').evaluate((el) => /** @type {Element} */ (document.getElementById(/** @type {string} */ (el.getAttribute('aria-describedby')))).textContent);
  expect(described).toBe(await tip.textContent());
});

test('tooltip: Escape hides it until both the pointer and focus leave its host (WCAG 1.4.13 dismissible), and the page still gets the Escape', async ({ page }) => {
  await openPreview(page);
  const hostEl = page.locator('[data-preview-component="tooltip"] [data-state="default"] .kit-tooltip-host');
  const button = hostEl.locator('button');
  const tip = hostEl.locator('.kit-tooltip');
  const vis = () => tip.evaluate((el) => getComputedStyle(el).visibility);
  const dismissed = () => hostEl.evaluate((el) => el.hasAttribute('data-kit-tooltip-dismissed'));
  // The host's listeners through CDP: the runtime adds two while a tooltip is dismissed, none after.
  const cdp = await page.context().newCDPSession(page);
  const listenersOf = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
    return listeners.map((l) => `${l.type}${l.useCapture ? '(capture)' : ''}`).sort();
  };
  const HOST = `document.querySelector('[data-preview-component="tooltip"] [data-state="default"] .kit-tooltip-host')`;
  const before = { host: await listenersOf(HOST), document: await listenersOf('document'), window: await listenersOf('window') };
  // A page-level Escape handler of its own, in the bubble phase: it must see every Escape, unprevented.
  await page.evaluate(() => {
    /** @type {any} */ (window).__escapes = [];
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') /** @type {any} */ (window).__escapes.push(e.defaultPrevented); });
  });
  const pageListeners = { ...before, document: [...before.document, 'keydown'].sort() };

  // Hover: Escape hides it at once; it stays hidden while the pointer stays, and a new hover shows it.
  await button.hover();
  await expect.poll(vis, { timeout: 2000 }).toBe('visible');
  await page.keyboard.press('Escape');
  expect(await vis(), 'hidden at once').toBe('hidden');
  expect(await dismissed()).toBe(true);
  expect(await listenersOf(HOST)).toEqual([...before.host, 'focusout', 'pointerleave'].sort());
  const b = await button.boundingBox();
  await page.mouse.move(b.x + 3, b.y + 3, { steps: 3 });
  await page.waitForTimeout(600); // past the hover delay
  expect(await vis(), 'still hidden while the pointer stays on the control').toBe('hidden');
  await page.mouse.move(1, 1);
  await expect.poll(dismissed).toBe(false);
  expect(await listenersOf(HOST), 'the leave listeners go when it clears').toEqual(before.host);
  await button.hover();
  await expect.poll(vis, { timeout: 2000 }).toBe('visible');
  await page.mouse.move(1, 1);
  await expect.poll(vis).toBe('hidden');

  // Keyboard focus: Escape hides it, focus stays; the pointer passing over and away doesn't bring it
  // back while focus stays; once focus leaves, the next focus shows it again.
  await button.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await vis()).toBe('visible');
  await page.keyboard.press('Escape');
  expect(await vis()).toBe('hidden');
  await expect(button).toBeFocused();
  await button.hover();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(50);
  expect(await dismissed(), 'focus is still on the control').toBe(true);
  expect(await vis()).toBe('hidden');
  await page.keyboard.press('Tab');
  expect(await dismissed()).toBe(false);
  await page.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  expect(await vis(), 'a new focus shows it again').toBe('visible');

  // Escape without a shown tooltip marks nothing.
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).blur());
  await page.keyboard.press('Escape');
  expect(await page.locator('[data-kit-tooltip-dismissed]').count()).toBe(0);

  // The runtime never takes the Escape: the page's own handler saw all three, none prevented.
  expect(await page.evaluate(() => /** @type {any} */ (window).__escapes)).toEqual([false, false, false]);
  expect({ host: await listenersOf(HOST), document: await listenersOf('document'), window: await listenersOf('window') }).toEqual(pageListeners);
  await cdp.detach();
});

test('tooltip: Escape on a tooltip inside a modal dialog still closes the dialog', async ({ page }) => {
  await openPreview(page);
  await page.evaluate(() => {
    const d = Object.assign(document.createElement('dialog'), { className: 'kit-dialog', id: 'tip-dialog' });
    d.setAttribute('aria-label', 'Tooltip in a dialog');
    d.innerHTML = '<div class="kit-dialog-body"><span class="kit-tooltip-host"><button class="kit-icon-button" type="button" aria-label="Tidy up" aria-describedby="tip-dialog-tip">T</button>'
      + '<span class="kit-tooltip" role="tooltip" id="tip-dialog-tip">Spaces the selected layers evenly</span></span></div>';
    document.body.append(d);
    /** @type {any} */ (window).__closed = /** @type {any} */ (window).kit.dialog(d);
  });
  const button = page.locator('#tip-dialog button');
  await button.hover();
  await expect.poll(() => page.locator('#tip-dialog .kit-tooltip').evaluate((el) => getComputedStyle(el).visibility), { timeout: 2000 }).toBe('visible');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => /** @type {any} */ (window).__closed), 'Escape closed the dialog with an empty returnValue').toBe('');
  expect(await page.locator('#tip-dialog').evaluate((d) => /** @type {HTMLDialogElement} */ (d).open)).toBe(false);
});

test('tabs: a click or an arrow key switches the panel, and the focus ring is on the tab', async ({ page }) => {
  await openPreview(page);
  const tabs = page.locator('[data-preview-component="tabs"] [data-state="default"] .kit-tabs');
  const shown = () => tabs.evaluate((el) => [...el.querySelectorAll(':scope > :not(.kit-tablist)')].map((p) => getComputedStyle(p).display !== 'none'));
  expect(await shown()).toEqual([true, false, false]);
  await tabs.locator('.kit-tab').nth(2).click();
  expect(await shown()).toEqual([false, false, true]);
  await tabs.locator('input').nth(2).focus();
  await page.keyboard.press('ArrowLeft');
  expect(await shown()).toEqual([false, true, false]);
  expect(await tabs.locator('.kit-tab').nth(1).evaluate((el) => getComputedStyle(el).outlineColor)).toBe(BRAND);
});

test('menu visuals: a popover in the top layer, radius 13px, padding 8px, 24px items; Escape closes it', async ({ page }) => {
  await openPreview(page);
  await page.locator('[popovertarget="g-menu-states-popover"]').click();
  const open = await page.evaluate(() => {
    const m = /** @type {HTMLElement} */ (document.getElementById('g-menu-states-popover'));
    const s = getComputedStyle(m);
    return { open: m.matches(':popover-open'), position: s.position, radius: s.borderRadius, padding: s.padding, shadow: s.boxShadow !== 'none', items: [...m.querySelectorAll('.kit-menu-item')].map((i) => getComputedStyle(i).height) };
  });
  expect(open).toMatchObject({ open: true, position: 'fixed', radius: '13px', padding: '8px', shadow: true });
  expect(open.items.length).toBeGreaterThan(0);
  expect(open.items.every((h) => h === '24px')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('g-menu-states-popover')).matches(':popover-open'))).toBe(false);
});
