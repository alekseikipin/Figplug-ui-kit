// The dialog (stateful component #2), end to end: the runtime's dialog code in the kit fixture
// (useKitFixture: ui.html's kit blocks, not the starter's demo), inside preview.html's fake Figma
// host. The markup below is added to the plugin's [data-kit-root] at run time (the runtime listens
// on document, so dialogs added after boot work).
// Covers: openers (data-kit-dialog-open) and kit.dialog(id | element); showModal() semantics (modal,
// top layer, the window is not refitted); first focus (the body's first field, else the close
// button, [autofocus] first); focus back to the opener or to what had focus; Escape resolves '' even
// after a dialog closed with a value; close buttons resolve their value; a host's preventDefault()
// keeps it open; aria-disabled openers do nothing; a missing dialog warns (opener) or rejects
// (kit.dialog); backdrop clicks are ignored unless data-kit-dialog-light-dismiss; Tab never reaches
// the inert page behind; a second dialog opened from inside the first; kit.dialog() on an open dialog
// waits for the same close; a close event still queued from an earlier close never settles a dialog
// opened again; kit.dialog() from a menu item (focus back to the menu's button); first focus passing
// over a hidden field; openers, close buttons and tooltip Escape without the popover API; listener
// counts back at baseline; the measured look (radius 13,
// --kit-shadow-dialog, 40px header with a 1px border, 16px body padding, 352/288/448 widths clamped
// to the window, the scrim, scrolling inside a short window with the header and footer in view);
// axe; and the live demo in preview.html's gallery. Behaviour notes: docs/components.md, "Dialog".

import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, openPreview, pluginFrame, mark, messagesSince, listenerCounter, patchFile, useKitFixture } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await useKitFixture(page); });

const X = '<svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-linecap="round"/></svg>';
const DIALOGS = `
<div class="kit-section kit-row" id="dialog-row">
  <button class="kit-button kit-button-secondary" type="button" id="open-rename" data-kit-dialog-open="rename">Rename</button>
  <button class="kit-button kit-button-secondary" type="button" id="open-confirm" data-kit-dialog-open="confirm">Delete</button>
  <button class="kit-button kit-button-secondary" type="button" id="open-disabled" data-kit-dialog-open="rename" aria-disabled="true">Off</button>
  <button class="kit-button kit-button-secondary" type="button" id="open-missing" data-kit-dialog-open="nope">Missing</button>
</div>
<dialog class="kit-dialog" id="rename" aria-labelledby="rename-title">
  <header class="kit-dialog-header"><h2 id="rename-title">Rename layers</h2><button class="kit-icon-button" type="button" id="rename-x" data-kit-dialog-close aria-label="Close">${X}</button></header>
  <div class="kit-dialog-body kit-stack">
    <div class="kit-field"><label class="kit-label" for="rename-prefix">Prefix</label><input class="kit-input" id="rename-prefix" type="text" value="Frame"></div>
    <button class="kit-button kit-button-secondary" type="button" id="open-nested" data-kit-dialog-open="confirm">Also delete</button>
  </div>
  <footer class="kit-dialog-footer">
    <button class="kit-button kit-button-secondary" type="button" id="rename-cancel" data-kit-dialog-close value="cancel">Cancel</button>
    <button class="kit-button kit-button-primary" type="button" id="rename-ok" data-kit-dialog-close value="rename">Rename</button>
  </footer>
</dialog>
<dialog class="kit-dialog kit-dialog-small" id="confirm" aria-labelledby="confirm-title" data-kit-dialog-light-dismiss>
  <header class="kit-dialog-header"><h2 id="confirm-title">Delete 3 layers?</h2><button class="kit-icon-button" type="button" id="confirm-x" data-kit-dialog-close aria-label="Close">${X}</button></header>
  <div class="kit-dialog-body"><p class="kit-text-secondary" id="confirm-text">They are removed with their children.</p></div>
  <footer class="kit-dialog-footer">
    <button class="kit-button kit-button-secondary" type="button" id="confirm-cancel" data-kit-dialog-close value="cancel">Cancel</button>
    <button class="kit-button kit-button-danger" type="button" id="confirm-ok" data-kit-dialog-close value="delete">Delete</button>
  </footer>
</dialog>`;

