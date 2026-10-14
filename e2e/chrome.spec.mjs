// Window chrome, end to end: the repo's real installKitWindow (code.js's kit:window block) and
// runtime (ui.html's kit blocks) in preview.html's fake Figma host, running the kit fixture
// (e2e/fixtures/kit-ui.html and kit-plugin.js, see useKitFixture) rather than the starter's demo,
// so these keep passing once the demo is replaced. Covers the PLAN.md Phase 1 item 2 sequences: open, drag,
// Escape mid-drag, right-click, plain click, double-click, arrow keys, Home, reopen with a saved
// size, replacing the demo markup, a data-kit-config override (and bad ones), host messages next
// to kit messages, the three modes, the UI's own 500 ms fallback (alone, and racing a main thread
// that answers late), and zero leaked listeners after every gesture. docs/window-chrome.md
// describes the behaviour checked here.

import {
  test, expect, openPreview, pluginFrame, waitForPlugin, mark, messagesSince, resizesSince, writesSince,
  callsSince, waitForFinal, frameSize, contentHeight, drag, handleCenter, listenerCounter, host, patchFile, useKitFixture,
  isMissingExample,
} from './helpers.mjs';

test.beforeEach(async ({ page }) => { await useKitFixture(page); });

const BOUNDS = { minWidth: 240, maxWidth: 960, minHeight: 120, maxHeight: 900 };
// Wraps to a different number of lines at 240, 320 and 440 px.
const LONG_TEXT = 'Shapes are placed in a row from the top-left corner of the viewport, spaced by their own width, '
  + 'and selected afterwards so you can move them together. Undo removes the whole batch in one step, '
  + 'and nothing is created when the count is outside the range shown above.';

