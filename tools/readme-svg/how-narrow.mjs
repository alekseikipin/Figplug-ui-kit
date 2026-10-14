import { esc, r2, len, MONO, SANS, themeCss, timeline, wrap, svgDoc } from './lib.mjs';

/**
 * The narrow (phone) version of how-it-works.svg: the same messages on the same timeline, between
 * two rails at the edges, without the drawing of the plugin window (its size is a line of text).
 */
export function howNarrowSvg() {
  const W = 400;
  const tl = timeline(14);
  const FS = 10.5;
  const mt = (x, y, s, cls = '', anchor = 'start', fs = FS) =>
    `<text class="m ${cls}" x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" style="font-size:${fs}px" textLength="${r2(len(s) * fs * 0.6)}" lengthAdjust="spacing">${esc(s)}</text>`;

  const MX = 28, UX = 372; // the two rails
  const els = [];

  // ---- Headers
  const CW = (W - 32 - 12) / 2;
  els.push(`<rect class="card" x="16.5" y="16.5" width="${CW - 1}" height="59" rx="10"/>`);
  els.push(`<text class="s h" x="30" y="40">code.ts<tspan class="sub" dx="6">main thread</tspan></text>`);
  els.push(`<text class="s note" x="30" y="60">the figma API · no DOM</text>`);
  const RX = 16 + CW + 12;
  els.push(`<rect class="card" x="${RX + 0.5}" y="16.5" width="${CW - 1}" height="59" rx="10"/>`);
  els.push(`<text class="s h" x="${RX + 14}" y="40">ui.html<tspan class="sub" dx="6">iframe</tspan></text>`);
  els.push(`<text class="s note" x="${RX + 14}" y="60">the DOM · no figma object</text>`);

  const rows = { r1: 142, r2: 172, r3: 202, sep: 244, r4: 270, r5: 306, r6: 332, r7: 364 };
  const railEnd = 392;
  els.push(`<path class="rail" d="M${MX} 76V${railEnd}"/><path class="rail" d="M${UX} 76V${railEnd}"/>`);
  els.push(`<circle class="railend" cx="${MX}" cy="76" r="2.5"/><circle class="railend" cx="${UX}" cy="76" r="2.5"/>`);

  // ---- The window's state, on the UI side
  const state = (t0, t1, s) => {
    const anim = t1 === null ? tl.appear(t0, { dur: 0.2, dy: 0 }) : tl.window(t0, t1, { dur: 0.2 });
    return `<g class="an ${anim}${t1 === null ? '' : ' hide'}">${mt(UX - 8, 100, s, 'kitt', 'end')}</g>`;
  };
  els.push(state(0.35, 3.3, 'window: hidden at 320 × 360'));
  els.push(state(3.5, 9.0, 'window: shown at 320 × 237'));
  els.push(state(9.15, null, 'window: 320 × 245'));

  // ---- Messages
  const arrow = (y, dir, label, kind, t0) => {
    const t1 = t0 + 0.5;
    const L = UX - 2 - (MX + 2);
    const [x1, x2] = dir === 'ui' ? [UX - 2, MX + 2] : [MX + 2, UX - 2];
    const head = dir === 'ui'
      ? `M${x2 + 7} ${y - 4}L${x2} ${y}L${x2 + 7} ${y + 4}`
      : `M${x2 - 7} ${y - 4}L${x2} ${y}L${x2 - 7} ${y + 4}`;
    const draw = tl.draw(t0, t1, L);
    const ah = tl.appear(t1 - 0.05, { dur: 0.08, dy: 0 });
    const lab = tl.appear(t0, { dur: 0.2, dy: 3 });
    const dot = tl.travel(t0, t1, x2 - x1);
    return `<path class="an ${draw} ln ${kind}s" d="M${x1} ${y}H${x2}" style="stroke-dasharray:${L}px"/>`
      + `<path class="an ${ah} hd ${kind}s" d="${head}"/>`
      + `<circle class="an ${dot} ${kind}f hide" cx="${x1}" cy="${y}" r="3.5"/>`
      + `<g class="an ${lab}">${mt((MX + UX) / 2, y - 7, label, `${kind}t`, 'middle')}</g>`;
  };
  els.push(arrow(rows.r1, 'ui', 'kit:ready { protocol: 1 }', 'kit', 1.0));
  els.push(arrow(rows.r2, 'main', 'kit:init { mode, chrome, bounds, size, … }', 'kit', 1.95));
  els.push(arrow(rows.r3, 'ui', 'kit:resize { width: 320, height: 237, … }', 'kit', 2.85));
  els.push(`<g class="an ${tl.appear(4.7)}"><text class="s sep" x="${(MX + UX) / 2}" y="${rows.sep}" text-anchor="middle">the person clicks Create</text></g>`);
  els.push(arrow(rows.r4, 'ui', 'create-shapes { count: 5, … }', 'you', 5.5));
  els.push(arrow(rows.r5, 'main', 'created { count: 5 }', 'you', 6.75));
  els.push(arrow(rows.r6, 'main', 'selection { count: 5 }', 'you', 7.25));
  els.push(arrow(rows.r7, 'ui', 'kit:resize { width: 320, height: 245, … }', 'kit', 8.55));

  // ---- Main-thread notes, beside the main rail
  const note = (y, s, t, cls = 'code') => `<g class="an ${tl.appear(t, { dur: 0.2, dy: 3 })}">${mt(MX + 8, y, s, cls, 'start', 10)}</g>`;
  els.push(note(100, 'installKitWindow()', 0.15, 'code b'));
  els.push(note(114, 'figma.showUI(…, { visible: false })', 0.15));
  els.push(note(rows.r3 + 16, 'figma.ui.resize(320, 237), figma.ui.show()', 3.4));
  els.push(note(rows.r4 + 16, 'figma.createRectangle() × 5', 6.05));
  els.push(note(rows.r7 + 16, 'figma.ui.resize(320, 245)', 9.1));

  // ---- Captions and legend
  const caps = [
    [0.15, 3.55, '1 · Opens hidden, sized by the kit’s messages', 'The runtime measures [data-kit-root]; code.ts applies the size.'],
    [3.55, 5.1, '2 · Shown once it has fitted its content', 'Hidden until then, so it shouldn’t flash blank or jump (to re-check in Figma).'],
    [5.1, 8.45, '3 · Your messages use the same channel', 'Any type that isn’t kit:*, typed like kit.d.ts types the kit’s.'],
    [8.45, 14, '4 · The content grew a line; the window follows', 'A ResizeObserver refits it: one more kit:resize.'],
  ];
  const CAP = railEnd + 26;
  caps.forEach(([a, b, h, d], i) => {
    const last = i === caps.length - 1;
    const anim = last ? tl.appear(a, { dur: 0.25, dy: 3 }) : tl.window(a, b - 0.25, { dur: 0.25 });
    const lines = wrap(d, 58).map((l, k) => `<text class="s capd" x="16" y="${CAP + 20 + k * 16}">${esc(l)}</text>`).join('');
    els.push(`<g class="an ${anim}${last ? '' : ' hide'}"><text class="s caph" x="16" y="${CAP}">${esc(h)}</text>${lines}</g>`);
  });
  const LEG = CAP + 70;
  els.push(`<path class="ln kits" d="M16 ${LEG - 4}h22"/><path class="hd kits" d="M33 ${LEG - 8}l5 4-5 4"/><text class="s leg" x="48" y="${LEG}">kit:ready, kit:init, kit:resize, kit:fit: the kit’s own</text>`);
  els.push(`<path class="ln yous" d="M16 ${LEG + 18}h22"/><path class="hd yous" d="M33 ${LEG + 14}l5 4-5 4"/><text class="s leg" x="48" y="${LEG + 22}">any other type: yours (here, the starter’s demo)</text>`);

  const H = LEG + 38;
  const tokens = {
    card: ['#f6f8fa', '#151b23'], line: ['#d1d9e0', '#3d444d'], fg: ['#1f2328', '#f0f6fc'], mute: ['#59636e', '#9198a1'],
    kit: ['#0969da', '#4493f8'], you: ['#8250df', '#ab7df8'],
  };
  const { scene, text: anim } = tl.css({ fadeOut: 13.1 });
  const css = [
    themeCss(tokens),
    `.m{font-family:${MONO}}`, `.s{font-family:${SANS}}`, 'text{white-space:pre}', '.b{font-weight:600}',
    '.card{fill:var(--card);stroke:var(--line)}',
    '.h{fill:var(--fg);font-size:14px;font-weight:600}', '.sub{fill:var(--mute);font-size:12px;font-weight:400}',
    '.note{fill:var(--mute);font-size:11px}',
    '.rail{stroke:var(--line);stroke-width:1.5;stroke-dasharray:3 4}', '.railend{fill:var(--line)}',
    '.ln{fill:none;stroke-width:1.6}', '.hd{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}',
    '.kits{stroke:var(--kit)}', '.yous{stroke:var(--you)}', '.kitf{fill:var(--kit)}', '.youf{fill:var(--you)}',
    '.kitt{fill:var(--kit)}', '.yout{fill:var(--you)}',
    '.code{fill:var(--fg)}', '.sep{fill:var(--mute);font-size:11px;font-style:italic}',
    '.caph{fill:var(--fg);font-size:13.5px;font-weight:600}', '.capd{fill:var(--mute);font-size:12px}', '.leg{fill:var(--mute);font-size:11.5px}',
    '.hide{opacity:0}',
    anim,
  ].join('\n');

  const body = `<g class="an ${scene}">\n${els.join('\n')}\n</g>`;
  return {
    w: W, h: H,
    svg: tl.render(svgDoc({
      w: W, h: H, css, body,
      title: 'How the kit works: two threads and their messages',
      desc: 'Animated diagram, narrow version. code.ts runs on Figma\'s main thread (the figma API, no DOM); ui.html runs in an iframe (the DOM, no figma object). installKitWindow() opens the window hidden at 320 × 360. The runtime sends kit:ready { protocol: 1 }, code.ts answers kit:init { mode, chrome, bounds, size, … }, the runtime measures the content and sends kit:resize { width: 320, height: 237, … }, and code.ts calls figma.ui.resize and shows the window at that size. (That this removes a blank or unfitted flash in Figma itself is still to be re-checked in a Figma run.) Clicking Create sends the demo\'s create-shapes message; code.ts answers created and selection, and one more kit:resize grows the window to 245. Sizes are those of the starter in the kit\'s browser preview.',
    })),
  };
}
