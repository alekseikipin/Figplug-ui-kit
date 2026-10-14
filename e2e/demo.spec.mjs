// The starter's "Create shapes" demo (code.ts below "// ---- Your plugin starts here ----" and the
// markup and script in ui.html), end to end in preview.html's fake Figma host: its messages next to
// the kit's, its Dev Mode failure path and its error state under axe. Every test here skips once
// the demo has been replaced by a plugin (HAS_DEMO in e2e/helpers.mjs); the kit itself is covered
// by the other specs, which run the kit fixture instead.

import { AxeBuilder } from '@axe-core/playwright';
import {
  test, expect, openPreview, pluginFrame, waitForPlugin, mark, messagesSince, frameSize, contentHeight,
  listenerCounter, host, HAS_DEMO, NO_DEMO,
} from './helpers.mjs';

test.skip(!HAS_DEMO, NO_DEMO);

const axe = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']);
const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

test("the demo's messages flow both ways next to the kit's", async ({ page }) => {
  await openPreview(page);
  const frame = pluginFrame(page);
  const count = await listenerCounter(page);
  const baseline = await count();
  const status = frame.locator('#status');
  await host(page, () => window.kitPreviewHost.select(3));
  await expect(status).toHaveText('3 layers selected');

  const at = await mark(page);
  await frame.locator('#count').fill('4');
  await frame.locator('#create').click();
  await expect(status).toHaveText(/Created 4 rectangles/);
  const host2ui = (await messagesSince(page, at)).map((m) => `${m.dir} ${m.msg.type}`);
  expect(host2ui).toEqual(expect.arrayContaining(['ui create-shapes', 'main created', 'main selection']));
  expect(await host(page, () => window.kitPreviewHost.nodes().filter((n) => n.type === 'RECTANGLE').length)).toBe(4);
  await page.waitForTimeout(200);
  expect((await frameSize(page)).height, 'still fitted after the status grew').toBe(await contentHeight(frame));

  // A kit:* type the runtime doesn't know is ignored; a host message still reaches the demo.
  const quiet = await mark(page);
  await host(page, () => window.kitPreviewHost.postToUi({ type: 'kit:from-the-future' }));
  await host(page, () => window.kitPreviewHost.postToUi({ type: 'selection', count: 2 }));
  await expect(status).toHaveText(/^2 layers selected/);
  expect((await messagesSince(page, quiet)).filter((m) => m.dir === 'ui')).toEqual([]);
  expect(await count()).toEqual(baseline);
});

test('Dev Mode is read-only: Create answers "Nothing created" and the main thread says why', async ({ page }) => {
  await openPreview(page, { editor: 'dev' });
  const frame = await waitForPlugin(page);
  await frame.locator('#create').click();
  await expect(frame.locator('#status')).toHaveText(/Nothing created/);
  await expect(page.locator('.preview-toast')).toContainText('Could not create shapes');
});

for (const theme of ['light', 'dark', 'figjam']) {
  test(`axe: the demo's count field in its error state (${theme})`, async ({ page }) => {
    await openPreview(page, { theme });
    await pluginFrame(page).locator('#count').fill('0');
    await expect(pluginFrame(page).locator('#count')).toHaveAttribute('aria-invalid', 'true');
    const { violations } = await axe(page).include('#live-frame').analyze();
    expect(summary(violations)).toEqual([]);
  });
}
