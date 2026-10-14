import { esc, r2, len, MONO, SANS, themeCss, timeline, svgDoc } from './lib.mjs';

export function howSvg() {
  const W = 880;
  const tl = timeline(14);
  const LFS = 10, LCW = LFS * 0.6; // message labels, notes
  const mt = (x, y, s, cls = '', anchor = 'start', fs = LFS) =>
    `<text class="m ${cls}" x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" style="font-size:${fs}px" textLength="${r2(len(s) * fs * 0.6)}" lengthAdjust="spacing">${esc(s)}</text>`;

  const MX = 300, UX = 572; // main rail, window's left edge
  const WX = 572, WW = 292, WY = 100, TB = 30, S = WW / 320;
  const fitH = 237, growH = 245, defH = 360;
  const yC = WY + TB; // content top
  const bottom = (h) => yC + h * S;

  const els = [];

  // ---- Headers
  const chip = (x, y, s, pulse, cls = '') => {
    const w = len(s) * 6 + 12;
    const hl = pulse ? `<rect class="an ${pulse} chiphl ${cls}" x="${r2(x)}" y="${y}" width="${r2(w)}" height="17" rx="8.5"/>` : '';
    return { w, svg: `<rect class="chip" x="${r2(x)}" y="${y}" width="${r2(w)}" height="17" rx="8.5"/>${hl}${mt(x + 6, y + 12, s, 'chipt', 'start', 10)}` };
  };
  const chips = (x, y, list) => {
    let out = '';
    for (const [s, pulse, cls] of list) { const c = chip(x, y, s, pulse, cls); out += c.svg; x += c.w + 6; }
    return out;
  };

  // pulse timings
  const pKitWin = tl.pulses([[0.15, 0.95], [1.85, 2.5], [3.35, 3.95], [9.15, 9.7]]);
  const pYourCode = tl.pulses([[6.05, 7.85]]);
  const pRuntime = tl.pulses([[0.85, 1.55], [2.45, 3.35], [8.45, 9.2]]);
  const pYourUi = tl.pulses([[5.15, 6.05], [7.25, 8.2]]);
  const pTok = tl.pulses([[3.55, 4.5]]);

  els.push(`<rect class="card" x="16.5" y="16.5" width="${MX - 16 - 1}" height="75" rx="10"/>`);
  els.push(`<text class="s h" x="32" y="40">code.ts<tspan class="sub" dx="8">main thread</tspan></text>`);
  els.push(`<text class="s note" x="32" y="58">the figma API · no DOM</text>`);
  els.push(chips(32, 66, [['kit:window', pKitWin, 'kitc'], ['your code', pYourCode, 'youc']]));

  els.push(`<rect class="card" x="${UX + 0.5}" y="16.5" width="${WW - 1}" height="75" rx="10"/>`);
  els.push(`<text class="s h" x="${UX + 16}" y="40">ui.html<tspan class="sub" dx="8">iframe</tspan></text>`);
  els.push(`<text class="s note" x="${UX + 16}" y="58">the DOM · no figma object</text>`);
  els.push(chips(UX + 16, 66, [['tokens', pTok, 'kitc'], ['components', pTok, 'kitc'], ['runtime', pRuntime, 'kitc'], ['your UI', pYourUi, 'youc']]));

  // Main rail
  els.push(`<path class="rail" d="M${MX} 92V352"/>`);

  // ---- Messages
  const rows = { r1: 136, r2: 166, r3: 196, sep: 224, r4: 252, r5: 280, r6: 306, r7: 334 };
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
  els.push(`<circle class="railend" cx="${MX}" cy="92" r="2.5"/>`);
  els.push(arrow(rows.r1, 'ui', 'kit:ready { protocol: 1 }', 'kit', 1.0));
  els.push(arrow(rows.r2, 'main', 'kit:init { mode, chrome, bounds, size, … }', 'kit', 1.95));
  els.push(arrow(rows.r3, 'ui', 'kit:resize { width: 320, height: 237, … }', 'kit', 2.85));
  els.push(`<g class="an ${tl.appear(4.7)}"><text class="s sep" x="${(MX + UX) / 2}" y="${rows.sep + 4}" text-anchor="middle">the person clicks Create</text></g>`);
  els.push(arrow(rows.r4, 'ui', "create-shapes { count: 5, … }", 'you', 5.5));
  els.push(arrow(rows.r5, 'main', 'created { count: 5 }', 'you', 6.75));
  els.push(arrow(rows.r6, 'main', 'selection { count: 5 }', 'you', 7.25));
  els.push(arrow(rows.r7, 'ui', 'kit:resize { width: 320, height: 245, … }', 'kit', 8.55));

  // ---- Main-thread notes (right-aligned on the rail)
  const note = (y, s, t, cls = 'code') => `<g class="an ${tl.appear(t, { dur: 0.2, dy: 3 })}">${mt(MX - 10, y, s, cls, 'end')}</g>`;
  els.push(note(110, 'installKitWindow()', 0.15, 'code b'));
  els.push(note(124, 'figma.showUI(…, { visible: false })', 0.15));
  els.push(note(rows.r3 + 4, 'figma.ui.resize(320, 237), figma.ui.show()', 3.4));
  els.push(note(rows.r4 + 4, 'figma.createRectangle() × 5', 6.05));
  els.push(note(rows.r7 + 4, 'figma.ui.resize(320, 245)', 9.1));

  // ---- The plugin window
  // Ghost: the hidden window at its starting size
  const ghostH = TB + defH * S;
  els.push(`<g class="an ${tl.window(0.35, 3.3, { dur: 0.2 })} hide"><rect class="ghost" x="${WX + 0.5}" y="${WY + 0.5}" width="${WW - 1}" height="${r2(ghostH - 1)}" rx="8"/>`
    + `<text class="s ghostt" x="${WX + WW / 2}" y="${r2(WY + ghostH / 2 - 4)}" text-anchor="middle">hidden</text>`
    + `<text class="s ghostt2" x="${WX + WW / 2}" y="${r2(WY + ghostH / 2 + 14)}" text-anchor="middle">opens at 320 × 360</text></g>`);

  const fitPx = TB + fitH * S, growPx = TB + growH * S;
  const k = growPx / fitPx;
  const grow = tl.add(`0%,${tl.p(9.15)}{transform:scaleY(1)}${tl.p(9.45)},100%{transform:scaleY(${r2(k * 1000) / 1000})}`);
  const slide8 = tl.add(`0%,${tl.p(9.15)}{transform:translateY(0)}${tl.p(9.45)},100%{transform:translateY(${r2(8 * S)}px)}`);
  const shown = tl.appear(3.5, { dur: 0.3, dy: 0 });

  // content in real 320-wide coordinates
  const c = [];
  const st = (x, y, s, cls, anchor = 'start') => `<text class="s ${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;
  c.push(st(16, 28, 'Create shapes', 'wt hb'));
  c.push(st(16, 52, 'Count', 'ws'));
  c.push(`<rect class="inp" x="16" y="60" width="288" height="24" rx="5"/>`);
  c.push(st(24, 76, '5', 'wt'));
  c.push(st(16, 100, 'From 1 to 50, placed in a row.', 'ws'));
  c.push(st(16, 124, 'Shape', 'ws'));
  c.push(`<rect class="selb" x="16.5" y="132.5" width="287" height="23" rx="5"/>`);
  c.push(st(24, 148, 'Rectangle', 'wt'));
  c.push(`<path class="chev" d="M287 142l4 4 4-4"/>`);
  c.push(`<path class="wdiv" d="M0 172.5H320"/>`);
  // footer: before (one line) and after (two lines)
  const stUpd = 7.85;
  c.push(`<g class="an ${tl.vanish(stUpd, { dur: 0.01 })} hide">${st(16, 205, 'Nothing selected', 'ws')}</g>`);
  c.push(`<g class="an ${tl.appear(stUpd, { dur: 0.01, dy: 0 })}">${st(16, 201, '5 layers selected', 'ws')}${st(16, 217, 'Created 5 rectangles', 'ws')}</g>`);
  const btnMove = tl.add(`0%,${tl.p(stUpd)}{transform:translateY(-4px)}${tl.p(stUpd + 0.01)},100%{transform:translateY(0)}`);
  const press = tl.pulses([[5.2, 5.45]], { dur: 0.05, max: 1 });
  c.push(`<g class="an ${btnMove}"><rect class="btn2" x="198.5" y="193.5" width="45" height="23" rx="5"/>${st(221, 209, 'Close', 'wt', 'middle')}`
    + `<rect class="btn1" x="252" y="193" width="52" height="24" rx="5"/><rect class="an ${press} pressed hide" x="252" y="193" width="52" height="24" rx="5"/>${st(278, 209, 'Create', 'onb', 'middle')}`
    + `<rect class="an ${tl.pulses([[5.2, 5.6]], { dur: 0.1, max: 0.9 })} ring hide" x="249" y="190" width="58" height="30" rx="7"/></g>`);

  const gripY = fitH; // grip sits in the bottom-right corner
  els.push(`<g class="an ${shown}">`
    + `<rect class="an ${grow} wbg grow" x="${WX + 0.5}" y="${WY + 0.5}" width="${WW - 1}" height="${r2(fitPx - 1)}" rx="8"/>`
    + `<rect class="wico" x="${WX + 12}" y="${WY + 8}" width="14" height="14" rx="3.5"/>`
    + `<text class="s wtitle" x="${WX + 34}" y="${WY + 19.5}">Kit starter</text>`
    + `<path class="wx" d="M${WX + WW - 22} ${WY + 10}l9 9m0-9l-9 9"/>`
    + `<path class="wdiv" d="M${WX + 1} ${WY + TB + 0.5}H${WX + WW - 1}"/>`
    + `<g transform="translate(${WX} ${yC}) scale(${r2(S * 10000) / 10000})">${c.join('')}</g>`
    + `<g class="an ${slide8} slide8"><path class="grip" d="M${r2(WX + WW - 5)} ${r2(bottom(gripY) - 12)}l-7 7m7-3l-3 3"/></g>`
    + `</g>`);

  // ---- Captions and legend (bottom left)
  const caps = [
    [0.15, 3.55, '1 · Opens hidden, then sized by the kit’s messages', 'The runtime measures [data-kit-root]; code.ts applies the size.'],
    [3.55, 5.1, '2 · Shown once it has fitted its content', 'Hidden until then, so it shouldn’t flash blank or jump (to re-check in Figma).'],
    [5.1, 8.45, '3 · Your messages use the same channel', 'Any type that isn’t kit:*, typed like kit.d.ts types the kit’s.'],
    [8.45, 14, '4 · The content grew a line, so the window follows', 'A ResizeObserver refits it: one more kit:resize.'],
  ];
  caps.forEach(([a, b, h, d], i) => {
    const last = i === caps.length - 1;
    const anim = last ? tl.appear(a, { dur: 0.25, dy: 3 }) : tl.window(a, b - 0.25, { dur: 0.25 });
    els.push(`<g class="an ${anim}${last ? '' : ' hide'}"><text class="s caph" x="16" y="392">${esc(h)}</text><text class="s capd" x="16" y="412">${esc(d)}</text></g>`);
  });
  els.push(`<path class="ln kits" d="M16 446h22"/><path class="hd kits" d="M33 442l5 4-5 4"/><text class="s leg" x="48" y="450">kit:ready, kit:init, kit:resize, kit:fit: the kit’s own (kit.d.ts)</text>`);
  els.push(`<path class="ln yous" d="M16 468h22"/><path class="hd yous" d="M33 464l5 4-5 4"/><text class="s leg" x="48" y="472">any other type: yours (here, the starter’s demo)</text>`);

  const H = 488;
  const tokens = {
    card: ['#f6f8fa', '#151b23'], line: ['#d1d9e0', '#3d444d'], fg: ['#1f2328', '#f0f6fc'], mute: ['#59636e', '#9198a1'],
    kit: ['#0969da', '#4493f8'], kitbg: ['#ddf4ff', '#132d4c'], you: ['#8250df', '#ab7df8'], youbg: ['#fbefff', '#2c1d4a'],
    chip: ['#ffffff', '#0d1117'],
    // the plugin window, drawn in Figma's own palette (approximate)
    wbg: ['#ffffff', '#2c2c2c'], wline: ['#e6e6e6', '#444444'], wt: ['#1e1e1e', '#ffffff'], ws: ['#757575', '#b3b3b3'],
    winp: ['#f5f5f5', '#383838'], brand: ['#0d99ff', '#0c8ce9'], brandp: ['#007be5', '#0a6dc2'],
  };
  const { scene, text: anim } = tl.css({ fadeOut: 13.1 });
  const css = [
    themeCss(tokens),
    `.m{font-family:${MONO}}`, `.s{font-family:${SANS}}`, 'text{white-space:pre}', '.b{font-weight:600}',
    '.card{fill:var(--card);stroke:var(--line)}',
    '.h{fill:var(--fg);font-size:14px;font-weight:600}', '.sub{fill:var(--mute);font-size:12px;font-weight:400}',
    '.note{fill:var(--mute);font-size:11.5px}',
    '.chip{fill:var(--chip);stroke:var(--line)}', '.chipt{fill:var(--fg)}',
    '.chiphl{opacity:0}', '.chiphl.kitc{fill:var(--kitbg);stroke:var(--kit)}', '.chiphl.youc{fill:var(--youbg);stroke:var(--you)}',
    '.rail{stroke:var(--line);stroke-width:1.5;stroke-dasharray:3 4}', '.railend{fill:var(--line)}',
    '.ln{fill:none;stroke-width:1.6}', '.hd{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}',
    '.kits{stroke:var(--kit)}', '.yous{stroke:var(--you)}', '.kitf{fill:var(--kit)}', '.youf{fill:var(--you)}',
    '.kitt{fill:var(--kit)}', '.yout{fill:var(--you)}',
    '.code{fill:var(--fg)}', '.sep{fill:var(--mute);font-size:11px;font-style:italic}',
    '.ghost{fill:none;stroke:var(--mute);stroke-width:1.2;stroke-dasharray:5 4}', '.ghostt{fill:var(--mute);font-size:13px;font-weight:600}', '.ghostt2{fill:var(--mute);font-size:11.5px}',
    '.wbg{fill:var(--wbg);stroke:var(--wline)}',
    `.grow{transform-origin:${WX}px ${WY}px;transform:scaleY(${r2(k * 1000) / 1000})}`, `.slide8{transform:translateY(${r2(8 * S)}px)}`,
    '.wico{fill:var(--wt)}', '.wtitle{fill:var(--wt);font-size:12px;font-weight:600}', '.wx{stroke:var(--wt);stroke-width:1.3;fill:none}',
    '.wdiv{stroke:var(--wline);fill:none}', '.wt{fill:var(--wt);font-size:11px}', '.ws{fill:var(--ws);font-size:11px}', '.hb{font-weight:600}',
    '.inp{fill:var(--winp)}', '.selb{fill:none;stroke:var(--wline)}', '.chev{fill:none;stroke:var(--ws);stroke-width:1.2}',
    '.btn2{fill:none;stroke:var(--wline)}', '.btn1{fill:var(--brand)}', '.pressed{fill:var(--brandp)}', '.onb{fill:#ffffff;font-size:11px}',
    '.ring{fill:none;stroke:var(--brand);stroke-width:2}', '.grip{stroke:var(--ws);stroke-width:1.2;fill:none;stroke-linecap:round}',
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
      desc: 'Animated diagram. code.ts runs on Figma\'s main thread (the figma API, no DOM); ui.html runs in an iframe (the DOM, no figma object) with the kit\'s tokens, components and runtime blocks. installKitWindow() opens the window hidden at 320 × 360. The runtime sends kit:ready { protocol: 1 }, code.ts answers kit:init { mode, chrome, bounds, size, … }, the runtime measures the content and sends kit:resize { width: 320, height: 237, … }, and code.ts calls figma.ui.resize and shows the window at that size. (That this removes a blank or unfitted flash in Figma itself is still to be re-checked in a Figma run.) Clicking Create sends the demo\'s create-shapes message; code.ts answers created and selection, the status grows to two lines, and one more kit:resize grows the window to 245. Sizes are those of the starter in the kit\'s browser preview.',
    })),
  };
}
