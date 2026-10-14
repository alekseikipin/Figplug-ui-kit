import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const OUT = process.env.OUT || fileURLToPath(new URL('../../docs/media', import.meta.url));
mkdirSync(OUT, { recursive: true });
const which = process.argv.slice(2);
const mods = {
  agent: ['./agent.mjs', 'agentSvg', {}],
  'agent-narrow': ['./agent.mjs', 'agentSvg', { W: 400 }],
  audit: ['./audit.mjs', 'auditSvg', {}],
  'audit-narrow': ['./audit.mjs', 'auditSvg', { W: 400 }],
  'how-it-works': ['./how.mjs', 'howSvg', {}],
  'how-it-works-narrow': ['./how-narrow.mjs', 'howNarrowSvg', {}],
};
for (const [name, [file, fn, opts]] of Object.entries(mods)) {
  if (which.length && !which.includes(name)) continue;
  const m = await import(file + '?' + Date.now());
  const { svg, w, h } = m[fn](opts);
  writeFileSync(`${OUT}/${name}.svg`, svg);
  console.log(name, w, 'x', h, Buffer.byteLength(svg), 'bytes');
}
