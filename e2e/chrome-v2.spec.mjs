// Window chrome v2 (kit 0.3.0), end to end in preview.html's fake Figma host with the repo's real
// kit blocks, running the kit fixture (useKitFixture) instead of the starter's demo: the handle's
// aria-describedby hint, the one polite live region and its debounced announcement (one per burst
// of keys, 150 ms after the last; drags and double-clicks are not announced), End (the widest
// usable snap), the new CONFIG.strings keys, and kit:fit from the main thread (KitWindow.fit() and
// the raw message) in each mode, dropped during a resizable drag. docs/window-chrome.md describes the
// behaviour checked here;
// e2e/chrome.spec.mjs covers the rest of the chrome.

import {
  test, expect, openPreview, pluginFrame, mark, messagesSince, resizesSince, writesSince, waitForFinal,
  frameSize, contentHeight, drag, handleCenter, listenerCounter, host, patchFile, useKitFixture,
} from './helpers.mjs';

test.beforeEach(async ({ page }) => { await useKitFixture(page); });

const HINT = 'Drag, or use the arrow keys. Shift for bigger steps, Enter to snap, Home to fit, End for the widest size.';

/**
 * Records every change to the live region from now on, with performance.now() timestamps, and
 * every keydown on the handle, in the plugin frame. Read back with announcements(frame).
 */
async function recordAnnouncements(frame) {
  await frame.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__said = [];
    w.__keys = [];
    const region = /** @type {Element} */ (document.querySelector('[data-kit-announce]'));
    new MutationObserver(() => w.__said.push({ t: performance.now(), text: region.textContent })).observe(region, { childList: true, characterData: true, subtree: true });
    // Modifier keydowns (Shift) are not resizes; only the others count as keys of a burst.
    document.querySelector('[data-kit-resize]').addEventListener('keydown', (e) => { if (e.key !== 'Shift') w.__keys.push(performance.now()); });
  });
}
const announcements = (frame) => frame.evaluate(() => ({ said: /** @type {any} */ (window).__said, keys: /** @type {any} */ (window).__keys }));
const addRows = (frame, n) => frame.evaluate((count) => {
  /** @type {Element} */ (document.querySelector('[data-kit-root] .kit-section')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(count));
}, n);

test.describe('the handle describes itself and has one live region', () => {
  test('aria-describedby points at #kit-resize-hint; one polite [data-kit-announce]; both visually hidden and outside the fit', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const handle = frame.locator('[data-kit-resize]');
    await expect(handle).toHaveAttribute('aria-describedby', 'kit-resize-hint');
    await expect(handle).toHaveAccessibleName('Resize window');
    await expect(handle).toHaveAccessibleDescription(HINT);
    const parts = await frame.evaluate(() => {
      const hint = /** @type {HTMLElement} */ (document.getElementById('kit-resize-hint'));
      const regions = document.querySelectorAll('[data-kit-announce]');
      const region = /** @type {HTMLElement} */ (regions[0]);
      const box = (/** @type {HTMLElement} */ el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; };
      return {
        hints: document.querySelectorAll('#kit-resize-hint').length, hintTag: hint.tagName, hintClass: hint.className, hintText: hint.textContent,
        regions: regions.length, live: region.getAttribute('aria-live'), regionClass: region.className, regionText: region.textContent,
        inBody: hint.parentElement === document.body && region.parentElement === document.body,
        boxes: [box(hint), box(region)],
        overflow: document.documentElement.scrollHeight - innerHeight,
      };
    });
    expect(parts).toEqual({
      hints: 1, hintTag: 'P', hintClass: 'kit-visually-hidden', hintText: HINT,
      regions: 1, live: 'polite', regionClass: 'kit-visually-hidden', regionText: '',
      inBody: true, boxes: [[1, 1], [1, 1]], overflow: 0,
    });
    expect(await frameSize(page), 'the fit is unchanged by them').toEqual({ width: 320, height: await contentHeight(frame), state: 'shown' });
  });

  test('an existing aria-describedby is kept; without a handle neither element is made', async ({ page }) => {
    await patchFile(page, 'ui.html', [['data-kit-resize hidden aria-label="Resize window"', 'data-kit-resize hidden aria-label="Resize window" aria-describedby="my-note"']]);
    await openPreview(page);
    await expect(pluginFrame(page).locator('[data-kit-resize]')).toHaveAttribute('aria-describedby', 'my-note kit-resize-hint');

    // This patch replaces the one above (each patch starts from the unpatched fixture).
    await patchFile(page, 'ui.html', [['<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>', '']]);
    await openPreview(page);
    expect(await pluginFrame(page).evaluate(() => [document.querySelectorAll('#kit-resize-hint').length, document.querySelectorAll('[data-kit-announce]').length])).toEqual([0, 0]);
  });

  test('data-kit-config strings.resizeHint and strings.announce replace the defaults; blank ones are ignored with one warning', async ({ page }) => {
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await openPreview(page, { config: JSON.stringify({ strings: { resizeHint: 'Ziehen oder Pfeiltasten.', announce: 'Fenster {width} × {height} ({width})' } }) });
    let frame = pluginFrame(page);
    await expect(frame.locator('[data-kit-resize]')).toHaveAccessibleDescription('Ziehen oder Pfeiltasten.');
    await recordAnnouncements(frame);
    await frame.focus('[data-kit-resize]');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await announcements(frame)).said.length).toBe(1);
    const h = await contentHeight(frame);
    expect((await announcements(frame)).said[0].text).toBe(`Fenster 328 × ${h} (328)`);
    expect(warnings).toEqual([]);

    await page.evaluate(() => localStorage.clear());
    await openPreview(page, { config: JSON.stringify({ strings: { resizeHint: ' ', announce: '' } }) });
    frame = pluginFrame(page);
    expect(warnings.filter((w) => w.includes('data-kit-config'))).toEqual([expect.stringContaining('ignored strings.resizeHint, strings.announce')]);
    await expect(frame.locator('[data-kit-resize]')).toHaveAccessibleDescription(HINT);
  });
});