test.describe('fit-content (the starter default)', () => {
  test('open: kit:ready, then kit:init, then one content fit that shows the window', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const all = await messagesSince(page, { messages: 0 });
    const kit = all.filter((m) => typeof m.msg.type === 'string' && m.msg.type.startsWith('kit:'));
    expect(kit.map((m) => `${m.dir} ${m.msg.type}`)).toEqual(['ui kit:ready', 'main kit:init', 'ui kit:resize']);
    expect(kit[0].msg).toEqual({ type: 'kit:ready', protocol: 1 });
    expect(kit[1].msg).toMatchObject({
      protocol: 1, mode: 'fit-content', chrome: true, editorType: 'figma', bounds: BOUNDS,
      size: { width: 320, height: 360 }, defaultSize: { width: 320, height: 360 }, restored: false,
    });
    const h = await contentHeight(frame);
    expect(kit[2].msg).toEqual({ type: 'kit:resize', width: 320, height: h, user: false, final: false });
    expect(h).toBeLessThan(360);

    // Figma's order: showUI hidden at the default size, resize to the fit, then show.
    const calls = (await callsSince(page, { calls: 0 })).map((c) => c.name);
    expect(calls.filter((n) => n.startsWith('ui.') || n === 'showUI')).toEqual(['showUI', 'ui.resize', 'ui.show']);
    const showUI = (await callsSince(page, { calls: 0 }, 'showUI'))[0].args[0];
    expect(showUI).toEqual({ width: 320, height: 360, themeColors: true, visible: false });
    expect(await frameSize(page)).toEqual({ width: 320, height: h, state: 'shown' });

    const ui = await frame.evaluate(() => ({
      origin: self.origin, cls: document.documentElement.className, figmaStyle: !!document.getElementById('figma-style'),
      chrome: document.documentElement.dataset.kitChrome, mode: document.documentElement.dataset.kitMode,
      handleHidden: /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]')).hidden,
      kit: { version: window.kit.version, protocol: window.kit.protocol, frozen: Object.isFrozen(window.kit) },
    }));
    expect(ui).toEqual({
      origin: 'null', cls: 'figma-light', figmaStyle: true, chrome: 'on', mode: 'fit-content', handleHidden: false,
      kit: { version: '0.4.0', protocol: 1, frozen: true },
    });
  });

  test('drag: the width follows, one final user message at the end, one storage write, no leaked listeners', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    expect(baseline.handle).toEqual(['dblclick', 'keydown', 'pointerdown']);

    const at = await mark(page);
    let during;
    let widthDuring = 0;
    await drag(page, frame, 80, 40, {
      beforeUp: async () => {
        await page.waitForTimeout(50);
        widthDuring = (await frameSize(page)).width;
        during = await count();
      },
    });
    await waitForFinal(page, at);
    expect(widthDuring, 'the window follows the pointer during the drag').toBeGreaterThan(320);
    expect(during.handle).toEqual([...baseline.handle, 'lostpointercapture', 'pointercancel', 'pointermove', 'pointerup'].sort());
    expect(during.window).toEqual([...baseline.window, 'keydown(capture)'].sort());

    const resizes = await resizesSince(page, at);
    const finals = resizes.filter((m) => m.final);
    expect(finals).toHaveLength(1);
    expect(finals[0]).toMatchObject({ width: 400, user: true, final: true });
    expect(resizes.indexOf(finals[0]), 'the final comes after the mid-drag sizes').toBeGreaterThan(0);
    expect(resizes.filter((m) => m.user && !m.final).every((m) => m.width > 320 && m.width <= 400)).toBe(true);
    // fit-content: the pointer's vertical movement is ignored; the height is the content's.
    expect(await frameSize(page)).toEqual({ width: 400, height: await contentHeight(frame), state: 'shown' });

    await page.waitForTimeout(600); // past code.ts's 400 ms debounce: no second write
    const writes = await writesSince(page, at);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ v: 1, editorType: 'figma', width: 400 });
    expect(await count()).toEqual(baseline);
  });

  test('Escape mid-drag: back to the start size, nothing user-made after the revert', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const start = await frameSize(page);

    const at = await mark(page);
    let afterRevert;
    await drag(page, frame, 100, 30, {
      beforeUp: async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(80);
        afterRevert = await mark(page);
        // The pointer keeps moving and is released after the revert: none of it may resize.
        const p = await handleCenter(frame);
        for (let i = 1; i <= 4; i++) { await page.mouse.move(p.x + 10 * i, p.y + 5 * i); await page.waitForTimeout(16); }
      },
    });
    await page.waitForTimeout(600);
    const before = await resizesSince(page, at);
    const revert = before.filter((m) => m.final);
    expect(revert).toEqual([{ type: 'kit:resize', width: start.width, height: start.height, user: true, final: true }]);
    const after = await resizesSince(page, afterRevert);
    expect(after.filter((m) => m.user), 'no user sizes after the revert').toEqual([]);
    expect(after.every((m) => m.width === start.width), 'only content fits at the start width').toBe(true);
    expect(await frameSize(page)).toEqual(start);
    // The saved size is the start size (written by the final revert), never the dragged one.
    expect((await writesSince(page, at)).every((w) => w.width === start.width)).toBe(true);
    expect(await count()).toEqual(baseline);

    // The next drag persists normally: the old {once:true} listeners no longer outlive Escape.
    const next = await mark(page);
    await drag(page, frame, 40, 0);
    await waitForFinal(page, next);
    expect((await resizesSince(page, next)).filter((m) => m.final)).toEqual([expect.objectContaining({ width: start.width + 40, user: true })]);
    expect(await count()).toEqual(baseline);
  });

  test('right-click and middle-click drags send nothing and add no listeners', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    for (const button of ['right', 'middle']) {
      const at = await mark(page);
      let during;
      await drag(page, frame, 60, 40, { button, beforeUp: async () => { during = await count(); } });
      await page.waitForTimeout(300);
      expect(during, `${button}: no drag started`).toEqual(baseline);
      expect(await messagesSince(page, at), `${button}: no messages`).toEqual([]);
    }
    expect(await frameSize(page)).toMatchObject({ width: 320 });
    expect(await count()).toEqual(baseline);
  });

  test('plain click: no message, no storage write', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const at = await mark(page);
    const p = await handleCenter(frame);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    const during = await count();
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(during.handle.length, 'a press starts a drag').toBe(baseline.handle.length + 4);
    expect(await messagesSince(page, at)).toEqual([]);
    expect(await writesSince(page, at)).toEqual([]);
    expect(await count()).toEqual(baseline);
  });

  test('double-click snaps through the widths with one final user message each', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    for (const width of [480, 640, 320]) {
      const at = await mark(page);
      const p = await handleCenter(frame);
      await page.mouse.dblclick(p.x, p.y);
      await waitForFinal(page, at, 300);
      const resizes = await resizesSince(page, at);
      expect(resizes[0], `snap to ${width}`).toMatchObject({ width, user: true, final: true });
      expect(resizes.filter((m) => m.user)).toHaveLength(1);
      expect(resizes.slice(1).every((m) => !m.user && m.width === width), 'later messages are content fits').toBe(true);
      expect(await frameSize(page)).toEqual({ width, height: await contentHeight(frame), state: 'shown' });
      expect((await writesSince(page, at)).map((w) => w.width)).toEqual([width]);
      await page.waitForTimeout(500); // so the next pair of clicks is a new double-click
    }
    expect(await count()).toEqual(baseline);
  });

  test('keys: Shift+Arrow and Arrow change the width, Up and Down are left to the page, Enter/Space snap, Home resets', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    await frame.focus('[data-kit-resize]');
    const steps = [['Shift+ArrowRight', 352], ['ArrowLeft', 344], ['ArrowUp', null], ['ArrowDown', null], ['Shift+ArrowLeft', 312], ['Enter', 320], ['Space', 480], ['Home', 320]];
    for (const [key, width] of steps) {
      const at = await mark(page);
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
      const user = (await resizesSince(page, at)).filter((m) => m.user);
      if (width === null) {
        expect(await messagesSince(page, at), `${key} does nothing in fit-content`).toEqual([]);
        continue;
      }
      expect(user, key).toEqual([expect.objectContaining({ width, final: true })]);
      expect((await frameSize(page)).width, key).toBe(width);
    }
    expect(await frameSize(page)).toEqual({ width: 320, height: await contentHeight(frame), state: 'shown' });
    expect(await count()).toEqual(baseline);
  });

  test('reopen restores the saved width; the height is fitted again', async ({ page }) => {
    await openPreview(page);
    let frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const at = await mark(page);
    await drag(page, frame, 80, 0);
    await waitForFinal(page, at);
    await page.waitForTimeout(100);
    expect((await writesSince(page, at)).map((w) => w.width)).toEqual([400]);

    const reopened = await mark(page);
    await host(page, () => window.kitPreviewHost.reload());
    frame = await waitForPlugin(page);
    const init = (await messagesSince(page, reopened)).find((m) => m.msg.type === 'kit:init').msg;
    expect(init).toMatchObject({ restored: true, size: { width: 400 } });
    expect(await frameSize(page)).toEqual({ width: 400, height: await contentHeight(frame), state: 'shown' });
    expect(await writesSince(page, reopened), 'reopening writes nothing').toEqual([]);
    expect(await count(), 'the new window starts with the same listeners').toEqual(baseline);
  });

  test('data-kit-config overrides CONFIG: snapWidths [300, 400]', async ({ page }) => {
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await openPreview(page, { config: JSON.stringify({ snapWidths: [300, 400] }) });
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    for (const width of [400, 300]) {
      const at = await mark(page);
      const p = await handleCenter(frame);
      await page.mouse.dblclick(p.x, p.y);
      await waitForFinal(page, at);
      expect((await resizesSince(page, at))[0]).toMatchObject({ width, user: true, final: true });
      await page.waitForTimeout(500);
    }
    expect(warnings, 'a valid override warns about nothing').toEqual([]);
    expect(await count()).toEqual(baseline);
  });

  test("host messages flow both ways next to the kit's", async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const status = frame.locator('#fixture-status');
    const before = (await frameSize(page)).height;

    const at = await mark(page);
    await frame.locator('#fixture-ping').click();
    await expect(status).toHaveText(/^Pong 1/);
    const host2ui = (await messagesSince(page, at)).map((m) => `${m.dir} ${m.msg.type}`);
    expect(host2ui).toEqual(expect.arrayContaining(['ui fixture-ping', 'main fixture-pong']));
    expect((await messagesSince(page, at)).find((m) => m.msg.type === 'fixture-pong').msg).toEqual({ type: 'fixture-pong', n: 1 });
    await page.waitForTimeout(200);
    expect((await frameSize(page)).height, 'refitted after the status grew').toBeGreaterThan(before);
    expect((await frameSize(page)).height).toBe(await contentHeight(frame));

    // A kit:* type the runtime doesn't know is ignored; a host message still reaches the host script.
    const quiet = await mark(page);
    await host(page, () => window.kitPreviewHost.postToUi({ type: 'kit:from-the-future' }));
    await host(page, () => window.kitPreviewHost.postToUi({ type: 'fixture-pong', n: 2 }));
    await expect(status).toHaveText(/^Pong 2/);
    expect((await messagesSince(page, quiet)).filter((m) => m.dir === 'ui')).toEqual([]);
    expect(await count()).toEqual(baseline);
  });

  test('a drag that rewraps text ends at the content height, narrower or wider, after holding still', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate((text) => {
      const p = document.createElement('p');
      p.className = 'kit-help';
      p.textContent = text;
      /** @type {Element} */ (document.querySelector('[data-kit-root] .kit-section')).append(p);
    }, LONG_TEXT);
    await page.waitForTimeout(200);
    const heights = new Set();
    for (const [dx, width] of [[-80, 240], [200, 440]]) {
      const at = await mark(page);
      // Holding still lets the observer's fit for the new width land before the release; the
      // final size must not then go back to a height measured before the text rewrapped.
      await drag(page, frame, dx, 0, { steps: 4, beforeUp: () => page.waitForTimeout(300) });
      await waitForFinal(page, at, 300);
      const h = await contentHeight(frame);
      heights.add(h);
      expect(await frameSize(page), `dragged to ${width}`).toEqual({ width, height: h, state: 'shown' });
      expect(await frame.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'nothing cut off, no blank strip').toBe(0);
      expect((await resizesSince(page, at)).filter((m) => m.final)).toEqual([expect.objectContaining({ width, height: h, user: true })]);
    }
    expect(heights.size, 'the text really rewrapped').toBe(2);
  });

  test('replacing the markup, or the root itself, still fits; nothing is saved and no error fires', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    // A ResizeObserver loop error goes to window 'error' only, never to the console.
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__errors = [];
      window.addEventListener('error', (e) => w.__errors.push(e.message));
    });
    const count = await listenerCounter(page);
    const baseline = await count();
    const rows = (n) => `<div class="kit-section kit-stack">${'<p class="kit-help">Row</p>'.repeat(n)}</div>`;
    const fits = async (label, measure = contentHeight) => {
      await page.waitForTimeout(250);
      expect((await frameSize(page)).height, label).toBe(Math.max(BOUNDS.minHeight, await measure(frame)));
    };
    const at = await mark(page);

    await frame.evaluate((html) => { /** @type {Element} */ (document.querySelector('[data-kit-root]')).innerHTML = html; }, rows(24));
    await fits('taller markup');
    const tall = (await frameSize(page)).height;
    await frame.evaluate((html) => { /** @type {Element} */ (document.querySelector('[data-kit-root]')).innerHTML = html; }, rows(1));
    await fits('shorter markup, down to minHeight');
    expect((await frameSize(page)).height).toBeLessThan(tall);

    await frame.evaluate((html) => {
      const main = document.createElement('main');
      main.className = 'kit-app';
      main.setAttribute('data-kit-root', '');
      main.innerHTML = html;
      /** @type {Element} */ (document.querySelector('[data-kit-root]')).replaceWith(main);
    }, rows(8));
    await fits('a new root element');
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('[data-kit-root] .kit-section')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(6)));
    await fits('the new root grew');

    // No [data-kit-root] left: <body> is measured, and the observer moves up to it.
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('[data-kit-root]')).removeAttribute('data-kit-root'));
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('main .kit-section')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(4)));
    const bodyHeight = (f) => f.evaluate(() => Math.ceil(document.body.getBoundingClientRect().bottom + scrollY));
    await fits('body as the root', bodyHeight);
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('main .kit-section')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(4)));
    await fits('body as the root, grown', bodyHeight);

    expect(await frame.evaluate(() => /** @type {any} */ (window).__errors)).toEqual([]);
    expect((await resizesSince(page, at)).filter((m) => m.user), 'content fits only').toEqual([]);
    expect(await writesSince(page, at)).toEqual([]);
    expect(await count()).toEqual(baseline);
  });

  test('only the pointer that started a drag ends it: a touch tap or another pointer lifting does not', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const cdp = await page.context().newCDPSession(page);
    const at = await mark(page);
    const p = await handleCenter(frame);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) { await page.mouse.move(p.x + 10 * i, p.y); await page.waitForTimeout(16); }
    await page.waitForTimeout(50);
    // A finger taps the handle (where it is now) mid-drag: its own pointerdown, pointerup and
    // lostpointercapture. Then another pointer's release events, as a host or a stylus might send.
    const q = await handleCenter(frame);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y, id: 7 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frame.evaluate(() => {
      const handle = /** @type {Element} */ (document.querySelector('[data-kit-resize]'));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.dispatchEvent(new PointerEvent(type, { pointerId: 99, bubbles: true }));
    });
    await page.waitForTimeout(100);
    expect((await resizesSince(page, at)).filter((m) => m.final), 'the mouse drag is still on').toEqual([]);
    for (let i = 5; i <= 8; i++) { await page.mouse.move(p.x + 10 * i, p.y); await page.waitForTimeout(16); }
    await page.mouse.up();
    await waitForFinal(page, at);
    expect((await resizesSince(page, at)).filter((m) => m.final)).toEqual([expect.objectContaining({ width: 400, user: true })]);
    expect((await frameSize(page)).width).toBe(400);
    expect(await count()).toEqual(baseline);
  });

  test('a double-click whose second press drags keeps the dragged width; no snap on top', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const at = await mark(page);
    const p = await handleCenter(frame);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.mouse.down({ clickCount: 2 });
    for (let i = 1; i <= 6; i++) { await page.mouse.move(p.x + 10 * i, p.y); await page.waitForTimeout(16); }
    await page.mouse.up({ clickCount: 2 });
    await page.waitForTimeout(300);
    expect((await resizesSince(page, at)).filter((m) => m.final)).toEqual([expect.objectContaining({ width: 380, user: true })]);
    expect((await frameSize(page)).width).toBe(380);

    // A dblclick that arrives while a drag is still on does nothing either.
    const next = await mark(page);
    const q = await handleCenter(frame);
    await page.mouse.move(q.x, q.y);
    await page.mouse.down();
    await page.mouse.move(q.x + 20, q.y);
    await page.waitForTimeout(50);
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('[data-kit-resize]')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, detail: 2 })));
    await page.waitForTimeout(50);
    expect((await resizesSince(page, next)).filter((m) => m.final)).toEqual([]);
    await page.mouse.up();
    await waitForFinal(page, next);
    expect((await resizesSince(page, next)).filter((m) => m.final)).toEqual([expect.objectContaining({ width: 400, user: true })]);
    expect((await writesSince(page, at)).map((w) => w.width)).toEqual([380, 400]);
    expect(await count()).toEqual(baseline);
  });

  test('web fonts that never settle delay the first fit by CONFIG.initTimeoutMs at most', async ({ page }) => {
    // A font request that hangs keeps document.fonts.ready pending forever.
    await patchFile(page, 'ui.html', [['<meta charset="utf-8">', `<meta charset="utf-8"><script>Object.defineProperty(document.fonts, 'ready', { value: new Promise(() => {}) });</${'script'}>`]]);
    await openPreview(page);
    const frame = pluginFrame(page);
    const kit = (await messagesSince(page, { messages: 0 })).filter((m) => typeof m.msg.type === 'string' && m.msg.type.startsWith('kit:'));
    expect(kit.map((m) => `${m.dir} ${m.msg.type}`)).toEqual(['ui kit:ready', 'main kit:init', 'ui kit:resize']);
    expect(await frameSize(page)).toEqual({ width: 320, height: await contentHeight(frame), state: 'shown' });
    // And it keeps fitting afterwards.
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('[data-kit-root] .kit-section')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(5)));
    await page.waitForTimeout(250);
    expect((await frameSize(page)).height).toBe(await contentHeight(frame));
  });

  test('data-kit-config of the wrong shape is ignored with one warning, and the defaults keep working', async ({ page }) => {
    const cases = [
      ['[300, 400]', 'must be a JSON object'],
      ['"snap"', 'must be a JSON object'],
      ['null', 'must be a JSON object'],
      ['{"snapWidths": [], "step": 0.4, "bigStep": 0, "strings": {"resizeLabel": "  ", "other": "x"}}', 'ignored snapWidths, step, bigStep, strings.resizeLabel, strings.other'],
      ['{"initTimeoutMs": -1, "fallbackMode": "floating", "mode": "fixed"}', 'ignored initTimeoutMs, fallbackMode, mode'],
      ['{"snapWidths": [300, 400', 'not valid JSON'],
    ];
    for (const [config, warning] of cases) {
      const warnings = [];
      const onConsole = (m) => { if (m.type() === 'warning' && m.text().includes('data-kit-config')) warnings.push(m.text()); };
      page.on('console', onConsole);
      await openPreview(page, { config });
      const frame = pluginFrame(page);
      expect(warnings, config).toHaveLength(1);
      expect(warnings[0], config).toContain(warning);
      expect(await frame.locator('[data-kit-resize]').getAttribute('aria-label'), config).toBe('Resize window');
      await frame.focus('[data-kit-resize]');
      for (const [key, width] of [['ArrowRight', 328], ['Shift+ArrowRight', 360], ['Enter', 480]]) {
        const at = await mark(page);
        await page.keyboard.press(key);
        await waitForFinal(page, at, 50);
        expect((await resizesSince(page, at))[0], `${config}: ${key}`).toMatchObject({ width, user: true, final: true });
      }
      page.off('console', onConsole);
      await page.evaluate(() => localStorage.clear()); // the next case starts from the default width again
    }
  });
});

