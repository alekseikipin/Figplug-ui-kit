// The README's recorded media: docs/media/*.gif, docs/media/components-sheet-*.png and
// docs/img/figma-side-by-side-*.png. Skipped unless asked:
//
//   UPDATE_MEDIA=1 npx playwright test e2e/readme-media.spec.mjs
//
// It needs ffmpeg on PATH (or FFMPEG=/path/to/ffmpeg). KIT_PREVIEW_PORT=<n> picks another port, as
// for every spec. The files land in docs/; the frames stay in test-results/ until the next run.
// docs/media/*.svg are illustrations, not recordings: tools/readme-svg/build.mjs makes them.
//
// What they show, and what they don't. Every GIF and the components sheet are the real kit (the
// repo's code.js and ui.html, its kit blocks, or an examples/ plugin) running in preview.html's
// fake Figma host in Chromium. None of them is a recording of Figma. The Figma captures are
// docs/img/figma-starter-*.png and figma-panel-*.png, which no test makes; this spec only crops and
// joins them into figma-side-by-side-*.png, pixels unchanged. For the recording only, this spec
// dresses the host page at run time (preview.html, ui.html and code.js on disk are never touched):
// - a canvas in Figma's canvas colours (#f5f5f5 light, #1e1e1e dark) with a dot grid, the preview's
//   plugin window placed on it, and nothing else of the page. The window's title bar gets a plugin
//   icon like Figma's, and its size readout shows only in window-*.gif, where the size is the point;
// - a drawn mouse pointer that follows every page.mouse move, a ring while the button is down,
//   keycaps for keys, and a caption bar that says what each step shows and, on every frame, that
//   this is the kit's browser preview and not Figma;
// - in hero-*.gif, the shapes the starter created, drawn on the canvas from the stub's document
//   (kitPreviewHost.nodes()) in a row (the starter's 100 px shapes 150 px apart, scaled down), and
//   the create-shapes message held back for 840 ms so the Create button's busy state shows (the
//   stub answers at once; Figma's main thread takes a moment too);
// - a theme change applied live, as Figma does it under themeColors: true: the <html> class and the
//   <style id="figma-style"> palette are swapped inside the plugin's iframe (the preview's own Theme
//   buttons rerun the plugin instead);
// - components-*.gif runs a small plugin made at record time from ui.html's three kit blocks (cut
//   from the file, never copied by hand), the real code.js's kit:window block and the demo below;
// - in examples-*.gif, the two resizable examples are refitted off camera with the grip's Home key
//   (in resizable mode Home re-fits the height to the content), so their footers sit on the window's
//   bottom edge instead of above an empty area;
// - CSS animations (the busy spinner, a toast sliding in) are paused and stepped through, so they
//   are captured frame by frame however long a screenshot takes;
// - Math.random is seeded in the host page, where the fake host runs code.js, so content-fill
//   writes the same names on every run.
//
// Each storyboard drives the page step by step and takes a 2x screenshot per frame, each frame
// with its own duration. Every caption stays up for at least about 2.5 s. GitHub shows a GIF's first
// frame alone when the reader's "Autoplay animated images" setting is off (by default, when the OS
// asks for reduced motion), so each GIF opens on a poster frame: a finished state, taken during the
// story. ffmpeg then encodes the GIF in two passes (palettegen, then paletteuse with an ordered
// dither, which suits flat UI). The stages are small (400 to 560 CSS px wide), so the plugin window
// fills most of the frame and stays legible when a phone shrinks it. The text is in the kit's font
// stack: Inter where it is installed, else the system font (the preview's "Simulate no Inter"
// stays off). The committed GIFs were made on macOS, without Inter. Sizes are checked against BUDGET.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, openPreview, pluginFrame, waitForPlugin, host, HAS_DEMO, NO_DEMO } from './helpers.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), 'utf8');
const out = (name) => fileURLToPath(new URL(`docs/media/${name}`, ROOT));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
/** One frame of motion, in ms: about 14 fps, and a whole number of GIF centiseconds. */
const MOTION = 70;
const MB = 1024 * 1024;
const BUDGET = { gif: 1.5 * MB, png: 0.5 * MB };
const THEMES = ['light', 'dark'];
/** The caption bar's height; keep in step with #rec-caption below. */
const CAPTION_BAR = 52;

// ---- Sources, cut from the repo's files at record time -------------------------------------------

/** ui.html's three kit blocks, tags included, as a plugin pastes them. */
function kitBlocks() {
  const html = read('ui.html');
  return ['<style data-kit="tokens">', '<style data-kit="components">', '<script data-kit="runtime">'].map((open) => {
    const start = html.indexOf(open);
    if (start < 0 || html.indexOf(open, start + 1) >= 0) throw new Error(`ui.html must hold exactly one ${open}`);
    const close = open.startsWith('<style') ? '</style>' : '</script>';
    return html.slice(start, html.indexOf(close, start) + close.length);
  }).join('\n');
}

/** code.js up to and including its "// ==== kit:window:end ====" line. */
function kitWindowCode() {
  const code = read('code.js');
  const end = code.indexOf('// ==== kit:window:end ====');
  if (end < 0) throw new Error('code.js has no "// ==== kit:window:end ====" line (run npm run build)');
  return code.slice(0, code.indexOf('\n', end) + 1);
}

/** The palette Figma would inject for a theme, as preview.html builds it from the fallback file. */
function palette(theme) {
  const selector = { light: ':where(:root)', dark: ':where(:root.figma-dark)', figjam: ':where(:root[data-kit-surface="figjam"])' }[theme];
  const css = read('tokens.figma-fallback.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim() === selector) return ':root {' + m[2].replace(/\s+$/, '') + '\n}';
  }
  throw new Error(`tokens.figma-fallback.css has no ${selector} block`);
}

/** Runs ffmpeg, with a clear error when it is missing. */
function ffmpeg(args) {
  try {
    execFileSync(FFMPEG, ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`ffmpeg not found (${FFMPEG}): install it, or set FFMPEG=/path/to/ffmpeg`);
    throw new Error(`ffmpeg failed: ${error.stderr ? error.stderr.toString() : error.message}`);
  }
}

// ---- The recording stage (host page only) --------------------------------------------------------