/** Opens the plugin with the dialogs at the end of its content; host code logs every close and every Escape it sees. */
async function openWithDialogs(page, query = {}) {
  await openPreview(page, query);
  const frame = pluginFrame(page);
  await frame.evaluate((html) => {
    document.querySelector('[data-kit-root]').insertAdjacentHTML('beforeend', html);
    const w = /** @type {any} */ (window);
    w.__closed = [];
    w.__hostEscapes = 0;
    for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', () => w.__closed.push(`${d.id}:${d.returnValue}`));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') w.__hostEscapes++; });
  }, DIALOGS);
  await page.waitForTimeout(250); // let the fit for the new row land
  return frame;
}

const state = (frame) => frame.evaluate(() => ({
  open: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.id),
  modal: [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).map((d) => d.id),
  focus: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null,
  closed: /** @type {any} */ (window).__closed,
}));
const expectState = (frame, want) => expect.poll(() => state(frame).then(({ open, focus }) => ({ open, focus }))).toEqual(want);

/** Event listener types on one element of the plugin page, through CDP (as helpers.mjs counts the handle's). */
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

test.describe('dialog', () => {
  test('an opener opens it as a modal in the top layer: the body\'s first field has focus, Escape closes it with "" and focus returns to the opener', async ({ page }) => {
    const frame = await openWithDialogs(page);
    const at = await mark(page);
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    expect((await state(frame)).modal).toEqual(['rename']);
    // The top layer changes no layout: no refit, no resize message.
    expect((await messagesSince(page, at)).filter((m) => m.dir === 'ui')).toEqual([]);
    await page.keyboard.press('Escape');
    await expectState(frame, { open: [], focus: 'open-rename' });
    await expect.poll(() => state(frame).then((s) => s.closed), { message: 'close events (queued after close())' }).toEqual(['rename:']);
  });

  test('kit.dialog(id | element) resolves with the close button\'s value; the close button and Escape resolve "" even after a valued close', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.focus('#fixture-name');
    await frame.evaluate(() => { /** @type {any} */ (window).__p = window.kit.dialog('rename'); });
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await frame.click('#rename-ok');
    expect(await frame.evaluate(() => /** @type {any} */ (window).__p)).toBe('rename');
    await expectState(frame, { open: [], focus: 'fixture-name' }); // back to what had focus
    // Escape after a valued close: '' (the runtime clears returnValue on every open).
    await frame.evaluate(() => { /** @type {any} */ (window).__p = window.kit.dialog(/** @type {HTMLDialogElement} */ (document.getElementById('rename'))); });
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await page.keyboard.press('Escape');
    expect(await frame.evaluate(() => /** @type {any} */ (window).__p)).toBe('');
    // The header's close button has no value: ''.
    await frame.evaluate(() => { /** @type {any} */ (window).__p = window.kit.dialog('rename'); });
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await frame.click('#rename-x');
    expect(await frame.evaluate(() => /** @type {any} */ (window).__p)).toBe('');
    await expect.poll(() => state(frame).then((s) => s.closed), { message: 'close events (queued after close())' }).toEqual(['rename:rename', 'rename:', 'rename:']);
  });

  test('first focus: [autofocus] wins, and with no field in the body the close button has it', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.click('#open-confirm');
    await expectState(frame, { open: ['confirm'], focus: 'confirm-x' });
    await frame.click('#confirm-cancel');
    await expectState(frame, { open: [], focus: 'open-confirm' });
    await frame.evaluate(() => document.getElementById('rename-ok').setAttribute('autofocus', ''));
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-ok' });
  });

  test('a host\'s preventDefault() keeps it open; aria-disabled openers do nothing; a missing dialog warns (opener) or rejects (kit.dialog)', async ({ page }) => {
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    const frame = await openWithDialogs(page);
    await frame.evaluate(() => document.getElementById('rename-ok').addEventListener('click', (e) => e.preventDefault(), { once: true }));
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await frame.click('#rename-ok'); // validation failed in the host's handler
    await page.waitForTimeout(100);
    expect((await state(frame)).open).toEqual(['rename']);
    await frame.click('#rename-ok');
    await expectState(frame, { open: [], focus: 'open-rename' });
    await expect.poll(() => state(frame).then((s) => s.closed), { message: 'close events (queued after close())' }).toEqual(['rename:rename']);

    await frame.click('#open-disabled', { force: true }); // Playwright never clicks aria-disabled on its own
    await page.waitForTimeout(100);
    expect((await state(frame)).open).toEqual([]);

    await frame.click('#open-missing');
    await expect.poll(() => warnings.filter((w) => w.includes('[kit]') && w.includes('nope'))).toHaveLength(1);
    const rejected = await frame.evaluate(() => window.kit.dialog('nope').then(() => 'resolved', (e) => `${e.name}: ${e.message}`));
    expect(rejected).toMatch(/^TypeError: kit\.dialog: nope is not a <dialog>$/);
  });

  test('backdrop clicks are ignored unless the dialog has data-kit-dialog-light-dismiss; clicks inside never close it', async ({ page }) => {
    const frame = await openWithDialogs(page);
    const frameBox = await page.locator('iframe[name="kit-plugin"]').boundingBox();
    const corner = { x: frameBox.x + 3, y: frameBox.y + 3 }; // the backdrop, outside every dialog box
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await page.mouse.click(corner.x, corner.y);
    await page.waitForTimeout(100);
    expect((await state(frame)).open, 'no light dismiss by default').toEqual(['rename']);
    await page.keyboard.press('Escape');
    await expectState(frame, { open: [], focus: 'open-rename' });

    await frame.click('#open-confirm');
    await expectState(frame, { open: ['confirm'], focus: 'confirm-x' });
    await frame.click('#confirm-text'); // inside the dialog
    await frame.click('#confirm-title');
    await page.waitForTimeout(100);
    expect((await state(frame)).open).toEqual(['confirm']);
    await page.mouse.click(corner.x, corner.y);
    await expectState(frame, { open: [], focus: 'open-confirm' });
    await expect.poll(() => state(frame).then((s) => s.closed), { message: 'close events (queued after close())' }).toEqual(['rename:', 'confirm:']);
  });

  test('Tab and Shift+Tab move through the dialog in order and never reach the page behind it (native showModal: the rest is inert)', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await frame.focus('#rename-x');
    const where = () => frame.evaluate(() => {
      const el = document.activeElement;
      return { id: el && el.id, inDialog: !!(el && el.closest('dialog')), focused: document.hasFocus() };
    });
    const walk = async (key, n) => {
      const ids = [];
      for (let i = 0; i < n; i++) {
        await page.keyboard.press(key);
        ids.push((await where()).id);
      }
      return ids;
    };
    expect(await walk('Tab', 4)).toEqual(['rename-prefix', 'open-nested', 'rename-cancel', 'rename-ok']);
    expect(await walk('Shift+Tab', 4)).toEqual(['rename-cancel', 'open-nested', 'rename-prefix', 'rename-x']);
    // Past either end, focus wraps inside the dialog or leaves the plugin's document (the browser's
    // own stop), and never lands on the inert page behind the dialog.
    for (const key of ['Shift+Tab', 'Tab', 'Tab']) {
      await page.keyboard.press(key);
      const w = await where();
      if (w.focused) expect(w.inDialog, `${key}: ${w.id}`).toBe(true);
    }
    expect((await state(frame)).open).toEqual(['rename']);
  });

  test('a dialog opened from inside another stacks on top; Escape closes only the top one; focus goes back step by step; kit.dialog() on an open dialog waits for its close', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await frame.click('#open-nested');
    await expectState(frame, { open: ['rename', 'confirm'], focus: 'confirm-x' });
    expect((await state(frame)).modal.sort()).toEqual(['confirm', 'rename']);
    await page.keyboard.press('Escape');
    await expectState(frame, { open: ['rename'], focus: 'open-nested' });
    await page.keyboard.press('Escape');
    await expectState(frame, { open: [], focus: 'open-rename' });
    // Two calls, one dialog: both promises settle with the same value.
    await frame.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__a = window.kit.dialog('confirm');
      w.__b = window.kit.dialog('confirm');
    });
    await expectState(frame, { open: ['confirm'], focus: 'confirm-x' });
    await frame.click('#confirm-ok');
    expect(await frame.evaluate(() => Promise.all([/** @type {any} */ (window).__a, /** @type {any} */ (window).__b]))).toEqual(['delete', 'delete']);
    expect((await state(frame)).open).toEqual([]);
    expect(await frame.evaluate(() => /** @type {any} */ (window).__hostEscapes), 'Escape still reaches the host\'s own listener').toBe(2);
  });

  test('listeners: dialogs add none to document, window or the handle; a dialog keeps only the host\'s own after every path', async ({ page }) => {
    const frame = await openWithDialogs(page);
    const count = await listenerCounter(page);
    const baseline = await count();
    expect(baseline.document).toEqual(['beforetoggle(capture)', 'click(capture)', 'keydown', 'keydown(capture)', 'scroll(capture)', 'toggle(capture)']);
    const own = ['close']; // openWithDialogs' close logger
    expect(await listenersOf(page, "document.getElementById('rename')")).toEqual(own);
    const cycle = async (openIt, closeIt, id = 'rename') => {
      await openIt();
      await expect.poll(() => state(frame).then((s) => s.open)).toEqual([id]);
      expect(await count(), 'nothing on document, window or the handle while open').toEqual(baseline);
      expect(await listenersOf(page, `document.getElementById('${id}')`), 'one close listener while open').toEqual([...own, 'close'].sort());
      await closeIt();
      await expect.poll(() => state(frame).then((s) => s.open)).toEqual([]);
      expect(await count()).toEqual(baseline);
      // The runtime's once-listener goes when the close event fires, a task after the dialog closed.
      await expect.poll(() => listenersOf(page, `document.getElementById('${id}')`), { message: 'released on close' }).toEqual(own);
    };
    await cycle(() => frame.click('#open-rename'), () => page.keyboard.press('Escape'));
    await cycle(() => frame.click('#open-rename'), () => frame.click('#rename-ok'));
    await cycle(() => frame.evaluate(() => { window.kit.dialog('rename'); }), () => frame.click('#rename-x'));
    await cycle(() => frame.click('#open-confirm'), async () => {
      const box = await page.locator('iframe[name="kit-plugin"]').boundingBox();
      await page.mouse.click(box.x + 3, box.y + 3);
    }, 'confirm');
  });

  test('look: radius 13px, the dialog shadow, a 40px header with a 1px border, 16px body padding, widths 352/288/448 clamped to the window, the scrim', async ({ page }) => {
    const frame = await openWithDialogs(page, { mode: 'resizable' });
    await frame.evaluate(() => {
      document.getElementById('rename').insertAdjacentHTML('afterend', '<dialog class="kit-dialog kit-dialog-large" id="large" aria-label="Large"><div class="kit-dialog-body">Wide</div></dialog>');
    });
    const look = (id) => frame.evaluate((i) => {
      const d = /** @type {HTMLDialogElement} */ (document.getElementById(i));
      const s = getComputedStyle(d);
      const header = d.querySelector('.kit-dialog-header');
      const body = /** @type {Element} */ (d.querySelector('.kit-dialog-body'));
      return {
        width: Math.round(d.getBoundingClientRect().width), viewport: document.documentElement.clientWidth,
        radius: s.borderRadius, shadow: s.boxShadow !== 'none', bg: s.backgroundColor, color: s.color, border: s.borderTopWidth,
        header: header ? { height: Math.round(header.getBoundingClientRect().height), border: getComputedStyle(header).borderBottomWidth } : null,
        bodyPadding: getComputedStyle(body).paddingLeft, backdrop: getComputedStyle(d, '::backdrop').backgroundColor,
      };
    }, id);
    // At the default 320px the widths are clamped to the window minus 16px; End widens the window to 640px first.
    await frame.evaluate(() => { window.kit.dialog('rename'); });
    expect((await look('rename')).width).toBe(304);
    await page.keyboard.press('Escape');
    await frame.focus('[data-kit-resize]');
    await page.keyboard.press('End');
    await expect.poll(() => frame.evaluate(() => innerWidth)).toBe(640);
    await frame.evaluate(() => { window.kit.dialog('rename'); });
    let l = await look('rename');
    expect(l).toMatchObject({ radius: '13px', shadow: true, border: '0px', header: { height: 40, border: '1px' }, bodyPadding: '16px', backdrop: 'rgba(0, 0, 0, 0.5)' });
    expect(l.width).toBe(352);
    expect(l.bg).toBe(await frame.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await page.keyboard.press('Escape');
    await frame.evaluate(() => { window.kit.dialog('confirm'); });
    l = await look('confirm');
    expect(l.width).toBe(288);
    await page.keyboard.press('Escape');
    await frame.evaluate(() => { window.kit.dialog('large'); });
    l = await look('large');
    expect(l.width).toBe(448);
    await page.keyboard.press('Escape');
  });

  test('a dialog taller than the window scrolls inside it, with the header and the footer kept in view', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.evaluate(() => {
      const body = document.querySelector('#rename .kit-dialog-body');
      for (let i = 0; i < 30; i++) body.insertAdjacentHTML('beforeend', `<p class="kit-text-secondary">Line ${i + 1}</p>`);
    });
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    const box = () => frame.evaluate(() => {
      const d = /** @type {HTMLElement} */ (document.getElementById('rename'));
      const r = d.getBoundingClientRect();
      const h = /** @type {Element} */ (d.querySelector('.kit-dialog-header')).getBoundingClientRect();
      const f = /** @type {Element} */ (d.querySelector('.kit-dialog-footer')).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, inner: innerHeight, scrolls: d.scrollHeight > d.clientHeight, headerTop: h.top, footerBottom: f.bottom };
    });
    let b = await box();
    expect(b.scrolls).toBe(true);
    expect(b.bottom - b.top).toBeLessThanOrEqual(b.inner - 16);
    expect(Math.abs(b.footerBottom - b.bottom), 'footer at the bottom edge').toBeLessThanOrEqual(1);
    await frame.evaluate(() => { /** @type {HTMLElement} */ (document.getElementById('rename')).scrollTop = 10000; });
    b = await box();
    expect(Math.abs(b.headerTop - b.top), 'header at the top edge after scrolling').toBeLessThanOrEqual(1);
    expect(Math.abs(b.footerBottom - b.bottom)).toBeLessThanOrEqual(1);
  });

  test('axe: the kit fixture with a dialog open (and with a nested one) has no WCAG 2.1 A/AA violations', async ({ page }) => {
    const frame = await openWithDialogs(page);
    const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']).include('#live-frame').analyze();
    const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    expect(summary((await axe()).violations)).toEqual([]);
    await frame.click('#open-nested');
    await expectState(frame, { open: ['rename', 'confirm'], focus: 'confirm-x' });
    expect(summary((await axe()).violations)).toEqual([]);
  });

  test('a close event still queued from an earlier close never settles the dialog opened again in the same task; its next close does', async ({ page }) => {
    const frame = await openWithDialogs(page);
    const log = await frame.evaluate(async () => {
      const d = /** @type {HTMLDialogElement} */ (document.getElementById('rename'));
      const out = [];
      const settle = (name) => (v) => out.push(`${name} ${JSON.stringify(v)} open=${d.open}`);
      const first = window.kit.dialog(d).then(settle('first'));
      await new Promise((r) => setTimeout(r, 50));
      // Host code starting over: close, then show the dialog again at once. The close event of
      // close('restart') is dispatched later, while the dialog is open again.
      d.close('restart');
      const second = window.kit.dialog(d).then(settle('second'));
      await new Promise((r) => setTimeout(r, 100));
      out.push(`after 100 ms open=${d.open}`);
      /** @type {HTMLElement} */ (document.getElementById('rename-ok')).click();
      await Promise.all([first, second]);
      return out;
    });
    // Nothing settles while the dialog is open; both promises settle at the close that ends the
    // dialog (the earlier one with that close's value too: docs/components.md, "Dialog").
    expect(log).toEqual(['after 100 ms open=true', 'first "rename" open=false', 'second "rename" open=false']);
  });

  test('kit.dialog() from a menu item\'s click handler, by mouse and by keyboard: the menu closes and focus goes back to its button when the dialog closes', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.evaluate(() => {
      /** @type {Element} */ (document.getElementById('dialog-row')).insertAdjacentHTML('beforeend', `
        <button class="kit-button kit-button-secondary" type="button" id="menu-button" popovertarget="menu" aria-haspopup="menu" aria-expanded="false">Options</button>
        <div class="kit-menu" id="menu" popover role="menu" aria-labelledby="menu-button">
          <button class="kit-menu-item" role="menuitem" type="button" id="m-rename">Rename…</button>
          <button class="kit-menu-item" role="menuitem" type="button" id="m-delete" data-kit-dialog-open="confirm">Delete…</button>
        </div>`);
      /** @type {Element} */ (document.getElementById('m-rename')).addEventListener('click', () => { /** @type {any} */ (window).__p = window.kit.dialog('rename'); });
    });
    const menuOpen = () => frame.evaluate(() => /** @type {Element} */ (document.getElementById('menu')).matches(':popover-open'));
    const focus = () => state(frame).then((s) => s.focus);
    for (const how of ['mouse', 'keyboard']) {
      for (const [item, dialog, first] of [['m-rename', 'rename', 'rename-prefix'], ['m-delete', 'confirm', 'confirm-x']]) {
        if (how === 'mouse') {
          await frame.click('#menu-button');
          await expect.poll(focus).toBe('m-rename');
          await frame.click(`#${item}`);
        } else {
          await frame.focus('#menu-button');
          await page.keyboard.press('ArrowDown');
          await expect.poll(focus).toBe('m-rename');
          if (item === 'm-delete') await page.keyboard.press('ArrowDown');
          await expect.poll(focus).toBe(item);
          await page.keyboard.press('Enter');
        }
        await expectState(frame, { open: [dialog], focus: first });
        expect(await menuOpen(), `${how}, ${item}: the menu is closed`).toBe(false);
        await page.keyboard.press('Escape');
        await expectState(frame, { open: [], focus: 'menu-button' });
      }
    }
  });

  test('first focus: the first body element that takes focus, so a hidden field is passed over; links and [tabindex] count', async ({ page }) => {
    const frame = await openWithDialogs(page);
    await frame.evaluate(() => {
      /** @type {Element} */ (document.querySelector('#rename .kit-dialog-body')).insertAdjacentHTML('afterbegin',
        '<div class="kit-field" hidden><label class="kit-label" for="rename-advanced">Advanced</label><input class="kit-input" id="rename-advanced" type="text"></div>');
    });
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await page.keyboard.press('Escape');
    await expectState(frame, { open: [], focus: 'open-rename' });
    await frame.evaluate(() => {
      /** @type {Element} */ (document.querySelector('#confirm .kit-dialog-body')).insertAdjacentHTML('beforeend', '<a href="#confirm-text" id="confirm-more">What is removed?</a>');
    });
    await frame.click('#open-confirm');
    await expectState(frame, { open: ['confirm'], focus: 'confirm-more' });
    await page.keyboard.press('Escape');
    await expectState(frame, { open: [], focus: 'open-confirm' });
  });

  test('without the popover API the dialog still works: openers, close buttons, kit.dialog(), Escape; and Escape still hides a tooltip', async ({ page }) => {
    await patchFile(page, 'ui.html', [['<script data-kit="runtime">', `<script>delete HTMLElement.prototype.showPopover;</${'script'}>\n<script data-kit="runtime">`]]);
    const frame = await openWithDialogs(page);
    expect(await frame.evaluate(() => typeof HTMLElement.prototype.showPopover)).toBe('undefined');
    const count = await listenerCounter(page);
    expect((await count()).document, 'only the capture keydown and click listeners (and the host\'s own keydown)').toEqual(['click(capture)', 'keydown', 'keydown(capture)']);
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await frame.click('#rename-ok');
    await expectState(frame, { open: [], focus: 'open-rename' });
    await frame.evaluate(() => { /** @type {any} */ (window).__p = window.kit.dialog('confirm'); });
    await expectState(frame, { open: ['confirm'], focus: 'confirm-x' });
    await frame.click('#confirm-ok');
    expect(await frame.evaluate(() => /** @type {any} */ (window).__p)).toBe('delete');
    await frame.click('#open-rename');
    await expectState(frame, { open: ['rename'], focus: 'rename-prefix' });
    await page.keyboard.press('Escape');
    await expectState(frame, { open: [], focus: 'open-rename' });
    await expect.poll(() => state(frame).then((s) => s.closed)).toEqual(['rename:rename', 'confirm:delete', 'rename:']);
    // The tooltip's Escape is part of the same capture listener.
    await frame.evaluate(() => {
      /** @type {Element} */ (document.getElementById('dialog-row')).insertAdjacentHTML('beforeend', '<span class="kit-tooltip-host" id="tip-host"><button class="kit-icon-button" type="button" id="tip-button" aria-label="Tidy up" aria-describedby="tip">T</button><span class="kit-tooltip" role="tooltip" id="tip">Spaces the layers evenly</span></span>');
    });
    const tip = frame.locator('#tip');
    await frame.hover('#tip-button');
    await expect.poll(() => tip.evaluate((el) => getComputedStyle(el).visibility), { timeout: 2000 }).toBe('visible');
    await page.keyboard.press('Escape');
    expect(await tip.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
    expect(await frame.locator('#tip-host').getAttribute('data-kit-tooltip-dismissed')).toBe('');
  });

  // preview.html's own runtime block runs the live dialogs in the gallery.
  test('the gallery demo: an opener and kit.dialog() in the preview page itself, axe-clean closed and open', async ({ page }) => {
    await openPreview(page);
    test.skip(await page.locator('#g-dialog-button').count() === 0, 'preview.html has no live dialog demo');
    const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']).include('#gallery').analyze();
    const summary = (violations) => violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(summary((await axe()).violations)).toEqual([]);
    await page.locator('#g-dialog-button').scrollIntoViewIfNeeded();
    await page.click('#g-dialog-button');
    await expect(page.locator('#g-dialog-live')).toBeVisible();
    await expect(page.locator('#g-dialog-prefix')).toBeFocused();
    expect(summary((await axe()).violations), 'open').toEqual([]);
    await page.click('#g-dialog-live [value="rename"]');
    await expect(page.locator('#g-dialog-live')).toBeHidden();
    await expect(page.locator('#g-dialog-result')).toHaveText('Returned: "rename"');
    await expect(page.locator('#g-dialog-button')).toBeFocused();
    await page.click('#g-dialog-confirm-button');
    await expect(page.locator('#g-dialog-confirm')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#g-dialog-result')).toHaveText('Returned: an empty string');
    await expect(page.locator('#g-dialog-confirm-button')).toBeFocused();
  });
});