test.describe('resizable', () => {
  test('drag changes both sides; Escape after a pending frame still wins; reopen restores width and height', async ({ page }) => {
    await openPreview(page, { mode: 'resizable' });
    let frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    const first = (await resizesSince(page, { messages: 0 }))[0];
    expect(first, 'resizable never auto-fits: the first size is the default, unchanged').toEqual({ type: 'kit:resize', width: 320, height: 360, user: false, final: false });

    let at = await mark(page);
    await drag(page, frame, 80, 60);
    await waitForFinal(page, at);
    expect((await resizesSince(page, at)).filter((m) => m.final)).toEqual([{ type: 'kit:resize', width: 400, height: 420, user: true, final: true }]);
    expect(await frameSize(page)).toEqual({ width: 400, height: 420, state: 'shown' });
    expect(await count()).toEqual(baseline);

    // Hold the plugin's animation frames so a mid-drag size is still queued when Escape lands.
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__realRaf = window.requestAnimationFrame;
      w.__held = [];
      window.requestAnimationFrame = (cb) => { w.__held.push(cb); return 100000 + w.__held.length; };
    });
    at = await mark(page);
    const p = await handleCenter(frame);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y + 20);
    await page.mouse.move(p.x + 50, p.y + 30);
    expect(await frame.evaluate(() => /** @type {any} */ (window).__held.length), 'a frame is pending').toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    // The pending frame fires late: it must not send the dragged size over the revert.
    await frame.evaluate(() => { const w = /** @type {any} */ (window); for (const cb of w.__held.splice(0)) cb(performance.now()); });
    await page.mouse.up();
    await frame.evaluate(() => { const w = /** @type {any} */ (window); window.requestAnimationFrame = w.__realRaf; });
    await page.waitForTimeout(300);
    expect(await resizesSince(page, at)).toEqual([{ type: 'kit:resize', width: 400, height: 420, user: true, final: true }]);
    expect(await frameSize(page)).toEqual({ width: 400, height: 420, state: 'shown' });
    expect(await count()).toEqual(baseline);

    // Keys: Up/Down change the height here; Home resets the width and fits the height to the content.
    await frame.focus('[data-kit-resize]');
    for (const [key, size] of [['ArrowDown', { width: 400, height: 428 }], ['Shift+ArrowUp', { width: 400, height: 396 }], ['Shift+ArrowRight', { width: 432, height: 396 }]]) {
      at = await mark(page);
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
      expect(await resizesSince(page, at), key).toEqual([{ type: 'kit:resize', ...size, user: true, final: true }]);
    }
    at = await mark(page);
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    const home = await resizesSince(page, at);
    expect(home.at(-1)).toMatchObject({ width: 320, height: await contentHeight(frame), user: true, final: true });
    expect(await count()).toEqual(baseline);

    // Back to 400 x 420, then reopen: both sides come back.
    at = await mark(page);
    await frame.focus('[data-kit-resize]');
    await drag(page, frame, 80, 420 - (await frameSize(page)).height);
    await waitForFinal(page, at);
    const saved = (await writesSince(page, at)).at(-1);
    expect(saved).toMatchObject({ width: 400, height: 420 });
    const reopened = await mark(page);
    await host(page, () => window.kitPreviewHost.reload());
    frame = await waitForPlugin(page);
    const init = (await messagesSince(page, reopened)).find((m) => m.msg.type === 'kit:init').msg;
    expect(init).toMatchObject({ mode: 'resizable', restored: true, size: { width: 400, height: 420 } });
    expect((await resizesSince(page, reopened))[0]).toEqual({ type: 'kit:resize', width: 400, height: 420, user: false, final: false });
    expect(await frameSize(page)).toEqual({ width: 400, height: 420, state: 'shown' });
    expect(await count(), 'the new window starts with the same listeners').toEqual(baseline);
  });

  test('fast keys add up on both sides, and a key right after Home starts from where Home put the window', async ({ page }) => {
    await openPreview(page, { mode: 'resizable' });
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    await frame.focus('[data-kit-resize]');
    // No waits: most presses arrive before the previous size has reached the viewport.
    let at = await mark(page);
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    const keys = (await resizesSince(page, at)).filter((m) => m.user);
    expect(keys.map((m) => `${m.width}x${m.height}`)).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `320x${368 + 8 * i}`),
      ...Array.from({ length: 10 }, (_, i) => `${328 + 8 * i}x440`),
    ]);
    expect(await frameSize(page)).toEqual({ width: 400, height: 440, state: 'shown' });

    at = await mark(page);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    const user = (await resizesSince(page, at)).filter((m) => m.user);
    const [home, down] = [user[0], user[user.length - 1]];
    expect(home).toMatchObject({ width: 320, final: true });
    expect(down, 'Down adds to the height Home asked for, and nothing comes after it').toEqual({ ...home, height: home.height + 8 });
    // In between, at most Home's own refit (when its width landed before Down), at Home's size.
    expect(user.slice(1, -1).filter((m) => m.width !== home.width || m.height !== home.height)).toEqual([]);
    expect(await frameSize(page)).toEqual({ width: 320, height: home.height + 8, state: 'shown' });
    expect(await count()).toEqual(baseline);
  });
});

