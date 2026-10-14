#!/usr/bin/env node
// scripts/make-fonts-css.mjs · kit v0.2.0 · zero dependencies, no network
// Opt-in helper: turns local Inter font files into @font-face rules with base64 data: URIs.
// The kit's font stack is "Inter, system-ui, …" and ships no font. Data URIs need no
// networkAccess domain, so the plugin can keep "allowedDomains": ["none"].
//
//   node scripts/make-fonts-css.mjs path/to/InterVariable.woff2 [more files…] > fonts.css
//
// Download the files yourself (e.g. https://rsms.me/inter/); this script only reads local paths.
// Variable files (name contains "Variable", "[wght…]" or "VF") get font-weight 100 900; static files
// get the weight in their name (Thin … Black, default 400). "Italic" in the name gives font-style italic.

import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';

// Sniff the format from the file's magic bytes rather than trusting the extension.
const FORMATS = [
  { magic: 'wOF2', format: 'woff2', mime: 'font/woff2' },
  { magic: 'wOFF', format: 'woff', mime: 'font/woff' },
  { magic: 'OTTO', format: 'opentype', mime: 'font/otf' },
  { magic: '\x00\x01\x00\x00', format: 'truetype', mime: 'font/ttf' },
  { magic: 'true', format: 'truetype', mime: 'font/ttf' },
];
// Longest names first, so "ExtraBold" isn't read as "Bold".
const WEIGHTS = [['extralight', 200], ['ultralight', 200], ['extrabold', 800], ['ultrabold', 800], ['semibold', 600],
  ['demibold', 600], ['thin', 100], ['light', 300], ['medium', 500], ['bold', 700], ['black', 900], ['heavy', 900]];

export function fontFace(path) {
  const bytes = readFileSync(path);
  const kind = FORMATS.find((f) => bytes.subarray(0, 4).toString('latin1') === f.magic);
  if (!kind) throw new Error(`${path} is not a woff2, woff, ttf or otf file`);
  const name = basename(path);
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  const variable = /variable|\[[^\]]*wght|(?:^|[-_.])vf(?:[-_.]|$)/i.test(name);
  const weight = variable ? '100 900' : String(WEIGHTS.find(([w]) => flat.includes(w))?.[1] ?? 400);
  const css = `/* ${name} */
@font-face {
  font-family: "Inter";
  font-style: ${/italic|oblique/i.test(name) ? 'italic' : 'normal'};
  font-weight: ${weight};
  font-display: swap;
  src: url("data:${kind.mime};base64,${bytes.toString('base64')}") format("${kind.format}");
}
`;
  return { name, css };
}

function main(paths) {
  if (!paths.length || paths.includes('--help') || paths.includes('-h')) {
    console.error('usage: node scripts/make-fonts-css.mjs path/to/InterVariable.woff2 [more files…] > fonts.css');
    process.exitCode = paths.length ? 0 : 2;
    return;
  }
  if (process.stdout.isTTY) {
    console.error('make-fonts-css: the output is hundreds of KB of base64; redirect it, e.g. > fonts.css');
    process.exitCode = 2;
    return;
  }
  let faces;
  try {
    faces = paths.map(fontFace);
  } catch (error) {
    console.error(`make-fonts-css: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const body = faces.map((f) => f.css).join('\n');
  const kb = Math.round(Buffer.byteLength(body) / 1024);
  process.stdout.write(`/* fonts.css · made by scripts/make-fonts-css.mjs from ${faces.map((f) => f.name).join(', ')}
 * Paste these rules into a host <style> block AFTER the three data-kit blocks in ui.html,
 * never inside them: upgrading the kit means re-pasting those blocks, which would drop the fonts.
 * Cost: ~${kb} KB, outside the kit's 64 KB ui.html budget. Data URIs need no networkAccess domain.
 * Inter is under the SIL Open Font License 1.1; keep its licence notice with your plugin's sources.
 */
${body}`);
  console.error(`make-fonts-css: wrote ${faces.length} @font-face rule(s), ~${kb} KB`);
}

// import.meta.main needs Node 24.2+; the path comparison covers 24.0 and 24.1.
if (import.meta.main ?? import.meta.filename === realpathSync(process.argv[1] ?? '.')) main(process.argv.slice(2));
