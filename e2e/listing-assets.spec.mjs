// Regenerates the Community listing images for the two archetypes in docs/community-listing.md:
// docs/listing/<example>/icon.png (128 x 128), cover.png and cover-dark.png (1920 x 1080).
// Skipped unless asked:
//   UPDATE_LISTING=1 npx playwright test e2e/listing-assets.spec.mjs
// The cover's window is the real example running in preview.html's fake host (?plugin=examples/
// <name>, the stub's sample selection), so it is a browser render, not a Figma capture; the font is
// whatever the machine has (Inter if installed, else system-ui). The compositions are built here on
// throwaway pages that use tokens.figma-fallback.css for their colours: none of this is kit code.

import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, openPreview, pluginFrame, frameSize } from './helpers.mjs';

const out = (name, file) => {
  const dir = fileURLToPath(new URL(`../docs/listing/${name}/`, import.meta.url));
  mkdirSync(dir, { recursive: true });
  return dir + file;
};

/** The kit's font stack, so the composition's type matches the window's on the same machine. */
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Each archetype: the listing name and value statement (keep them identical to
 * docs/community-listing.md), the tokens for the icon tile and the cover's stage, the icon glyph
 * (a 128 x 128 SVG drawn in currentColor, set to the tile's on-colour), and what to do in the
 * plugin window before the screenshot so the cover shows the plugin doing its job.
 */
const ARCHETYPES = {
  'rename-layers': {
    name: 'Rename in Order',
    statement: 'See every new name before you rename.',
    tile: '--figma-color-bg-brand-secondary',
    onTile: '--figma-color-icon-onbrand',
    stage: '--figma-color-bg-brand-tertiary',
    // Three Layers-panel rows; each name gets the same prefix (solid) before its own name (faint).
    glyph: `
      <g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round">
        <rect x="20" y="26" width="16" height="16" rx="3"/><rect x="20" y="56" width="16" height="16" rx="3"/><rect x="20" y="86" width="16" height="16" rx="3"/>
      </g>
      <g fill="currentColor">
        <rect x="48" y="28" width="24" height="12" rx="6"/><rect x="48" y="58" width="24" height="12" rx="6"/><rect x="48" y="88" width="24" height="12" rx="6"/>
        <g opacity="0.45"><rect x="78" y="28" width="30" height="12" rx="6"/><rect x="78" y="58" width="20" height="12" rx="6"/><rect x="78" y="88" width="26" height="12" rx="6"/></g>
      </g>`,
    async setup(frame) {
      await frame.locator('#prefix').fill('Promo/');
      await frame.locator('#numbering').check();
      await frame.locator('#digits').selectOption('2');
      await frame.locator('#order').selectOption('columns');
      await expect(frame.locator('main')).toContainText('Promo/Card 01');
      await expect(frame.locator('main')).toContainText('Promo/Label 02');
    },
  },
  'a11y-contrast': {
    name: 'Text Contrast Check',
    statement: 'Checks text against what is really behind it.',
    tile: '--figma-color-bg-success-secondary',
    onTile: '--figma-color-icon-onsuccess',
    stage: '--figma-color-bg-success-tertiary',
    // The contrast symbol: a ring with its left half filled.
    glyph: `
      <circle cx="64" cy="64" r="33" fill="none" stroke="currentColor" stroke-width="7"/>
      <path d="M64 31a33 33 0 0 0 0 66z" fill="currentColor"/>`,
    async setup(frame) {
      // The stub's sample: Caption (light grey on white) fails AA; its row is chosen and detailed.
      await expect(frame.locator('main')).toContainText('1 of 3 text layers is below WCAG AA.');
      await expect(frame.locator('main')).toContainText('2.67:1');
    },
  },
};

/** The icon tile as markup: full bleed (Figma rounds icons where it shows them, if at all; UNVERIFIED). */
const tileSvg = (a) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" style="display:block;color:var(${a.onTile})" aria-hidden="true"><rect width="128" height="128" fill="var(${a.tile})"/>${a.glyph}</svg>`;

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

/** A throwaway page at `path` on the preview server, with the fallback palette loaded. */
async function compose(page, path, theme, body, css) {
  const html = `<!doctype html><html lang="en" class="${theme === 'dark' ? 'figma-dark' : 'figma-light'}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/tokens.figma-fallback.css"><style>
html, body { margin: 0; }
body { font-family: ${FONT}; -webkit-font-smoothing: antialiased; color: var(--figma-color-text); background: var(--figma-color-bg); }
${css}
</style></head><body>${body}</body></html>`;
  await page.route(`**${path}`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

/** The icon at 2x (256 x 256 pixels), always on the light palette: one icon serves both themes. */
async function iconShot(page, name, a) {
  await page.setViewportSize({ width: 128, height: 128 });
  await compose(page, `/__listing/${name}/icon.html`, 'light', tileSvg(a), 'body { width: 128px; height: 128px; overflow: hidden; }');
  return page.screenshot({ clip: { x: 0, y: 0, width: 128, height: 128 } });
}

/**
 * The example's window as a PNG with transparent rounded corners, at 2x: the real plugin in the
 * preview's fake host, with the listing name in its title bar (as the publish folder's manifest will
 * have it) and without the preview-only size readout.
 */
async function windowShot(page, name, a, theme) {
  await page.setViewportSize({ width: 1400, height: 1100 });
  // The manifest from disk, renamed (no route.fetch(): see serve() in helpers.mjs).
  const manifest = JSON.parse(readFileSync(new URL(`../examples/${name}/manifest.json`, import.meta.url), 'utf8'));
  await page.route(`**/examples/${name}/manifest.json`, (route) => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ ...manifest, name: a.name }),
  }));
  await openPreview(page, { plugin: `examples/${name}`, theme });
  const frame = pluginFrame(page);
  await frame.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.kitPreviewHost.select('sample'));
  await page.waitForTimeout(400);
  await a.setup(frame);
  await frame.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.waitForTimeout(400); // the fit after the last change
  await expect(page.locator('#live-title')).toHaveText(a.name);
  const size = await frameSize(page);
  expect(size.state).toBe('shown');
  await page.mouse.move(1, 1); // no hover state in the picture
  const box = await page.locator('#live-window').boundingBox();
  const png = await page.locator('#live-window').screenshot({
    animations: 'disabled',
    omitBackground: true,
    style: 'html, body, .preview-main, #live, .preview-stage { background: transparent !important; } .preview-window { box-shadow: none !important; } .preview-titlebar-size { visibility: hidden !important; } .preview-toolbar { visibility: hidden !important; }',
  });
  return { png, width: box.width, height: box.height };
}

