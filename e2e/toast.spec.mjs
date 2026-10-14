// The toast (stateful component #3), end to end: kit.toast() from the runtime in the kit fixture
// (useKitFixture: ui.html's kit blocks, not the starter's demo), inside preview.html's fake Figma host.
// Covers: the live region (created at the first toast, aria-live="polite", fixed at the bottom centre
// above the resize handle, the first toast added only once the region exists, no refit); the queue
// (first in, first out, one shown at a time, each for its duration, 0 until dismissed); the timer
// pausing under the pointer and with focus inside, then resuming with the time left; Escape inside a
// toast (and only there); the action (onClick, then dismissed), the close button and dismiss() for
// shown and queued toasts; role="alert" for danger only; the close button's name from
// CONFIG.strings.dismiss; the look (inverse surface, 5px radius, 32px, tone icon colours); reduced
// motion; focus given back when a focused toast goes; a wide toast clear of the resize handle;
// toasts inside an open modal dialog (not inert; the top one when nested) and back out when it closes; axe with a
// toast and a dialog open; listener counts; and the live demo in preview.html's gallery.
// Behaviour notes: docs/components.md, "Toast".

import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, openPreview, pluginFrame, mark, messagesSince, listenerCounter, patchFile, useKitFixture } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await useKitFixture(page); });

/** The texts of the toasts in the plugin page, in order (one at most, when the queue works). */
const shown = (frame) => frame.evaluate(() => [...document.querySelectorAll('.kit-toast')].map((t) => /** @type {Element} */ (t.querySelector('.kit-toast-text')).textContent));
/** kit.toast(message, options) in the plugin page; the handle goes to window.__handles. */
const fire = (frame, message, options) => frame.evaluate(([m, o]) => {
  const w = /** @type {any} */ (window);
  w.__handles = w.__handles || [];
  w.__handles.push(window.kit.toast(m, o));
}, [message, options]);
const axe = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']);
const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

/** Event listener types on one object of the plugin page, through CDP (as helpers.mjs counts the handle's). */
async function listenersOf(page, expression) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = new Map();
  cdp.on('Runtime.executionContextCreated', ({ context }) => { if (context.auxData && context.auxData.isDefault) contexts.set(context.auxData.frameId, context.id); });
  await cdp.send('Runtime.enable');
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const child = (frameTree.childFrames || []).find((c) => c.frame.name === 'kit-plugin');
  let session = cdp;
  const contextId = child ? contexts.get(child.frame.id) : undefined;
  if (contextId === undefined) {
    session = await page.context().newCDPSession(pluginFrame(page));
    await session.send('Runtime.enable');
  }
  try {
    const { result } = await session.send('Runtime.evaluate', { expression, contextId });
    if (!result.objectId) throw new Error(`no object for ${expression}`);
    const { listeners } = await session.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    return listeners.map((l) => l.type).sort();
  } finally {
    if (session !== cdp) await session.detach();
    await cdp.detach();
  }
}

