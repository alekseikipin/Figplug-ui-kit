// Regenerates the four documentation screenshots (docs/img/*.png) at 2x. Skipped unless asked:
//   UPDATE_SCREENSHOTS=1 npx playwright test --grep @screenshots
// The README and docs link to exactly these four paths.

import { fileURLToPath } from 'node:url';
import { test, expect, openPreview, pluginFrame, frameSize, contentHeight } from './helpers.mjs';

const out = (name) => fileURLToPath(new URL(`../docs/img/${name}`, import.meta.url));

test.describe('docs screenshots', { tag: '@screenshots' }, () => {
  test.skip(!process.env.UPDATE_SCREENSHOTS, 'set UPDATE_SCREENSHOTS=1 to regenerate docs/img');
  test.use({ deviceScaleFactor: 2, viewport: { width: 1200, height: 900 } });

  for (const theme of ['light', 'dark']) {
    test(`starter-${theme}.png: the plugin window in the fake host`, async ({ page }) => {
      await openPreview(page, { theme });
      const frame = pluginFrame(page);
      await frame.evaluate(() => document.fonts.ready);
      expect(await frameSize(page)).toMatchObject({ width: 320, height: await contentHeight(frame), state: 'shown' });
      await page.mouse.move(1, 1); // no hover state in the picture
      await page.locator('#live-window').screenshot({ path: out(`starter-${theme}.png`), animations: 'disabled' });
    });

    test(`gallery-${theme}.png: every component in every state`, async ({ page }) => {
      await openPreview(page, { theme });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(1, 1);
      // Loading spinners are frozen so the picture is stable from run to run.
      // The sticky toolbar would float over the top of the section; keep it at the top of the page.
      await page.locator('#gallery').screenshot({ path: out(`gallery-${theme}.png`), animations: 'disabled', style: '.preview-toolbar { position: static !important; }' });
    });
  }
});