test.describe('announcements', () => {
  test('a burst of keys is announced once, 150 ms after the last key, with the size it ends at', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await recordAnnouncements(frame); // adds one keydown listener of the test's own to the handle
    const count = await listenerCounter(page);
    const baseline = await count();
    // Five keys 40 ms apart, dispatched in the frame so the spacing doesn't depend on the test
    // runner: each one restarts the 150 ms wait, so nothing is said in between.
    await frame.evaluate(async () => {
      const handle = /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]'));
      for (const [key, shiftKey] of [['ArrowRight', false], ['ArrowRight', false], ['ArrowRight', true], ['ArrowRight', false], ['ArrowRight', false]]) {
        handle.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    });
    await expect.poll(async () => (await announcements(frame)).said.length).toBe(1);
    await page.waitForTimeout(300);
    const { said, keys } = await announcements(frame);
    expect(keys).toHaveLength(5);
    expect(said, 'one announcement for the whole burst').toHaveLength(1);
    const gaps = keys.slice(1).map((t, i) => t - keys[i]);
    expect(Math.max(...gaps), 'the keys really came as one burst').toBeLessThan(150);
    const delay = said[0].t - keys[keys.length - 1];
    expect(delay, 'counted from the last key, not the first').toBeGreaterThanOrEqual(145);
    expect(delay).toBeLessThan(400);
    const width = 320 + 8 * 4 + 32;
    await expect.poll(() => frameSize(page)).toEqual({ width, height: await contentHeight(frame), state: 'shown' });
    expect(said[0].text).toBe(`Window ${width} by ${await contentHeight(frame)}`);
    expect(await count(), 'the announcement timer adds no listener').toEqual(baseline);
  });

  test('every key restarts the wait; a drag drops a pending announcement; a burst ending at a spoken size speaks again', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await recordAnnouncements(frame);
    // Hold the runtime's 150 ms timers (the announcement is its only one) so the order of events,
    // not the speed of the machine, decides what is said.
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      const realSet = window.setTimeout.bind(window);
      const realClear = window.clearTimeout.bind(window);
      w.__held = new Map();
      let next = 1e6;
      w.setTimeout = (fn, ms, ...args) => {
        if (ms !== 150) return realSet(fn, ms, ...args);
        w.__held.set(++next, fn);
        return next;
      };
      w.clearTimeout = (id) => { if (!w.__held.delete(id)) realClear(id); };
      w.__release = () => { const fns = [...w.__held.values()]; w.__held.clear(); for (const fn of fns) fn(); };
    });
    const held = () => frame.evaluate(() => /** @type {any} */ (window).__held.size);
    const release = () => frame.evaluate(() => /** @type {any} */ (window).__release());
    await frame.focus('[data-kit-resize]');
    for (const key of ['ArrowRight', 'ArrowRight', 'Shift+ArrowLeft', 'Enter']) {
      await page.keyboard.press(key);
      expect(await held(), `${key}: one pending announcement, the earlier one cancelled`).toBe(1);
    }
    expect((await announcements(frame)).said).toEqual([]);
    await release();
    // 320 + 8 + 8 - 32 = 304, then Enter snaps to the next width, 320.
    expect((await announcements(frame)).said.map((a) => a.text)).toEqual([`Window 320 by ${await contentHeight(frame)}`]);

    // A key, then a drag before its announcement: the drag drops it, and drags say nothing.
    let at = await mark(page);
    await page.keyboard.press('ArrowRight');
    expect(await held()).toBe(1);
    await drag(page, frame, 40, 0, { steps: 2 });
    await waitForFinal(page, at, 50);
    expect(await held(), 'pointerdown cancelled it').toBe(0);
    const p = await handleCenter(frame);
    await page.mouse.dblclick(p.x, p.y);
    await page.waitForTimeout(100);
    expect(await held(), 'double-click snaps are not announced').toBe(0);
    await release();
    expect((await announcements(frame)).said).toHaveLength(1);

    // Two keys that end where the last announcement was: said again, so the person hears it.
    at = await mark(page);
    await frame.focus('[data-kit-resize]');
    const width = (await frameSize(page)).width;
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await release();
    const said = (await announcements(frame)).said.map((a) => a.text);
    expect(said).toHaveLength(2);
    expect(said[1]).toBe(`Window ${width} by ${await contentHeight(frame)}`);
  });

  test('Enter, Home and End are announced like arrows; keys that do nothing are not', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await recordAnnouncements(frame);
    await frame.focus('[data-kit-resize]');
    for (const [key, width] of [['Enter', 480], ['End', 640], ['Home', 320]]) {
      const before = (await announcements(frame)).said.length;
      await page.keyboard.press(key);
      await expect.poll(async () => (await announcements(frame)).said.length, key).toBe(before + 1);
      expect((await announcements(frame)).said.at(-1).text, key).toBe(`Window ${width} by ${await contentHeight(frame)}`);
    }
    // fit-content: Up and Down belong to the page, and a letter is not a resize.
    const before = (await announcements(frame)).said.length;
    for (const key of ['ArrowUp', 'ArrowDown', 'a']) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    expect((await announcements(frame)).said).toHaveLength(before);
  });

  test('resizable: Up and Down are announced with the new height', async ({ page }) => {
    await openPreview(page, { mode: 'resizable' });
    const frame = pluginFrame(page);
    await recordAnnouncements(frame);
    await frame.focus('[data-kit-resize]');
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    // However the presses fell into bursts, the last thing said is where the window ended.
    await expect.poll(async () => (await announcements(frame)).said.map((a) => a.text).at(-1)).toBe('Window 320 by 384');
  });
});

