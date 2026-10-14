import { esc, r2, len, MONO, SANS, themeCss, timeline, svgDoc } from './lib.mjs';

/** Word-wraps [class, text] segments into lines of at most `max` characters, keeping each piece's class. */
function wrapParts(parts, max) {
  const words = [];
  for (const [c, s] of parts) for (const w of s.split(/(?<= )/)) if (w) words.push([c, w]);
  const lines = [[]];
  let n = 0;
  for (const [c, w] of words) {
    const bare = w.replace(/ $/, '');
    if (n > 0 && n + len(bare) > max) { lines.push([]); n = 0; }
    lines[lines.length - 1].push([c, w]);
    n += len(w);
  }
  return lines.map((l) => {
    const last = l[l.length - 1];
    if (last) last[1] = last[1].replace(/ $/, '');
    return l;
  });
}

/**
 * npm run audit catching a hard-coded colour. W = 880 for wide screens; a narrow W (400) clips the
 * editor's long lines, as an editor without soft wrap does, and wraps the terminal's.
 */
export function auditSvg({ W = 880 } = {}) {
  const FS = 12.5, CW = FS * 0.6, LH = 20;
  const TFS = 12, TCW = TFS * 0.6, TLH = 19;
  const narrow = W < 600;
  const tl = timeline(12);

  /** Monospace text from [class, string] segments, pinned to the cell grid with textLength. */
  const seg = (x, y, parts, { cls = 'm', cw = CW, extra = '' } = {}) => {
    const n = parts.reduce((a, [, s]) => a + len(s), 0);
    const inner = parts.map(([c, s]) => (c ? `<tspan class="${c}">${esc(s)}</tspan>` : esc(s))).join('');
    return `<text class="${cls}" x="${r2(x)}" y="${r2(y)}" textLength="${r2(n * cw)}" lengthAdjust="spacing"${extra}>${inner}</text>`;
  };

  const BAR = 36;
  const GX = 56, CX = 72; // gutter right edge, code start
  const row = (i) => BAR + 26 + i * LH; // i = 0 is line 947
  const editorBottom = row(6) + 14;
  const TTOP = editorBottom + 8;

  // Timeline (s)
  const ty1 = [0.75, 1.25], ty2 = [1.35, 1.95], ty3 = [2.05, 2.15];
  const tCmd1 = [2.55, 2.95], tFind = 3.3, tSum = 3.45;
  const tSel = 5.0, tFix = 5.55, tTypeB = [5.6, 6.7];
  const tCmd2 = [7.1, 7.5], tClean = 7.9;

  const els = [];
  // Gutter numbers: 947-950 from the start; 951-953 each appear as a line is inserted above </style>.
  const inserts = [ty1[0], ty2[0], ty3[0]];
  for (let i = 0; i < 7; i++) {
    const a = i >= 4 ? ` class="an ${tl.appear(inserts[i - 4], { dur: 0.01, dy: 0 })}"` : '';
    els.push(`<g${a}><text class="m gut" x="${GX}" y="${row(i)}" text-anchor="end">${947 + i}</text></g>`);
  }
  // Static lines 947-949 (clipped at the editor's right edge, as an editor without wrap shows them)
  els.push(`<g clip-path="url(#code)">`);
  els.push(seg(CX, row(0), [['pun', '<'], ['tag', 'style'], ['pun', '>']]));
  els.push(seg(CX, row(1), [['com', "/* Your styles. Build with kit classes first; add rules here only for what they don't cover. */"]]));
  els.push(seg(CX, row(2), [['sel', '.demo-status'], ['fg', ' { '], ['prop', 'flex'], ['fg', ': '], ['val', '1 1 0'], ['fg', '; '], ['prop', 'min-width'], ['fg', ': '], ['val', '0'], ['fg', '; }']]));
  els.push('</g>');

  // Inserted lines 950-952, typed
  const typed = (i, parts, [t0, t1], bgCls = 'edbg') => {
    const n = parts.reduce((a, [, s]) => a + len(s), 0);
    const y = row(i);
    const cov = tl.type(t0, t1, n, n * CW + 2);
    const cur = tl.window(t0, t1, { dur: 0.01 });
    return seg(CX, y, parts) + `<g clip-path="url(#ed)"><g class="an ${cov} cv"><rect class="${bgCls}" x="${CX - 1}" y="${y - 15}" width="${r2(n * CW + 12)}" height="20"/><rect class="an ${cur} cur" x="${CX + 1}" y="${y - 13}" width="1.6" height="16"/></g></g>`;
  };
  // Each inserted line appears when its typing starts (before that its row is </style>'s).
  const at = (t, inner) => `<g class="an ${tl.appear(t, { dur: 0.01, dy: 0 })}">${inner}</g>`;
  els.push(at(ty1[0], typed(3, [['sel', '.demo-hint'], ['fg', ' {']], ty1)));
  // Line 951: the fixed version (B) under the original (A)
  const yB = row(4);
  const B = seg(CX, yB, [['fg', '  '], ['prop', 'color'], ['fg', ': '], ['fn', 'var'], ['fg', '('], ['val', '--figma-color-text'], ['fg', ');']]);
  const vCol = 9, vLen = len('var(--figma-color-text);');
  const covB = tl.type(tTypeB[0], tTypeB[1], vLen, vLen * CW + 2);
  const curB = tl.window(tTypeB[0], tTypeB[1], { dur: 0.01 });
  els.push(`<g class="an ${tl.appear(tFix, { dur: 0.01, dy: 0 })}">${B}</g>`);
  els.push(`<g clip-path="url(#ed)"><g class="an ${covB} cv"><rect class="edbg" x="${r2(CX + vCol * CW - 1)}" y="${yB - 15}" width="${r2(vLen * CW + 12)}" height="20"/><rect class="an ${curB} cur" x="${r2(CX + vCol * CW + 1)}" y="${yB - 13}" width="1.6" height="16"/></g></g>`);
  // Selection over #333, then A on top
  els.push(`<rect class="an ${tl.window(tSel, tFix - 0.02, { dur: 0.08 })} selbg hide" x="${r2(CX + vCol * CW - 1)}" y="${yB - 14}" width="${r2(4 * CW + 2)}" height="19" rx="2"/>`);
  const A = typed(4, [['fg', '  '], ['prop', 'color'], ['fg', ': '], ['lit', '#333'], ['fg', ';']], ty2);
  els.push(`<g class="an ${tl.window(ty2[0], tFix - 0.01, { dur: 0.01 })} hide">${A}</g>`);
  // Squiggle under #333 and the gutter marker while the finding stands
  let sq = `M${r2(CX + vCol * CW)} ${yB + 4}`;
  for (let x = CX + vCol * CW, k = 0; x < CX + (vCol + 4) * CW - 0.1; x += 3, k++) sq += `L${r2(x + 3)} ${yB + (k % 2 ? 4 : 1.5)}`;
  const wErr = tl.window(tFind + 0.1, tFix - 0.02, { dur: 0.15 });
  els.push(`<path class="an ${wErr} squig hide" d="${sq}"/>`);
  els.push(`<circle class="an ${wErr} errf hide" cx="16" cy="${yB - 4.5}" r="4"/>`);
  els.push(`<g class="an ${tl.appear(tClean, { dur: 0.2, dy: 0 })}"><circle class="okf" cx="16" cy="${yB - 4.5}" r="5.5"/><path class="tick" d="M13.4 ${r2(yB - 4.6)}l1.8 1.8 3.3-3.4"/></g>`);
  els.push(at(ty3[0], typed(5, [['fg', '}']], ty3)));
  // </style> starts on line 950 and moves down one line as each line is inserted above it (953 at rest)
  const move = tl.add(`0%,${tl.p(ty1[0])}{transform:translateY(${-3 * LH}px)}`
    + `${tl.p(ty1[0] + 0.01)},${tl.p(ty2[0])}{transform:translateY(${-2 * LH}px)}`
    + `${tl.p(ty2[0] + 0.01)},${tl.p(ty3[0])}{transform:translateY(${-LH}px)}`
    + `${tl.p(ty3[0] + 0.01)},100%{transform:translateY(0)}`);
  els.push(`<g class="an ${move}">${seg(CX, row(6), [['pun', '</'], ['tag', 'style'], ['pun', '>']])}</g>`);

  // Terminal: lines wrap at the terminal's width
  const tcols = Math.floor((W - 20 - 16) / TCW);
  const term = [];
  let ty = TTOP + 44;
  const tline = (parts) => {
    const lines = wrapParts(parts, tcols);
    const svg = lines.map((l, k) => seg(20, ty + k * TLH, l, { cls: 'm t', cw: TCW })).join('');
    ty += lines.length * TLH;
    return svg;
  };
  const cmd = ([t0, t1]) => {
    const y = ty;
    const s = 'npm run audit';
    const cov = tl.type(t0, t1, len(s), len(s) * TCW + 2);
    const cur = tl.window(t0 - 0.3, t1, { dur: 0.01 });
    const x = 20 + 2 * TCW;
    ty += TLH;
    return seg(20, y, [['mute', '$ '], ['fg', s]], { cls: 'm t', cw: TCW })
      + `<g clip-path="url(#tm)"><g class="an ${cov} cv"><rect class="tmbg" x="${r2(x - 1)}" y="${y - 14}" width="${r2(len(s) * TCW + 12)}" height="19"/><rect class="an ${cur} curb" x="${r2(x + 1)}" y="${y - 12}" width="${r2(TCW)}" height="15"/></g></g>`;
  };
  term.push(`<g class="an ${tl.appear(tCmd1[0] - 0.3, { dur: 0.01, dy: 0 })}">${cmd(tCmd1)}</g>`);
  term.push(`<g class="an ${tl.appear(tFind)}">${tline([['fg', 'ui.html:951  '], ['errt b', 'color-literal'], ['fg', '  literal colour #333 in color; use a var(--figma-color-*) token']])}`
    + `${tline([['fg', '(transparent and currentColor are fine)']])}</g>`);
  term.push(`<g class="an ${tl.appear(tSum)}">${tline([['errt', 'audit: 1 error(s), 0 warning(s) in 6 plugin folders; see docs/pitfalls.md']])}</g>`);
  ty += TLH;
  term.push(`<g class="an ${tl.appear(tCmd2[0] - 0.3, { dur: 0.01, dy: 0 })}">${cmd(tCmd2)}</g>`);
  term.push(`<g class="an ${tl.appear(tClean)}">${tline([['okt', 'audit: no problems in 6 plugin folders']])}</g>`);
  const H = ty - TLH + 18;

  const tokens = {
    win: ['#ffffff', '#0d1117'], bar: ['#f6f8fa', '#151b23'], line: ['#d1d9e0', '#3d444d'],
    tm: ['#f6f8fa', '#151b23'],
    fg: ['#1f2328', '#f0f6fc'], mute: ['#59636e', '#9198a1'], faint: ['#818b98', '#656c76'],
    tag: ['#116329', '#7ee787'], sel: ['#6639ba', '#d2a8ff'], prop: ['#0550ae', '#79c0ff'],
    val: ['#0a3069', '#a5d6ff'], lit: ['#953800', '#ffa657'], fn: ['#8250df', '#d2a8ff'],
    err: ['#d1242f', '#f85149'], ok: ['#1a7f37', '#3fb950'], selbg: ['#b6e3ff', '#1f4a7a'],
    acc: ['#0969da', '#4493f8'], dot: ['#d1d9e0', '#3d444d'],
  };
  const { scene, text: anim } = tl.css({ fadeOut: 11.15 });
  const css = [
    themeCss(tokens),
    `.m{font-family:${MONO};font-size:${FS}px}`, `.t{font-size:${TFS}px}`,
    `.s{font-family:${SANS}}`, 'text{white-space:pre}', '.b{font-weight:600}',
    '.win{fill:var(--win);stroke:var(--line)}', '.bar{fill:var(--bar)}', '.sep{stroke:var(--line);fill:none}',
    '.tmfill{fill:var(--tm)}', '.edbg{fill:var(--win)}', '.tmbg{fill:var(--tm)}',
    '.gut{fill:var(--faint)}', '.fg{fill:var(--fg)}', '.mute{fill:var(--mute)}', '.pun{fill:var(--mute)}', '.com{fill:var(--mute)}',
    '.tag{fill:var(--tag)}', '.sel{fill:var(--sel)}', '.prop{fill:var(--prop)}', '.val{fill:var(--val)}', '.lit{fill:var(--lit)}', '.fn{fill:var(--fn)}',
    '.errt{fill:var(--err)}', '.okt{fill:var(--ok)}', '.errf{fill:var(--err)}', '.okf{fill:var(--ok)}',
    '.tick{fill:none;stroke:var(--win);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}',
    '.squig{fill:none;stroke:var(--err);stroke-width:1.3}', '.selbg{fill:var(--selbg)}',
    '.cur{fill:var(--fg)}', '.curb{fill:var(--acc)}', '.dot{fill:var(--dot)}',
    '.title{fill:var(--mute);font-size:12px}', '.label{fill:var(--mute);font-size:10.5px;letter-spacing:.08em;font-weight:600}',
    '.cv,.cur,.curb,.hide{opacity:0}', '.cap{fill:var(--acc);font-size:12px;font-weight:500}',
    anim,
  ].join('\n');

  // Captions top right (on a narrow screen under the title bar's dots, left-aligned after them)
  const capX = W - 16;
  const caps = [[0.15, 2.45, '1 · a hard-coded colour'], [2.45, 5.0, '2 · npm run audit flags it'], [5.0, 7.0, '3 · a Figma token instead'], [7.0, 14, '4 · clean']];
  const capEls = caps.map(([a, b, txt], i) => {
    const last = i === caps.length - 1;
    const an = last ? tl.appear(a, { dur: 0.2, dy: 0 }) : tl.window(a, b - 0.2, { dur: 0.2 });
    return `<g class="an ${an} hide"><text class="s cap" x="${capX}" y="22" text-anchor="end">${esc(txt)}</text></g>`;
  }).join('')
    // Without motion: one caption for the whole story
    + `<g class="an ${tl.add('0%,100%{opacity:0}')}"><text class="s cap" x="${capX}" y="22" text-anchor="end">${narrow ? 'flagged, then fixed with a token' : 'flagged by npm run audit, fixed with a token'}</text></g>`;
  const body = `<defs><clipPath id="ed"><rect x="1" y="${BAR + 1}" width="${W - 2}" height="${editorBottom - BAR}"/></clipPath><clipPath id="code"><rect x="${CX - 2}" y="${BAR + 1}" width="${W - CX - 2}" height="${editorBottom - BAR}"/></clipPath><clipPath id="tm"><rect x="1" y="${TTOP + 1}" width="${W - 2}" height="${H - TTOP - 2}"/></clipPath></defs>
<rect class="win" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
<path class="bar" d="M0.5 ${BAR}V10.5a10 10 0 0 1 10-10h${W - 21}a10 10 0 0 1 10 10V${BAR}z"/>
<path class="tmfill" d="M0.5 ${TTOP}H${W - 0.5}V${H - 10.5}a10 10 0 0 1-10 10H10.5a10 10 0 0 1-10-10z"/>
<path class="sep" d="M0.5 ${BAR}.5H${W - 0.5}M0.5 ${TTOP}.5H${W - 0.5}"/>
<rect class="sep" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
<circle class="dot" cx="20" cy="18" r="5.5"/><circle class="dot" cx="38" cy="18" r="5.5"/><circle class="dot" cx="56" cy="18" r="5.5"/>
<text class="s title" x="${narrow ? 72 : W / 2}" y="22" text-anchor="${narrow ? 'start' : 'middle'}">ui.html</text>
<text class="s label" x="20" y="${TTOP + 20}">TERMINAL</text>
<g class="an ${scene}">${capEls}
${els.join('\n')}
${term.join('\n')}
</g>`;
  return {
    w: W, h: H,
    svg: tl.render(svgDoc({
      w: W, h: H, css, body,
      title: 'npm run audit catches a hard-coded colour',
      desc: 'Animated illustration with real audit output from kit 0.4.0: a rule with color: #333; is added to the host <style> in ui.html at line 951. npm run audit prints "ui.html:951  color-literal  literal colour #333 in color; use a var(--figma-color-*) token (transparent and currentColor are fine)" and "audit: 1 error(s), 0 warning(s) in 6 plugin folders; see docs/pitfalls.md". The value is replaced with var(--figma-color-text), and the next npm run audit prints "audit: no problems in 6 plugin folders".',
    })),
  };
}
