import { esc, r2, len, MONO, SANS, themeCss, timeline, wrap, svgDoc } from './lib.mjs';

/** Hard-wraps a string at `max` characters, preferring the last space or slash before the limit. */
function hardWrap(s, max) {
  const out = [];
  let rest = s;
  while (len(rest) > max) {
    const chars = [...rest];
    let cut = -1;
    for (let i = max; i > max * 0.5; i--) if (chars[i - 1] === ' ' || chars[i - 1] === '/') { cut = i; break; }
    if (cut < 0) cut = max;
    out.push(chars.slice(0, cut).join('').replace(/ $/, ''));
    rest = chars.slice(cut).join('');
  }
  out.push(rest);
  return out;
}

/** Word-wraps at `max` characters; a word too long for the rest of a line is split after a slash. */
function smartWrap(text, max) {
  const lines = [''];
  for (const word of text.split(' ')) {
    let w = word;
    for (;;) {
      const cur = lines[lines.length - 1];
      const room = max - len(cur) - (cur ? 1 : 0);
      if (len(w) <= room) { lines[lines.length - 1] = cur ? `${cur} ${w}` : w; break; }
      const chars = [...w];
      let cut = -1;
      for (let i = Math.min(room, chars.length - 1); i > 8; i--) if (chars[i - 1] === '/') { cut = i; break; }
      if (cut > 0 && len(w) > max / 2) {
        lines[lines.length - 1] = cur ? `${cur} ${chars.slice(0, cut).join('')}` : chars.slice(0, cut).join('');
        w = chars.slice(cut).join('');
      }
      lines.push('');
      if (len(w) > max) { lines[lines.length - 1] = [...w].slice(0, max).join(''); w = [...w].slice(max).join(''); lines.push(''); }
      if (!w) break;
    }
  }
  return lines.filter((l, i) => l || i < lines.length - 1);
}

/**
 * The one prompt, run by a coding agent. W = 880 for wide screens; a narrow W (400) wraps every
 * line for phones. The same task as the README's example: rename-layers, from docs/prompts.md.
 */