test.describe('a host that applies resizes late', () => {
  // Figma resizes the iframe from another process: kit:init, posted after the restore's
  // figma.ui.resize, can arrive while the viewport still has the default size.
  for (const mode of ['fit-content', 'resizable']) {
    test(`${mode}: the restored size survives reopening`, async ({ page }) => {
      await openPreview(page, { mode });
      let frame = pluginFrame(page);
      const at = await mark(page);
      await drag(page, frame, 80, mode === 'resizable' ? 60 : 0);
      await waitForFinal(page, at);
      await host(page, () => window.kitPreviewHost.setResizeLag(40));
      const reopened = await mark(page);
      await host(page, () => window.kitPreviewHost.reload());
      frame = await waitForPlugin(page);
      await page.waitForTimeout(300);
      const init = (await messagesSince(page, reopened)).find((m) => m.msg.type === 'kit:init').msg;
      expect(init).toMatchObject({ restored: true, size: { width: 400 } });
      const first = (await resizesSince(page, reopened))[0];
      const expected = mode === 'resizable' ? { width: 400, height: 420 } : { width: 400, height: await contentHeight(frame) };
      expect(first, 'the first request is the restored size, not the lagging viewport').toMatchObject({ width: 400, user: false });
      expect(await frameSize(page)).toEqual({ ...expected, state: 'shown' });
      expect(await writesSince(page, reopened), 'reopening writes nothing').toEqual([]);
    });
  }

  test('fit-content: a drag and a key still end at the size asked for', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await host(page, () => window.kitPreviewHost.setResizeLag(40));
    let at = await mark(page);
    await drag(page, frame, 80, 0);
    await waitForFinal(page, at, 300);
    expect(await frameSize(page)).toEqual({ width: 400, height: await contentHeight(frame), state: 'shown' });
    await frame.focus('[data-kit-resize]');
    at = await mark(page);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect((await resizesSince(page, at)).filter((m) => m.user).map((m) => m.width)).toEqual([408, 416, 424]);
    expect(await frameSize(page)).toEqual({ width: 424, height: await contentHeight(frame), state: 'shown' });
  });
});

