// Shared helpers for the docs/media SVG generator (scratch tooling, not shipped).

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const r2 = (n) => Math.round(n * 100) / 100;
export const len = (s) => [...s].length;

export const MONO = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace';
export const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

/** Theme tokens: { name: [light, dark] } → CSS for :root, dark media, #dark:target, #light:target. */
export function themeCss(tokens) {
  const block = (i) => Object.entries(tokens).map(([k, v]) => `--${k}:${v[i]}`).join(';');
  return [
    `svg{${block(0)}}`,
    `@media (prefers-color-scheme:dark){svg{${block(1)}}}`,
    `#dark:target{${block(1)}}`,
    `#light:target{${block(0)}}`,
  ].join('\n');
}

/** A cycle of D seconds; t in seconds → keyframe percentage. */
export function timeline(D) {
  const p = (t) => `${r2(Math.min(Math.max(t, 0), D) / D * 100)}%`;
  const rules = [];
  const css = [];
  let n = 0;
  const api = {
    D,
    p,
    /** Registers keyframes and returns a class name that runs them. */
    add(frames) {
      const name = `k${(n++).toString(36)}`;
      css.push(`@keyframes ${name}{${frames}}`);
      rules.push(`.${name}{animation-name:${name}}`);
      return name;
    },
    /** Hidden until t, then fades/slides in over dur and stays. */
    appear(t, { dur = 0.25, dy = 4 } = {}) {
      return api.add(`0%,${p(t)}{opacity:0;transform:translateY(${dy}px)}${p(t + dur)},100%{opacity:1;transform:translateY(0)}`);
    },
    /** Visible from t0 to t1 only (fades). Base style must be opacity:0 when hidden at the end. */
    window(t0, t1, { dur = 0.2, max = 1 } = {}) {
      return api.add(`0%,${p(t0)}{opacity:0}${p(t0 + dur)},${p(t1)}{opacity:${max}}${p(t1 + dur)},100%{opacity:0}`);
    },
    /** Opacity pulses: visible (max) during each [t0, t1] segment, 0 elsewhere. */
    pulses(segs, { dur = 0.15, max = 1 } = {}) {
      let s = '0%{opacity:0}';
      for (const [a, b] of segs) s += `${p(a)}{opacity:0}${p(a + dur)},${p(b)}{opacity:${max}}${p(b + dur)}{opacity:0}`;
      return api.add(`${s}100%{opacity:0}`);
    },
    /** A stroke that draws itself from its start to its end between t0 and t1 (path length l). */
    draw(t0, t1, l) {
      return api.add(`0%,${p(t0)}{stroke-dashoffset:${r2(l)}px}${p(t1)},100%{stroke-dashoffset:0px}`);
    },
    /** Moves by dx (translateX) between t0 and t1, visible only while moving. */
    travel(t0, t1, dx) {
      return api.add(`0%,${p(t0)}{opacity:0;transform:translateX(0)}${p(t0 + 0.01)}{opacity:1;transform:translateX(0)}${p(t1)}{opacity:1;transform:translateX(${r2(dx)}px)}${p(t1 + 0.05)},100%{opacity:0;transform:translateX(${r2(dx)}px)}`);
    },
    /** Visible until t, then fades out. */
    vanish(t, { dur = 0.2 } = {}) {
      return api.add(`0%,${p(t)}{opacity:1}${p(t + dur)},100%{opacity:0}`);
    },
    /** A cover (and its cursor) that slides right by w px in n steps from t0 to t1, then hides. */
    type(t0, t1, n, w) {
      return api.add(`0%,${p(t0)}{opacity:1;transform:translateX(0);animation-timing-function:steps(${n},end)}${p(t1)}{opacity:1;transform:translateX(${r2(w)}px)}${p(t1 + 0.02)},100%{opacity:0;transform:translateX(${r2(w)}px)}`);
    },
    /** Blinking (for a cursor) between t0 and t1; hidden outside. */
    blink(t0, t1, period = 1) {
      let s = t0 > 0 ? '0%{opacity:0}' : '';
      for (let t = t0; t < t1 - 0.05; t += period) {
        const off = Math.min(t + period / 2, t1);
        s += `${p(t)},${p(off)}{opacity:1}${p(off + 0.02)}{opacity:0}`;
      }
      return api.add(`${s}100%{opacity:0}`);
    },
    css({ fadeOut = D - 0.7 } = {}) {
      const scene = api.add(`0%,${p(fadeOut)}{opacity:1}${p(fadeOut + 0.45)},100%{opacity:0}`);
      api.finalText = () => [
          '@media (prefers-reduced-motion:no-preference){',
          `.an{animation-duration:${D}s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:ease-out}`,
          ...rules,
          ...css,
          '}',
        ].join('\n');
      return { scene, text: '@@ANIM@@' };
    },
    /** Puts the animation CSS (all keyframes registered so far) into the finished document. */
    render(doc) {
      return doc.replace('@@ANIM@@', api.finalText());
    },
  };
  return api;
}

/** Wraps text into lines of at most `max` characters, at spaces. */
export function wrap(text, max) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && len(line) + 1 + len(w) > max) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

export function svgDoc({ w, h, title, desc, css, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d" xml:space="preserve">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>
${css}
</style>
<g id="dark"><g id="light">
${body}
</g></g>
</svg>
`;
}
