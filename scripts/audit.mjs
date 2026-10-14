#!/usr/bin/env node
// scripts/audit.mjs · kit v0.4.0 · zero dependencies, Node 24
// Checks a plugin folder against the kit's rules, so an agent (or CI) verifies generated code
// instead of trusting it. Every rule is explained, with its fix, in docs/pitfalls.md.
//
//   node scripts/audit.mjs [--json] [dir ...]
//
// Default dirs: "." plus every examples/* folder that has a manifest.json (never tools/ or
// test/fixtures unless you name them). Prints "path:line  rule-id  message" per finding; exits 1
// if any finding is an error (warnings never fail it). Each rule is a small function
// (plugin) => findings[]; add new ones to RULES.

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

// ---- Text helpers -----------------------------------------------------------------------------

// Masking swaps characters for spaces but keeps newlines, so an offset into the masked copy
// is still the right offset (and line) in the original file.
const blank = (s) => s.replace(/[^\n]/g, ' ');
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;
const rel = (path) => relative(process.cwd(), path).split(sep).join('/') || '.';
const finding = (path, text, offset, rule, message, severity = 'error') =>
  ({ file: rel(path), line: lineAt(text, offset), rule, message, severity });
const quote = (s, max = 60) => JSON.stringify(s.length > max ? `${s.slice(0, max - 1)}…` : s);

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
// One left-to-right pass, so a "<style>" inside a comment or a "<!--" inside a script can't
// derail the scan. Comments and script bodies are masked before tags are read.
const BLOCKS = /<!--[\s\S]*?-->|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

// Character references, decoded as the browser decodes attribute values (&#35;, &#x23; and &num;
// are all "#"). from[i] is the raw offset of decoded character i; null when nothing was decoded.
const NAMED_REFS = { num: '#', lpar: '(', rpar: ')', comma: ',', period: '.', colon: ':', semi: ';', percnt: '%',
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', Tab: '\t', NewLine: '\n', nbsp: ' ', times: '×',
  hellip: '…', middot: '·', ndash: '–', mdash: '—', larr: '←', rarr: '→', uarr: '↑', darr: '↓' };
function decodeRefs(raw) {
  if (!raw.includes('&')) return { text: raw, from: null };
  let text = '';
  const from = [];
  for (const m of raw.matchAll(/&#(\d+);?|&#x([\da-f]+);?|&([a-z]+);|[^&]+|&/gi)) {
    const code = m[1] !== undefined ? Number(m[1]) : m[2] !== undefined ? parseInt(m[2], 16) : null;
    const valid = code !== null && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
    const ch = code !== null ? (valid ? String.fromCodePoint(code) : '�') : Object.hasOwn(NAMED_REFS, m[3] ?? '') ? NAMED_REFS[m[3]] : m[0];
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

// styles and scripts with their bodies; tags with their attributes and [start, end) in the file;
// masked, the file with comments and script/style bodies blanked; templates, the [start, end) of
// each <template> element, whose content scripts clone (ids and references are set at runtime).
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
    ({ name: m[1].toLowerCase(), attrs: parseAttrs(m[2], m.index + 1 + m[1].length), start: m.index, end: m.index + m[0].length }));
  const templates = [];
  const open = [];
  for (const m of masked.matchAll(/<(\/?)template\b[^>]*>/gi)) {
    if (!m[1]) open.push(m.index);
    else if (open.length) templates.push([open.pop(), m.index]);
  }
  return { styles, scripts, tags, masked, templates };
}

const inTemplate = (html, offset) => html.templates.some(([a, b]) => offset > a && offset < b);
const classes = (tag) => (tag.attrs.class?.value ?? '').split(/\s+/).filter(Boolean);
const tokens = (value) => (value ?? '').split(/\s+/).filter(Boolean);

// The element's content: from the end of its start tag to its matching end tag (a <div> inside a
// <div role="button"> nests), or null when there is none (a void element).
function contentOf(html, tag) {
  const edge = new RegExp(`<(/?)${tag.name}(?=[\\s/>])[^>]*>`, 'ig');
  edge.lastIndex = tag.end;
  for (let depth = 0, m; (m = edge.exec(html.masked));) {
    if (!m[1]) { if (!m[0].endsWith('/>')) depth++; } else if (depth-- === 0) return [tag.end, m.index];
  }
  return null;
}

// What a sighted person reads inside [start, end): no tags, nothing hidden (aria-hidden, hidden,
// .kit-visually-hidden), no SVG, no option lists; character references decoded, spaces collapsed.
function visibleText(html, [start, end]) {
  let text = html.masked.slice(start, end);
  const cut = (from, to) => { text = text.slice(0, from - start) + blank(text.slice(from - start, to - start)) + text.slice(to - start); };
  for (const tag of html.tags.filter((t) => t.start >= start && t.end <= end)) {
    const hides = tag.attrs['aria-hidden']?.value === 'true' || tag.attrs.hidden || classes(tag).includes('kit-visually-hidden')
      || ['svg', 'select', 'textarea', 'template'].includes(tag.name);
    const range = hides && contentOf(html, tag);
    if (range) cut(tag.start, Math.min(end, html.masked.indexOf('>', range[1]) + 1));
  }
  return decodeRefs(text.replace(/<[^>]*>/g, ' ')).text.replace(/\s+/g, ' ').trim();
}

// url() contents are never colours we can theme: url(#grad) is a reference, and a data: SVG used
// as mask-image needs a solid fill. So they are masked along with strings.
function maskValues(css) {
  return css
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m[0] + blank(m.slice(1, -1)) + m[0])
    .replace(/\burl\(([^)]*)\)/gi, (m, inner) => `url(${blank(inner)})`);
}

// A nested rule's selector as CSS nesting reads it: "&" is the parent, and a part without "&" is a
// descendant of it. .row { &:hover {} } is .row:hover; .a, .b { .c {} } is .a .c, .b .c.
const nestedSelector = (child, parent) => splitTop(parent, (s, i) => s[i] === ',').flatMap((p) =>
  splitTop(child, (s, i) => s[i] === ',').map((c) => (c.includes('&') ? c.replaceAll('&', p) : `${p} ${c}`))).join(', ');

// Splits CSS into declarations, remembering the selector of the enclosing style rule (and where
// that rule starts), with nested rules resolved. Boundaries come from the fully masked copy;
// selectors from the comment-masked copy, so [type="checkbox"] survives. Also used for style=""
// values (everything is one list).
export function cssDeclarations(css) {
  const raw = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  const flat = maskValues(raw);
  const out = [];
  const open = [];
  let start = 0;
  for (let i = 0; i <= flat.length; i++) {
    const ch = flat[i] ?? ';';
    if (ch !== '{' && ch !== '}' && ch !== ';') continue;
    if (ch === '{') {
      const head = raw.slice(start, i);
      const text = head.trim();
      const parent = open.findLast((r) => !r.text.startsWith('@'));
      open.push({ text: parent && !text.startsWith('@') ? nestedSelector(text, parent.text) : text,
        offset: start + head.length - head.trimStart().length });
    } else {
      const m = /^\s*([-\w]+)\s*:/.exec(flat.slice(start, i));
      if (m) {
        const offset = start + m[0].length;
        // A declaration inside an at-rule nested in a style rule belongs to that style rule.
        const rule = open.findLast((r) => !r.text.startsWith('@')) ?? open.at(-1);
        out.push({ selector: rule?.text ?? '', selectorOffset: rule?.offset ?? 0, prop: m[1].toLowerCase(), value: flat.slice(offset, i), offset });
      }
      if (ch === '}') open.pop();
    }
    start = i + 1;
  }
  return out;
}

// ---- JavaScript ---------------------------------------------------------------------------------