export function agentSvg({ W = 880 } = {}) {
  const FS = 12.5, CW = FS * 0.6, LH = 20;
  const narrow = W < 600;
  const tl = timeline(14);
  const mt = (x, y, s, cls = '') =>
    `<text class="m ${cls}" x="${r2(x)}" y="${r2(y)}" textLength="${r2(len(s) * CW)}" lengthAdjust="spacing">${esc(s)}</text>`;

  const TASK = 'renames the selected layers with a prefix, find and replace, and optional numbering, and shows a preview of the new names before I apply them';
  const PROMPT = `Clone https://github.com/alekseikipin/Figplug-ui-kit, read AGENTS.md, build a plugin that ${TASK} with kit classes only, then tell me how to import it.`;
  const X0 = 44;
  const promptCols = Math.floor((W - X0 - 24) / CW);
  const plines = smartWrap(PROMPT, promptCols);

  const BAR = 36;
  const boxTop = BAR + 14;
  const pBase = (i) => boxTop + 23 + i * LH;
  const boxBottom = pBase(plines.length - 1) + 13;

  // Prompt typing: fast (about 1 s), so the box is never empty for long.
  const T0 = 0.3, T1 = 1.35;
  const total = plines.reduce((a, l) => a + len(l), 0);
  let t = T0;
  const prompt = [];
  prompt.push(`<rect class="pbox" x="16" y="${boxTop}" width="${W - 32}" height="${boxBottom - boxTop}" rx="8"/>`);
  prompt.push(`<text class="m acc b" x="27" y="${pBase(0)}">&gt;</text>`);
  plines.forEach((l, i) => {
    const y = pBase(i);
    const dur = (T1 - T0) * len(l) / total;
    const w = len(l) * CW;
    prompt.push(mt(X0, y, l, 'fg'));
    const cover = tl.type(t, t + dur, len(l), w + 2);
    const cur = tl.window(t, t + dur, { dur: 0.01 });
    prompt.push(`<g clip-path="url(#pc)"><g class="an ${cover} cv"><rect class="pbg" x="${X0 - 1}" y="${y - 15}" width="${r2(w + 12)}" height="20"/><rect class="an ${cur} cur" x="${X0 + 1}" y="${y - 13}" width="${r2(CW)}" height="16" rx="1"/></g></g>`);
    t += dur;
  });

  // Agent steps, about 0.3 s apart, then the finished run holds for about 7 s.
  const steps = [
    { tool: 'Run', c: 'run', arg: 'git clone https://github.com/alekseikipin/Figplug-ui-kit.git' },
    { tool: 'Read', c: 'read', arg: 'AGENTS.md' },
    { tool: 'Read', c: 'read', arg: 'docs/components.md' },
    { tool: 'Edit', c: 'edit', arg: 'manifest.json', note: 'its own name and id' },
    { tool: 'Edit', c: 'edit', arg: 'ui.html', note: 'kit-field, kit-checkbox, kit-list in a kit-scroll, kit-footer' },
    { tool: 'Edit', c: 'edit', arg: 'code.ts', note: 'typed rename messages below "Your plugin starts here"' },
    { tool: 'Run', c: 'run', arg: 'npm install' },
    { out: 'added 8 packages, and audited 9 packages in 344ms' },
    { tool: 'Run', c: 'run', arg: 'npm run build' },
    { out: '> tsc -p tsconfig.json' },
    { tool: 'Run', c: 'run', arg: 'npm run audit' },
    { out: 'audit: no problems in 7 plugin folders', ok: true },
    { tool: 'Run', c: 'run', arg: 'npm run check:ui' },
    { out: 'check-ui: no type errors in 7 plugin folders', ok: true },
    { done: 'Done: build, audit and check:ui pass (your plugin and the 5 examples). In the Figma desktop app:' },
    { path: 'Figma → Plugins → Development → Import plugin from manifest… → pick manifest.json' },
  ];
  const S0 = 1.7, STEP = 0.32;
  steps.forEach((s, i) => { s.t = S0 + i * STEP; });
  const tDone = steps[steps.length - 2].t;
  const ARG = 36 + 6 * CW, NOTE = ARG + 15 * CW;
  const cols = (x) => Math.floor((W - x - 16) / CW);
  let y = boxBottom + 30;
  const stepEls = steps.map((s) => {
    const a = tl.appear(s.t);
    let inner = '';
    if (s.tool) {
      const args = smartWrap(s.arg, cols(ARG));
      inner = `<circle class="${s.c}" cx="23" cy="${y - 4.5}" r="3.5"/>` + mt(36, y, s.tool, `b ${s.c}`);
      args.forEach((l, k) => { inner += mt(ARG, y + k * LH, l, 'fg'); });
      y += (args.length - 1) * LH;
      if (s.note) {
        if (!narrow && len(args[args.length - 1]) < 14) inner += mt(NOTE, y, s.note, 'mute');
        else for (const l of wrap(s.note, cols(ARG))) { y += LH; inner += mt(ARG, y, l, 'mute'); }
      }
    } else if (s.out) {
      const lines = wrap(s.out, cols(56));
      inner = `<path class="elbow" d="M40 ${y - 14}V${y - 5}H49"/>`;
      lines.forEach((l, k) => { inner += mt(56, y + k * LH, l, s.ok ? 'ok' : 'mute'); });
      y += (lines.length - 1) * LH;
    } else if (s.done) {
      const lines = wrap(s.done, cols(36));
      inner = `<circle class="okf" cx="23" cy="${y - 4.5}" r="3.5"/>`;
      lines.forEach((l, k) => { inner += mt(36, y + k * LH, l, 'fg'); });
      y += (lines.length - 1) * LH;
    } else {
      const parts = narrow ? s.path.split(' → ').map((p, k, all) => (k < all.length - 1 ? `${p} →` : p)) : [s.path];
      const lines = narrow ? parts.reduce((acc, p) => {
        const last = acc[acc.length - 1];
        if (last !== undefined && len(last) + 1 + len(p) <= cols(36)) acc[acc.length - 1] = `${last} ${p}`; else acc.push(p);
        return acc;
      }, []) : parts;
      lines.forEach((l, k) => { inner += mt(36, y + k * LH, l, 'acc b'); });
      y += (lines.length - 1) * LH;
    }
    y += LH;
    return `<g class="an ${a}">${inner}</g>`;
  });
  const H = y;

  const tokens = {
    win: ['#ffffff', '#0d1117'], bar: ['#f6f8fa', '#151b23'], line: ['#d1d9e0', '#3d444d'],
    fg: ['#1f2328', '#f0f6fc'], mute: ['#59636e', '#9198a1'], faint: ['#818b98', '#656c76'],
    pbg: ['#f6f8fa', '#151b23'], acc: ['#0969da', '#4493f8'], ok: ['#1a7f37', '#3fb950'],
    read: ['#0969da', '#4493f8'], edit: ['#8250df', '#ab7df8'], run: ['#bc4c00', '#db6d28'],
    dot: ['#d1d9e0', '#3d444d'],
  };
  const { scene, text: anim } = tl.css({ fadeOut: 13.45 });
  const css = [
    themeCss(tokens),
    `.m{font-family:${MONO};font-size:${FS}px}`,
    `.s{font-family:${SANS}}`,
    'text{white-space:pre}',
    '.b{font-weight:600}',
    '.win{fill:var(--win);stroke:var(--line)}', '.bar{fill:var(--bar)}', '.sep{stroke:var(--line)}',
    '.pbox{fill:var(--pbg);stroke:var(--line)}', '.pbg{fill:var(--pbg)}', '.cur{fill:var(--acc)}',
    '.fg{fill:var(--fg)}', '.mute{fill:var(--mute)}', '.acc{fill:var(--acc)}', '.ok,.okf{fill:var(--ok)}',
    '.read{fill:var(--read)}', '.edit{fill:var(--edit)}', '.run{fill:var(--run)}', '.dot{fill:var(--dot)}',
    '.elbow{fill:none;stroke:var(--faint);stroke-width:1.2}',
    '.title{fill:var(--mute);font-size:12px}',
    '.cv,.cur,.hide{opacity:0}', '.runf{fill:var(--run)}', '.status{fill:var(--mute);font-size:12px}', '.okt{fill:var(--ok)}',
    anim,
  ].join('\n');

  const pulses = [];
  for (let p = S0 - 0.1; p < tDone - 0.3; p += 0.8) pulses.push([p, p + 0.4]);
  const body = `<defs><clipPath id="pc"><rect x="17" y="${boxTop + 1}" width="${W - 34}" height="${boxBottom - boxTop - 2}" rx="7"/></clipPath></defs>
<rect class="win" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
<path class="bar" d="M0.5 ${BAR}V10.5a10 10 0 0 1 10-10h${W - 21}a10 10 0 0 1 10 10V${BAR}z"/>
<path class="sep" d="M0.5 ${BAR}.5H${W - 0.5}"/>
<circle class="dot" cx="20" cy="18" r="5.5"/><circle class="dot" cx="38" cy="18" r="5.5"/><circle class="dot" cx="56" cy="18" r="5.5"/>
<text class="s title" x="${narrow ? 72 : W / 2}" y="22" text-anchor="${narrow ? 'start' : 'middle'}">your coding agent</text>
<g class="an ${scene}">
<g class="an ${tl.window(S0 - 0.2, tDone - 0.05, { dur: 0.15 })} hide"><circle class="an ${tl.pulses(pulses, { dur: 0.15 })} runf hide" cx="${W - 82}" cy="18" r="3.5"/><text class="s status" x="${W - 16}" y="22" text-anchor="end">working…</text></g>
<g class="an ${tl.appear(tDone, { dur: 0.2, dy: 0 })}"><text class="s status okt" x="${W - 16}" y="22" text-anchor="end">✓ done</text></g>
${prompt.join('\n')}
${stepEls.join('\n')}
</g>`;
  return {
    w: W, h: H,
    svg: tl.render(svgDoc({
      w: W, h: H, css, body,
      title: 'The one prompt, run by a coding agent',
      desc: `Animated illustration, not a recording: the README's one prompt, with the rename-layers task from docs/prompts.md ("${TASK}"), is typed into a coding agent (Claude Code, Cursor or similar). The agent clones the repo, reads AGENTS.md and docs/components.md, edits manifest.json, ui.html and code.ts, runs npm install, npm run build, npm run audit ("audit: no problems in 7 plugin folders") and npm run check:ui ("check-ui: no type errors in 7 plugin folders"), then says how to import the plugin: Figma → Plugins → Development → Import plugin from manifest… → pick manifest.json. The command output lines are real output from kit 0.4.0.`,
    })),
  };
}
