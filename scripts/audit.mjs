#!/usr/bin/env node
// scripts/audit.mjs · kit v0.2.0 · zero dependencies, Node 24
// Checks a plugin folder against the kit's rules, so an agent (or CI) verifies generated code
// instead of trusting it. Every rule is explained, with its fix, in docs/pitfalls.md.
//
//   node scripts/audit.mjs [--json] [dir ...]
//
// Default dirs: "." plus every examples/* folder that has a manifest.json.
// Prints "path:line  rule-id  message" per finding; exits 1 if any finding is an error.
// Each rule is a small function (plugin) => findings[]; add new ones to RULES.

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

// ---- Text helpers -----------------------------------------------------------------------------

// Masking swaps characters for spaces but keeps newlines, so an offset into the masked copy
// is still the right offset (and line) in the original file.
const blank = (s) => s.replace(/[^\n]/g, ' ');
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;
const rel = (path) => relative(process.cwd(), path).split(sep).join('/') || '.';
const finding = (path, text, offset, rule, message, severity = 'error') =>
  ({ file: rel(path), line: lineAt(text, offset), rule, message, severity });

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
// One left-to-right pass, so a "<style>" inside a comment or a "<!--" inside a script can't
// derail the scan. Comments and script bodies are masked before tags are read.
const BLOCKS = /<!--[\s\S]*?-->|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

// Character references, decoded as the browser decodes attribute values (&#35;, &#x23; and &num;
// are all "#"). from[i] is the raw offset of decoded character i; null when nothing was decoded.
const NAMED_REFS = { num: '#', lpar: '(', rpar: ')', comma: ',', period: '.', colon: ':', semi: ';', percnt: '%',
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', Tab: '\t', NewLine: '\n' };
function decodeRefs(raw) {
  if (!raw.includes('&')) return { text: raw, from: null };
  let text = '';
  const from = [];
  for (const m of raw.matchAll(/&#(\d+);?|&#x([\da-f]+);?|&([a-z]+);|[^&]+|&/gi)) {
    const code = m[1] !== undefined ? Number(m[1]) : m[2] !== undefined ? parseInt(m[2], 16) : null;
    const valid = code !== null && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    const ch = code !== null ? (valid ? String.fromCodePoint(code) : '\ufffd') : Object.hasOwn(NAMED_REFS, m[3] ?? '') ? NAMED_REFS[m[3]] : m[0];
    text += ch;
    for (let i = 0; i < ch.length; i++) from.push(m.index + (ch === m[0] ? i : 0));
  }
  return { text, from };
}

// { name: { value, offset, at } }: the decoded value, where the raw value starts in the file, and
// at(i), the file offset of value[i]. The first of a repeated attribute wins, as in HTML.
function parseAttrs(text, base = 0) {
  const attrs = {};
  for (const m of text.matchAll(ATTR)) {
    const raw = m[2] ?? m[3] ?? m[4] ?? '';
    const closingQuote = m[2] !== undefined || m[3] !== undefined ? 1 : 0;
    const offset = base + m.index + m[0].length - raw.length - closingQuote;
    const { text: value, from } = decodeRefs(raw);
    attrs[m[1].toLowerCase()] ??= { value, offset, at: (i) => offset + (from ? from[i] ?? raw.length : i) };
  }
  return attrs;
}

function parseHtml(text) {
  const styles = [];
  const scripts = [];
  const masked = text.replace(BLOCKS, (m, tag, attrs, body, at) => {
    if (!tag) return blank(m); // an HTML comment: nothing inside it counts
    const open = m.indexOf('>') + 1;
    (tag.toLowerCase() === 'style' ? styles : scripts).push({ attrs: parseAttrs(attrs), body, offset: at + open });
    return m.slice(0, open) + blank(m.slice(open));
  });
  const tags = [...masked.matchAll(TAG)].map((m) =>
    ({ name: m[1].toLowerCase(), attrs: parseAttrs(m[2], m.index + 1 + m[1].length) }));
  return { styles, scripts, tags };
}

// url() contents are never colours we can theme: url(#grad) is a reference, and a data: SVG used
// as mask-image needs a solid fill. So they are masked along with strings.
function maskValues(css) {
  return css
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m[0] + blank(m.slice(1, -1)) + m[0])
    .replace(/\burl\(([^)]*)\)/gi, (m, inner) => `url(${blank(inner)})`);
}