// A small scanner for JavaScript and TypeScript: it finds comments, strings, template literals
// (with their ${} holes, whose code is scanned too) and regular expression literals, so rules read
// code without being fooled by a "figma.ui.onmessage =" in a comment or a quote in a regex.
// Returns spans { kind: 'comment' | 'string' | 'template' | 'regex', start, end, holes? } (for
// strings, templates and regexes, [start, end) is the contents between the delimiters), masked
// (comments, string, template and regex contents blanked; quotes and ${ } kept) and code (only
// comments blanked). A "/" starts a regex where an operand is expected; after ")" and "]" it is a
// division, which is what real code nearly always means, except after the ")" that ends an
// if (...), while (...) or for (...) header.
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const HEADER_WORDS = new Set(['if', 'while', 'for', 'with']);
const identChar = (c) => c !== undefined && /[\w$]/.test(c);
const scans = new Map();
export function scanJs(js) {
  if (scans.has(js)) return scans.get(js);
  const spans = [];
  const holes = []; // open ${ } holes: { span, hole, depth }
  const parens = []; // for each open "(": does it start an if/while/for header?
  let depth = 0;
  let prev = ''; // last significant code character ("a" after an identifier or number)
  let word = '';
  const template = (p, span) => { // scans template text from p; returns where code resumes
    for (; p < js.length; p++) {
      if (js[p] === '\\') p++;
      else if (js[p] === '`') { span.end = p; prev = ')'; return p + 1; }
      else if (js[p] === '$' && js[p + 1] === '{') {
        const hole = { start: p, end: js.length };
        span.holes.push(hole);
        holes.push({ span, hole, depth: depth++ });
        prev = '{';
        return p + 2;
      }
    }
    span.end = js.length;
    return js.length;
  };
  for (let i = 0; i < js.length;) {
    const c = js[i];
    if (c === '/' && js[i + 1] === '/') {
      const end = js.slice(i).search(/[\n\r]/);
      const j = end < 0 ? js.length : i + end;
      spans.push({ kind: 'comment', start: i, end: j });
      i = j;
    } else if (c === '/' && js[i + 1] === '*') {
      const end = js.indexOf('*/', i + 2);
      const j = end < 0 ? js.length : end + 2;
      spans.push({ kind: 'comment', start: i, end: j });
      i = j;
    } else if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || (prev === 'a' && REGEX_AFTER.has(word)))) {
      let j = i + 1;
      for (let inClass = false; j < js.length && js[j] !== '\n' && (inClass || js[j] !== '/'); j++) {
        if (js[j] === '\\') j++;
        else if (js[j] === '[') inClass = true;
        else if (js[j] === ']') inClass = false;
      }
      spans.push({ kind: 'regex', start: i + 1, end: j });
      i = j + 1;
      while (identChar(js[i])) i++;
      prev = ')';
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < js.length && js[j] !== c && js[j] !== '\n'; j++) if (js[j] === '\\') j++;
      spans.push({ kind: 'string', start: i + 1, end: Math.min(j, js.length) });
      i = js[j] === c ? j + 1 : j;
      prev = ')';
    } else if (c === '`') {
      const span = { kind: 'template', start: i + 1, end: js.length, holes: [] };
      spans.push(span);
      i = template(i + 1, span);
    } else if (identChar(c)) {
      let j = i;
      while (identChar(js[j])) j++;
      word = js.slice(i, j);
      prev = 'a';
      i = j;
    } else {
      if (c === '{') depth++;
      else if (c === '}') {
        const top = holes.at(-1);
        if (top && top.depth === depth - 1) {
          holes.pop();
          depth--;
          top.hole.end = i + 1;
          i = template(i + 1, top.span);
          continue;
        }
        depth--;
      }
      if (c === '(') parens.push(prev === 'a' && HEADER_WORDS.has(word));
      if (!/\s/.test(c)) prev = c === ')' && parens.pop() ? ';' : c;
      i++;
    }
  }
  const masked = js.split('');
  const code = js.split('');
  const wipe = (arr, a, b) => { for (let k = a; k < b; k++) if (arr[k] !== '\n') arr[k] = ' '; };
  for (const s of spans) {
    if (s.kind === 'comment') { wipe(masked, s.start, s.end); wipe(code, s.start, s.end); continue; }
    // A template's ${ } holes are code: only the text around them is wiped (their own strings
    // are spans of their own).
    let from = s.start;
    for (const h of s.holes ?? []) { wipe(masked, from, h.start); from = h.end; }
    wipe(masked, from, s.end);
  }
  const result = { spans, masked: masked.join(''), code: code.join('') };
  scans.set(js, result);
  return result;
}

// JavaScript with comments blanked and string contents blanked (quotes kept), so a commented-out
// or quoted "KIT_PROTOCOL = 0" never counts. Offsets and lines stay those of the original.
const maskJs = (js) => scanJs(js).masked;

// A literal's text with each ${ } hole replaced by \u0001 (same length, so offsets hold): colours
// built from variables in a hole are document data, never a literal.
const HOLE = '\u0001';
function literalText(js, span) {
  let text = js.slice(span.start, span.end);
  for (const h of span.holes ?? []) {
    const a = h.start - span.start;
    const b = Math.min(h.end, span.end) - span.start;
    text = text.slice(0, a) + HOLE.repeat(Math.max(0, b - a)) + text.slice(b);
  }
  return text;
}
const literals = (spans) => spans.filter((s) => s.kind === 'string' || s.kind === 'template');

// Index of the bracket that closes the one at open, in masked code; masked.length if none.
function closer(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if ('([{'.includes(masked[i])) depth++;
    else if (')]}'.includes(masked[i]) && --depth === 0) return i;
  }
  return masked.length;
}
// Index of the bracket that opens the one that closes at close.
function opener(masked, close) {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (')]}'.includes(masked[i])) depth++;
    else if ('([{'.includes(masked[i]) && --depth === 0) return i;
  }
  return -1;
}

// The end of the expression that starts at from: a ";" or "," at depth 0, a bracket that closes
// an outer one, or a line break that ends the statement (automatic semicolon insertion).
function expressionEnd(masked, from) {
  let depth = 0;
  for (let i = from; i < masked.length; i++) {
    const c = masked[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) return i; depth--; }
    else if (depth === 0 && (c === ';' || c === ',')) return i;
    else if (depth === 0 && c === '\n') {
      const before = masked.slice(from, i).trimEnd().at(-1) ?? '';
      const after = /\S/.exec(masked.slice(i))?.[0] ?? '';
      if (before && !/[-.?:+*/%&|^=<>(,!~]/.test(before) && !/[-.?:+*/%&|^=<>]/.test(after)) return i;
    }
  }
  return masked.length;
}

// The arguments of the call whose "(" is at open: [{ start, end }] at depth 0, and the ")".
function callArgs(masked, open) {
  const close = closer(masked, open);
  const args = [];
  let start = open + 1;
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    if ('([{'.includes(masked[i])) depth++;
    else if (')]}'.includes(masked[i])) depth--;
    else if (masked[i] === ',' && depth === 0) { args.push({ start, end: i }); start = i + 1; }
  }
  if (masked.slice(start, close).trim()) args.push({ start, end: close });
  return { args, close };
}
// The text of a single string literal that makes up the whole of [start, end), else null.
function onlyLiteral(js, spans, { start, end }) {
  const inner = literals(spans).filter((s) => s.start >= start && s.end <= end);
  if (inner.length !== 1 || inner[0].holes?.length) return null;
  const outside = js.slice(start, inner[0].start - 1) + js.slice(inner[0].end + 1, end);
  return outside.trim() ? null : js.slice(inner[0].start, inner[0].end);
}

// The JavaScript of each of the host's own inline scripts: no kit runtime, no JSON, no src.
const JS_TYPE = /^(?:|module|(?:text|application)\/(?:java|ecma)script)$/i;
const hostScripts = (html) => html.scripts.filter((s) => !s.attrs['data-kit'] && !s.attrs.src
  && JS_TYPE.test((s.attrs.type?.value ?? '').trim()));

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

// Masks use only the alpha of their image, so the colour in mask-image: linear-gradient(black,
// transparent) (a scroll fade) is never seen and never needs a theme.
const ALPHA_ONLY = /^(?:-webkit-)?mask(?:-image|-border|-border-source|-box-image|-box-image-source)?$/;

export function colorLiterals(value, prop = '') {
  if (ALPHA_ONLY.test(prop)) return [];
  const hits = [...value.matchAll(HEX), ...value.matchAll(COLOR_FN)];
  if (!NAME_VALUED.test(prop)) hits.push(...[...value.matchAll(WORD)].filter((m) => NAMED.has(m[0].toLowerCase())));
  // A colour function with a ${ } hole in it is built from data (a template literal in a script).
  return hits.filter((m) => !m[0].includes(HOLE)).map((m) => ({ index: m.index, text: m[0] }));
}

// ---- Rules: styles ------------------------------------------------------------------------------

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

// Selector helpers for missing-disabled: split at top-level commas and combinators, and read a
// compound's element, ids and classes.
function splitTop(s, test) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') depth++;
    else if (s[i] === ')' || s[i] === ']') depth--;
    else if (depth === 0 && test(s, i)) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}
