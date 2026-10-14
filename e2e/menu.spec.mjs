// The menu (stateful component #1), end to end: the runtime's delegated menu listeners in the kit
// fixture (useKitFixture: ui.html's kit blocks, not the starter's demo), inside preview.html's fake
// Figma host. The markup below is added to the plugin's [data-kit-root] at run time (the runtime
// listens on document, so menus added after boot work).
// Covers: open and close by click, light dismiss, ArrowDown on the invoker, Enter on the invoker,
// roving focus with wrap, Home/End, disabled items skipped, Escape (focus back to the invoker, the
// host's own Escape handler untouched), Tab, item clicks (after the host's handler; preventDefault
// keeps it open), aria-expanded on every invoker, the clicked invoker without ToggleEvent.source, a
// second menu closing the first, placement (under
// the invoker, flipped above near the bottom, shifted in from the right, re-placed when the window
// resizes or the page scrolls, inside the viewport), listener counts back at baseline, and the
// live demo in preview.html's gallery. Behaviour notes: docs/components.md, "Menu".

import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, openPreview, pluginFrame, mark, messagesSince, listenerCounter, host, patchFile, useKitFixture } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await useKitFixture(page); });

// Two invokers for one menu (both must track aria-expanded), five items: one disabled, one
// aria-disabled, a separator between them.
const MENU = `
<div class="kit-section kit-row" id="menu-row">
  <button class="kit-button kit-button-secondary" type="button" id="menu-button" popovertarget="menu-1" aria-haspopup="menu" aria-expanded="false">Options</button>
  <button class="kit-button kit-button-tertiary" type="button" id="menu-button-2" popovertarget="menu-1" aria-haspopup="menu" aria-expanded="false">More</button>
  <button class="kit-button kit-button-secondary" type="button" id="after-button">After</button>
  <div class="kit-menu" id="menu-1" popover role="menu" aria-labelledby="menu-button">
    <button class="kit-menu-item" role="menuitem" type="button" id="m-rename">Rename</button>
    <button class="kit-menu-item" role="menuitem" type="button" id="m-duplicate" disabled>Duplicate</button>
    <button class="kit-menu-item" role="menuitem" type="button" id="m-copy">Copy link</button>
    <hr class="kit-menu-separator">
    <button class="kit-menu-item" role="menuitem" type="button" id="m-lock" aria-disabled="true">Lock</button>
    <button class="kit-menu-item" role="menuitem" type="button" id="m-delete">Delete</button>
  </div>
</div>`;