test.describe('Community listing images', { tag: '@listing' }, () => {
  test.skip(!process.env.UPDATE_LISTING, 'set UPDATE_LISTING=1 to regenerate docs/listing');
  // Everything renders at 2x: the window capture keeps its 2x pixels, and the icon and cover are
  // saved at their CSS size (scale: 'css'), which smooths their edges.
  test.use({ deviceScaleFactor: 2 });

  for (const [name, a] of Object.entries(ARCHETYPES)) {
    test(`${name}/icon.png: 128 x 128`, async ({ page }) => {
      await iconShot(page, name, a);
      const png = await page.screenshot({ path: out(name, 'icon.png'), clip: { x: 0, y: 0, width: 128, height: 128 }, scale: 'css' });
      expect(pngSize(png)).toEqual({ width: 128, height: 128 });
    });

    for (const theme of ['light', 'dark']) {
      const file = theme === 'dark' ? 'cover-dark.png' : 'cover.png';
      test(`${name}/${file}: 1920 x 1080, the real window on the listing composition`, async ({ page }) => {
        const icon = await iconShot(page, name, a);
        const shot = await windowShot(page, name, a, theme);
        // The stage is the right half less its margins. The window is shown as large as fits with
        // room around it, at most 1.8x its CSS size (the capture is 2x, so it is only scaled down).
        const stage = { width: 960 - 72, height: 1080 - 2 * 72 };
        const scale = Math.min(1.8, (stage.width - 2 * 96) / shot.width, (stage.height - 2 * 80) / shot.height);
        const shadow = theme === 'dark'
          ? 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4)) drop-shadow(0 12px 32px rgba(0, 0, 0, 0.35))'
          : 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.1)) drop-shadow(0 12px 32px rgba(0, 0, 0, 0.12))';
        const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
        await page.setViewportSize({ width: 1920, height: 1080 });
        await compose(page, `/__listing/${name}/${file.replace('.png', '.html')}`, theme, `
<div class="cover">
  <div class="copy">
    <img class="icon" alt="" src="${dataUrl(icon)}">
    <h1>${a.name}</h1>
    <p>${a.statement}</p>
  </div>
  <div class="stage"><img class="window" alt="" src="${dataUrl(shot.png)}" style="width: ${Math.round(shot.width * scale)}px"></div>
</div>`, `
body { width: 1920px; height: 1080px; overflow: hidden; }
.cover { display: grid; grid-template-columns: 960px 960px; height: 1080px; }
.copy { display: flex; flex-direction: column; justify-content: center; padding: 0 48px 0 128px; }
.icon { display: block; width: 128px; height: 128px; border-radius: 28px; }
h1 { margin: 56px 0 0; font-size: 80px; line-height: 88px; font-weight: 700; letter-spacing: -0.025em; text-wrap: balance; }
p { margin: 24px 0 0; font-size: 40px; line-height: 52px; font-weight: 400; letter-spacing: -0.01em; text-wrap: balance; color: var(--figma-color-text-secondary); }
.stage { display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 72px 72px 72px 0; border-radius: 48px; background: var(${a.stage}); }
.window { display: block; height: auto; filter: ${shadow}; }`);
        // A different font (no Inter, another OS) can change the line breaks: the name and the
        // statement must each stay on one line, or the copy needs shortening.
        expect((await page.locator('h1').boundingBox()).height, 'the name fits on one line').toBeLessThanOrEqual(88);
        expect((await page.locator('p').boundingBox()).height, 'the statement fits on one line').toBeLessThanOrEqual(52);
        const png = await page.screenshot({ path: out(name, file), clip: { x: 0, y: 0, width: 1920, height: 1080 }, scale: 'css', animations: 'disabled' });
        expect(pngSize(png)).toEqual({ width: 1920, height: 1080 });
      });
    }
  }
});