const compoundsOf = (selector) => splitTop(selector, (s, i) => /[\s>+~]/.test(s[i]));
function baseOf(compound) {
  const stripped = compound.replace(/\[[^\]]*\]|::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g, ' ');
  return {
    tag: /^\s*([a-z][\w-]*)/i.exec(stripped)?.[1].toLowerCase() ?? '',
    names: [...stripped.matchAll(/[.#][\w-]+/g)].map((m) => m[0]),
  };
}
const HOVER = /:hover(?![\w-])/;
const DISABLED_STATE = /:disabled\b|:enabled\b|\[\s*(?:aria-)?disabled\b/i;
const WITHOUT_NOT = (compound) => compound.replace(/:not\((?:[^()]|\([^()]*\))*\)/gi, '');
// Hover feedback a person sees: colours, borders, shadows, opacity, cursor (layout is not feedback).
const FEEDBACK = /^(?:color|background(?:-[\w-]+)?|border(?:-[\w-]+)?|outline(?:-[\w-]+)?|box-shadow|opacity|filter|text-decoration(?:-[\w-]+)?|cursor|fill|stroke|--[\w-]+)$/;
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea']);
const WIDGET_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
  'switch', 'checkbox', 'radio', 'treeitem', 'slider', 'spinbutton', 'combobox']);
const KIT_CONTROL = /^\.kit-(?:button(?:-(?:primary|secondary|tertiary|danger|large))?|input|textarea|icon-button|menu-item)$/;

// The host's own <style> blocks: everything but the three data-kit blocks.
const hostStyles = (html) => html.styles.filter((s) => !s.attrs['data-kit']);

function missingDisabled({ ui }) {
  const out = [];
  for (const { path, text, html } of ui) {
    // A page that never disables anything can't show a disabled control lighting up.
    const disables = html.tags.some((t) => t.attrs.disabled || t.attrs['aria-disabled'])
      || hostScripts(html).some((s) => /\bdisabled\b/.test(scanJs(s.body).code));
    if (!disables) continue;
    // Classes and ids that sit on a control, in the markup or in HTML strings in host scripts.
    const controls = new Set();
    const note = (name, attrs) => {
      if (!CONTROL_TAGS.has(name) && !tokens(attrs.role?.value).some((r) => WIDGET_ROLES.has(r))) return;
      for (const c of tokens(attrs.class?.value)) controls.add(`.${c}`);
      if (attrs.id?.value) controls.add(`#${attrs.id.value.trim()}`);
    };
    for (const tag of html.tags) note(tag.name, tag.attrs);
    for (const script of hostScripts(html)) {
      const { spans } = scanJs(script.body);
      for (const s of literals(spans)) for (const m of literalText(script.body, s).matchAll(TAG)) note(m[1].toLowerCase(), parseAttrs(m[2]));
    }
    const rules = [];
    for (const style of hostStyles(html)) {
      const seen = new Map();
      for (const d of cssDeclarations(style.body)) {
        if (d.selector.startsWith('@')) continue;
        const key = `${d.selectorOffset}`;
        if (!seen.has(key)) seen.set(key, { selector: d.selector, offset: style.offset + d.selectorOffset, feedback: false });
        if (FEEDBACK.test(d.prop)) seen.get(key).feedback = true;
      }
      rules.push(...seen.values());
    }
    const disabled = rules.flatMap((r) => splitTop(r.selector, (s, i) => s[i] === ',').flatMap(compoundsOf))
      .filter((c) => DISABLED_STATE.test(c)).map((c) => baseOf(c).names);
    for (const rule of rules.filter((r) => r.feedback)) {
      for (const sel of splitTop(rule.selector, (s, i) => s[i] === ',')) {
        const hovered = compoundsOf(sel).find((c) => HOVER.test(WITHOUT_NOT(c)));
        if (!hovered || DISABLED_STATE.test(hovered)) continue;
        const { tag, names } = baseOf(hovered);
        const isControl = CONTROL_TAGS.has(tag) || names.some((n) => KIT_CONTROL.test(n) || controls.has(n))
          || /\[\s*role\s*=\s*["']?(?:button|menuitem|tab|option|link)\b/i.test(hovered);
        if (!isControl || disabled.some((d) => d.every((n) => names.includes(n)))) continue;
        const base = hovered.replace(/:hover(?![\w-])/g, '') || tag;
        out.push(finding(path, text, rule.offset, 'missing-disabled',
          `${sel} gives a control hover feedback, but no rule styles ${base}:disabled or ${base}[aria-disabled="true"], `
          + `so a disabled control still reacts; write ${base}:not(:disabled):not([aria-disabled="true"]):hover, or add a disabled rule with the disabled tokens`));
      }
    }
  }
  return out;
}

// CSS property names from script: backgroundColor -> background-color, webkitX -> -webkit-x.
const cssProp = (name) => (name === 'cssFloat' ? 'float' : name.startsWith('--') ? name
  : name.replace(/^(webkit|moz|ms)(?=[A-Z])/, '-$1').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
// HTML attributes that carry colours, inside a string: style="..." and the SVG paint attributes.
const HTML_COLOR_ATTR = /(?<=\s)(style|fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function jsColorLiteral({ ui }) {
  const out = [];
  for (const { path, text, html } of ui) {
    for (const script of hostScripts(html)) {
      const js = script.body;
      const { spans, masked } = scanJs(js);
      const report = (offset, literal, where) => out.push(finding(path, text, script.offset + offset, 'js-color-literal',
        `literal colour ${literal} set from script (${where}); colours come from tokens: use 'var(--figma-color-*)', `
        + 'or set an attribute that your CSS styles with tokens; a colour from the document goes in a custom property (style.setProperty(\'--swatch\', hex))'));
      // Literals in [start, end): checked as one declaration list, or as the value of prop. A colour
      // function the literal leaves open ('rgb(' + r + ...) is finished from data: not a literal.
      const check = (start, end, prop, where) => {
        const closed = (c) => !c.text.includes('(') || c.text.endsWith(')');
        for (const s of literals(spans).filter((l) => l.start >= start && l.end <= end)) {
          const value = literalText(js, s);
          if (prop === null) {
            for (const d of cssDeclarations(value)) for (const c of colorLiterals(d.value, d.prop).filter(closed)) report(s.start + d.offset + c.index, c.text, where);
          } else {
            for (const c of colorLiterals(maskValues(value), prop).filter(closed)) report(s.start + c.index, c.text, where);
          }
        }
      };
      // el.style.color = ..., el.style['border-color'] = ..., el.style.cssText (+)= ..., el.style = ...
      for (const m of masked.matchAll(/\.\s*style\s*(\.\s*[A-Za-z_$][\w$]*|\[[^\]]*\])?\s*\+?=(?!=)/g)) {
        const raw = m[1] ? js.slice(m.index + m[0].indexOf(m[1]), m.index + m[0].indexOf(m[1]) + m[1].length) : '';
        const name = raw.replace(/^\.\s*|^\[\s*['"`]?|['"`]?\s*\]$/g, '');
        const end = expressionEnd(masked, m.index + m[0].length);
        if (!name || name === 'cssText') check(m.index + m[0].length, end, null, `style${name ? '.cssText' : ''} =`);
        else check(m.index + m[0].length, end, cssProp(name), `style.${name} =`);
      }
      // el.style.setProperty(prop, value), el.setAttribute('style' | 'fill' | ..., value) and
      // el.setAttributeNS(ns, 'fill', value)
      for (const m of masked.matchAll(/\.\s*(style\s*\.\s*setProperty|setAttribute(NS)?)\s*\(/g)) {
        const args = callArgs(masked, m.index + m[0].length - 1).args.slice(m[2] ? 1 : 0);
        if (args.length < 2) continue;
        const name = onlyLiteral(js, spans, args[0]);
        if (m[1].startsWith('setAttribute')) {
          const attr = name?.toLowerCase();
          if (attr === 'style') check(args[1].start, args[1].end, null, `${m[1]}('style', …)`);
          else if (PAINT_ATTRS.includes(attr)) check(args[1].start, args[1].end, attr, `${m[1]}('${attr}', …)`);
        } else {
          check(args[1].start, args[1].end, name ?? '--x', `style.setProperty(${name ? `'${name}'` : '…'}, …)`);
        }
      }
      // Object.assign(el.style, { color: '#fff' }): each literal is the value of the key before it.
      for (const m of masked.matchAll(/\bObject\s*\.\s*assign\s*\(/g)) {
        const { args } = callArgs(masked, m.index + m[0].length - 1);
        if (args.length < 2 || !/\.\s*style$/.test(masked.slice(args[0].start, args[0].end).trim())) continue;
        for (const arg of args.slice(1)) {
          for (const s of literals(spans).filter((l) => l.start >= arg.start && l.end <= arg.end)) {
            const key = /(?:^|[{,])\s*(?:([A-Za-z_$][\w$]*)|(['"])([\w-]+)\2)\s*:[^,{}]*$/.exec(js.slice(arg.start, s.start - 1));
            const prop = key?.[1] ?? key?.[3];
            if (prop) check(s.start, s.end, cssProp(prop), `Object.assign(style, { ${prop}: … })`);
          }
        }
      }
      // HTML in strings and templates (innerHTML, insertAdjacentHTML, template literals).
      for (const s of literals(spans)) {
        const value = literalText(js, s);
        for (const m of value.matchAll(HTML_COLOR_ATTR)) {
          const attr = m[1].toLowerCase();
          const inner = m[2] ?? m[3];
          const at = s.start + m.index + m[0].length - inner.length - 1;
          if (attr === 'style') {
            for (const d of cssDeclarations(inner)) for (const c of colorLiterals(d.value, d.prop)) report(at + d.offset + c.index, c.text, 'style="…" in an HTML string');
          } else {
            for (const c of colorLiterals(maskValues(inner), attr)) report(at + c.index, c.text, `${attr}="…" in an HTML string`);
          }
        }
      }
    }
  }
  return out;
}

// The size budget of a ui file, two warnings for two causes. The three data-kit blocks of a
// release stay under 60 KB, so more means a doubled, edited or half-merged paste. Past 128 KB or
// 3,200 lines the whole file is more than an agent reads in one go, kit or not. A plugin's own
// code never trips the first one. Fonts embedded as data: URLs (scripts/make-fonts-css.mjs) count
// in neither, as docs/tokens.md says; images in data: URLs count like any other bytes. The kit's
// own budget for the starter (under 64 KB and 1,600 lines) is test/budget.test.mjs, not a rule.
const BUDGET_KIT_BYTES = 60 * 1024;
const BUDGET_BYTES = 128 * 1024;
const BUDGET_LINES = 3200;
const KB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const isHtml = (path) => /\.html?$/i.test(path);
const FONT_DATA = /url\(\s*(['"]?)(data:(?:font\/|application\/(?:x-)?font)[^'")]*)\1\s*\)/gi;
const fontBytes = (s) => [...s.matchAll(FONT_DATA)].reduce((n, m) => n + Buffer.byteLength(m[2]), 0);
function budget({ ui }) {
  return ui.filter((f) => isHtml(f.path)).flatMap(({ path, text, html }) => {
    const out = [];
    const blocks = [...html.styles, ...html.scripts].filter((b) => b.attrs['data-kit']).sort((a, b) => a.offset - b.offset);
    const kit = blocks.reduce((n, b) => n + Buffer.byteLength(b.body) - fontBytes(b.body), 0);
    if (kit > BUDGET_KIT_BYTES) {
      out.push(finding(path, text, blocks[0].offset, 'budget',
        `the data-kit blocks of ${basename(path)} are ${KB(kit)}, over the ${KB(BUDGET_KIT_BYTES)} a kit release stays under: `
        + 'a block was pasted twice or edited, or holds code of your own. Paste all three again, unchanged, from one release, '
        + 'and keep your own CSS and scripts in plain <style> and <script> elements after them (see docs/pitfalls.md, "The size budget")', 'warning'));
    }
    const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    const fonts = fontBytes(text);
    const bytes = Buffer.byteLength(text) - fonts;
    if (lines > BUDGET_LINES || bytes > BUDGET_BYTES) {
      out.push(finding(path, text, 0, 'budget',
        `${basename(path)} is ${lines.toLocaleString('en')} lines and ${KB(bytes)}${fonts ? ' (fonts in data: URLs not counted)' : ''}, `
        + `over ${BUDGET_LINES.toLocaleString('en')} lines or ${KB(BUDGET_BYTES)}; the kit blocks are ${KB(kit)} of it, your own code ${KB(bytes - kit)}. `
        + 'A file this size no longer fits whole in an agent\'s context, so edits start to miss parts of it: reuse kit classes, '
        + 'keep your markup, CSS and scripts lean, and move work to code.ts (see docs/pitfalls.md, "The size budget")', 'warning'));
    }
    return out;
  });
}

// ---- Rules: markup and accessibility -------------------------------------------------------------

function missingLang({ ui }) {
  return ui.filter((f) => isHtml(f.path)).flatMap(({ path, text, html }) => {
    const root = html.tags.find((t) => t.name === 'html');
    if (root && root.attrs.lang?.value.trim()) return [];
    return [finding(path, text, root ? root.start : 0, 'missing-lang', root
      ? `<html> has no lang; write <html lang="en"> (or the language of your text) so screen readers pronounce it right`
      : 'no <html lang="..."> element; start the file with <!doctype html> and <html lang="en">')];
  });
}

// Ids that something points at with one of attrs, in the markup or from a host script:
// setAttribute('aria-describedby', 'a b') and HTML strings holding aria-describedby="a".
function referencedIds(html, attrs) {
  const ids = new Set();
  for (const tag of html.tags) for (const a of attrs) for (const id of tokens(tag.attrs[a]?.value)) ids.add(id);
  const names = attrs.join('|');
  for (const script of hostScripts(html)) {
    const js = script.body;
    const { spans, masked } = scanJs(js);
    for (const m of masked.matchAll(/\.\s*setAttribute\s*\(/g)) {
      const { args } = callArgs(masked, m.index + m[0].length - 1);
      if (args.length < 2 || !attrs.includes(onlyLiteral(js, spans, args[0])?.toLowerCase())) continue;
      for (const s of literals(spans).filter((l) => l.start >= args[1].start && l.end <= args[1].end)) {
        for (const id of tokens(literalText(js, s).replaceAll(HOLE, ' '))) ids.add(id);
      }
    }
    for (const s of literals(spans)) {
      for (const m of literalText(js, s).matchAll(new RegExp(`(?:${names})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'gi'))) {
        for (const id of tokens((m[1] ?? m[2]).replaceAll(HOLE, ' '))) ids.add(id);
      }
    }
  }
  return ids;
}

const LABELABLE = new Set(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress']);
const NAMED_BY_CONTENT = new Set(['button', 'a', 'summary']);
// The widget roles whose name comes from their content (WAI-ARIA "name from content"). A slider's,
// spinbutton's or combobox's text is its value, not its label.
const NAME_FROM_CONTENT = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
  'switch', 'checkbox', 'radio', 'treeitem']);
// The words of a text, lower-cased: letters and digits only.
const wordsOf = (s) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
// Does the accessible name keep the visible label? Every visible word has to start a word of the
// name, in any order ("Duration (s)" is kept by "Animation duration in seconds"; "Prefix" is not
// kept by "Text to add"). Looser than WCAG 2.5.3's "contains", on purpose: few false alarms.
const keepsLabel = (name, visible) => wordsOf(visible).every((w) => wordsOf(name).some((n) => n.startsWith(w)));

function ariaLabelOverride({ ui }) {
  const out = [];
  for (const { path, text, html } of ui) {
    const byFor = new Map();
    const wrapped = new Map();
    for (const label of html.tags.filter((t) => t.name === 'label')) {
      const range = contentOf(html, label);
      if (!range || label.attrs.hidden || classes(label).includes('kit-visually-hidden')) continue;
      const words = visibleText(html, range);
      const target = label.attrs.for?.value.trim();
      if (target) { if (!byFor.has(target)) byFor.set(target, words); continue; }
      const control = html.tags.find((t) => t.start >= range[0] && t.end <= range[1] && LABELABLE.has(t.name));
      if (control) wrapped.set(control, words);
    }
    for (const tag of html.tags) {
      const label = tag.attrs['aria-label'];
      if (!label?.value.trim() || tag.attrs['aria-labelledby']?.value.trim()) continue;
      const type = (tag.attrs.type?.value ?? '').toLowerCase();
      let visible = '';
      let where = '';
      if (LABELABLE.has(tag.name) && !(tag.name === 'input' && type === 'hidden')) {
        visible = byFor.get(tag.attrs.id?.value.trim()) || wrapped.get(tag) || '';
        where = 'its <label>';
      }
      const role = tokens(tag.attrs.role?.value)[0];
      if (!visible && (role ? NAME_FROM_CONTENT.has(role) : NAMED_BY_CONTENT.has(tag.name))) {
        const range = contentOf(html, tag);
        visible = range ? visibleText(html, range) : '';
        where = 'its text';
      }
      if (!visible && tag.name === 'input' && /^(?:submit|button|reset)$/.test(type)) {
        visible = tag.attrs.value?.value.trim() ?? '';
        where = 'its value';
      }
      // One letter or digit ("X" to close, "B" for bold) is a symbol, which WCAG 2.5.3 leaves out.
      if (wordsOf(visible).join('').length < 2 || keepsLabel(label.value, visible)) continue;
      out.push(finding(path, text, label.offset, 'aria-label-override',
        `aria-label=${quote(label.value)} replaces ${where} ${quote(visible)} as the accessible name, so a screen reader `
        + `and voice control use words nobody sees; remove the aria-label, or make it include the words of ${quote(visible)}`));
    }
  }
  return out;
}

function missingDescribedby({ ui }) {
  const out = [];
  for (const { path, text, html } of ui) {
    const described = referencedIds(html, ['aria-describedby', 'aria-labelledby']);
    for (const tag of html.tags) {
      if (inTemplate(html, tag.start)) continue; // cloned by a script, which wires it up
      const invalid = tag.attrs['aria-invalid'];
      if (invalid && !['', 'false'].includes(invalid.value.trim().toLowerCase())
        && !tag.attrs['aria-describedby']?.value.trim() && !tag.attrs['aria-errormessage']?.value.trim()) {
        out.push(finding(path, text, invalid.offset, 'missing-describedby',
          `aria-invalid="${invalid.value}" without aria-describedby: nothing tells a screen reader what is wrong; `
          + 'point aria-describedby at the .kit-help that explains the error'));
      }
      if (!tokens(tag.attrs.role?.value).includes('tooltip')) continue;
      const id = tag.attrs.id?.value.trim();
      if (id && described.has(id)) continue;
      out.push(finding(path, text, tag.start, 'missing-describedby', id
        ? `role="tooltip" id="${id}" is not referenced: put aria-describedby="${id}" on the control it describes, or screen readers never read it`
        : 'role="tooltip" without an id: give it one and put aria-describedby="<that id>" on the control it describes'));
    }
    out.push(...scriptInvalid(path, text, html));
  }
  return out;
}

// el.setAttribute('aria-invalid', 'true') in a host script, where el is an element found by a
// literal id (document.getElementById('count') or const count = byId('count')) that has no
// aria-describedby or aria-errormessage in the markup and gets none from the same script variable.
function scriptInvalid(path, text, html) {
  const out = [];
  const byId = new Map(html.tags.filter((t) => t.attrs.id).map((t) => [t.attrs.id.value.trim(), t]));
  const LOOKUP = String.raw`\b(?:getElementById|byId|querySelector|\$)\s*\(\s*(['"])#?([\w-]+)\1\s*\)`;
  for (const script of hostScripts(html)) {
    const js = script.body;
    const { spans, masked, code } = scanJs(js);
    for (const m of masked.matchAll(/\.\s*setAttribute\s*\(/g)) {
      const { args } = callArgs(masked, m.index + m[0].length - 1);
      const value = args.length === 2 && onlyLiteral(js, spans, args[0])?.toLowerCase() === 'aria-invalid' && onlyLiteral(js, spans, args[1]);
      if (!value || value.trim().toLowerCase() === 'false') continue;
      const before = code.slice(Math.max(0, m.index - 200), m.index);
      const inline = new RegExp(`${LOOKUP}\\s*$`).exec(before);
      const name = !inline && /([A-Za-z_$][\w$]*)\s*$/.exec(before)?.[1];
      const found = inline ?? (name && new RegExp(`\\b(?:const|let|var)\\s+${name.replace(/\$/g, '\\$')}\\b[^;\\n]*?${LOOKUP}`).exec(code));
      const tag = found && byId.get(found[2]);
      if (!tag || tag.attrs['aria-describedby']?.value.trim() || tag.attrs['aria-errormessage']?.value.trim()) continue;
      if (name && new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\.\\s*setAttribute\\s*\\(\\s*(['"])aria-(?:describedby|errormessage)\\1`).test(code)) continue;
      out.push(finding(path, text, script.offset + m.index + 1, 'missing-describedby',
        `aria-invalid="${value}" set on #${found[2]}, which has no aria-describedby: nothing tells a screen reader what is wrong; `
        + `put aria-describedby="<id of its .kit-help>" on #${found[2]} in the markup`));
    }
  }
  return out;
}

function orphanHelp({ ui }) {
  const out = [];
  for (const { path, text, html } of ui) {
    const described = referencedIds(html, ['aria-describedby', 'aria-errormessage']);
    for (const tag of html.tags) {
      if (!classes(tag).includes('kit-help') || inTemplate(html, tag.start)) continue;
      const id = tag.attrs.id?.value.trim();
      if (id && described.has(id)) continue;
      out.push(finding(path, text, tag.start, 'orphan-help',
        `no aria-describedby points at this .kit-help${id ? `#${id}` : ''}: .kit-help is the help or error text of one control `
        + `(${id ? `put aria-describedby="${id}" on that control` : 'give it an id and put aria-describedby="<id>" on that control'}); `
        + 'for other secondary text, such as a status line, use .kit-text-secondary', 'warning'));
    }
  }
  return out;
}

// ---- Rules: manifest ----------------------------------------------------------------------------

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

// ---- Rules: main thread -------------------------------------------------------------------------

const PROTOCOL = /\b(?:const|let|var)\s+KIT_PROTOCOL\s*(?::\s*\w+\s*)?=\s*(\d+(?:\.\d+)?)/;
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

// The patterns of SES (Secure ECMAScript), whose checks Figma's main-thread sandbox applies to the
// whole source text, comments and strings included: a possible dynamic import, and HTML comment
// markers. https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_IMPORT_REJECTED.md
const SES_IMPORT = /(^|[^.]|\.\.\.)\bimport(\s*(?:\(|\/[/*]))/g;
const SES_COMMENT = /<!--|-->/g;
function sesForbidden({ main, compiled, ui }) {
  const out = [];
  for (const { path, text } of [main, compiled].filter(Boolean)) {
    for (const m of text.matchAll(SES_IMPORT)) {
      out.push(finding(path, text, m.index + m[1].length, 'ses-forbidden',
        `${quote(`import${m[2]}`)} here, even in a comment or string, makes Figma reject the whole file ("possible import expression rejected"); `
        + 'reword it (for example "dynamic import") or split the string (\'im\' + \'port(\')'));
    }
    for (const m of text.matchAll(SES_COMMENT)) {
      out.push(finding(path, text, m.index, 'ses-forbidden',
        `"${m[0]}" here, even in a comment or string (or as "i-->0"), makes Figma reject the whole file (HTML comment markers); `
        + `reword or split it ('<' + '!--'), and keep HTML out of ${extname(path)} files`));
    }
  }
  for (const { path, text } of ui) {
    for (const m of text.matchAll(/<!--/g)) {
      out.push(finding(path, text, m.index, 'ses-forbidden',
        'HTML comment in a ui file: whether Figma\'s sandbox rejects comment markers here is unverified, so kit ui files have none; '
        + 'use /* */ in <style>, // in <script>, or delete it', 'warning'));
    }
  }
  return out;
}

// Code at brace depth 0 of masked code: the statement starts there, not a namespace or class body.
const depthAt = (masked, offset) => {
  let depth = 0;
  for (let i = 0; i < offset; i++) depth += masked[i] === '{' ? 1 : masked[i] === '}' ? -1 : 0;
  return depth;
};

function topLevelModule({ main }) {
  if (!main) return [];
  const masked = maskJs(main.text);
  const out = [];
  for (const m of masked.matchAll(/(?<=^|[;{}]|\n)[ \t]*\b(import|export)\b(?!\s*[(.])/g)) {
    const at = m.index + m[0].indexOf(m[1]);
    if (depthAt(masked, at) !== 0) continue;
    out.push(finding(main.path, main.text, at, 'top-level-module', m[1] === 'export'
      ? `"export" makes ${basename(main.path)} a module: tsc then ends code.js with "export {};" and Figma, which runs it as a plain script, fails to start it; `
        + 'remove the export (code.ts sees kit.d.ts\'s global types without one)'
      : `"import" here: Figma runs one plain script, with no bundler and no modules; copy what you need into ${basename(main.path)} instead`));
  }
  return out;
}

// figma.ui.onmessage holds one handler, so a second assignment silently replaces the first. One
// assignment (Figma's template style) is fine: in Figma desktop 126.9.13 (2026-10-14, tools/probe)
// it left the kit's figma.ui.on('message') listener in place in all five editors. Clearing the
// property (= undefined, = null, = void 0, also in parentheses or with "as T") is deliberate: it
// does not count as a handler, and the next assignment after it starts over.
const CLEARS_HANDLER = /^\s*(?:\(\s*)*(?:undefined|null|void(?:\s+0|\s*\(\s*0\s*\)))(?:\s*\))*(?:\s+as\s+[\w$.]+(?:\[\])*)*\s*(?:[;,)}\n]|$)/;
function onmessageAssign({ main }) {
  if (!main) return [];
  const masked = plainMembers(main.text);
  const out = [];
  let first = null; // the handler assigned since the last clear, if any
  for (const m of masked.matchAll(receiverPattern(String.raw`<ui>\.\s*onmessage\s*=(?!=)`, figmaNames(masked)))) {
    if (CLEARS_HANDLER.test(masked.slice(m.index + m[0].length))) { first = null; continue; }
    if (first === null) { first = lineAt(main.text, m.index); continue; }
    out.push(finding(main.path, main.text, m.index, 'onmessage-assign',
      `figma.ui.onmessage is assigned again (first at line ${first}): the property holds one handler, so this one replaces `
      + 'the earlier one, which silently stops receiving messages; register each handler with '
      + 'figma.ui.on(\'message\', (msg) => { ... }), which keeps them all (docs/messages.md)', 'warning'));
  }
  return out;
}

// Calls that throw under "documentAccess": "dynamic-page", with what to use instead (Figma's
// "Migrating to dynamic page loading" guide; docs/pitfalls.md pitfall 5). Only exact, Figma-specific
// names, so a plugin's own .instances or .consumers never counts. <figma>, <root> and <variables>
// stand for figma, figma.root and figma.variables, or a name the file gives them (see figmaNames).
const SYNC_GETTERS = [
  [String.raw`<figma>\.\s*getNodeById\s*\(`, 'figma.getNodeById()', 'await figma.getNodeByIdAsync(id)'],
  [String.raw`<figma>\.\s*getStyleById\s*\(`, 'figma.getStyleById()', 'await figma.getStyleByIdAsync(id)'],
  [String.raw`<figma>\.\s*getFileThumbnailNode\s*\(`, 'figma.getFileThumbnailNode()', 'await figma.getFileThumbnailNodeAsync()'],
  [String.raw`<figma>\.\s*getLocal(Paint|Text|Effect|Grid)Styles\s*\(`, 'figma.getLocal$1Styles()', 'await figma.getLocal$1StylesAsync()'],
  [String.raw`<variables>\.\s*(getVariableById|getVariableCollectionById|getLocalVariables|getLocalVariableCollections)\s*\(`,
    'figma.variables.$1()', 'await figma.variables.$1Async()'],
  [String.raw`\.\s*setRange(Fill|Text)StyleId\s*\(`, '.setRange$1StyleId()', 'await node.setRange$1StyleIdAsync(...)'],
  [String.raw`\.\s*mainComponent\b(?!\s*=[^=])`, 'reading .mainComponent', 'await instance.getMainComponentAsync()'],
  [String.raw`<figma>\.\s*currentPage\s*=(?!=)`, 'assigning figma.currentPage', 'await figma.setCurrentPageAsync(page)'],
  [String.raw`\.\s*(fill|stroke|effect|grid|text)StyleId\s*=(?!=)`, 'assigning .$1StyleId', 'await node.set$1StyleIdAsync(id)'],
  [String.raw`\.\s*backgroundStyleId\s*=(?!=)`, 'assigning .backgroundStyleId', 'await node.setFillStyleIdAsync(id)'],
  [String.raw`\.\s*vectorNetwork\s*=(?!=)`, 'assigning .vectorNetwork', 'await node.setVectorNetworkAsync(network)'],
];
// These work only once every page is loaded.
const NEEDS_ALL_PAGES = String.raw`<root>\.\s*(findAll|findOne|findAllWithCriteria|findWidgetNodesByWidgetId)\s*\(`;
const DOCUMENT_CHANGE = String.raw`<figma>\.\s*(?:on|once)\s*\(\s*(['"\x60])documentchange\1`;
const capital = (s) => s[0].toUpperCase() + s.slice(1);

// Masked code with member access spelled one way, so figma?.getNodeById(id), figma['getNodeById'](id)
// and figma.getNodeById?.(id) all read as figma.getNodeById(id). Same length: offsets hold.
function plainMembers(js) {
  const { spans, masked } = scanJs(js);
  const text = masked.split('');
  const skip = (i, step) => { while (/\s/.test(masked[i] ?? '')) i += step; return i; };
  for (const s of spans.filter((x) => x.kind === 'string')) {
    const name = js.slice(s.start, s.end);
    const open = skip(s.start - 2, -1);
    const close = skip(s.end + 1, 1);
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || masked[open] !== '[' || masked[close] !== ']') continue;
    // A member access: the "[" follows an operand (x['a'], f()['a'], x?.['a']), not an array literal.
    const before = skip(open - 1, -1);
    const word = /[\w$]+$/.exec(masked.slice(Math.max(0, before - 20), before + 1))?.[0];
    if (!/[\w$)\].]/.test(masked[before] ?? '') || REGEX_AFTER.has(word)) continue;
    const plain = `.${name}`.padEnd(close + 1 - open);
    for (let i = 0; i < plain.length; i++) text[open + i] = plain[i];
  }
  return text.join('').replace(/\?\.(?=\s*[([])/g, '  ').replace(/\?\.(?!\d)/g, ' .');
}
// The other names this file gives figma, figma.root, figma.variables and figma.ui: const f = figma,
// const root = figma.root, const ui = figma.ui, const { root, variables: vars, ui } = figma.
function figmaNames(plain) {
  const names = { figma: [], root: [], variables: [], ui: [] };
  const end = String.raw`\s*(?=;|$|\n(?!\s*[.([]))`;
  for (const m of plain.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*figma\s*(?:\.\s*(root|variables|ui))?${end}`, 'g'))) {
    names[m[2] ?? 'figma'].push(m[1]);
  }
  for (const m of plain.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*figma${end}`, 'g'))) {
    for (const part of m[1].split(',')) {
      const [key, alias = key] = part.split(':').map((s) => s.trim());
      if (key === 'root' || key === 'variables' || key === 'ui') names[key].push(alias);
    }
  }
  return names;
}
function receiverPattern(source, names) {
  const local = (list) => list.map((n) => `(?<![\\w$.])${n.replace(/\$/g, '\\$')}`);
  const figma = `(?:${['(?<![\\w$])figma', ...local(names.figma)].join('|')})\\s*`;
  const member = (key) => `(?:${[`${figma}\\.\\s*${key}`, ...local(names[key])].join('|')})\\s*`;
  return new RegExp(source.replace('<figma>', figma).replace('<root>', member('root')).replace('<variables>', member('variables'))
    .replace('<ui>', member('ui')), 'g');
}

function syncGetter({ main }) {
  if (!main) return [];
  const { code } = scanJs(main.text);
  const masked = plainMembers(main.text);
  const names = figmaNames(masked);
  const out = [];
  const report = (offset, message) => out.push(finding(main.path, main.text, offset, 'sync-getter', message));
  for (const [source, what, instead] of SYNC_GETTERS) {
    for (const m of masked.matchAll(receiverPattern(source, names))) {
      // if (typeof node.setRangeFillStyleIdAsync === 'function') ... else node.setRangeFillStyleId():
      // a fallback for old clients, behind a check for the Async version, which never runs here.
      const method = /([A-Za-z]+)\s*\($/.exec(m[0])?.[1];
      const guard = method && new RegExp(`\\btypeof\\s+[\\w$.?[\\]]*\\b${method}Async\\b|(['"])${method}Async\\1\\s+in\\b`);
      if (guard && guard.test(code)) continue;
      const fill = (s) => s.replace('$1', m[1] ?? '').replace(/set(fill|stroke|effect|grid|text)Style/, (x, k) => `set${capital(k)}Style`);
      report(m.index + (m[0].startsWith('.') ? 1 : 0), `${fill(what)} throws under "documentAccess": "dynamic-page"; use ${fill(instead)}`);
    }
  }
  // "Preceding" is read loosely: any loadAllPagesAsync() call in the file counts, wherever it is,
  // because the audit can't follow the order of execution and a false alarm costs more here.
  if (/\bloadAllPagesAsync\s*\(/.test(masked)) return out;
  for (const m of masked.matchAll(receiverPattern(NEEDS_ALL_PAGES, names))) {
    report(m.index, `figma.root.${m[1]}() needs every page loaded under "dynamic-page": call await figma.loadAllPagesAsync() first (slow in big files), `
      + 'or search figma.currentPage instead');
  }
  for (const m of code.matchAll(receiverPattern(DOCUMENT_CHANGE, names))) {
    if (masked[m.index] !== code[m.index]) continue; // inside a string
    report(m.index, 'figma.on(\'documentchange\') throws under "dynamic-page" until await figma.loadAllPagesAsync() has run; '
      + 'listen to page.on(\'nodechange\') or figma.on(\'stylechange\') instead');
  }
  return out;
}

// Does the *Async() (or Promise.all()) call that starts at nameStart and closes at close hand its
// promise to something that waits for it? A heuristic on the text around the call: null when the
// promise is kept, else what is wrong. docs/pitfalls.md lists what it accepts and what it misses.
const DEFINITION_WORDS = /^(?:function|async|get|set|static|public|private|protected|readonly|abstract|override|declare)$/;
// isAsync(fn), supportsAsync(): predicates about async code, which return a boolean, not a promise
// (isReadyAsync() is still a promise).
const PREDICATE = /^(?:is|has|can|should|supports|was|needs)Async$/;
const KEEPS = /^(?:await|return|yield|void|throw)$/;
function operandStart(masked, j) {
  for (;;) {
    if (masked[j] === ')' || masked[j] === ']') {
      const o = opener(masked, j);
      if (o < 0) return j + 1;
      if (identChar(masked[o - 1]) || masked[o - 1] === ')' || masked[o - 1] === ']') {
        let w = o - 1;
        while (identChar(masked[w - 1])) w--;
        if (!KEEPS.test(masked.slice(w, o)) && !/^(?:if|while|for|switch|typeof)$/.test(masked.slice(w, o))) { j = o - 1; continue; }
      }
      return o;
    }
    if (identChar(masked[j])) { while (identChar(masked[j - 1])) j--; return j; }
    if (masked[j] === '"' || masked[j] === "'" || masked[j] === '`') return masked.lastIndexOf(masked[j], j - 1);
    return j + 1;
  }
}
function chainStart(masked, pos) {
  for (let s = pos; ;) {
    let k = s - 1;
    while (k >= 0 && /\s/.test(masked[k])) k--;
    if (masked[k] !== '.' || masked[k - 1] === '.') return s;
    let j = k - 1;
    if (masked[j] === '?') j--;
    while (j >= 0 && /\s/.test(masked[j])) j--;
    if (j < 0) return s;
    s = operandStart(masked, j);
  }
}
// The bracket that encloses position k (the innermost unclosed one before it), or -1.
function enclosingOpen(masked, k) {
  for (let i = k, depth = 0; i >= 0; i--) {
    if (')]}'.includes(masked[i])) depth++;
    else if ('([{'.includes(masked[i]) && depth-- === 0) return i;
  }
  return -1;
}
function promiseKept(masked, name, nameStart, close) {
  const after = masked.slice(close + 1);
  const next = /^\s*(\??\.)?\s*([\w$]*)/.exec(after);
  if (next[1] && /^(?:then|catch|finally)$/.test(next[2])) return null;
  if (next[1] || /^\s*\[/.test(after)) return `reads ${next[1] ? `.${next[2]}` : '[...]'} of the promise ${name}() returns, not of its result; write (await ${name}(...))${next[1] ? `.${next[2]}` : '[...]'}`;
  const start = chainStart(masked, nameStart);
  let k = start - 1;
  while (k >= 0 && /\s/.test(masked[k])) k--;
  const c = masked[k] ?? '';
  let w = k;
  while (identChar(masked[w - 1])) w--;
  const word = identChar(c) ? masked.slice(w, k + 1) : '';
  if (KEEPS.test(word)) return null;
  // A concise arrow body returns the promise to whoever calls the arrow: fine, except forEach.
  if (c === '>' && masked[k - 1] === '=') {
    return forEachCallback(masked, k - 1) ? `forEach drops the promise ${name}() returns (forEach never waits); ${FOR_EACH_FIX}` : null;
  }
  const dropped = `${name}() returns a promise that nothing awaits; write await ${name}(...) inside an async function, return it, `
    + 'or end the chain with .catch() (void marks a deliberate fire-and-forget)';
  if (c === '{' && masked[k - 1] === '$') return `puts the promise ${name}() returns into a template string ("[object Promise]"); await it first`;
  if (c === '!') return `!${name}() negates a promise, which is always false; await it first`;
  if (c === '=' && !/[=!<>]/.test(masked[k - 1] ?? '')) {
    const before = masked.slice(0, k);
    if (/[}\]]\s*$/.test(before)) return `destructures the promise ${name}() returns; write = await ${name}(...)`;
    // A plain variable (const p = ..., p = ...), maybe with a type; a property (this.p = ...) is
    // stored for later and trusted.
    const target = /(?:^|[^\w$.\])])([A-Za-z_$][\w$]*)\s*(?::\s*[\w$.<>[\]|&,\s'"?]+?)?\s*$/.exec(before);
    if (!target) return null;
    // Kept if it is later awaited, returned, then-ed, collected (push, set, an array literal,
    // Promise.all) or handed to a call that is itself awaited or returned: await withTimeout(p).
    const v = target[1].replace(/[$]/g, '\\$');
    const ident = `(?<![\\w$.])${v}(?![\\w$])`;
    const used = [
      `\\b(?:await|return|yield|void)\\s+[^;\\n]*?${ident}`,
      `${ident}\\s*\\??\\.\\s*(?:then|catch|finally)\\b`,
      `\\.\\s*(?:push|unshift|add|set)\\s*\\([^;]*?${ident}`,
      `\\bPromise\\s*\\.\\s*(?:all|allSettled|race|any)\\s*\\([^;]*?${ident}`,
      `\\[[^\\];]*${ident}\\s*[,\\]]`,
    ].some((pattern) => new RegExp(pattern).test(after));
    return used ? null
      : `${target[1]} holds the promise ${name}() returns and is never awaited; write = await ${name}(...), or await ${target[1]} before using it`;
  }
  if (c === '(' || c === ',') {
    const o = c === '(' ? k : enclosingOpen(masked, k - 1);
    if (o >= 0 && masked[o] === '(' && /\b(?:if|while|switch)\s*$/.test(masked.slice(0, o))) {
      return `${name}() is used as a condition, but a promise is always truthy; await it first`;
    }
    return null; // an argument or array element: whatever receives it is trusted to wait
  }
  // After a line that ends in a name, a number, "]" or a string or template literal, a new line
  // starts a new statement (automatic semicolon insertion).
  const statement = k < 0 || ';{})'.includes(c) || ['else', 'do'].includes(word) || caseLabelEnd(masked, k)
    || (/\n/.test(masked.slice(k + 1, start)) && (identChar(c) || ']\'"`'.includes(c)));
  const ends = /^\s*(?:[;})]|$)/.test(after) || /^[ \t\r]*\n/.test(after);
  return statement && ends ? dropped : null;
}
// Is the ":" at k the end of a case or default label in a switch body?
function caseLabelEnd(masked, k) {
  if (masked[k] !== ':' || !/(?:^|[\s;{}:])(?:case\b[^;{}?:]*|default\s*)$/.test(masked.slice(Math.max(0, k - 200), k))) return false;
  const body = enclosingOpen(masked, k - 1);
  const head = body > 0 && masked[body] === '{' ? /\)\s*$/.exec(masked.slice(0, body)) : null;
  return Boolean(head) && /\bswitch\s*$/.test(masked.slice(0, opener(masked, head.index)));
}
// Is the arrow whose "=>" starts at arrow the (not async) callback of a forEach call? An async
// callback is reported once, by FOR_EACH_ASYNC.
const FOR_EACH_FIX = 'use for (const x of list) { await ... }, or await Promise.all(list.map(async (x) => ...))';
const FOR_EACH_ASYNC = /\.\s*forEach\s*\(\s*(?:(async)\b|([A-Za-z_$][\w$.]*Async)\s*[,)])/g;
function forEachCallback(masked, arrow) {
  let p = arrow - 1;
  while (p >= 0 && /\s/.test(masked[p])) p--;
  if (masked[p] === ')') p = opener(masked, p) - 1;
  else while (identChar(masked[p])) p--;
  return /\.\s*forEach\s*\(\s*$/.test(masked.slice(0, p + 1));
}

function unawaitedAsync({ main }) {
  if (!main) return [];
  const masked = maskJs(main.text);
  const out = [];
  // Every *Async() call, and Promise.all() and its kin, which return a promise too.
  for (const m of masked.matchAll(/(?<![\w$])(?:([A-Za-z_$][\w$]*Async)|(?<!\.\s*)Promise\s*\.\s*(all|allSettled|race|any))\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = closer(masked, open);
    // Declarations: function fooAsync(), method definitions and interface signatures.
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(masked[k])) k--;
    let w = k;
    while (identChar(masked[w - 1])) w--;
    const before = identChar(masked[k]) ? masked.slice(w, k + 1) : masked[k] ?? '';
    const follows = /^\s*(\S)/.exec(masked.slice(close + 1))?.[1];
    if (DEFINITION_WORDS.test(before) || follows === '{') continue;
    if (follows === ':' && (k < 0 || ';{},'.includes(before) || /\n/.test(masked.slice(k + 1, m.index)))) continue;
    const name = m[1] ?? `Promise.${m[2]}`;
    if (PREDICATE.test(name)) continue;
    const problem = promiseKept(masked, name, m.index, close);
    if (problem) out.push(finding(main.path, main.text, m.index, 'unawaited-async', problem));
  }
  // xs.forEach(async (x) => { await ... }) and xs.forEach(loadAsync): forEach drops each promise.
  for (const m of masked.matchAll(FOR_EACH_ASYNC)) {
    const at = m.index + m[0].indexOf(m[1] ?? m[2]);
    out.push(finding(main.path, main.text, at, 'unawaited-async',
      `forEach drops the promise of each ${m[1] ? 'async callback' : `${m[2]}() call`}, so the work finishes after the code that follows it `
      + `(a figma.closePlugin(), say) and its errors go unhandled; ${FOR_EACH_FIX}`));
  }
  return out;
}

// ---- Rules: kit blocks --------------------------------------------------------------------------

const KIT_BLOCKS = [['tokens', 'style'], ['components', 'style'], ['runtime', 'script']];
const blockLabel = (name, tag) => `<${tag} data-kit="${name}">`;
// { name: [{ offset, body }] } for the three data-kit blocks of a parsed html file.
function kitBlocksOf(html) {
  const blocks = {};
  for (const [name, tag] of KIT_BLOCKS) {
    blocks[name] = (tag === 'style' ? html.styles : html.scripts).filter((b) => b.attrs['data-kit']?.value === name);
  }
  return blocks;
}
// code.ts's block, from its start marker line through its end marker line.
const WINDOW_BLOCK = /^\/\/ ==== kit:window:start\b[^\n]*\n[\s\S]*?^\/\/ ==== kit:window:end\b[^\n]*$/m;
function windowBlockOf(text) {
  const m = WINDOW_BLOCK.exec(text);
  return m ? { offset: m.index, body: m[0] } : null;
}

// The first line where copy and reference differ: { at (offset in the copy), line (0-based in the
// block), copy, ref }, or null when they are the same. Line endings don't count (a CRLF checkout of
// a copy is the same kit); any other whitespace does.
function firstDifference(copy, ref) {
  const a = copy.split('\n');
  const b = ref.split('\n');
  const same = (x, y) => x !== undefined && y !== undefined && x.replace(/\r$/, '') === y.replace(/\r$/, '');
  let i = 0;
  while (same(a[i], b[i])) i++;
  if (i >= a.length && i >= b.length) return null;
  const line = (s) => (s === undefined ? '(end of block)' : s.replace(/\r$/, ''));
  return { at: a.slice(0, i).join('\n').length + (i ? 1 : 0), line: i, copy: line(a[i]), ref: line(b[i]) };
}

function sectionDrift({ dir, ui, code, types, preview, kitRoot }) {
  const out = [];
  // Compares one copy (file, block offset and body) with its reference; reports the first difference.
  const compare = (label, copy, ref, fix) => {
    const diff = firstDifference(copy.body, ref.body);
    if (!diff) return;
    const refLine = lineAt(ref.text, ref.offset) + diff.line;
    const what = diff.copy.trim() === diff.ref.trim() && diff.copy !== diff.ref
      ? `${quote(diff.copy.trim())} differs only in spaces or tabs` : `${quote(diff.copy.trim())} here, ${quote(diff.ref.trim())} there`;
    out.push(finding(copy.path, copy.text, copy.offset + diff.at, 'section-drift', `${label} differs from ${rel(ref.path)}:${refLine}: ${what}; ${fix}`));
  };
  // Each of the three ui blocks, in copy (a parsed file) against ref.
  const compareUi = (copyFile, refFile) => {
    const copyBlocks = kitBlocksOf(copyFile.html);
    const refBlocks = kitBlocksOf(refFile.html);
    for (const [name, tag] of KIT_BLOCKS) {
      const [ref] = refBlocks[name];
      const copies = copyBlocks[name];
      if (!ref) continue;
      if (!copies.length) {
        out.push(finding(copyFile.path, copyFile.text, 0, 'section-drift',
          `no ${blockLabel(name, tag)} block; paste it from ${rel(refFile.path)}, unchanged, into <head>`));
        continue;
      }
      if (copies.length > 1) {
        out.push(finding(copyFile.path, copyFile.text, copies[1].offset, 'section-drift',
          `${blockLabel(name, tag)} appears ${copies.length} times; keep one, pasted from ${rel(refFile.path)}`));
      }
      compare(blockLabel(name, tag), { ...copyFile, ...copies[0] }, { ...refFile, ...ref },
        `paste the whole block from ${rel(refFile.path)} again, unchanged (your own CSS and scripts go in separate elements after the kit blocks)`);
    }
  };
  const kitUi = ui.find((f) => Object.values(kitBlocksOf(f.html)).some((b) => b.length));
  // preview.html carries the ui blocks of the folder's own ui.html (the repo root, or a clone of it).
  if (preview && kitUi && Object.values(kitBlocksOf(preview.html)).some((b) => b.length)) compareUi(preview, kitUi);
  if (!kitRoot) return out;
  // examples/<name>: each kit file against the kit root's.
  if (kitRoot.ui) for (const f of ui.filter((u) => Object.values(kitBlocksOf(u.html)).some((b) => b.length))) compareUi(f, kitRoot.ui);
  const refWindow = kitRoot.code && windowBlockOf(kitRoot.code.text);
  if (refWindow && code) {
    const copy = windowBlockOf(code.text);
    if (!copy) {
      out.push(finding(code.path, code.text, 0, 'section-drift',
        `no kit:window block; paste it from ${rel(kitRoot.code.path)}, unchanged, at the top of ${basename(code.path)}`));
    } else {
      compare('the kit:window block', { ...code, ...copy }, { ...kitRoot.code, ...refWindow },
        `paste the whole block from ${rel(kitRoot.code.path)} again, unchanged (your own code goes below it)`);
    }
  }
  if (kitRoot.types) {
    if (!types) {
      out.push(finding(join(dir, 'kit.d.ts'), '', 0, 'section-drift', `no kit.d.ts; copy ${rel(kitRoot.types.path)} here unchanged`));
    } else {
      compare('kit.d.ts', { ...types, offset: 0, body: types.text }, { ...kitRoot.types, offset: 0, body: kitRoot.types.text },
        `copy ${rel(kitRoot.types.path)} here again, unchanged (declare your own types in ${basename(code?.path ?? 'code.ts')})`);
    }
  }
  return out;
}

export const RULES = [manifestFields, documentAccess, networkAccess, colorLiteral, controlHeight, protocolMismatch,
  sectionDrift, missingDisabled, syncGetter, unawaitedAsync, ariaLabelOverride, missingLang, missingDescribedby,
  budget, sesForbidden, topLevelModule, onmessageAssign, jsColorLiteral, orphanHelp];

// ---- Loading and CLI --------------------------------------------------------------------------

function uiNames(manifest) {
  const { ui } = manifest;
  if (typeof ui === 'string') return [ui];
  return ui && typeof ui === 'object' ? Object.values(ui).filter((v) => typeof v === 'string') : [];
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const source = (dir, name) => {
  const text = read(join(dir, name));
  return text === null ? null : { path: join(dir, name), text };
};
const htmlFile = (dir, name) => {
  const file = source(dir, name);
  return file && { ...file, html: parseHtml(file.text) };
};

// The manifest, the ui file(s) it names (ui.html if none), code.ts (else the main .js) and, next
// to code.ts, the compiled main .js that Figma actually runs; for section-drift, kit.d.ts, the
// folder's preview.html, and for examples/<name> the kit root two levels up.
export function loadPlugin(dir) {
  const manifest = { path: join(dir, 'manifest.json'), text: read(join(dir, 'manifest.json')) ?? '', json: {} };
  manifest.bom = manifest.text.startsWith('﻿');
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
  const ui = (names.length ? names : ['ui.html']).map((name) => htmlFile(dir, name)).filter(Boolean);
  const { main } = manifest.json;
  const mainJs = typeof main === 'string' && extname(main) === '.js' ? main : 'code.js';
  const hasTs = existsSync(join(dir, 'code.ts'));
  const mainName = hasTs ? 'code.ts' : typeof main === 'string' ? main : 'code.js';
  const root = resolve(dir, '..', '..');
  const isExample = basename(resolve(dir, '..')) === 'examples' && ['ui.html', 'code.ts', 'kit.d.ts'].some((n) => existsSync(join(root, n)));
  return {
    dir,
    manifest,
    ui,
    main: source(dir, mainName),
    compiled: hasTs ? source(dir, mainJs) : null,
    code: source(dir, 'code.ts'),
    types: source(dir, 'kit.d.ts'),
    preview: htmlFile(dir, 'preview.html'),
    kitRoot: isExample ? { dir: root, ui: htmlFile(root, 'ui.html'), code: source(root, 'code.ts'), types: source(root, 'kit.d.ts') } : null,
  };
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