const STAGE_CSS = `
html, body { overflow: hidden !important; }
.preview-toolbar, #gallery, #live > :not(.preview-live-layout), .preview-live-layout > :not(#live-stage), #live-status { display: none !important; }
:root { --rec-canvas: #f5f5f5; --rec-dot: rgba(0, 0, 0, 0.13); --rec-shape: #ff8000; --rec-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
:root.figma-dark { --rec-canvas: #1e1e1e; --rec-dot: rgba(255, 255, 255, 0.1); }
#live-stage {
  position: fixed !important; inset: 0 !important; z-index: 2147483000; min-height: 0 !important;
  padding: 0 !important; overflow: hidden !important; border-radius: 0 !important;
  background: radial-gradient(circle, var(--rec-dot) 0.9px, transparent 1.3px) 10px 10px / 20px 20px, var(--rec-canvas) !important;
}
#live-window { position: absolute !important; top: var(--rec-top, 16px); left: var(--rec-left, 50%); translate: var(--rec-shift, -50%) 0; }
:root:not([data-rec-size]) #live-size { display: none; }
#rec-icon { flex: none; width: 16px; height: 16px; }
#rec-shapes { position: absolute; inset: 0; pointer-events: none; }
#rec-shapes > i { position: absolute; background-color: var(--rec-shape); }
#rec-shapes > i[data-type="ELLIPSE"] { border-radius: 50%; }
#rec-shapes > b { position: absolute; border: 1px solid var(--figma-color-border-selected); }
#rec-caption {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483600; box-sizing: border-box;
  display: flex; flex-direction: column; justify-content: center; gap: 2px;
  height: ${CAPTION_BAR}px; padding: 0 14px; border-top: 1px solid var(--figma-color-border);
  background-color: var(--figma-color-bg); color: var(--figma-color-text);
}
#rec-head { display: flex; align-items: center; gap: 8px; min-width: 0; font: 600 14px/20px var(--rec-ui); }
#rec-step { flex: none; min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 6px; border-radius: 10px; background-color: var(--figma-color-bg-brand); color: var(--figma-color-text-onbrand); font-size: 11px; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums; }
#rec-step:empty { display: none; }
#rec-text { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#rec-note { color: var(--figma-color-text-secondary); font: 400 11px/14px var(--rec-ui); white-space: nowrap; }
#rec-keys { position: fixed; right: 16px; bottom: ${CAPTION_BAR + 14}px; z-index: 2147483600; display: flex; gap: 6px; }
#rec-keys > kbd {
  display: grid; place-items: center; min-width: 36px; height: 36px; padding: 0 10px; border-radius: 8px; box-sizing: border-box;
  border: 1px solid var(--figma-color-border-strong); background-color: var(--figma-color-bg);
  box-shadow: 0 2px 0 var(--figma-color-border-strong); color: var(--figma-color-text); font: 600 15px/1 var(--rec-ui);
}
#rec-keys[data-down] > kbd { translate: 0 2px; box-shadow: 0 0 0 var(--figma-color-border-strong); background-color: var(--figma-color-bg-secondary); }
#rec-ring {
  position: fixed; left: 0; top: 0; z-index: 2147483646; width: 28px; height: 28px; margin: -14px 0 0 -14px;
  border: 2px solid rgba(13, 153, 255, 0.75); border-radius: 50%; background-color: rgba(13, 153, 255, 0.2); display: none; pointer-events: none;
}
#rec-ring[data-on] { display: block; }
#rec-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; margin: -2px 0 0 -3px; pointer-events: none; filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.35)); }
`;

/**
 * Turns preview.html into the recording stage: the canvas, the plugin window on it (`left` in px, or
 * centred), the title bar's icon (and size readout when `size`), the shapes layer, the caption bar,
 * keycaps, the press ring and the pointer.
 */
async function installStage(page, { top = 16, left = null, size = false } = {}) {
  await page.addStyleTag({ content: STAGE_CSS });
  await page.evaluate(({ top, left, size }) => {
    const win = /** @type {HTMLElement} */ (document.getElementById('live-window'));
    win.style.setProperty('--rec-top', `${top}px`);
    if (left !== null) { win.style.setProperty('--rec-left', `${left}px`); win.style.setProperty('--rec-shift', '0'); }
    document.documentElement.toggleAttribute('data-rec-size', size);
    // Figma's title bar shows the plugin's icon; a development plugin gets this </> one.
    document.getElementById('live-title').insertAdjacentHTML('beforebegin', `<svg id="rec-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect width="16" height="16" rx="3.5" style="fill: var(--figma-color-icon)"/>
      <path d="M6 5.5 3.75 8 6 10.5M10 5.5 12.25 8 10 10.5M8.9 4.75l-1.8 6.5" fill="none" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--figma-color-bg)"/></svg>`);
    win.insertAdjacentHTML('beforebegin', '<div id="rec-shapes" aria-hidden="true"></div>');
    document.body.insertAdjacentHTML('beforeend', `
      <div id="rec-caption" aria-hidden="true"><div id="rec-head"><span id="rec-step"></span><span id="rec-text"></span></div><span id="rec-note">Recorded in the kit's browser preview, not in Figma</span></div>
      <div id="rec-keys" aria-hidden="true"></div>
      <div id="rec-ring" aria-hidden="true"></div>
      <svg id="rec-cursor" width="22" height="24" viewBox="0 0 22 24" aria-hidden="true"><path d="M3 2v17.4l4.3-4.1 2.9 6.7 3.1-1.3-2.9-6.6h6z" fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`);
  }, { top, left, size });
}