test.describe('toast', () => {
  test('the region is made at the first toast: aria-live="polite", fixed at the bottom centre above the resize handle; the toast follows once the region exists; no refit', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    expect(await frame.locator('.kit-toast-region').count(), 'nothing before the first toast').toBe(0);
    const at = await mark(page);
    const first = await frame.evaluate(() => {
      window.kit.toast('Renamed 3 layers');
      const r = document.querySelector('.kit-toast-region');
      return r && { live: r.getAttribute('aria-live'), children: r.children.length, parent: r.parentElement && r.parentElement.tagName };
    });
    expect(first, 'the region exists at once, empty: a live region speaks only about changes').toEqual({ live: 'polite', children: 0, parent: 'BODY' });
    await expect.poll(() => shown(frame)).toEqual(['Renamed 3 layers']);
    const geo = await frame.evaluate(() => {
      const region = /** @type {Element} */ (document.querySelector('.kit-toast-region'));
      const r = region.getBoundingClientRect();
      return {
        position: getComputedStyle(region).position, centre: Math.round((r.left + r.right) / 2), half: Math.round(innerWidth / 2), gap: Math.round(innerHeight - r.bottom),
        above: Number(getComputedStyle(region).zIndex) > Number(getComputedStyle(/** @type {Element} */ (document.querySelector('[data-kit-resize]'))).zIndex),
      };
    });
    expect(geo).toMatchObject({ position: 'fixed', gap: 8, above: true });
    expect(Math.abs(geo.centre - geo.half)).toBeLessThanOrEqual(1);
    expect(await frame.locator('.kit-toast-region').count(), 'one region').toBe(1);
    expect((await messagesSince(page, at)).filter((m) => m.dir === 'ui'), 'a toast never refits the window').toEqual([]);
  });

  test('the queue: first in, first out, one shown at a time, each for its own duration; 0 stays until dismissed', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__log = [];
      w.__most = 0;
      new MutationObserver(() => {
        const toasts = document.querySelectorAll('.kit-toast');
        w.__most = Math.max(w.__most, toasts.length);
        const text = toasts.length ? /** @type {Element} */ (toasts[0].querySelector('.kit-toast-text')).textContent : null;
        if (text !== null && (!w.__log.length || w.__log[w.__log.length - 1].text !== text)) w.__log.push({ text, at: performance.now() });
      }).observe(document.body, { childList: true, subtree: true });
    });
    await fire(frame, 'A', { duration: 400 });
    await fire(frame, 'B', { duration: 600 });
    await fire(frame, 'C', { duration: 0 });
    await expect.poll(() => shown(frame), { timeout: 5000 }).toEqual(['C']);
    await page.waitForTimeout(1200);
    expect(await shown(frame), 'duration 0: until dismissed').toEqual(['C']);
    const { log, most } = await frame.evaluate(() => ({ log: /** @type {any} */ (window).__log, most: /** @type {any} */ (window).__most }));
    expect(log.map((e) => e.text)).toEqual(['A', 'B', 'C']);
    expect(most, 'never two at once').toBe(1);
    const a = log[1].at - log[0].at;
    const b = log[2].at - log[1].at;
    expect(a, 'A shown about 400 ms').toBeGreaterThanOrEqual(380);
    expect(a).toBeLessThan(1400);
    expect(b, 'B shown about 600 ms').toBeGreaterThanOrEqual(580);
    expect(b).toBeLessThan(1600);
  });

  test('the timer pauses under the pointer and while focus is inside, then resumes with the time left', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await fire(frame, 'Hover me', { duration: 700 });
    await expect.poll(() => shown(frame)).toEqual(['Hover me']);
    const box = await frame.locator('.kit-toast').boundingBox();
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await page.waitForTimeout(1500);
    expect(await shown(frame), 'kept while hovered').toEqual(['Hover me']);
    await page.mouse.move(1, 1);
    const left = Date.now();
    await page.waitForTimeout(150);
    expect(await shown(frame), 'resumes, not restarts at 0').toEqual(['Hover me']);
    await expect.poll(() => shown(frame), { timeout: 3000 }).toEqual([]);
    expect(Date.now() - left, 'about the time that was left').toBeLessThan(2000);

    await fire(frame, 'Focus me', { duration: 600 });
    await expect.poll(() => shown(frame)).toEqual(['Focus me']);
    await frame.focus('.kit-toast .kit-icon-button');
    await page.waitForTimeout(1300);
    expect(await shown(frame), 'kept while focus is inside').toEqual(['Focus me']);
    await frame.focus('#fixture-name');
    await expect.poll(() => shown(frame), { timeout: 3000 }).toEqual([]);
  });

  test('Escape dismisses the toast that has focus, without reaching the host\'s Escape handler; Escape elsewhere leaves it', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__hostEscapes = 0;
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') w.__hostEscapes++; });
    });
    await fire(frame, 'Sticky', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Sticky']);
    await frame.focus('#fixture-name');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await shown(frame), 'focus is not in the toast').toEqual(['Sticky']);
    await frame.focus('.kit-toast .kit-icon-button');
    await page.keyboard.press('Escape');
    await expect.poll(() => shown(frame)).toEqual([]);
    expect(await frame.evaluate(() => /** @type {any} */ (window).__hostEscapes), 'only the first Escape reached the host').toBe(1);
  });

  test('the action runs its onClick, then dismisses; the close button dismisses; dismiss() takes out a shown or a queued toast, and twice is safe', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__ran = [];
      window.kit.toast('Deleted 2 layers', { duration: 0, action: { label: 'Undo', onClick: () => w.__ran.push(document.querySelectorAll('.kit-toast').length) } });
    });
    await expect.poll(() => shown(frame)).toEqual(['Deleted 2 layers']);
    const action = frame.locator('.kit-toast .kit-button');
    await expect(action).toHaveText('Undo');
    await action.click();
    await expect.poll(() => shown(frame)).toEqual([]);
    expect(await frame.evaluate(() => /** @type {any} */ (window).__ran), 'onClick ran once, while the toast was still there').toEqual([1]);

    await fire(frame, 'Close me', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Close me']);
    await frame.click('.kit-toast .kit-icon-button');
    await expect.poll(() => shown(frame)).toEqual([]);

    await frame.evaluate(() => { /** @type {any} */ (window).__handles = []; });
    await fire(frame, 'One', { duration: 0 });
    await fire(frame, 'Two', { duration: 0 });
    await fire(frame, 'Three', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['One']);
    await frame.evaluate(() => /** @type {any} */ (window).__handles[1].dismiss()); // Two, still queued
    await frame.evaluate(() => /** @type {any} */ (window).__handles[0].dismiss());
    await expect.poll(() => shown(frame)).toEqual(['Three']);
    await frame.evaluate(() => { const h = /** @type {any} */ (window).__handles; h[0].dismiss(); h[1].dismiss(); });
    await page.waitForTimeout(100);
    expect(await shown(frame), 'dismissing again changes nothing').toEqual(['Three']);
    await frame.evaluate(() => /** @type {any} */ (window).__handles[2].dismiss());
    await expect.poll(() => shown(frame)).toEqual([]);
  });

  test('a toast dismissed while it holds focus gives focus back to where it came from: Enter on the close button, Escape, the action, dismiss()', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const focus = () => frame.evaluate(() => {
      const el = document.activeElement;
      return !el ? null : el.matches('[data-kit-resize]') ? 'handle' : el.closest('.kit-toast') ? `toast ${el.textContent || el.getAttribute('aria-label')}` : el.id || el.tagName;
    });
    for (const how of ['Enter on Dismiss', 'Escape', 'Enter on Undo', 'dismiss()']) {
      await frame.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__h = window.kit.toast('Deleted 2 layers', { duration: 0, action: { label: 'Undo', onClick() {} } });
      });
      await expect.poll(() => shown(frame)).toEqual(['Deleted 2 layers']);
      // The keyboard way in: Tab from the resize handle (the toast region is the last thing in the page).
      await frame.focus('[data-kit-resize]');
      await page.keyboard.press('Tab');
      expect(await focus(), how).toBe('toast Undo');
      if (how === 'Enter on Dismiss') {
        await page.keyboard.press('Tab');
        expect(await focus()).toBe('toast Dismiss');
        await page.keyboard.press('Enter');
      } else if (how === 'Escape') await page.keyboard.press('Escape');
      else if (how === 'Enter on Undo') await page.keyboard.press('Enter');
      else await frame.evaluate(() => /** @type {any} */ (window).__h.dismiss());
      await expect.poll(() => shown(frame)).toEqual([]);
      expect(await focus(), `${how}: focus is back on the handle`).toBe('handle');
    }
    // Focus that is not in the toast stays where it is.
    await fire(frame, 'Saved', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Saved']);
    await frame.focus('.kit-toast .kit-icon-button');
    await frame.focus('#fixture-name');
    await frame.evaluate(() => /** @type {any} */ (window).__handles.pop().dismiss());
    await expect.poll(() => shown(frame)).toEqual([]);
    expect(await focus()).toBe('fixture-name');
  });

  test('a wide toast keeps clear of the resize handle while the chrome is on', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      window.kit.toast('Couldn\'t export 2 layers because they are hidden or locked in this file', { tone: 'danger', duration: 0, action: { label: 'Show', onClick() {} } });
    });
    await expect.poll(() => frame.locator('.kit-toast').count()).toBe(1);
    const geo = await frame.evaluate(() => {
      const t = /** @type {Element} */ (document.querySelector('.kit-toast')).getBoundingClientRect();
      const h = /** @type {Element} */ (document.querySelector('[data-kit-resize]')).getBoundingClientRect();
      const hit = document.elementFromPoint(h.left + 1, h.top + 1);
      return { toast: { left: t.left, right: t.right, bottom: t.bottom }, handle: { left: h.left, top: h.top }, width: innerWidth, hit: hit && hit.matches('[data-kit-resize]') };
    });
    expect(geo.toast.right, 'the toast ends left of the handle').toBeLessThanOrEqual(geo.handle.left);
    expect(geo.toast.left, 'still centred').toBeCloseTo(geo.width - geo.toast.right, 0);
    expect(geo.hit, 'the whole handle takes the pointer').toBe(true);
  });

  test('with a sticky footer the toast sits above it, so it never covers the footer\'s buttons', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      const root = /** @type {Element} */ (document.querySelector('[data-kit-root]'));
      root.insertAdjacentHTML('beforeend', '<footer class="kit-footer"><button class="kit-button kit-button-primary" type="button">Apply</button></footer>');
      window.kit.toast('Saved 3 colours', { duration: 0 });
    });
    await expect.poll(() => frame.locator('.kit-toast').count()).toBe(1);
    // Measure once the slide-in has finished and the fit-content window has refitted to the footer.
    await frame.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    await expect.poll(() => frame.evaluate(() => Math.round(innerHeight - /** @type {Element} */ (document.querySelector('.kit-footer')).getBoundingClientRect().bottom))).toBe(0);
    const geo = await frame.evaluate(() => {
      const t = /** @type {Element} */ (document.querySelector('.kit-toast')).getBoundingClientRect();
      const f = /** @type {Element} */ (document.querySelector('.kit-footer')).getBoundingClientRect();
      const b = /** @type {Element} */ (document.querySelector('.kit-footer .kit-button')).getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { toastBottom: t.bottom, footerTop: f.top, footerAtBottom: Math.round(innerHeight - f.bottom), hit: hit && hit.matches('.kit-footer .kit-button') };
    });
    expect(geo.footerAtBottom, 'the footer sits at the bottom of the window').toBe(0);
    expect(geo.toastBottom, 'the toast ends above the footer').toBeLessThanOrEqual(geo.footerTop);
    expect(geo.hit, 'the footer button still takes the pointer').toBe(true);
  });

  test('with nested dialogs open the region goes to the top one, also when focus has fallen to <body>; its toast takes clicks', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      document.querySelector('[data-kit-root]').insertAdjacentHTML('beforeend', `
        <dialog class="kit-dialog" id="a" aria-labelledby="a-title"><header class="kit-dialog-header"><h2 id="a-title">Rename</h2></header>
          <div class="kit-dialog-body"><button class="kit-button kit-button-secondary" type="button" id="a-open" data-kit-dialog-open="b">Delete…</button></div></dialog>
        <dialog class="kit-dialog kit-dialog-small" id="b" aria-labelledby="b-title"><header class="kit-dialog-header"><h2 id="b-title">Delete 3 layers?</h2></header>
          <div class="kit-dialog-body"><p class="kit-text-secondary" id="b-text">They are removed with their children.</p><button class="kit-button kit-button-secondary" type="button" id="b-ok" data-kit-dialog-close value="ok">OK</button></div></dialog>`);
    });
    await frame.evaluate(() => { window.kit.dialog('a'); });
    await frame.click('#a-open');
    await expect.poll(() => frame.evaluate(() => document.activeElement && document.activeElement.id)).toBe('b-ok');
    await frame.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).blur()); // e.g. the host replaced the focused button
    expect(await frame.evaluate(() => document.activeElement === document.body)).toBe(true);
    await fire(frame, 'Copied 3 names', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Copied 3 names']);
    expect(await frame.evaluate(() => /** @type {Element} */ (document.querySelector('.kit-toast-region')).parentElement.id)).toBe('b');
    await frame.click('.kit-toast .kit-icon-button');
    await expect.poll(() => shown(frame)).toEqual([]);
    // b closes: back into a (the opener there has focus again).
    await fire(frame, 'Second', { duration: 0 });
    await frame.click('#b-ok');
    await expect.poll(() => frame.evaluate(() => /** @type {Element} */ (document.querySelector('.kit-toast-region')).parentElement.id)).toBe('a');
  });

  test('semantics: the region is polite, a danger toast is role="alert" and the others have no role; icons are hidden; the close button is named "Dismiss"; an unknown tone draws no icon', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const look = () => frame.evaluate(() => {
      const t = /** @type {HTMLElement} */ (document.querySelector('.kit-toast'));
      const icon = t.querySelector(':scope > svg');
      return { role: t.getAttribute('role'), tone: t.dataset.kitTone || null, icon: icon ? icon.getAttribute('aria-hidden') : null, live: /** @type {Element} */ (t.parentElement).getAttribute('aria-live') };
    });
    for (const [tone, want] of [['success', { role: null, tone: 'success', icon: 'true' }], ['danger', { role: 'alert', tone: 'danger', icon: 'true' }], ['info', { role: null, tone: 'info', icon: 'true' }], ['warning', { role: null, tone: 'warning', icon: 'true' }], [undefined, { role: null, tone: null, icon: null }], ['loud', { role: null, tone: null, icon: null }]]) {
      await fire(frame, `Tone ${tone}`, { tone, duration: 0 });
      await expect.poll(() => shown(frame)).toEqual([`Tone ${tone}`]);
      expect(await look(), String(tone)).toEqual({ ...want, live: 'polite' });
      await expect(frame.locator('.kit-toast .kit-icon-button')).toHaveAccessibleName('Dismiss');
      await frame.evaluate(() => /** @type {any} */ (window).__handles.pop().dismiss());
      await expect.poll(() => shown(frame)).toEqual([]);
    }
  });

  test('data-kit-config strings.dismiss names the close button', async ({ page }) => {
    await patchFile(page, 'ui.html', [['</head>', '<script type="application/json" data-kit-config>{"strings": {"dismiss": "Schließen"}}</script>\n</head>']]);
    await openPreview(page);
    const frame = pluginFrame(page);
    await fire(frame, 'Gespeichert', { duration: 0 });
    await expect(frame.locator('.kit-toast .kit-icon-button')).toHaveAccessibleName('Schließen');
  });

  test('look: the inverse surface, radius 5px, at least 32px, the tooltip shadow; icons in bg-success and bg-danger, the others in icon-oninverse; buttons stay readable when hovered', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await openPreview(page, { theme });
      const frame = pluginFrame(page);
      const token = (name) => frame.evaluate((n) => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.color = `var(${n})`;
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }, name);
      const iconColour = async (tone) => {
        await fire(frame, `Look ${tone}`, { tone, duration: 0 });
        await expect.poll(() => shown(frame)).toEqual([`Look ${tone}`]);
        const s = await frame.evaluate(() => {
          const t = /** @type {Element} */ (document.querySelector('.kit-toast'));
          const c = getComputedStyle(t);
          return { icon: getComputedStyle(/** @type {Element} */ (t.querySelector(':scope > svg'))).color, bg: c.backgroundColor, color: c.color, radius: c.borderRadius, height: /** @type {HTMLElement} */ (t).offsetHeight, shadow: c.boxShadow !== 'none' };
        });
        await frame.evaluate(() => /** @type {any} */ (window).__handles.pop().dismiss());
        return s;
      };
      const success = await iconColour('success');
      expect(success).toMatchObject({ bg: await token('--figma-color-bg-inverse'), color: await token('--figma-color-text-oninverse'), radius: '5px', shadow: true });
      expect(success.height).toBeGreaterThanOrEqual(32);
      // The solid fills, not icon-success / icon-danger: Figma's dark icon tints fall below 3:1 on the
      // white toast (docs/accessibility.md, toast icons on the inverse surface).
      expect(success.icon).toBe(await token('--figma-color-bg-success'));
      expect((await iconColour('danger')).icon).toBe(await token('--figma-color-bg-danger'));
      expect((await iconColour('info')).icon).toBe(await token('--figma-color-icon-oninverse'));
      expect((await iconColour('warning')).icon).toBe(await token('--figma-color-icon-oninverse'));
      // The close button keeps the oninverse colour under the pointer (an icon button would turn icon-hover).
      await fire(frame, 'Hover the close button', { duration: 0 });
      await expect.poll(() => shown(frame)).toEqual(['Hover the close button']);
      await frame.hover('.kit-toast .kit-icon-button');
      const hovered = await frame.evaluate(() => {
        const b = /** @type {Element} */ (document.querySelector('.kit-toast .kit-icon-button'));
        return { color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor };
      });
      expect(hovered.color).toBe(await token('--figma-color-text-oninverse'));
      expect(hovered.bg, 'a hover fill').not.toBe('rgba(0, 0, 0, 0)');
      await frame.evaluate(() => /** @type {any} */ (window).__handles.pop().dismiss());
    }
  });

  test('motion: a toast slides in, except with prefers-reduced-motion', async ({ page }) => {
    await openPreview(page);
    let frame = pluginFrame(page);
    await fire(frame, 'Slides', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Slides']);
    expect(await frame.evaluate(() => getComputedStyle(/** @type {Element} */ (document.querySelector('.kit-toast'))).animationName)).toBe('kit-toast-in');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPreview(page);
    frame = pluginFrame(page);
    await fire(frame, 'Still', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Still']);
    expect(await frame.evaluate(() => getComputedStyle(/** @type {Element} */ (document.querySelector('.kit-toast'))).animationName)).toBe('none');
  });

  test('with a modal dialog open the region moves into it (the page behind is inert) and back out when it closes; axe is clean with a toast and a dialog open', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    await frame.evaluate(() => {
      document.querySelector('[data-kit-root]').insertAdjacentHTML('beforeend', `<dialog class="kit-dialog" id="d" aria-labelledby="d-title">
        <header class="kit-dialog-header"><h2 id="d-title">Export</h2><button class="kit-icon-button" type="button" data-kit-dialog-close aria-label="Close"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8" fill="none" stroke="currentColor"/></svg></button></header>
        <div class="kit-dialog-body"><div class="kit-field"><label class="kit-label" for="d-name">File name</label><input class="kit-input" id="d-name" type="text" value="Frame"></div></div>
        <footer class="kit-dialog-footer"><button class="kit-button kit-button-primary" type="button" data-kit-dialog-close value="export">Export</button></footer></dialog>`);
    });
    const where = () => frame.evaluate(() => {
      const r = document.querySelector('.kit-toast-region');
      const t = document.querySelector('.kit-toast');
      const box = t ? t.getBoundingClientRect() : null;
      return { parent: r && r.parentElement && (r.parentElement.id || r.parentElement.tagName), visible: !!box && box.width > 0 && box.height > 0 };
    });
    await frame.evaluate(() => { window.kit.dialog('d'); });
    await expect.poll(() => frame.evaluate(() => document.activeElement && document.activeElement.id)).toBe('d-name');
    await fire(frame, 'Exported Frame.png', { tone: 'success', duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Exported Frame.png']);
    expect(await where()).toEqual({ parent: 'd', visible: true });
    // Not inert: the close button inside the dialog's region takes focus.
    await frame.focus('.kit-toast .kit-icon-button');
    expect(await frame.evaluate(() => /** @type {Element} */ (document.activeElement).matches('.kit-toast .kit-icon-button'))).toBe(true);
    expect(summary((await axe(page).include('#live-frame').analyze()).violations), 'a toast and a dialog open').toEqual([]);
    await frame.focus('#d-name');
    await page.keyboard.press('Escape'); // closes the dialog, not the toast
    await expect.poll(where).toEqual({ parent: 'BODY', visible: true });
    expect(await shown(frame)).toEqual(['Exported Frame.png']);
    // A dialog that opens while a toast shows takes the region in.
    await frame.evaluate(() => { window.kit.dialog('d'); });
    await expect.poll(where).toEqual({ parent: 'd', visible: true });
    await frame.click('#d [value="export"]');
    await expect.poll(where).toEqual({ parent: 'BODY', visible: true });
    expect(summary((await axe(page).include('#live-frame').analyze()).violations), 'a toast open').toEqual([]);
    // Escape inside a toast that sits in an open dialog closes the toast, not the dialog.
    await frame.evaluate(() => { window.kit.dialog('d'); });
    await expect.poll(where).toEqual({ parent: 'd', visible: true });
    await frame.focus('.kit-toast .kit-icon-button');
    await page.keyboard.press('Escape');
    await expect.poll(() => shown(frame)).toEqual([]);
    expect(await frame.evaluate(() => /** @type {HTMLDialogElement} */ (document.getElementById('d')).open), 'the dialog stays open').toBe(true);
  });

  test('listeners: toasts add none to document, window or the handle; a dismissed toast keeps none of its own', async ({ page }) => {
    await openPreview(page);
    const frame = pluginFrame(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__h = window.kit.toast('Listen', { duration: 0, action: { label: 'Undo', onClick() {} } });
    });
    await expect.poll(() => shown(frame)).toEqual(['Listen']);
    await frame.evaluate(() => { /** @type {any} */ (window).__el = document.querySelector('.kit-toast'); });
    expect(await count(), 'nothing on document, window or the handle').toEqual(baseline);
    expect(await listenersOf(page, 'window.__el')).toEqual(['click', 'focusin', 'focusout', 'keydown', 'mouseenter', 'mouseleave']);
    await frame.evaluate(() => /** @type {any} */ (window).__h.dismiss());
    await expect.poll(() => shown(frame)).toEqual([]);
    expect(await listenersOf(page, 'window.__el'), 'released when the toast is removed').toEqual([]);
    expect(await listenersOf(page, "document.querySelector('.kit-toast-region')"), 'the region has none').toEqual([]);
    expect(await count()).toEqual(baseline);
    // Timers too: a timed toast dismissed early leaves nothing that fires later.
    await fire(frame, 'Short', { duration: 300 });
    await fire(frame, 'Next', { duration: 0 });
    await expect.poll(() => shown(frame)).toEqual(['Short']);
    await frame.evaluate(() => /** @type {any} */ (window).__handles[0].dismiss());
    await expect.poll(() => shown(frame)).toEqual(['Next']);
    await page.waitForTimeout(600);
    expect(await shown(frame), 'the dismissed toast\'s timer did not take the next one').toEqual(['Next']);
  });

  // preview.html's own runtime block runs the live toasts in the gallery.
  test('the gallery demo: three queued toasts and a toast with an action, in the preview page itself', async ({ page }) => {
    await openPreview(page);
    test.skip(await page.locator('#g-toast-queue').count() === 0, 'preview.html has no live toast demo');
    const texts = () => page.evaluate(() => [...document.querySelectorAll('.kit-toast-region .kit-toast-text')].map((t) => t.textContent));
    await page.locator('#g-toast-queue').scrollIntoViewIfNeeded();
    await page.click('#g-toast-queue');
    await expect.poll(texts).toEqual(['Renamed 3 layers']);
    await page.click('.kit-toast-region .kit-icon-button');
    await expect.poll(texts).toEqual(['2 layers have no fill']);
    await page.click('.kit-toast-region .kit-icon-button');
    await expect.poll(texts).toEqual(['Export failed: the frame is empty']);
    await expect(page.locator('.kit-toast-region .kit-toast')).toHaveAttribute('role', 'alert');
    expect(summary((await axe(page).analyze()).violations), 'the page with a toast').toEqual([]);
    await page.click('#g-toast-action');
    await page.click('.kit-toast-region .kit-icon-button');
    await expect.poll(texts).toEqual(['Deleted 2 layers']);
    await page.click('.kit-toast-region .kit-button');
    await expect(page.locator('#g-toast-result')).toHaveText('Undo: ran');
    await expect.poll(texts).toEqual([]);
  });
});