test.describe('End', () => {
  test('End takes the widest snap, keeps the height in resizable, and does not repeat', async ({ page }) => {
    await openPreview(page, { mode: 'resizable' });
    const frame = pluginFrame(page);
    await frame.focus('[data-kit-resize]');
    let at = await mark(page);
    await page.keyboard.press('End');
    await waitForFinal(page, at);
    expect((await resizesSince(page, at)).filter((m) => m.user)).toEqual([{ type: 'kit:resize', width: 640, height: 360, user: true, final: true }]);
    expect(await frameSize(page)).toEqual({ width: 640, height: 360, state: 'shown' });
    expect((await writesSince(page, at)).map((w) => [w.width, w.height])).toEqual([[640, 360]]);
    // Held down, End sends once (like Enter and Home).
    at = await mark(page);
    await frame.locator('[data-kit-resize]').dispatchEvent('keydown', { key: 'End', repeat: true });
    await page.waitForTimeout(150);
    expect(await resizesSince(page, at)).toEqual([]);
    // Home goes back to the default width; End again to the widest.
    for (const [key, width] of [['Home', 320], ['End', 640]]) {
      at = await mark(page);
      await page.keyboard.press(key);
      await waitForFinal(page, at, 300);
      expect((await frameSize(page)).width, key).toBe(width);
    }
  });

  test('snaps outside the bounds are not usable: End stops at the widest one inside them', async ({ page }) => {
    // The default maxWidth is 960, so 1200 is out; the widest usable snap is 500.
    await openPreview(page, { config: JSON.stringify({ snapWidths: [300, 1200, 500] }) });
    const frame = pluginFrame(page);
    await frame.focus('[data-kit-resize]');
    const at = await mark(page);
    await page.keyboard.press('End');
    await waitForFinal(page, at, 300);
    expect((await resizesSince(page, at)).filter((m) => m.user)).toEqual([expect.objectContaining({ width: 500, user: true, final: true })]);
    expect(await frameSize(page)).toEqual({ width: 500, height: await contentHeight(frame), state: 'shown' });
  });
});

