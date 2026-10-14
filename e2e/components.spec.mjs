// Phase 2 components that behave, not just look, in the gallery of preview.html: forced colours
// (Windows high contrast: native checkboxes and radios come back, selected rows and the highlighted
// menu item get an outline), the CSS-only tooltip (hover delay, pointer onto it, keyboard focus at
// once, never widening the page), the CSS-only tabs (click and arrow keys), and the popover menu's
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
  await hostEl.locator('button').hover();
  await page.waitForTimeout(100);
  expect(await vis(), 'still hidden during the delay').toBe('hidden');
  await expect.poll(vis, { timeout: 2000 }).toBe('visible');
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

test('tabs: a click or an arrow key switches the panel, and the focus ring is on the tab', async ({ page }) => {
  await openPreview(page);
  const tabs = page.locator('[data-preview-component="tabs"] [data-state="default"] .kit-tabs');
  const shown = () => tabs.evaluate((el) => [...el.querySelectorAll(':scope > .kit-tabpanel')].map((p) => getComputedStyle(p).display !== 'none'));
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