/** Opens the plugin and puts the menu row at the end of its content: `where` is 'bottom' (last row of a fit-content window) or 'top'. */
async function openWithMenu(page, { mode = 'fit-content', where = 'bottom' } = {}) {
  await openPreview(page, mode === 'fit-content' ? {} : { mode });
  const frame = pluginFrame(page);
  await frame.evaluate(({ html, where }) => {
    const root = /** @type {Element} */ (document.querySelector('[data-kit-root]'));
    root.insertAdjacentHTML(where === 'top' ? 'afterbegin' : 'beforeend', html);
    // Host code, as a plugin would write it: a click log, and an Escape handler that "closes the plugin".
    const w = /** @type {any} */ (window);
    w.__clicks = [];
    w.__hostEscapes = 0;
    for (const item of document.querySelectorAll('.kit-menu-item')) {
      item.addEventListener('click', () => w.__clicks.push({ id: item.id, open: document.getElementById('menu-1').matches(':popover-open') }));
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') w.__hostEscapes++; });
  }, { html: MENU, where });
  await page.waitForTimeout(250); // let the fit for the new row land
  return frame;
}

const state = (frame) => frame.evaluate(() => {
  const menu = /** @type {HTMLElement} */ (document.getElementById('menu-1'));
  const box = menu.getBoundingClientRect();
  return {
    open: menu.matches(':popover-open'),
    focus: document.activeElement ? document.activeElement.id : null,
    expanded: [...document.querySelectorAll('[popovertarget="menu-1"]')].map((b) => b.getAttribute('aria-expanded')),
    box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
    viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
  };
});
const rect = (frame, id) => frame.evaluate((i) => {
  const r = /** @type {Element} */ (document.getElementById(i)).getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}, id);
const clicks = (frame) => frame.evaluate(() => /** @type {any} */ (window).__clicks);

// The browser shows the menu at once, but the runtime finishes opening it in the 'toggle' event
// (a task later): it places the menu, sets aria-expanded, then focuses the first item. Focus on an
// item therefore means all three are done. Closing resets aria-expanded in 'toggle' too.
const expectOpen = (frame) => expect.poll(() => state(frame).then((s) => s.open && /^m-/.test(s.focus || '') && s.expanded.every((e) => e === 'true')), { message: 'menu open and settled' }).toBe(true);
const expectClosed = (frame) => expect.poll(() => state(frame).then((s) => !s.open && s.expanded.every((e) => e === 'false')), { message: 'menu closed' }).toBe(true);

/** The open menu keeps the runtime's 8px viewport margin on every side. */
function expectInside(s) {
  expect(s.box.left, 'left edge').toBeGreaterThanOrEqual(8);
  expect(s.box.top, 'top edge').toBeGreaterThanOrEqual(8);
  expect(s.box.right, 'right edge').toBeLessThanOrEqual(s.viewport.width - 8);
  expect(s.box.bottom, 'bottom edge').toBeLessThanOrEqual(s.viewport.height - 8);
}

test.describe('menu', () => {
  test('click opens it under the invoker and focuses the first item; aria-expanded follows on every invoker; click again and click outside close it', async ({ page }) => {
    const frame = await openWithMenu(page, { where: 'top' });
    expect(await state(frame)).toMatchObject({ open: false, expanded: ['false', 'false'] });
    const at = await mark(page);

    await frame.click('#menu-button');
    await expectOpen(frame);
    let s = await state(frame);
    expect(s).toMatchObject({ open: true, expanded: ['true', 'true'], focus: 'm-rename' });
    const invoker = await rect(frame, 'menu-button');
    expect(s.box.top, 'just under the invoker').toBe(Math.round(invoker.bottom + 4));
    expect(s.box.left, 'left edges aligned').toBe(Math.round(invoker.left));
    expectInside(s);
    // The menu is in the top layer: opening it changes no layout, so the window is not refitted.
    expect((await messagesSince(page, at)).filter((m) => m.dir === 'ui')).toEqual([]);

    await frame.click('#menu-button'); // the invoker toggles it closed
    await expectClosed(frame);

    await frame.click('#menu-button-2'); // the second invoker opens the same menu
    await expectOpen(frame);
    s = await state(frame);
    expect(s.box.left, 'anchored to the invoker that opened it').toBe(Math.round((await rect(frame, 'menu-button-2')).left));
    expect(s.expanded).toEqual(['true', 'true']);

    await frame.click('#after-button'); // light dismiss: a click outside the menu
    await expectClosed(frame);
    expect((await state(frame)).focus).toBe('after-button');
    expect(await clicks(frame), 'no item was chosen').toEqual([]);
  });

  test('keys: ArrowDown or Enter on the invoker opens it; ArrowDown/ArrowUp wrap and skip disabled items; Home/End', async ({ page }) => {
    const frame = await openWithMenu(page);
    await frame.focus('#menu-button');
    await page.keyboard.press('ArrowDown');
    await expectOpen(frame);
    expect((await state(frame)).focus).toBe('m-rename');

    // Duplicate (disabled) and Lock (aria-disabled) are never visited.
    const walk = [['ArrowDown', 'm-copy'], ['ArrowDown', 'm-delete'], ['ArrowDown', 'm-rename'], ['ArrowUp', 'm-delete'],
      ['ArrowUp', 'm-copy'], ['ArrowUp', 'm-rename'], ['End', 'm-delete'], ['Home', 'm-rename']];
    for (const [key, id] of walk) {
      await page.keyboard.press(key);
      expect((await state(frame)).focus, key).toBe(id);
    }
    // From an aria-disabled item (a mouse can focus it) the keys still move to its neighbours.
    await frame.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('m-lock')).focus());
    await page.keyboard.press('ArrowDown');
    expect((await state(frame)).focus).toBe('m-delete');
    await frame.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('m-lock')).focus());
    await page.keyboard.press('ArrowUp');
    expect((await state(frame)).focus).toBe('m-copy');

    // Enter on an item chooses it: the host's handler runs while the menu is still open.
    await page.keyboard.press('Enter');
    await expectClosed(frame);
    expect(await clicks(frame)).toEqual([{ id: 'm-copy', open: true }]);
    expect((await state(frame)).focus).toBe('menu-button');

    // Enter on the invoker opens it natively (popovertarget); the first item gets focus.
    await page.keyboard.press('Enter');
    await expectOpen(frame);
    expect((await state(frame)).focus).toBe('m-rename');
    // ArrowDown elsewhere does nothing to the menu.
    await page.keyboard.press('Escape');
    await expectClosed(frame);
    await frame.focus('#after-button');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    expect((await state(frame)).open).toBe(false);
  });

  test('Escape closes it and returns focus to the invoker; the host Escape handler does not fire while a menu is open', async ({ page }) => {
    const frame = await openWithMenu(page);
    await frame.focus('#menu-button-2');
    await page.keyboard.press('ArrowDown');
    await expectOpen(frame);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expectClosed(frame);
    expect((await state(frame)).focus).toBe('menu-button-2');
    expect(await frame.evaluate(() => /** @type {any} */ (window).__hostEscapes), 'the menu owned that Escape').toBe(0);
    // With no menu open, Escape belongs to the plugin again.
    await page.keyboard.press('Escape');
    expect(await frame.evaluate(() => /** @type {any} */ (window).__hostEscapes)).toBe(1);
  });

  test('without ToggleEvent.source (older engines) a menu opened from its second button sits under that button, and Escape focuses it', async ({ page }) => {
    // Hide the engine's ToggleEvent.source, as a browser from before it would.
    await patchFile(page, 'ui.html', [['<script data-kit="runtime">', `<script>if (window.ToggleEvent) Object.defineProperty(ToggleEvent.prototype, 'source', { get() { return undefined; } });</${'script'}>\n<script data-kit="runtime">`]]);
    const frame = await openWithMenu(page, { where: 'top' });
    for (const how of ['click', 'Enter']) {
      for (const id of ['menu-button-2', 'menu-button']) {
        if (how === 'click') await frame.click(`#${id}`);
        else {
          await frame.focus(`#${id}`);
          await page.keyboard.press('Enter');
        }
        await expectOpen(frame);
        const s = await state(frame);
        expect(s.box.left, `${how} ${id}: under its own button`).toBe(Math.max(8, Math.min(Math.round((await rect(frame, id)).left), s.viewport.width - 8 - s.box.width)));
        await page.keyboard.press('Escape');
        await expectClosed(frame);
        expect((await state(frame)).focus, `${how} ${id}`).toBe(id);
      }
    }
  });

  test('a second menu opening closes the first; Escape then closes the second and focuses its own invoker', async ({ page }) => {
    const frame = await openWithMenu(page, { where: 'top' });
    await frame.evaluate(() => document.getElementById('menu-row').insertAdjacentHTML('beforeend',
      '<button class="kit-button kit-button-secondary" type="button" id="other-button" popovertarget="menu-2" aria-haspopup="menu" aria-expanded="false">Other</button>'
      + '<div class="kit-menu" id="menu-2" popover role="menu"><button class="kit-menu-item" role="menuitem" type="button" id="o-first">First</button></div>'));
    const other = () => frame.evaluate(() => ({
      open: document.getElementById('menu-2').matches(':popover-open'),
      expanded: document.getElementById('other-button').getAttribute('aria-expanded'),
      left: document.getElementById('menu-2').getBoundingClientRect().left,
    }));
    await frame.click('#menu-button');
    await expectOpen(frame);
    await frame.focus('#other-button'); // keyboard focus moves without a click (no light dismiss)
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => frame.evaluate(() => document.activeElement.id)).toBe('o-first');
    await expectClosed(frame); // the browser closed menu-1 when menu-2 opened
    expect(await other()).toMatchObject({ open: true, expanded: 'true', left: Math.round((await rect(frame, 'other-button')).left) });
    await page.keyboard.press('Escape');
    await expect.poll(other).toMatchObject({ open: false, expanded: 'false' });
    expect((await state(frame)).focus).toBe('other-button');
  });

  test('Tab and Shift+Tab close it; focus leaves the menu', async ({ page }) => {
    const frame = await openWithMenu(page);
    for (const key of ['Tab', 'Shift+Tab']) {
      await frame.focus('#menu-button');
      await page.keyboard.press('ArrowDown');
      await expectOpen(frame);
      await page.keyboard.press(key);
      await expectClosed(frame);
      // Hiding the menu puts focus back on the invoker, and the Tab then moves on from there (back
      // to the kit fixture's Ping button, the control before the menu row).
      expect((await state(frame)).focus, key).toBe(key === 'Tab' ? 'menu-button-2' : 'fixture-ping');
      expect(await clicks(frame), key).toEqual([]);
    }
  });

  test('item clicks: the host handler runs first, then the menu closes; preventDefault keeps it open; disabled items do not close it', async ({ page }) => {
    const frame = await openWithMenu(page);
    const open = async () => {
      await frame.click('#menu-button');
      await expectOpen(frame);
    };
    await open();
    await frame.click('#m-rename');
    await expectClosed(frame);
    expect(await clicks(frame)).toEqual([{ id: 'm-rename', open: true }]);
    expect((await state(frame)).focus, 'focus is back on the invoker').toBe('menu-button');

    // A host handler that calls preventDefault keeps the menu open (a checkable item, say).
    await frame.evaluate(() => document.getElementById('m-copy').addEventListener('click', (e) => e.preventDefault(), { once: true }));
    await open();
    await frame.click('#m-copy');
    await page.waitForTimeout(150);
    expect((await state(frame)).open).toBe(true);
    // A disabled item gets no click at all; an aria-disabled one reaches the host (which checks
    // the attribute, as for any aria-disabled control) but leaves the menu open.
    await frame.click('#m-duplicate', { force: true });
    await frame.click('#m-lock', { force: true }); // Playwright treats aria-disabled as not clickable
    await page.waitForTimeout(150);
    expect((await state(frame)).open).toBe(true);
    expect((await clicks(frame)).map((c) => c.id)).toEqual(['m-rename', 'm-copy', 'm-lock']);
    await frame.click('#m-delete');
    await expectClosed(frame);
    expect((await clicks(frame)).at(-1)).toEqual({ id: 'm-delete', open: true });
  });

  test('placement: flips above near the bottom edge, shifts in from the right edge, follows a window resize, stays inside the viewport', async ({ page }) => {
    // The menu row is the last row of a fit-content window: no room below the invoker.
    const frame = await openWithMenu(page);
    await frame.click('#menu-button');
    await expectOpen(frame);
    let s = await state(frame);
    let invoker = await rect(frame, 'menu-button');
    expect(invoker.bottom + 4 + s.box.height, 'it would not fit below').toBeGreaterThan(s.viewport.height - 8);
    expect(Math.abs(s.box.bottom - (invoker.top - 4)), 'flipped: its bottom edge sits 4px above the invoker').toBeLessThanOrEqual(1);
    expectInside(s);
    await page.keyboard.press('Escape');
    await expectClosed(frame);

    // An invoker at the right edge: the menu is shifted left to keep 8px clear.
    await frame.evaluate(() => { /** @type {HTMLElement} */ (document.getElementById('menu-button-2')).style.marginLeft = 'auto'; });
    await frame.click('#menu-button-2');
    await expectOpen(frame);
    s = await state(frame);
    invoker = await rect(frame, 'menu-button-2');
    expect(invoker.left + s.box.width, 'left-aligned it would overflow').toBeGreaterThan(s.viewport.width - 8);
    expect(Math.abs(s.box.right - (s.viewport.width - 8)), 'its right edge 8px in').toBeLessThanOrEqual(1);
    expectInside(s);

    // The host resizes the window while the menu is open: it follows its invoker.
    const before = s.box.left;
    await host(page, () => {
      const range = /** @type {HTMLInputElement} */ (document.getElementById('live-width'));
      range.value = '480';
      range.dispatchEvent(new Event('input'));
    });
    // Re-placed in the frame's 'resize' event, which follows the new size by a rendering step.
    await expect.poll(() => state(frame).then((x) => x.viewport.width === 480 && Math.abs(x.box.right - (480 - 8)) <= 1)).toBe(true);
    s = await state(frame);
    expect(s.open, 'a window resize is not a light dismiss').toBe(true);
    expect(s.box.left, 'moved with the invoker').toBeGreaterThan(before);
    expect(Math.abs(s.box.right - (s.viewport.width - 8))).toBeLessThanOrEqual(1);
    expectInside(s);
  });

  test('an open menu follows its invoker when the page scrolls under it, and stays put when its own items scroll', async ({ page }) => {
    const frame = await openWithMenu(page, { mode: 'resizable', where: 'top' });
    // A window shorter than its content, so the page can scroll.
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('[data-kit-root]')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(30)));
    await frame.click('#menu-button');
    await expectOpen(frame);
    const before = (await state(frame)).box.top;
    await frame.evaluate(() => window.scrollBy(0, 20));
    await expect.poll(() => state(frame).then((x) => x.box.top)).toBe(before - 20);
    expect((await state(frame)).open, 'scrolling is not a light dismiss').toBe(true);
    const invoker = await rect(frame, 'menu-button');
    expect((await state(frame)).box.top).toBe(Math.round(invoker.bottom + 4));
    // The menu's own scroll (a long menu) does not re-place it.
    await frame.evaluate(() => {
      const menu = /** @type {HTMLElement} */ (document.getElementById('menu-1'));
      menu.style.maxHeight = '60px';
      menu.scrollTop = 30;
      menu.dispatchEvent(new Event('scroll'));
    });
    expect(await frame.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('menu-1')).style.top)).toBe(`${before - 20}px`);
  });

  test('a menu taller than a short window keeps its top 8px from the top edge (resizable)', async ({ page }) => {
    const frame = await openWithMenu(page, { mode: 'resizable', where: 'top' });
    await frame.focus('[data-kit-resize]');
    for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowUp'); // down to minHeight
    await expect.poll(() => frame.evaluate(() => innerHeight)).toBe(120);
    await frame.click('#menu-button');
    await expectOpen(frame);
    const s = await state(frame);
    expect(s.box.top).toBe(8);
    expect(s.box.left).toBeGreaterThanOrEqual(8);
  });

  test('listeners: five delegated ones on document from boot, and the counts are back at baseline after every open/close path', async ({ page }) => {
    const frame = await openWithMenu(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    // The plain 'keydown' is this test's own host Escape handler (openWithMenu); the five capture
    // listeners are the runtime's, registered once at boot.
    expect(baseline.document).toEqual(['beforetoggle(capture)', 'click(capture)', 'keydown', 'keydown(capture)', 'scroll(capture)', 'toggle(capture)']);
    expect(baseline.handle).toEqual(['dblclick', 'keydown', 'pointerdown']);
    const cycle = async (openIt, closeIt) => {
      await openIt();
      await expectOpen(frame);
      expect(await count(), 'nothing added while open').toEqual(baseline);
      await closeIt();
      await expectClosed(frame);
      expect(await count()).toEqual(baseline);
    };
    await cycle(() => frame.click('#menu-button'), () => frame.click('#menu-button'));
    await cycle(() => frame.click('#menu-button'), () => frame.click('h1'));
    await cycle(async () => { await frame.focus('#menu-button'); await page.keyboard.press('ArrowDown'); }, () => page.keyboard.press('Escape'));
    await cycle(() => frame.click('#menu-button-2'), () => frame.click('#m-delete'));
    await cycle(async () => { await frame.focus('#menu-button'); await page.keyboard.press('ArrowDown'); }, () => page.keyboard.press('Tab'));
  });

  // preview.html's own runtime block runs the live menus in the gallery (the menu-demo markup).
  test('the gallery demo: a real menu in the preview page itself, axe-clean closed and open', async ({ page }) => {
    await openPreview(page);
    test.skip(await page.locator('#g-menu-button').count() === 0, 'preview.html has no live menu demo');
    const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']).include('#g-menu-demo').analyze();
    const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(summary((await axe()).violations)).toEqual([]);
    await page.locator('#g-menu-button').scrollIntoViewIfNeeded();
    await page.focus('#g-menu-button');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#g-menu')).toBeVisible();
    await expect(page.locator('#g-menu-button')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#g-menu .kit-menu-item').first()).toBeFocused();
    expect(summary((await axe()).violations), 'open').toEqual([]);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#g-menu')).toBeHidden();
    await expect(page.locator('#g-menu-chosen')).toHaveText('Chosen: Duplicate');
    await expect(page.locator('#g-menu-button')).toBeFocused();
    await page.click('#g-menu-more');
    await expect(page.locator('#g-menu-2')).toBeVisible();
    await expect(page.locator('#g-menu-more')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#g-menu-2')).toBeHidden();
    await expect(page.locator('#g-menu-more')).toBeFocused();
  });
});
