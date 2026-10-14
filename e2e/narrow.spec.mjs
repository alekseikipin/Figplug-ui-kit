// A 240px plugin window (the kit's minimum width) with Phase 2 parts in it: a section header with an
// icon button and a tooltip, a notice, a checkbox, a long list in a .kit-scroll region and a sticky
// footer, with the chrome on, in fit-content and resizable (shorter than its content, so the content
// scrolls under the footer), light and dark. Checks that no control sits under the 24px resize grip,
// that the footer ends at the window's bottom edge, that nothing widens the page, and that the
// .kit-scroll region keeps a fit-content window short. Runs the kit fixture (useKitFixture) with its
// <main> replaced. Screenshots for review only with UPDATE_SCREENSHOTS=1 (into this test's output
// folder under test-results/, or SHOTS_DIR).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, openPreview, pluginFrame, patchFile, useKitFixture, contentHeight, frameSize } from './helpers.mjs';

const FIXTURE = readFileSync(new URL('./fixtures/kit-ui.html', import.meta.url), 'utf8');
const MAIN = FIXTURE.slice(FIXTURE.indexOf('<main'), FIXTURE.indexOf('</main>') + '</main>'.length);
const ROWS = Array.from({ length: 30 }, (_, i) => `<li><button class="kit-list-row" type="button"><span class="kit-list-row-label">Layer ${i + 1}</span></button></li>`).join('');
const NARROW = `<main class="kit-app" data-kit-root>
  <header class="kit-section-header"><h2>Shapes</h2><span class="kit-tooltip-host"><button class="kit-icon-button" type="button" aria-label="Options" aria-describedby="tip"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 12h.01M12 12h.01M16.5 12h.01" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><span class="kit-tooltip kit-tooltip-end" role="tooltip" id="tip">More options</span></span></header>
  <div class="kit-section kit-stack">
    <div class="kit-notice" data-kit-tone="warning" role="status"><p class="kit-notice-text">Locked layers are skipped.</p></div>
    <label class="kit-checkbox"><input type="checkbox" checked>Select the new shapes</label>
    <div class="kit-scroll" id="layers" tabindex="0" role="region" aria-label="Layers"><ul class="kit-list">${ROWS}</ul></div>
  </div>
  <footer class="kit-footer">
    <p class="kit-text-secondary" id="status" role="status">Nothing selected</p>
    <div class="kit-row"><button class="kit-button kit-button-secondary" id="close" type="button">Close</button>
    <button class="kit-button kit-button-primary" id="create" type="button">Create</button></div>
  </footer>
</main>`;

test.use({ deviceScaleFactor: 2 });
test.beforeEach(async ({ page }) => {
  await useKitFixture(page);
  await patchFile(page, 'ui.html', [[MAIN, NARROW]]);
});

for (const theme of ['light', 'dark']) {
  for (const mode of ['fit-content', 'resizable']) {
    test(`240px window: the footer and every control stay clear of the grip (${mode}, ${theme})`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1000, height: 800 });
      await openPreview(page, { theme, mode });
      await page.locator('#live-width').fill('240');
      await page.waitForTimeout(400);
      const frame = pluginFrame(page);
      if (mode === 'resizable') {
        // Shorter than the content, so the footer has to stick.
        await page.evaluate(() => { /** @type {HTMLElement} */ (document.getElementById('live-frame')).style.height = '220px'; });
        await page.waitForTimeout(200);
      } else {
        // The long list scrolls in its own region: the window fits a short page, footer included.
        expect((await frameSize(page)).height).toBe(await contentHeight(frame));
        expect(await frame.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'the window shows all of its content').toBe(0);
        const scroll = await frame.locator('#layers').evaluate((el) => ({ height: el.clientHeight, scrolls: el.scrollHeight > el.clientHeight, overflow: getComputedStyle(el).overflowY }));
        expect(scroll).toEqual({ height: 240, scrolls: true, overflow: 'auto' });
      }
      const geo = await frame.evaluate(() => {
        const r = (/** @type {Element} */ el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const handle = /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]'));
        const footer = /** @type {Element} */ (document.querySelector('.kit-footer'));
        const footerTop = footer.getBoundingClientRect().top;
        // Content scrolled under the sticky footer is hidden by it; only its visible part counts.
        const controls = [...document.querySelectorAll('button:not([data-kit-resize]), input, select')].map((el) => {
          const box = { id: el.id || el.className, ...r(el) };
          if (!el.closest('.kit-footer')) box.b = Math.min(box.b, footerTop);
          return box;
        }).filter((c) => c.b > c.t);
        return { width: innerWidth, height: innerHeight, chrome: document.documentElement.dataset.kitChrome, handle: r(handle), handleHidden: handle.hidden, footer: r(footer), controls, scrollW: document.documentElement.scrollWidth };
      });
      const overlap = geo.controls.filter((c) => c.l < geo.handle.r && c.r > geo.handle.l && c.t < geo.handle.b && c.b > geo.handle.t);
      expect(geo.width).toBe(240);
      expect(geo.chrome).toBe('on');
      expect(geo.handleHidden).toBe(false);
      expect(overlap, 'no control under the grip').toEqual([]);
      expect(geo.scrollW, 'no horizontal scroll (the hidden tooltip included)').toBe(240);
      expect(Math.round(geo.footer.b), 'the footer sits at the window\'s bottom edge').toBe(geo.height);
      if (process.env.UPDATE_SCREENSHOTS) {
        await page.mouse.move(1, 1);
        await page.locator('#live-window').screenshot({ path: join(process.env.SHOTS_DIR || testInfo.outputPath(), `narrow-${mode}-${theme}.png`), animations: 'disabled' });
      }
    });
  }
}