test.describe('kit:fit from the main thread', () => {
  // The fixture's code.js with a host message that calls KitWindow.fit(), as a plugin would after
  // sending the UI new content.
  const fitOnRequest = (page) => patchFile(page, 'code.js', [[
    "installKitWindow({ mode: 'fit-content' });",
    "const kitWin = installKitWindow({ mode: 'fit-content' });\nfigma.ui.on('message', (m) => { if (m && m.type === 'please-fit') kitWin.fit(); });",
  ]]);
  const askMainToFit = (frame) => frame.evaluate(() => parent.postMessage({ pluginMessage: { type: 'please-fit' } }, '*'));

  test('resizable: KitWindow.fit() fits the height to the content and keeps the width; nothing is saved', async ({ page }) => {
    await fitOnRequest(page);
    await openPreview(page, { mode: 'resizable' });
    const frame = pluginFrame(page);
    let at = await mark(page);
    await drag(page, frame, 80, 0);
    await waitForFinal(page, at);
    expect(await frameSize(page)).toEqual({ width: 400, height: 360, state: 'shown' });

    await addRows(frame, 20);
    await page.waitForTimeout(250);
    expect((await frameSize(page)).height, 'resizable does not follow content by itself').toBe(360);
    at = await mark(page);
    await askMainToFit(frame);
    const h = await contentHeight(frame);
    expect(h).toBeGreaterThan(360);
    await expect.poll(() => frameSize(page)).toEqual({ width: 400, height: h, state: 'shown' });
    const sent = await messagesSince(page, at);
    expect(sent.filter((m) => m.dir === 'main').map((m) => m.msg)).toEqual([{ type: 'kit:fit' }]);
    expect(await resizesSince(page, at)).toEqual([{ type: 'kit:resize', width: 400, height: h, user: false, final: false }]);
    expect(await frameSize(page)).toEqual({ width: 400, height: h, state: 'shown' });
    expect(await writesSince(page, at), 'a fit is never saved').toEqual([]);
  });

  test('resizable: a kit:fit that arrives during a drag is dropped, so the window never jumps under the pointer and the drag\'s size stays', async ({ page }) => {
    await openPreview(page, { mode: 'resizable' });
    const frame = pluginFrame(page);
    expect(await frameSize(page)).toEqual({ width: 320, height: 360, state: 'shown' });
    const at = await mark(page);
    await drag(page, frame, 40, 120, {
      beforeUp: async () => {
        await page.waitForTimeout(100); // held still at 360 x 480
        await host(page, () => window.kitPreviewHost.postToUi({ type: 'kit:fit' }));
        await page.waitForTimeout(200);
      },
    });
    await waitForFinal(page, at);
    const sent = await resizesSince(page, at);
    expect(sent.filter((m) => !m.user), 'no fit while the pointer is down').toEqual([]);
    expect(sent[sent.length - 1]).toEqual({ type: 'kit:resize', width: 360, height: 480, user: true, final: true });
    expect(await frameSize(page)).toEqual({ width: 360, height: 480, state: 'shown' });
    // After the drag, kit:fit works again.
    const after = await mark(page);
    await host(page, () => window.kitPreviewHost.postToUi({ type: 'kit:fit' }));
    const h = await contentHeight(frame);
    await expect.poll(() => resizesSince(page, after)).toEqual([{ type: 'kit:resize', width: 360, height: Math.max(120, h), user: false, final: false }]);
  });

  test('fit-content: kit:fit refits even when nothing else would (no ResizeObserver)', async ({ page }) => {
    await patchFile(page, 'ui.html', [['<meta charset="utf-8">', `<meta charset="utf-8"><script>window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };</${'script'}>`]]);
    await openPreview(page);
    const frame = pluginFrame(page);
    const start = await frameSize(page);
    await addRows(frame, 5);
    await page.waitForTimeout(250);
    expect(await frameSize(page), 'without the observer the window stays put').toEqual(start);
    const at = await mark(page);
    await host(page, () => window.kitPreviewHost.postToUi({ type: 'kit:fit' }));
    const h = await contentHeight(frame);
    await expect.poll(() => resizesSince(page, at)).toEqual([{ type: 'kit:resize', width: 320, height: h, user: false, final: false }]);
    expect(await frameSize(page)).toEqual({ width: 320, height: h, state: 'shown' });
  });

  test('fixed: KitWindow.fit() posts nothing, and a kit:fit that arrives anyway is ignored', async ({ page }) => {
    await fitOnRequest(page);
    await openPreview(page, { mode: 'fixed' });
    const frame = pluginFrame(page);
    await addRows(frame, 10);
    const at = await mark(page);
    await askMainToFit(frame);
    await page.waitForTimeout(200);
    expect((await messagesSince(page, at)).filter((m) => m.dir === 'main'), 'main sends no kit:fit in fixed mode').toEqual([]);
    await host(page, () => window.kitPreviewHost.postToUi({ type: 'kit:fit' }));
    await page.waitForTimeout(300);
    expect(await resizesSince(page, at)).toEqual([]);
    expect(await frameSize(page)).toEqual({ width: 320, height: 360, state: 'shown' });
  });

  test('a fit() called before the UI has started is applied by its first request (resizable)', async ({ page }) => {
    await patchFile(page, 'code.js', [["installKitWindow({ mode: 'fit-content' });", "installKitWindow({ mode: 'fit-content' }).fit();"]]);
    await openPreview(page, { mode: 'resizable' });
    const frame = pluginFrame(page);
    const all = await messagesSince(page, { messages: 0 });
    const kit = all.filter((m) => typeof m.msg.type === 'string' && m.msg.type.startsWith('kit:')).map((m) => `${m.dir} ${m.msg.type}`);
    expect(kit, 'kit:fit is queued before the page loads, so it arrives before kit:init').toEqual(['main kit:fit', 'ui kit:ready', 'main kit:init', 'ui kit:resize']);
    const h = await contentHeight(frame);
    expect(h).toBeLessThan(360);
    expect((await resizesSince(page, { messages: 0 }))[0]).toEqual({ type: 'kit:resize', width: 320, height: Math.max(120, h), user: false, final: false });
    expect(await frameSize(page)).toEqual({ width: 320, height: Math.max(120, h), state: 'shown' });
    // Only once: content changes afterwards don't move a resizable window.
    await addRows(frame, 5);
    await page.waitForTimeout(250);
    expect((await frameSize(page)).height).toBe(Math.max(120, h));
  });

  test('host messages and unknown kit:* types still pass untouched next to kit:fit', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    // The fixture's first answer adds a line to its status; let that refit land first.
    await host(page, () => window.kitPreviewHost.postToUi({ type: 'fixture-pong', n: 1 }));
    await expect(frame.locator('#fixture-status')).toHaveText(/^Pong 1/);
    await page.waitForTimeout(200);
    const at = await mark(page);
    await host(page, () => {
      window.kitPreviewHost.postToUi({ type: 'kit:fit', extra: true });
      window.kitPreviewHost.postToUi({ type: 'kit:something-newer' });
      window.kitPreviewHost.postToUi({ type: 'fixture-pong', n: 2 });
    });
    await expect(frame.locator('#fixture-status')).toHaveText(/^Pong 2/);
    await page.waitForTimeout(200);
    // fit-content is already fitted: the refit asks for the same size, which the runtime dedupes.
    expect((await messagesSince(page, at)).filter((m) => m.dir === 'ui')).toEqual([]);
  });
});