test.describe('a main thread that answers late', () => {
  // Main busy for longer than CONFIG.initTimeoutMs: the UI falls back and fits before kit:init
  // arrives, and main applies that fallback fit after it has already sent kit:init. Every
  // UI -> main message is handed to code.js's listeners LATE ms after it arrives.
  const LATE = 800;
  const lateMain = (page) => patchFile(page, 'code.js', [['// ---- Your plugin starts here ----',
    '// ---- Your plugin starts here ----\n{ const on = figma.ui.on.bind(figma.ui);'
    + ` figma.ui.on = (type, fn) => on(type, (msg, props) => setTimeout(() => fn(msg, props), ${LATE})); }`]]);

  for (const mode of ['fit-content', 'resizable', 'fixed']) {
    test(`${mode}: the window ends at the size it gets without the delay`, async ({ page }) => {
      await lateMain(page);
      await openPreview(page, { mode });
      const frame = pluginFrame(page);
      await page.waitForTimeout(2 * LATE + 600);
      const kit = (await messagesSince(page, { messages: 0 }))
        .filter((m) => typeof m.msg.type === 'string' && m.msg.type.startsWith('kit:')).map((m) => `${m.dir} ${m.msg.type}`);
      expect(kit.indexOf('ui kit:resize'), 'the UI fell back and fitted before kit:init').toBeLessThan(kit.indexOf('main kit:init'));
      expect(kit.indexOf('ui kit:resize')).toBeGreaterThan(-1);
      const expected = mode === 'fit-content' ? { width: 320, height: Math.max(BOUNDS.minHeight, await contentHeight(frame)) } : { width: 320, height: 360 };
      expect(await frameSize(page)).toEqual({ ...expected, state: 'shown' });
      expect(await frame.evaluate(() => document.documentElement.dataset.kitChrome)).toBe(mode === 'fixed' ? 'off' : 'on');
      expect(await writesSince(page, { calls: 0 }), 'nothing the person did, so nothing is saved').toEqual([]);
    });
  }
});