/** Draws the stub's rectangles and ellipses on the canvas in a row, with a selection box. */
async function drawShapes(page, { x, y, size = 24, selected = true }) {
  const nodes = await host(page, () => window.kitPreviewHost.nodes());
  await page.evaluate(({ nodes, x, y, size, selected }) => {
    const layer = /** @type {HTMLElement} */ (document.getElementById('rec-shapes'));
    layer.replaceChildren();
    const shapes = nodes.filter((n) => n.type === 'RECTANGLE' || n.type === 'ELLIPSE');
    const pitch = size * 1.5; // code.ts places its 100 px shapes 150 px apart
    shapes.forEach((n, i) => {
      const el = document.createElement('i');
      el.dataset.type = n.type;
      Object.assign(el.style, { left: `${x + i * pitch}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
      layer.append(el);
    });
    if (selected && shapes.length) {
      const box = document.createElement('b');
      Object.assign(box.style, { left: `${x - 1}px`, top: `${y - 1}px`, width: `${(shapes.length - 1) * pitch + size + 2}px`, height: `${size + 2}px` });
      layer.append(box);
    }
  }, { nodes, x, y, size, selected });
}

/**
 * Switches the theme live, as Figma does with themeColors: true: the host page's class, and inside
 * the plugin's iframe the <html> class and the injected <style id="figma-style"> palette.
 */
async function switchThemeLive(page, theme) {
  const cls = theme === 'dark' ? 'figma-dark' : 'figma-light';
  await page.evaluate((cls) => {
    const html = document.documentElement;
    html.classList.remove('figma-light', 'figma-dark');
    html.classList.add(cls);
  }, cls);
  await pluginFrame(page).evaluate(({ cls, css }) => {
    const html = document.documentElement;
    html.classList.remove('figma-light', 'figma-dark');
    html.classList.add(cls);
    const style = document.getElementById('figma-style');
    if (!style) throw new Error('no <style id="figma-style"> in the plugin page');
    style.textContent = css;
  }, { cls, css: palette(theme) });
}

/** Holds UI -> main messages of one type in the host until window.__recRelease() (install before goto). */
async function holdMessages(page, type) {
  await page.addInitScript((type) => {
    const held = [];
    const replayed = new WeakSet();
    window.addEventListener('message', (event) => {
      const msg = event.data && event.data.pluginMessage;
      if (replayed.has(event) || !msg || msg.type !== type) return;
      event.stopImmediatePropagation();
      held.push(new MessageEvent('message', { data: event.data, origin: event.origin, source: event.source }));
    }, true);
    window.__recRelease = () => { for (const e of held.splice(0)) { replayed.add(e); window.dispatchEvent(e); } };
  }, type);
}

/** Makes Math.random repeatable in the host page, where the fake host runs code.js (install before goto). */
async function seedRandom(page, seed = 20261014) {
  await page.addInitScript((seed) => {
    let a = seed >>> 0; // mulberry32
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

/** Picks a plugin in the preview's (hidden) Plugin field and waits for its window. */
async function pickPlugin(page, value) {
  await page.evaluate((v) => {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('live-plugin'));
    select.value = v;
    select.dispatchEvent(new Event('change'));
  }, value);
  return waitForPlugin(page);
}

/** Waits for the plugin window to stop changing size (fits and refits land within a frame or two). */
async function settle(page, ms = 120) {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = JSON.stringify(await host(page, () => window.kitPreviewHost.frameSize()));
    if (now === last) return;
    last = now;
    await page.waitForTimeout(ms / 3);
  }
}

/** Fails when the plugin window (title bar included) would run into the caption bar or off the stage. */
async function expectWindowFits(page) {
  const box = await page.locator('#live-window').boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'the plugin window is on the stage').not.toBeNull();
  expect(box.x, 'window inside the stage, left').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'window inside the stage, right').toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, 'window above the caption bar').toBeLessThanOrEqual(viewport.height - CAPTION_BAR - 4);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ---- Storyboard: frames with durations, then ffmpeg ---------------------------------------------

class Storyboard {
  constructor(page, testInfo, name) {
    this.page = page;
    this.dir = testInfo.outputPath(`${name}-frames`);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    /** @type {{ file: string, ms: number }[]} */
    this.frames = [];
    /** @type {{ file: string, ms: number } | null} The GIF's first frame (see poster). */
    this.posterFrame = null;
    this.pointer = { x: 0, y: 0 };
  }

  /** Takes one frame, shown for `ms`. */
  async shot(ms = MOTION) {
    const file = join(this.dir, `${String(this.frames.length).padStart(4, '0')}.png`);
    await this.page.screenshot({ path: file, animations: 'allow', caret: 'hide', scale: 'device' });
    this.frames.push({ file, ms });
  }

  /** Shows the last frame for `ms` longer. */
  hold(ms) { this.frames[this.frames.length - 1].ms += ms; }

  /**
   * Takes the GIF's first frame now, with its own caption (no step badge), shown for `ms`: the
   * frame a reader sees alone when animated images don't autoplay. The story's caption comes back.
   */
  async poster(text, ms) {
    const [prevText, prevStep] = await this.page.evaluate(() => [document.getElementById('rec-text').textContent, document.getElementById('rec-step').textContent]);
    await this.caption(text);
    const file = join(this.dir, 'poster.png');
    await this.page.screenshot({ path: file, animations: 'allow', caret: 'hide', scale: 'device' });
    this.posterFrame = { file, ms };
    await this.caption(prevText, prevStep);
  }

  /** Sets the caption (and its step badge), takes away the last step's keycaps, and checks it fits. */
  async caption(text, step = '') {
    const overflow = await this.page.evaluate(([t, s]) => {
      const el = document.getElementById('rec-text');
      el.textContent = t;
      document.getElementById('rec-step').textContent = s;
      document.getElementById('rec-keys').replaceChildren();
      return el.scrollWidth > el.clientWidth;
    }, [text, String(step)]);
    if (overflow) throw new Error(`caption too long for the stage: "${text}"`);
  }

  /** Shows keycaps (`down` draws them pressed); none hides them. */
  async keys(list = [], down = false) {
    await this.page.evaluate(([list, down]) => {
      const keys = document.getElementById('rec-keys');
      keys.replaceChildren(...list.map((k) => Object.assign(document.createElement('kbd'), { textContent: k })));
      keys.toggleAttribute('data-down', down);
    }, [list, down]);
  }

  async drawPointer() {
    await this.page.evaluate(({ x, y }) => {
      document.getElementById('rec-cursor').style.transform = `translate(${x}px, ${y}px)`;
      document.getElementById('rec-ring').style.transform = `translate(${x}px, ${y}px)`;
    }, this.pointer);
  }

  async ring(on) { await this.page.evaluate((on) => document.getElementById('rec-ring').toggleAttribute('data-on', on), on); }

  /** Puts the pointer somewhere without a frame. */
  async place(x, y) {
    this.pointer = { x, y };
    await this.page.mouse.move(x, y);
    await this.drawPointer();
  }

  /** Glides the pointer to (x, y) over about `ms`, a frame per step. */
  async move(x, y, { ms = 560 } = {}) {
    const from = { ...this.pointer };
    const steps = Math.max(1, Math.round(ms / MOTION));
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      this.pointer = { x: Math.round((from.x + (x - from.x) * t) * 2) / 2, y: Math.round((from.y + (y - from.y) * t) * 2) / 2 };
      await this.page.mouse.move(this.pointer.x, this.pointer.y);
      await this.drawPointer();
      await this.shot();
    }
  }

  /** Glides to a point of an element (its centre, plus dx and dy). */
  async moveTo(locator, { dx = 0, dy = 0, ms } = {}) {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${locator} is not visible`);
    await this.move(Math.round(box.x + box.width / 2 + dx), Math.round(box.y + box.height / 2 + dy), { ms });
  }

  /** Presses and releases the real mouse button where the pointer is, with the ring while it is down. */
  async click({ settleMs = 0, hold = 0 } = {}) {
    await this.ring(true);
    await this.page.mouse.down();
    await this.shot(MOTION * 2);
    await this.page.mouse.up();
    await this.ring(false);
    if (settleMs) await this.page.waitForTimeout(settleMs);
    await this.shot(MOTION + hold);
  }

  /** A press that the page doesn't get (the native select opens an OS popup no screenshot shows). */
  async fakePress(action) {
    await this.ring(true);
    await this.shot(MOTION * 2);
    await action();
    await this.ring(false);
  }

  /** Presses a key with its keycaps shown, then takes a frame of the result. */
  async key(key, caps, { ms = 360, wait } = {}) {
    await this.keys(caps, true);
    await this.page.keyboard.press(key);
    if (wait) await wait();
    await this.shot(MOTION * 2);
    await this.keys(caps, false);
    await this.shot(ms - MOTION * 2);
  }

  /** Writes the GIF, poster first: two ffmpeg passes over the frames (palette, then the GIF). Returns its size. */
  encode(file) {
    // Durations in whole centiseconds (a GIF's unit; 2 at least, as browsers stretch shorter delays
    // to 100 ms). Each image is read at 100 fps so the concat demuxer keeps them exact (its default,
    // 25 fps, rounds to 40 ms). The last frame's delay, which the demuxer drops, is -final_delay.
    if (!this.posterFrame) throw new Error('no poster frame: call sb.poster() during the story');
    const frames = [this.posterFrame, ...this.frames];
    const list = join(this.dir, 'frames.ffconcat');
    const lines = ['ffconcat version 1.0'];
    const cs = (ms) => Math.max(2, Math.round(ms / 10));
    for (const f of frames) lines.push(`file '${basename(f.file)}'`, 'option framerate 100', `duration ${(cs(f.ms) / 100).toFixed(2)}`);
    writeFileSync(list, lines.join('\n') + '\n');
    const paletteFile = join(this.dir, 'palette.png');
    const input = ['-f', 'concat', '-safe', '0', '-i', list];
    mkdirSync(dirname(file), { recursive: true });
    ffmpeg([...input, '-vf', 'palettegen=max_colors=256:stats_mode=full', paletteFile]);
    ffmpeg([...input, '-i', paletteFile, '-lavfi', '[0:v]setsar=1[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-fps_mode', 'passthrough', '-loop', '0', '-final_delay', String(cs(frames[frames.length - 1].ms)), file]);
    const bytes = statSync(file).size;
    const seconds = frames.reduce((s, f) => s + f.ms, 0) / 1000;
    console.log(`${basename(file)}: ${(bytes / MB).toFixed(2)} MB, ${frames.length} frames, ${seconds.toFixed(1)} s`);
    return bytes;
  }
}

/** Steps the CSS animations of `selector` (with its pseudo-elements) through `ms`, a frame per MOTION. */
async function stepAnimations(sb, frame, selector, ms) {
  for (let t = 0; t < ms; t += MOTION) {
    await frame.evaluate(([selector, t]) => {
      const el = document.querySelector(selector);
      for (const a of el ? el.getAnimations({ subtree: true }) : []) { a.pause(); a.currentTime = t; }
    }, [selector, t]);
    await sb.shot();
  }
  await frame.evaluate((selector) => {
    const el = document.querySelector(selector);
    for (const a of el ? el.getAnimations({ subtree: true }) : []) a.play();
  }, selector);
}

// ---- The animations ------------------------------------------------------------------------------

test.describe('README media', { tag: '@media' }, () => {
  test.skip(!process.env.UPDATE_MEDIA, 'set UPDATE_MEDIA=1 to regenerate the README media');
  test.describe.configure({ timeout: 240_000 });
  test.use({ deviceScaleFactor: 2 });

  test.describe('hero', () => {
    const STAGE = { width: 480, height: 416 };
    test.use({ viewport: STAGE });
    const SHAPES = { x: 102, y: 322, size: 24 }; // 8 shapes, 36 px apart: 276 px, centred

    for (const theme of THEMES) {
      test(`hero-${theme}.gif: the starter creates shapes, then follows the theme`, async ({ page }, testInfo) => {
        test.skip(!HAS_DEMO, `${NO_DEMO}; the hero shows the demo`);
        const other = theme === 'light' ? 'dark' : 'light';
        await holdMessages(page, 'create-shapes');
        await openPreview(page, theme === 'light' ? {} : { theme });
        const frame = pluginFrame(page);
        await frame.evaluate(() => document.fonts.ready);
        await installStage(page, { top: 16 });
        await settle(page);
        const sb = new Storyboard(page, testInfo, `hero-${theme}`);
        await sb.place(420, 330);

        // 1. A count and a shape (the select's popup is the OS's own, so no frame shows it).
        await sb.caption('Set a count and a shape', 1);
        await sb.shot(700);
        await sb.moveTo(frame.locator('#count'), { dx: 60, ms: 490 });
        await sb.click();
        await page.keyboard.press('ControlOrMeta+A');
        await sb.shot(MOTION * 3);
        await page.keyboard.type('8');
        await sb.shot(600);
        await sb.moveTo(frame.locator('#shape'), { dx: 40, ms: 420 });
        await sb.fakePress(async () => {
          await frame.locator('#shape').selectOption('ellipse');
          await frame.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
        });
        await sb.shot(900);

        // 2. Create: busy while main works, then the shapes, the status and the refit.
        await sb.caption('Create: a spinner, then 8 ellipses', 2);
        await sb.moveTo(frame.locator('#create'), { dx: 16, dy: 6, ms: 490 }); // beside the spinner
        await sb.ring(true);
        await page.mouse.down();
        await sb.shot(MOTION * 2);
        await page.mouse.up();
        await sb.ring(false);
        await expect(frame.locator('#create')).toHaveAttribute('aria-busy', 'true');
        await stepAnimations(sb, frame, '#create', 840);
        await page.evaluate(() => window.__recRelease());
        await expect(frame.locator('#status')).toHaveText(/8 layers selected\s*Created 8 ellipses/);
        await settle(page);
        await drawShapes(page, SHAPES);
        await expectWindowFits(page);
        await sb.shot(1700);

        // 3. Figma's other theme, applied live, and back.
        await sb.caption('Follows Figma\'s theme, live', 3);
        await sb.move(420, 330, { ms: 420 });
        await switchThemeLive(page, other);
        await sb.shot(1700);
        await switchThemeLive(page, theme);
        await sb.shot(1000);

        await sb.poster('Kit starter: the plugin you start from', 2600);
        expect(sb.encode(out(`hero-${theme}.gif`))).toBeLessThanOrEqual(BUDGET.gif);
      });
    }
  });

  test.describe('window', () => {
    test.use({ viewport: { width: 560, height: 420 } });

    for (const theme of THEMES) {
      test(`window-${theme}.gif: drag, snap and keyboard resizing; the height follows the content`, async ({ page }, testInfo) => {
        test.skip(!HAS_DEMO, `${NO_DEMO}; window-*.gif resizes the demo`);
        await openPreview(page, theme === 'light' ? {} : { theme });
        const frame = pluginFrame(page);
        // Off camera: make the starter's status two lines long, as after a Create.
        await frame.locator('#create').click();
        await expect(frame.locator('#status')).toHaveText(/Created 5 rectangles/);
        await installStage(page, { left: 20, top: 16, size: true });
        await settle(page);
        await frame.evaluate(() => document.fonts.ready);
        const sb = new Storyboard(page, testInfo, `window-${theme}`);
        const size = () => host(page, () => window.kitPreviewHost.frameSize());
        const grip = async () => {
          const box = await frame.locator('[data-kit-resize]').boundingBox();
          return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
        };
        const nextFrame = () => frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

        /** Moves the pressed pointer by dx in `steps` frames, each after the window has followed. */
        const dragBy = async (dx, steps) => {
          const from = { ...sb.pointer };
          for (let i = 1; i <= steps; i++) {
            sb.pointer = { x: Math.round(from.x + dx * ease(i / steps)), y: from.y };
            await page.mouse.move(sb.pointer.x, sb.pointer.y);
            await sb.drawPointer();
            await nextFrame();
            await sb.shot();
          }
        };
        const start = await size();

        // 1. Drag wider: the width follows the pointer, the height stays fitted.
        await sb.place(470, 320);
        await sb.caption('Drag the grip: the width follows', 1);
        await sb.shot(600);
        let g = await grip();
        await sb.move(g.x, g.y, { ms: 560 });
        await sb.ring(true);
        await page.mouse.down();
        await sb.shot(MOTION * 2);
        await dragBy(180, 14);
        sb.hold(700);
        expect(await size()).toMatchObject({ width: 500, height: start.height });
        await expectWindowFits(page);
        await sb.poster('Resize by dragging, double-click or keys', 2400);

        // 2. Narrower than at first: the status wraps and the fitted height follows, mid-drag.
        await sb.caption('Narrower: text wraps, height follows', 2);
        await dragBy(-260, 18);
        await page.mouse.up();
        await sb.ring(false);
        await settle(page);
        expect(await size()).toMatchObject({ width: 240 });
        expect((await size()).height).toBeGreaterThan(start.height);
        await expectWindowFits(page);
        await sb.shot(1300);

        // 3. Double-click snaps to the next width: 320, then 480 (and 640, not shown).
        await sb.caption('Double-click the grip to snap its width', 3);
        for (const width of [320, 480]) {
          g = await grip();
          await sb.move(g.x, g.y, { ms: 350 });
          await sb.ring(true);
          await sb.shot(MOTION);
          await page.mouse.dblclick(g.x, g.y);
          await sb.ring(false);
          await settle(page);
          expect((await size()).width).toBe(width);
          await sb.shot(900);
        }

        // 4. Keys: Tab to the grip (from Create, the control before it), Shift+Left, then Home.
        await sb.move(60, 340, { ms: 420 }); // clear of the keycaps
        await frame.locator('#create').focus();
        await sb.caption('Keys: Tab, Shift + ←, then Home', 4);
        await sb.shot(400);
        await sb.key('Tab', ['Tab'], { ms: 600 });
        expect(await frame.evaluate(() => document.activeElement && document.activeElement.matches('[data-kit-resize]'))).toBe(true);
        for (let i = 0; i < 2; i++) await sb.key('Shift+ArrowLeft', ['⇧', '←'], { ms: 500, wait: () => settle(page) });
        expect((await size()).width).toBe(416);
        await sb.key('Home', ['Home'], { ms: 1600, wait: () => settle(page) });
        expect(await size()).toMatchObject({ width: 320, height: start.height });

        expect(sb.encode(out(`window-${theme}.gif`))).toBeLessThanOrEqual(BUDGET.gif);
      });
    }
  });

  test.describe('components', () => {
    test.use({ viewport: { width: 440, height: 420 } }); // room under the window for the keycaps

    // A small plugin made of ui.html's kit blocks and this markup: kit classes only, no colours.
    const DEMO_MARKUP = `<main class="kit-app" data-kit-root>
  <div class="kit-section kit-stack">
    <h1 class="kit-heading">Layer tools</h1>
    <div class="kit-row">
      <button class="kit-button kit-button-secondary" type="button" id="options" popovertarget="options-menu" aria-haspopup="menu" aria-expanded="false">Options</button>
      <div class="kit-menu" id="options-menu" popover role="menu" aria-labelledby="options">
        <button class="kit-menu-item" role="menuitem" type="button">Rename</button>
        <button class="kit-menu-item" role="menuitem" type="button">Duplicate</button>
        <button class="kit-menu-item" role="menuitem" type="button">Group selection</button>
        <hr class="kit-menu-separator">
        <button class="kit-menu-item" role="menuitem" type="button" disabled>Delete</button>
      </div>
      <button class="kit-button kit-button-secondary" type="button" id="rename-open">Rename layers…</button>
    </div>
    <p class="kit-text-secondary" id="result" role="status">Nothing chosen yet</p>
  </div>
  <hr class="kit-divider">
  <div class="kit-section">
    <div class="kit-tabs">
      <div class="kit-tablist" role="radiogroup" aria-label="Format">
        <label class="kit-tab"><input type="radio" name="format" value="png" checked>PNG</label>
        <label class="kit-tab"><input type="radio" name="format" value="svg">SVG</label>
        <label class="kit-tab"><input type="radio" name="format" value="pdf">PDF</label>
      </div>
      <div class="kit-stack demo-panel">
        <div class="kit-row" role="radiogroup" aria-label="Scale">
          <label class="kit-radio"><input type="radio" name="scale" value="1">1x</label>
          <label class="kit-radio"><input type="radio" name="scale" value="2" checked>2x</label>
          <label class="kit-radio"><input type="radio" name="scale" value="3">3x</label>
        </div>
      </div>
      <div class="kit-stack demo-panel">
        <div class="kit-row">
          <label class="kit-checkbox"><input type="checkbox" checked>Outline text</label>
          <span class="kit-tooltip-host">
            <button class="kit-icon-button" type="button" aria-label="About outlined text" aria-describedby="outline-tip"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor"/><path d="M12 11v4.5" fill="none" stroke="currentColor" stroke-linecap="round"/><circle cx="12" cy="8.75" r=".75" fill="currentColor"/></svg></button>
            <span class="kit-tooltip" role="tooltip" id="outline-tip">Text becomes vector paths</span>
          </span>
        </div>
      </div>
      <div class="kit-stack demo-panel"><p class="kit-text-secondary">One page per frame.</p></div>
    </div>
  </div>
  <dialog class="kit-dialog" id="rename" aria-labelledby="rename-title">
    <header class="kit-dialog-header"><h2 id="rename-title">Rename layers</h2><button class="kit-icon-button" type="button" data-kit-dialog-close aria-label="Close"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-linecap="round"/></svg></button></header>
    <div class="kit-dialog-body kit-stack">
      <div class="kit-field"><label class="kit-label" for="prefix">Prefix</label><input class="kit-input" id="prefix" type="text" value="Icon/" aria-describedby="prefix-help"><p class="kit-help" id="prefix-help">Added before each selected layer's name.</p></div>
    </div>
    <footer class="kit-dialog-footer">
      <button class="kit-button kit-button-secondary" type="button" data-kit-dialog-close value="cancel">Cancel</button>
      <button class="kit-button kit-button-primary" type="button" data-kit-dialog-close value="rename">Rename</button>
    </footer>
  </dialog>
  <footer class="kit-footer">
    <p class="kit-text-secondary">3 layers selected</p>
    <button class="kit-button kit-button-primary" type="button" id="export">Export</button>
  </footer>
</main>
<button class="kit-resize-handle" type="button" data-kit-resize hidden aria-label="Resize window"></button>`;
    const DEMO_SCRIPT = `'use strict';
(() => {
  const result = document.getElementById('result');
  document.getElementById('options-menu').addEventListener('click', (event) => {
    const item = event.target instanceof Element ? event.target.closest('.kit-menu-item') : null;
    if (item && !item.disabled) result.textContent = 'You picked ' + item.textContent;
  });
  document.getElementById('rename-open').addEventListener('click', async () => {
    const choice = await window.kit.dialog('rename');
    result.textContent = choice === 'rename' ? 'You pressed Rename' : choice === 'cancel' ? 'You pressed Cancel' : 'Dialog closed';
  });
  document.getElementById('export').addEventListener('click', () => {
    window.kit.toast('Started 3 downloads', { tone: 'success', duration: 1500 });
    window.kit.toast('1 hidden layer was skipped', { tone: 'warning', duration: 4000 });
  });
})();`;
    const demoUi = () => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kit components</title>
${kitBlocks()}
<style>
.demo-panel { padding-top: var(--kit-spacer-3); }
</style>
</head>
<body>
${DEMO_MARKUP}
<script>
${DEMO_SCRIPT}
</script>
</body>
</html>
`;
    const demoCode = () => `${kitWindowCode()}
installKitWindow({ mode: 'fit-content', size: { width: 360 }, title: 'Kit components' });
`;

    for (const theme of THEMES) {
      test(`components-${theme}.gif: menu, tabs, tooltip, dialog and toasts, run by the kit`, async ({ page }, testInfo) => {
        const files = { 'ui.html': demoUi(), 'code.js': demoCode() };
        for (const [file, body] of Object.entries(files)) {
          await page.route(`**/${file}`, (route) => (new URL(route.request().url()).pathname === `/${file}`
            ? route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', body })
            : route.fallback()));
        }
        await openPreview(page, theme === 'light' ? {} : { theme });
        const frame = pluginFrame(page);
        await frame.evaluate(() => document.fonts.ready);
        await installStage(page, { top: 16 });
        await settle(page);
        await expectWindowFits(page);
        // Toasts start paused, so their slide-in can be stepped through (see stepToast).
        await frame.evaluate(() => {
          new MutationObserver((records) => {
            for (const r of records) for (const n of r.addedNodes) if (n instanceof HTMLElement) for (const a of n.getAnimations({ subtree: true })) a.pause();
          }).observe(document.body, { childList: true, subtree: true });
        });
        const sb = new Storyboard(page, testInfo, `components-${theme}`);
        const stepToast = async () => {
          await expect(frame.locator('.kit-toast')).toHaveCount(1);
          await stepAnimations(sb, frame, '.kit-toast', 280);
        };
        await sb.place(400, 300);

        // 1. Menu.
        await sb.caption('Menu: click, then pick an item', 1);
        await sb.shot(600);
        await sb.moveTo(frame.locator('#options'), { ms: 420 });
        await sb.click({ hold: 600 });
        await expect(frame.locator('#options-menu')).toBeVisible();
        await sb.moveTo(frame.getByRole('menuitem', { name: 'Duplicate' }), { dx: 10, ms: 420 });
        await sb.poster('Kit components in a plugin window', 2400);
        sb.hold(300);
        await sb.click({ hold: 900 });
        await expect(frame.locator('#result')).toHaveText('You picked Duplicate');

        // 2. Tabs.
        await sb.caption('Tabs switch the options below', 2);
        await sb.shot(500);
        await sb.moveTo(frame.locator('.kit-tab', { hasText: 'SVG' }), { ms: 420 });
        await sb.click({ hold: 1400 });
        await settle(page);
        await expectWindowFits(page);

        // 3. Tooltip on keyboard focus.
        await sb.caption('Tooltip: on hover or keyboard focus', 3);
        await sb.move(400, 300, { ms: 280 });
        await sb.key('Tab', ['Tab'], { ms: 600 });
        await sb.key('Tab', ['Tab'], { ms: 1700 });
        await expect(frame.locator('#outline-tip')).toBeVisible();

        // 4. Dialog.
        await sb.caption('Dialog: a modal that returns your choice', 4);
        await sb.moveTo(frame.locator('#rename-open'), { ms: 490 });
        await sb.click({ hold: 1000 });
        await expect(frame.locator('#rename')).toBeVisible();
        await sb.moveTo(frame.locator('#rename button[value="rename"]'), { ms: 420 });
        await sb.click({ hold: 1300 });
        await expect(frame.locator('#result')).toHaveText('You pressed Rename');

        // 5. Two toasts, one after the other.
        await sb.caption('Toasts: one message at a time', 5);
        await sb.moveTo(frame.locator('#export'), { ms: 420 });
        await sb.ring(true);
        await page.mouse.down();
        await sb.shot(MOTION * 2);
        await page.mouse.up();
        await sb.ring(false);
        await sb.move(422, 250, { ms: 280 }); // off the window: a pointer over a toast pauses its timer
        await stepToast();
        // The first toast's own timer ends it (in real time); in the GIF it shows for 1.3 s.
        await expect(frame.locator('.kit-toast', { hasText: '1 hidden layer' })).toHaveCount(1, { timeout: 5000 });
        sb.hold(1300 - 280);
        await stepToast();
        sb.hold(1500);

        expect(sb.encode(out(`components-${theme}.gif`))).toBeLessThanOrEqual(BUDGET.gif);
      });
    }
  });

  test.describe('examples', () => {
    test.use({ viewport: { width: 400, height: 552 } });

    /** Fits a resizable window's height to its content, as the grip's Home key does (off camera). */
    const refit = async (page, frame) => {
      await frame.locator('[data-kit-resize]').focus();
      await page.keyboard.press('Home');
      await frame.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
      await settle(page, 300);
    };

    /** Each example's main action with the stub's sample selection (a card frame and a label). */
    const EXAMPLES = [
      {
        name: 'rename-layers', caption: 'Rename layers: preview every new name',
        async setup(page) { await host(page, () => window.kitPreviewHost.select('sample')); },
        async act(sb, frame, page) {
          await sb.moveTo(frame.locator('#prefix'), { dx: 40, ms: 420 });
          await sb.click();
          for (const ch of 'Icon/') {
            await page.keyboard.type(ch);
            await page.waitForTimeout(60);
            await settle(page);
            await sb.shot(140);
          }
          await expect(frame.locator('#rows')).toContainText('Icon/Card');
          await sb.poster('Five example plugins, made with the kit', 2400);
          sb.hold(1500);
        },
      },
      {
        name: 'export-selection', caption: 'Export: one PNG per layer, 1x to 3x',
        async setup(page, frame) { await host(page, () => window.kitPreviewHost.select('sample')); await settle(page, 300); await refit(page, frame); },
        async act(sb, frame) {
          await sb.moveTo(frame.locator('.kit-radio', { hasText: '3x' }), { dx: -10, ms: 420 });
          await sb.click({ hold: 1800 });
          await expect(frame.locator('#list')).toContainText('720 × 288');
        },
      },
      {
        name: 'content-fill', caption: 'Content fill: names, emails or dates',
        async setup(page) { await host(page, () => window.kitPreviewHost.select('sample')); },
        async act(sb, frame) {
          await sb.moveTo(frame.locator('#nested'), { ms: 420 });
          await sb.click({ settleMs: 150, hold: 500 });
          await sb.moveTo(frame.locator('#fill'), { ms: 420 });
          await sb.click({ settleMs: 300, hold: 1600 });
          await expect(frame.locator('#result')).toContainText('Filled 3 layers');
        },
      },
      {
        name: 'variables-sync', caption: 'Variables sync: edit a colour by hex',
        async setup(page, frame) { await expect(frame.locator('#list .kit-list-row')).toHaveCount(3); await refit(page, frame); },
        async act(sb, frame, page) {
          await sb.moveTo(frame.locator('#list .kit-list-row').filter({ has: frame.locator('.kit-list-row-label', { hasText: /^color\/brand$/ }) }), { ms: 420 });
          await sb.click({ hold: 300 });
          for (const ch of '9747FF') {
            await page.keyboard.type(ch);
            await sb.shot(MOTION * 2);
          }
          await sb.key('Enter', ['⏎'], { ms: 1500, wait: () => page.waitForTimeout(150) });
          await expect(frame.locator('#status')).toContainText('Set color/brand to 9747FF');
        },
      },
      {
        name: 'a11y-contrast', caption: 'Contrast check: flags text below AA',
        async setup(page, frame) {
          await host(page, () => window.kitPreviewHost.select('sample'));
          await expect(frame.locator('#list .kit-list-row')).not.toHaveCount(0);
        },
        async act(sb, frame, page) {
          await sb.moveTo(frame.locator('#list .kit-list-row').first(), { ms: 420 });
          await sb.click({ settleMs: 100, hold: 100 });
          await settle(page);
          await sb.shot(2000);
        },
      },
    ];

    for (const theme of THEMES) {
      test(`examples-${theme}.gif: the five examples, each doing its main action`, async ({ page }, testInfo) => {
        const missing = EXAMPLES.filter((ex) => !existsSync(new URL(`examples/${ex.name}/manifest.json`, ROOT))).map((ex) => ex.name);
        test.skip(missing.length > 0, `examples/ lacks ${missing.join(', ')} (deleted when starting a plugin), so examples-*.gif can't be made`);
        await seedRandom(page); // content-fill picks its names with Math.random, in the host page's realm
        await openPreview(page, { plugin: `examples/${EXAMPLES[0].name}`, ...(theme === 'light' ? {} : { theme }) });
        await installStage(page, { top: 16 });
        const sb = new Storyboard(page, testInfo, `examples-${theme}`);
        await sb.place(330, 470);
        for (const [i, ex] of EXAMPLES.entries()) {
          const frame = i === 0 ? pluginFrame(page) : await pickPlugin(page, `examples/${ex.name}`);
          await frame.evaluate(() => document.fonts.ready);
          await settle(page);
          await ex.setup(page, frame);
          await settle(page, 300);
          await expectWindowFits(page);
          await sb.caption(ex.caption, `${i + 1}/${EXAMPLES.length}`);
          await sb.shot(900);
          await ex.act(sb, frame, page);
          await expectWindowFits(page);
        }
        expect(sb.encode(out(`examples-${theme}.gif`))).toBeLessThanOrEqual(BUDGET.gif);
      });
    }
  });

  // ---- Stills ------------------------------------------------------------------------------------

  test.describe('components sheet', () => {
    test.use({ viewport: { width: 760, height: 1200 } });

    // The 20 components in their default state (plus a few telling states), grouped as in the
    // README's table. The open tooltip, menu, dialog and toast are the gallery's static copies
    // (data-kit-demo-open, preview.html only); everything else is plain kit markup.
    const icon = (d) => `<svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const PLUS = 'M12 7.5v9M7.5 12h9';
    const ALIGN = 'M7.5 6.5v11M10.5 9.5h6M10.5 14.5h4';
    const CLOSE = 'm8 8 8 8m0-8-8 8';
    const FRAME = 'M9.5 6.5v11M14.5 6.5v11M6.5 9.5h11M6.5 14.5h11';
    const item = (name, body) => `<div class="sheet-item"><span class="sheet-name">${name}</span>${body}</div>`;
    const SHEET = `<div id="rec-sheet">
<section class="sheet-group"><h2>Actions</h2>
${item('Button', `<div class="kit-row sheet-wrap"><button class="kit-button kit-button-primary" type="button">Create</button><button class="kit-button kit-button-secondary" type="button">Cancel</button><button class="kit-button kit-button-tertiary" type="button">Reset</button><button class="kit-button kit-button-danger" type="button">Delete</button><button class="kit-button kit-button-primary" type="button" aria-busy="true">Create</button><button class="kit-button kit-button-secondary" type="button" disabled>Export</button></div>`)}
${item('Icon button', `<div class="kit-row"><button class="kit-icon-button" type="button" aria-label="Align left">${icon(ALIGN)}</button><button class="kit-icon-button" type="button" aria-label="Add">${icon(PLUS)}</button><button class="kit-icon-button" type="button" aria-label="Grid" aria-pressed="true">${icon(FRAME)}</button></div>`)}
</section>
<section class="sheet-group"><h2>Fields</h2>
${item('Text input', `<div class="kit-field"><label class="kit-label" for="s-name">Name</label><input class="kit-input" id="s-name" type="text" value="Header"></div>`)}
${item('Textarea', `<div class="kit-field"><label class="kit-label" for="s-names">Names</label><textarea class="kit-textarea" id="s-names" rows="2">Card
Card 2</textarea></div>`)}
<div class="sheet-pair">
${item('Number field', `<div class="kit-number"><span class="kit-number-prefix" aria-hidden="true">W</span><input class="kit-input" type="number" value="320" aria-label="Width"></div>`)}
${item('Colour field', `<div class="kit-color"><input class="kit-color-swatch" type="color" value="#0d99ff" aria-label="Pick a colour"><input class="kit-input" type="text" value="0D99FF" aria-label="Hex" spellcheck="false"></div>`)}
</div>
</section>
<section class="sheet-group"><h2>Choices</h2>
${item('Select', `<div class="kit-select"><select aria-label="Shape"><option>Rectangle</option><option>Ellipse</option></select></div>`)}
<div class="sheet-pair">
${item('Checkbox', `<div class="kit-stack sheet-tight"><label class="kit-checkbox"><input type="checkbox" checked>Include hidden</label><label class="kit-checkbox"><input type="checkbox">Outline text</label></div>`)}
${item('Radio', `<div class="kit-stack sheet-tight" role="radiogroup" aria-label="Scale"><label class="kit-radio"><input type="radio" name="s-scale">1x</label><label class="kit-radio"><input type="radio" name="s-scale" checked>2x</label></div>`)}
</div>
${item('Tabs', `<div class="kit-tabs"><div class="kit-tablist" role="radiogroup" aria-label="Format"><label class="kit-tab"><input type="radio" name="s-tabs" checked>PNG</label><label class="kit-tab"><input type="radio" name="s-tabs">SVG</label><label class="kit-tab"><input type="radio" name="s-tabs">PDF</label></div><div><p class="kit-help">Scale and background.</p></div><div></div><div></div></div>`)}
</section>
<section class="sheet-group"><h2>Overlays</h2>
<div class="sheet-pair">
${item('Tooltip', `<span class="kit-tooltip-host sheet-tip"><button class="kit-icon-button" type="button" aria-label="Align left" aria-describedby="s-tip">${icon(ALIGN)}</button><span class="kit-tooltip" role="tooltip" id="s-tip" data-kit-demo-open>Align left edges</span></span>`)}
${item('Menu', `<div class="kit-menu" role="menu" aria-label="More actions" data-kit-demo-open><button class="kit-menu-item" role="menuitem" type="button" tabindex="-1">Rename…</button><button class="kit-menu-item" role="menuitem" type="button" tabindex="-1">Duplicate</button><hr class="kit-menu-separator"><button class="kit-menu-item" role="menuitem" type="button" tabindex="-1" disabled>Delete</button></div>`)}
</div>
${item('Dialog', `<dialog class="kit-dialog kit-dialog-small" open inert aria-labelledby="s-dialog-title" data-kit-demo-open><header class="kit-dialog-header"><h2 id="s-dialog-title">Delete 3 layers?</h2><button class="kit-icon-button" type="button" aria-label="Close">${icon(CLOSE)}</button></header><div class="kit-dialog-body"><p class="kit-text-secondary">Undo brings them back.</p></div><footer class="kit-dialog-footer"><button class="kit-button kit-button-secondary" type="button">Cancel</button><button class="kit-button kit-button-danger" type="button">Delete</button></footer></dialog>`)}
${item('Toast', `<div class="kit-toast" inert data-kit-demo-open><p class="kit-toast-text">Renamed 3 layers</p><button class="kit-button kit-button-secondary" type="button">Undo</button><button class="kit-icon-button" type="button" aria-label="Dismiss">${icon(CLOSE)}</button></div>`)}
</section>
<section class="sheet-group"><h2>Layout</h2>
${item('Section header', `<header class="kit-section-header"><h4>Layers</h4><button class="kit-icon-button" type="button" aria-label="Add layer">${icon(PLUS)}</button></header>`)}
${item('List', `<ul class="kit-list" aria-label="Frames"><li class="kit-list-row"><svg class="kit-icon kit-list-row-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${FRAME}" fill="none" stroke="currentColor" stroke-linecap="round"/></svg><span class="kit-list-row-label">Header</span><span class="kit-list-row-meta">1440 × 80</span></li><li class="kit-list-row"><svg class="kit-icon kit-list-row-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${FRAME}" fill="none" stroke="currentColor" stroke-linecap="round"/></svg><span class="kit-list-row-label">Hero</span><span class="kit-list-row-meta">1440 × 720</span></li></ul>`)}
${item('Empty state', `<div class="kit-empty sheet-empty"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 6.5 6 3-6 3-6-3zM6 13.5l6 3 6-3" fill="none" stroke="currentColor" stroke-linejoin="round"/></svg><p class="kit-empty-title">No layers selected</p><p class="kit-empty-text">Select layers to rename them.</p></div>`)}
${item('Inline notice', `<div class="kit-notice" data-kit-tone="info" role="status"><svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor"/><path d="M12 11.5v3M12 9.25v.01" fill="none" stroke="currentColor" stroke-linecap="round"/></svg><p class="kit-notice-text">Hidden layers are skipped.</p></div>`)}
<div class="sheet-pair sheet-pair-footer">
${item('Sticky footer', `<footer class="kit-footer sheet-footer"><p class="kit-text-secondary">3 selected</p><button class="kit-button kit-button-primary" type="button">Rename</button></footer>`)}
${item('Resize handle', `<div class="kit-demo-handle"><button class="kit-resize-handle" type="button" aria-label="Resize window"></button></div>`)}
</div>
</section>
</div>`;
    const SHEET_CSS = `
body > :not(#rec-sheet) { display: none !important; }
html, body { background-color: var(--figma-color-bg-secondary) !important; }
#rec-sheet { columns: 2; column-gap: 12px; width: 728px; padding: 16px; box-sizing: content-box; background-color: var(--figma-color-bg-secondary); }
.sheet-group { break-inside: avoid; display: flex; flex-direction: column; gap: 12px; margin: 0 0 12px; padding: 12px 14px 14px; border: 1px solid var(--figma-color-border); border-radius: var(--kit-radius-large); background-color: var(--figma-color-bg); }
.sheet-group > h2 { margin: 0; color: var(--figma-color-text); font: var(--kit-font-weight-strong) var(--kit-font-size-large)/var(--kit-line-height-large) var(--kit-font-family); }
.sheet-item { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sheet-name { color: var(--figma-color-text-tertiary); font-size: 10px; font-weight: var(--kit-font-weight-strong); line-height: 16px; letter-spacing: 0.04em; text-transform: uppercase; }
.sheet-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
.sheet-pair-footer { grid-template-columns: 1fr auto; }
.sheet-wrap { flex-wrap: wrap; }
.sheet-tight { gap: 4px; }
.sheet-tip { margin: 2px 0 34px 52px; align-self: flex-start; }
.sheet-empty { padding: 0; }
.sheet-footer { position: static; padding: 0; border: 0; background: none; }
`;

    for (const theme of THEMES) {
      test(`components-sheet-${theme}.png: the 20 components at a glance`, async ({ page }) => {
        await openPreview(page, theme === 'light' ? {} : { theme });
        await page.addStyleTag({ content: SHEET_CSS });
        await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), SHEET);
        await page.evaluate(() => document.fonts.ready);
        const names = await page.locator('#rec-sheet .sheet-name').allTextContents();
        expect(names, 'one label per component').toHaveLength(20);
        const file = out(`components-sheet-${theme}.png`);
        await page.locator('#rec-sheet').screenshot({ path: file, animations: 'disabled', caret: 'hide', scale: 'device' });
        console.log(`${basename(file)}: ${(statSync(file).size / 1024).toFixed(0)} KB`);
        expect(statSync(file).size).toBeLessThanOrEqual(BUDGET.png);
      });
    }
  });

  test.describe('Figma side by side', () => {
    // Not a recording: the two real Figma captures of each theme (docs/img/figma-starter-*.png and
    // figma-panel-*.png, same moment, same scale), joined into one image: the starter window, a
    // transparent gap, and the top of the Design panel cropped to the window's height.
    /** A PNG's width and height, from its IHDR chunk. */
    const pngSize = (file) => {
      const bytes = readFileSync(file);
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    };
    const GAP = 40;

    for (const theme of THEMES) {
      test(`figma-side-by-side-${theme}.png: the starter next to Figma's own panel`, async () => {
        const starter = fileURLToPath(new URL(`docs/img/figma-starter-${theme}.png`, ROOT));
        const panel = fileURLToPath(new URL(`docs/img/figma-panel-${theme}.png`, ROOT));
        const file = fileURLToPath(new URL(`docs/img/figma-side-by-side-${theme}.png`, ROOT));
        const s = pngSize(starter);
        const p = pngSize(panel);
        expect(p.height, 'the panel is taller than the window, so cropping it loses nothing above').toBeGreaterThan(s.height);
        ffmpeg(['-i', starter, '-i', panel, '-filter_complex',
          `[1:v]format=rgba,crop=${p.width}:${s.height}:0:0[p];`
          + `[0:v]format=rgba,pad=width=${s.width + GAP + p.width}:height=${s.height}:x=0:y=0:color=0x00000000[s];`
          + `[s][p]overlay=x=${s.width + GAP}:y=0:format=auto,format=rgba`,
          '-frames:v', '1', '-update', '1', file]);
        expect(pngSize(file)).toEqual({ width: s.width + GAP + p.width, height: s.height });
        console.log(`${basename(file)}: ${(statSync(file).size / 1024).toFixed(0)} KB`);
        expect(statSync(file).size).toBeLessThanOrEqual(BUDGET.png);
      });
    }
  });
});