// Splits CSS into declarations, remembering the selector of the enclosing rule. Boundaries come
// from the fully masked copy; selectors from the comment-masked copy, so [type="checkbox"] survives.
// Also used for style="" values (no braces: everything is one declaration list).
export function cssDeclarations(css) {
  const raw = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  const flat = maskValues(raw);
  const out = [];
  const open = [];
  let start = 0;
  for (let i = 0; i <= flat.length; i++) {
    const ch = flat[i] ?? ';';
    if (ch !== '{' && ch !== '}' && ch !== ';') continue;
    if (ch === '{') open.push(raw.slice(start, i).trim());
    else {
      const m = /^\s*([-\w]+)\s*:/.exec(flat.slice(start, i));
      if (m) {
        const offset = start + m[0].length;
        out.push({ selector: open.at(-1) ?? '', prop: m[1].toLowerCase(), value: flat.slice(offset, i), offset });
      }
      if (ch === '}') open.pop();
    }
    start = i + 1;
  }
  return out;
}

// ---- Colours ----------------------------------------------------------------------------------

// CSS named colours plus system colours (which follow the OS theme, not Figma's).
// transparent and currentColor are deliberately absent: they are allowed everywhere.
const NAMED = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
  darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold
  goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
  lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
  palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
  springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
  accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext
  graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext`.split(/\s+/));
// Properties whose values are names, where "tan" or "Canvas" would be a font or animation, not a colour.
const NAME_VALUED = new RegExp(`^(?:${['font', 'font-family', 'content', 'quotes', 'animation', 'animation-name',
  'grid(?:-[\\w-]+)?', 'counter-[\\w-]+', 'list-style', 'list-style-type', 'container', 'container-name',
  'view-transition-name', 'anchor-name', 'position-anchor', 'will-change', 'transition-property'].join('|')})$`);
// A # in a value always starts a hash token, also straight after a word ("1px solid#000", minified
// CSS); only an escaped \# is part of a name. url(#id), strings and selectors are masked already.
const HEX = /(?<!\\)#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
const COLOR_FN = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)?/gi;
const WORD = /(?<![\w-])[a-z]+(?![\w-])/gi;
// The only literals the kit allows, and only inside <style data-kit="tokens">.
const LITERAL_TOKEN = /^--kit-(?:shadow-[\w-]+|scrim)$/;
const PAINT_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'];

export function colorLiterals(value, prop = '') {
  const hits = [...value.matchAll(HEX), ...value.matchAll(COLOR_FN)];
  if (!NAME_VALUED.test(prop)) hits.push(...[...value.matchAll(WORD)].filter((m) => NAMED.has(m[0].toLowerCase())));
  return hits.map((m) => ({ index: m.index, text: m[0] }));
}

// ---- Rules ------------------------------------------------------------------------------------

function colorLiteral({ ui }) {
  const out = [];
  for (const { path, text, html } of ui) {
    const report = (offset, literal, where) => out.push(finding(path, text, offset, 'color-literal',
      `literal colour ${literal} ${where}; use a var(--figma-color-*) token (transparent and currentColor are fine)`));
    for (const style of html.styles) {
      const tokens = style.attrs['data-kit']?.value === 'tokens';
      for (const d of cssDeclarations(style.body)) {
        if (tokens && LITERAL_TOKEN.test(d.prop)) continue;
        const where = tokens
          ? `in ${d.prop} inside the tokens block (only --kit-shadow-* and --kit-scrim may hold literals)`
          : `in ${d.prop}`;
        for (const c of colorLiterals(d.value, d.prop)) report(style.offset + d.offset + c.index, c.text, where);
      }
    }
    for (const { attrs } of html.tags) {
      for (const d of attrs.style ? cssDeclarations(attrs.style.value) : []) {
        for (const c of colorLiterals(d.value, d.prop)) report(attrs.style.at(d.offset + c.index), c.text, `in style="${d.prop}: …"`);
      }
      for (const name of PAINT_ATTRS.filter((n) => attrs[n])) {
        const { value, at } = attrs[name];
        for (const c of colorLiterals(maskValues(value), name)) report(at(c.index), c.text, `in ${name}=""`);
      }
    }
  }
  return out;
}

// The kit's control classes. Wrappers (.kit-input-icon, a host's .kit-button-group) are not controls.
const CONTROL_NAME = 'kit-(?:button(?:-(?:primary|secondary|tertiary|danger|large))?|input|select|icon-button)';
const CONTROL_CLASS = new RegExp(`\\.${CONTROL_NAME}(?![\\w-])`);
const CONTROL_CLASS_ATTR = new RegExp(`(?:^|\\s)${CONTROL_NAME}(?=\\s|$)`);
const OFF_SIZE_TYPE = /^(?:checkbox|radio|color|range|hidden)$/i;
const isHeight = (prop) => /^(?:min-|max-)?(?:height|block-size)$/.test(prop);
const isHeightToken = (prop) => /^--kit-control-height(?:-large)?$/.test(prop);
const KIT_HEIGHT_VAR = /^var\(\s*--kit-control-height(?:-large)?\s*\)$/i;

// A declared length in px: px, rem (16px) and pt, also inside calc(); NaN for other units (em, vh:
// never a fixed 24 or 32), null when it is no single length (var(), %, auto, calc of several terms).
function lengthPx(value) {
  const text = value.replace(/!important\s*$/i, '').trim();
  const inner = /^calc\(\s*([^()]*?)\s*\)$/i.exec(text)?.[1] ?? text;
  const m = /^(-?(?:\d+(?:\.\d*)?|\.\d+))([a-z]*)$/i.exec(inner);
  if (!m || (!m[2] && Number(m[1]) !== 0)) return null;
  const factor = { px: 1, rem: 16, pt: 4 / 3 }[m[2].toLowerCase()];
  return Number(m[1]) === 0 ? 0 : factor ? Math.round(Number(m[1]) * factor * 1000) / 1000 : NaN;
}
const SIZES = [24, 32];
// A control's height: any length but 24 or 32 px. 0 and 1px pass (the visually-hidden idiom).
const offHeight = (value) => { const px = lengthPx(value); return px !== null && ![...SIZES, 0, 1].includes(px); };
// --kit-control-height(-large) itself: exactly 24 or 32 px, or one of the two kit variables.
const offToken = (value) => !KIT_HEIGHT_VAR.test(value.replace(/!important\s*$/i, '').trim()) && !SIZES.includes(lengthPx(value));

// Does the rule style the control itself? Only the subject (last compound) counts, so
// ".kit-button::after" (spinner) and ".kit-input-icon .kit-icon" don't; neither do checkboxes,
// radios, or multi-line controls (textarea, select[multiple], select[size]), which size to their rows.
export function targetsControl(selector) {
  // [type="checkbox" i] -> [type=checkbox]: quotes, spaces and a case flag don't change the match.
  let s = selector.replace(/\[[^\]]*\]/g, (m) => m.replace(/\s+[is]\s*\]$/i, ']').replace(/[\s"']/g, ''));
  while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, ''); // drop :not(...)/:has(...) arguments
  return s.split(',').some((part) => {
    const subject = part.trim().split(/\s*[\s>+~]\s*/).pop();
    if (/::|:(?:before|after)\b/.test(subject)) return false;
    if (CONTROL_CLASS.test(subject)) return true;
    if (/\[type=(?:checkbox|radio|color|range|hidden)\]/i.test(subject)) return false;
    if (/\.kit-(?:checkbox|radio|color)\b/.test(part)) return false;
    if (/^select\S*\[(?:multiple|size)[\]=]/i.test(subject)) return false;
    return /^(?:button|input|select)(?![\w-])/i.test(subject);
  });
}

function controlHeight({ ui }) {
  const out = [];
  const hint = 'kit controls are 24px (var(--kit-control-height)) or 32px (var(--kit-control-height-large))';
  for (const { path, text, html } of ui) {
    const report = (offset, what) => out.push(finding(path, text, offset, 'control-height', `${what}; ${hint}`));
    const value = (d) => d.value.replace(/!important\s*$/i, '').trim();
    for (const style of html.styles) {
      for (const d of cssDeclarations(style.body)) {
        if (isHeightToken(d.prop) ? offToken(d.value) : isHeight(d.prop) && targetsControl(d.selector) && offHeight(d.value)) {
          report(style.offset + d.offset, `${d.prop}: ${value(d)} on ${d.selector || ':root'}`);
        }
      }
    }
    for (const { name, attrs } of html.tags) {
      if (!attrs.style) continue;
      const multiLine = name === 'textarea' || (name === 'select' && (attrs.multiple || Number(attrs.size?.value) > 1));
      const offSize = name === 'input' && OFF_SIZE_TYPE.test(attrs.type?.value ?? '');
      const control = !multiLine && !offSize
        && (/^(?:button|input|select)$/.test(name) || CONTROL_CLASS_ATTR.test(attrs.class?.value ?? ''));
      for (const d of cssDeclarations(attrs.style.value)) {
        if (isHeightToken(d.prop) ? offToken(d.value) : control && isHeight(d.prop) && offHeight(d.value)) {
          report(attrs.style.at(d.offset), `style="${d.prop}: ${value(d)}" on <${name}>`);
        }
      }
    }
  }
  return out;
}

// Manifest findings point at the line of the key they are about (line 1 if it is missing).
const atKey = ({ path, text }, key, rule, message) =>
  finding(path, text, Math.max(0, text.indexOf(`"${key}"`)), rule, message);

const EDITOR_TYPES = ['figma', 'figjam', 'dev', 'slides', 'buzz'];

function manifestFields({ dir, manifest }) {
  if (manifest.error) return [finding(manifest.path, '', 0, 'manifest-fields', manifest.error)];
  const m = manifest.json;
  const issue = (key, message) => atKey(manifest, key, 'manifest-fields', message);
  const out = ['name', 'id', 'api', 'main', 'ui', 'editorType'].filter((k) => m[k] === undefined)
    .map((k) => issue(k, `missing "${k}"`));
  if (manifest.bom) {
    out.push(finding(manifest.path, manifest.text, 0, 'manifest-fields',
      'manifest.json starts with a byte-order mark; save it as UTF-8 without BOM (whether Figma accepts one is unverified)', 'warning'));
  }
  if (m.main !== undefined && typeof m.main !== 'string') {
    out.push(issue('main', '"main" must be a file name, the compiled .js file, e.g. "code.js"'));
  } else if (typeof m.main === 'string' && extname(m.main) !== '.js') {
    out.push(issue('main', `"main" is ${m.main}; it must name the compiled .js file, e.g. "code.js"`));
  } else if (typeof m.main === 'string' && !existsSync(join(dir, m.main))) {
    out.push(issue('main', `"main" points to ${m.main}, which does not exist; run npm run build`));
  }
  const { ui } = m;
  const uiMap = ui && typeof ui === 'object' && !Array.isArray(ui) ? Object.values(ui) : null;
  if (ui !== undefined && typeof ui !== 'string' && !(uiMap?.length && uiMap.every((v) => typeof v === 'string'))) {
    out.push(issue('ui', '"ui" must be a file name such as "ui.html", or a non-empty object of file names'));
  }
  for (const name of uiNames(m).filter((n) => !existsSync(join(dir, n)))) {
    out.push(issue('ui', `"ui" points to ${name}, which does not exist`));
  }
  const types = m.editorType;
  const unknown = Array.isArray(types) ? types.filter((t) => !EDITOR_TYPES.includes(t)) : [];
  if (types !== undefined && (!Array.isArray(types) || !types.length)) {
    out.push(issue('editorType', '"editorType" must be a non-empty array, e.g. ["figma"]'));
  } else if (unknown.length) {
    out.push(issue('editorType', `"editorType" has ${unknown.map((t) => JSON.stringify(t)).join(', ')}; `
      + `the editor types are ${EDITOR_TYPES.map((t) => `"${t}"`).join(', ')}`));
  } else if (types?.includes('dev') && types.includes('figjam')) {
    out.push(issue('editorType', '"editorType" cannot combine "dev" with "figjam"; Dev Mode needs its own manifest'));
  }
  return out;
}

function documentAccess({ manifest }) {
  const value = manifest.json.documentAccess;
  if (manifest.error || value === 'dynamic-page') return [];
  return [atKey(manifest, 'documentAccess', 'manifest-document-access', value === undefined
    ? 'missing "documentAccess": "dynamic-page" (required for new plugins; without it Figma loads every page first)'
    : `"documentAccess" is ${JSON.stringify(value)}; it must be "dynamic-page"`)];
}

function networkAccess({ manifest }) {
  const na = manifest.json.networkAccess;
  const issue = (message) => [atKey(manifest, 'networkAccess', 'manifest-network-access', message)];
  if (manifest.error) return [];
  if (!na || typeof na !== 'object') {
    return issue('missing "networkAccess"; add { "allowedDomains": ["none"] } or list the domains the plugin calls');
  }
  if (!Array.isArray(na.allowedDomains) || !na.allowedDomains.length) {
    return issue('"networkAccess.allowedDomains" must be a non-empty array (["none"] blocks all network access)');
  }
  if (na.allowedDomains.includes('*') && !na.reasoning) {
    return issue('"allowedDomains": ["*"] needs a "reasoning" string');
  }
  return [];
}

const PROTOCOL = /\b(?:const|let|var)\s+KIT_PROTOCOL\s*(?::\s*\w+\s*)?=\s*(\d+(?:\.\d+)?)/;
// JavaScript with comments blanked and string contents blanked (quotes kept), so a commented-out
// or quoted "KIT_PROTOCOL = 0" never counts. Offsets and lines stay those of the original.
const maskJs = (js) => js.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
  (m) => (m[0] === '/' ? blank(m) : m[0] + blank(m.slice(1, -1)) + m[0]));
const protocolOf = (text) => PROTOCOL.exec(maskJs(text));

function protocolMismatch({ main, compiled, ui }) {
  if (!main) return [];
  const inMain = protocolOf(main.text);
  const issue = (path, text, offset, message) => finding(path, text, offset, 'protocol-mismatch', message);
  const where = inMain && `${rel(main.path)}:${lineAt(main.text, inMain.index)}`;
  const out = [];
  // Figma runs the compiled main file, so it has to say what code.ts says.
  const inCompiled = compiled && protocolOf(compiled.text);
  if (inMain && compiled && inCompiled?.[1] !== inMain[1]) {
    out.push(issue(compiled.path, compiled.text, inCompiled?.index ?? 0,
      `${inCompiled ? `KIT_PROTOCOL is ${inCompiled[1]} here` : 'no KIT_PROTOCOL here'} but ${inMain[1]} in ${where}; `
      + `${rel(compiled.path)} is stale, run npm run build`));
  }
  const hits = ui.flatMap(({ path, text, html }) => {
    // The runtime block is the source of truth; any inline script is a fallback for hand-made copies.
    const runtime = html.scripts.filter((s) => s.attrs['data-kit']?.value === 'runtime');
    for (const script of runtime.length ? runtime : html.scripts) {
      const m = protocolOf(script.body);
      if (m) return [{ path, text, script, m }];
    }
    return [];
  });
  if (inMain && ui.length && !hits.length) {
    out.push(issue(main.path, main.text, inMain.index,
      `KIT_PROTOCOL is ${inMain[1]} here but the ui file has no kit runtime; paste the three data-kit blocks into it`));
  }
  for (const { path, text, script, m } of hits.filter((h) => h.m[1] !== inMain?.[1])) {
    out.push(issue(path, text, script.offset + m.index, inMain
      ? `KIT_PROTOCOL is ${m[1]} here but ${inMain[1]} in ${where}; re-paste the kit blocks from one release into both files`
      : `KIT_PROTOCOL is ${m[1]} here but ${rel(main.path)} has none; paste the kit:window block into it`));
  }
  return out;
}

export const RULES = [manifestFields, documentAccess, networkAccess, colorLiteral, controlHeight, protocolMismatch];

// ---- Loading and CLI --------------------------------------------------------------------------

function uiNames(manifest) {
  const { ui } = manifest;
  if (typeof ui === 'string') return [ui];
  return ui && typeof ui === 'object' ? Object.values(ui).filter((v) => typeof v === 'string') : [];
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

// The manifest, the ui file(s) it names (ui.html if none), code.ts (else the main .js) and, next
// to code.ts, the compiled main .js that Figma actually runs.
export function loadPlugin(dir) {
  const manifest = { path: join(dir, 'manifest.json'), text: read(join(dir, 'manifest.json')) ?? '', json: {} };
  manifest.bom = manifest.text.startsWith('\uFEFF');
  try {
    manifest.json = JSON.parse(manifest.bom ? manifest.text.slice(1) : manifest.text);
    const { json } = manifest;
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('not an object');
  } catch (error) {
    manifest.json = {};
    manifest.error = existsSync(manifest.path)
      ? `manifest.json is not valid JSON (${error.message})`
      : 'no manifest.json in this folder';
  }
  const names = uiNames(manifest.json);
  const ui = [];
  for (const name of names.length ? names : ['ui.html']) {
    const text = read(join(dir, name));
    if (text !== null) ui.push({ path: join(dir, name), text, html: parseHtml(text) });
  }
  const { main } = manifest.json;
  const mainJs = typeof main === 'string' && extname(main) === '.js' ? main : 'code.js';
  const source = (name) => {
    const text = read(join(dir, name));
    return text === null ? null : { path: join(dir, name), text };
  };
  const hasTs = existsSync(join(dir, 'code.ts'));
  const mainName = hasTs ? 'code.ts' : typeof main === 'string' ? main : 'code.js';
  return { dir, manifest, ui, main: source(mainName), compiled: hasTs ? source(mainJs) : null };
}

export function auditDir(dir) {
  const plugin = loadPlugin(dir);
  return RULES.flatMap((rule) => rule(plugin)).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function defaultDirs(root = '.') {
  const examples = join(root, 'examples');
  if (!existsSync(examples)) return [root];
  const found = readdirSync(examples).sort().map((name) => join(examples, name));
  return [root, ...found.filter((dir) => existsSync(join(dir, 'manifest.json')))];
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('usage: node scripts/audit.mjs [--json] [dir ...]   (rules: docs/pitfalls.md)');
    return;
  }
  const dirs = argv.filter((a) => !a.startsWith('-'));
  const list = dirs.length ? dirs : defaultDirs();
  const findings = list.flatMap(auditDir);
  const errors = findings.filter((f) => f.severity === 'error').length;
  if (argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const f of findings) {
      console.log(`${f.file}:${f.line}  ${f.rule}  ${f.severity === 'error' ? '' : 'warning: '}${f.message}`);
    }
    const n = `${list.length} plugin folder${list.length === 1 ? '' : 's'}`;
    const warnings = findings.length - errors;
    console.log(findings.length
      ? `audit: ${errors} error(s), ${warnings} warning(s) in ${n}; see docs/pitfalls.md`
      : `audit: no problems in ${n}`);
  }
  process.exitCode = errors ? 1 : 0;
}

// import.meta.main needs Node 24.2+; the path comparison covers 24.0 and 24.1.
if (import.meta.main ?? import.meta.filename === realpathSync(process.argv[1] ?? '.')) main(process.argv.slice(2));