test.describe('fixed, and no host at all', () => {
  test('fixed: shown at its size from the start; no chrome, no handle, and the kit never asks for a size', async ({ page }) => {
    await openPreview(page, { mode: 'fixed' });
    const frame = pluginFrame(page);
    await page.waitForTimeout(600); // past both 500 ms fallbacks
    const kit = (await messagesSince(page, { messages: 0 })).filter((m) => typeof m.msg.type === 'string' && m.msg.type.startsWith('kit:'));
    expect(kit.map((m) => `${m.dir} ${m.msg.type}`)).toEqual(['ui kit:ready', 'main kit:init']);
    expect(kit[1].msg).toMatchObject({ mode: 'fixed', chrome: true, size: { width: 320, height: 360 } });
    expect((await callsSince(page, { calls: 0 }, 'showUI'))[0].args[0]).toMatchObject({ width: 320, height: 360, visible: true });
    expect(await frameSize(page)).toEqual({ width: 320, height: 360, state: 'shown' });
    expect(await frame.evaluate(() => ({
      chrome: document.documentElement.dataset.kitChrome, mode: document.documentElement.dataset.kitMode,
      handleHidden: /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]')).hidden,
    }))).toEqual({ chrome: 'off', mode: 'fixed', handleHidden: true });

    // Gestures aimed at the hidden handle, and kit.fit(), send nothing.
    const at = await mark(page);
    await frame.evaluate(() => {
      const handle = /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]'));
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, detail: 2 }));
      for (const key of ['ArrowRight', 'ArrowDown', 'Enter', ' ', 'Home']) handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      window.kit.fit();
    });
    await frame.evaluate(() => /** @type {Element} */ (document.querySelector('[data-kit-root] .kit-section')).insertAdjacentHTML('beforeend', '<p class="kit-help">Row</p>'.repeat(5)));
    await page.waitForTimeout(300);
    expect(await messagesSince(page, at)).toEqual([]);
    expect(await frameSize(page)).toEqual({ width: 320, height: 360, state: 'shown' });
  });

  test('ui.html opened straight in a browser: after CONFIG.initTimeoutMs it fits on its own, chrome off', async ({ page }) => {
    const noise = [];
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') noise.push(`${m.type()}: ${m.text()}`); });
    await page.goto('/ui.html');
    await page.waitForFunction(() => document.documentElement.dataset.kitChrome !== undefined);
    const ui = await page.evaluate(() => ({
      at: performance.now(), chrome: document.documentElement.dataset.kitChrome, mode: document.documentElement.dataset.kitMode,
      handleHidden: /** @type {HTMLElement} */ (document.querySelector('[data-kit-resize]')).hidden, version: window.kit.version,
    }));
    expect(ui.at, 'the runtime waited for kit:init first').toBeGreaterThanOrEqual(500);
    expect(ui).toMatchObject({ chrome: 'off', mode: 'fit-content', handleHidden: true, version: '0.4.0' });
    // No chrome: the grip corner is not reserved.
    expect(await page.evaluate(() => getComputedStyle(/** @type {Element} */ (document.querySelector('.kit-app'))).paddingBottom)).toBe('0px');
    await page.waitForTimeout(200);
    expect(noise).toEqual([]);
  });
});

test('a whole session logs no errors and no warnings', async ({ page }) => {
  const noise = [];
  page.on('console', (m) => { if ((m.type() === 'warning' || m.type() === 'error') && !isMissingExample(m)) noise.push(`${m.type()}: ${m.text()}`); });
  await openPreview(page);
  const frame = pluginFrame(page);
  const at = await mark(page);
  await drag(page, frame, 60, 0);
  await waitForFinal(page, at);
  await drag(page, frame, 40, 0, { beforeUp: () => page.keyboard.press('Escape') });
  const p = await handleCenter(frame);
  await page.mouse.dblclick(p.x, p.y);
  await frame.focus('[data-kit-resize]');
  for (const key of ['ArrowRight', 'Shift+ArrowLeft', 'Home', 'Enter']) await page.keyboard.press(key);
  await host(page, () => window.kitPreviewHost.reload());
  await waitForPlugin(page);
  await page.waitForTimeout(300);
  expect(noise).toEqual([]);
});
