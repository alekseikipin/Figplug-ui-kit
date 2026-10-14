// Every page in docs/ is reachable from docs/index.md, and every relative link and #anchor in the
// repo's Markdown resolves: the target file exists, and an anchor matches a heading the way GitHub
// makes heading ids. That covers Markdown links and the HTML the README uses for its media
// (src, srcset and href attributes), where an .svg#id link needs that id in the SVG (the README's
// SVGs pick their theme with #light and #dark). Plain file reads, so `npm run check` catches a
// renamed heading, file or GIF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// PLAN.md is the owner's product plan and is never edited here; node_modules and test output are not ours.
const SKIP_DIRS = new Set(['node_modules', 'test-results', 'playwright-report', '.git']);
const SKIP_FILES = new Set(['PLAN.md']);
const EXAMPLES = join(ROOT, 'examples');

function markdownFiles(dir = ROOT) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) continue; // .claude/skills/kit-ui/references -> docs, checked once as docs/
    if (info.isDirectory()) { if (!SKIP_DIRS.has(name)) out.push(...markdownFiles(path)); continue; }
    if (name.endsWith('.md') && !SKIP_FILES.has(relative(ROOT, path))) out.push(path);
  }
  return out;
}

// Fenced code blocks and inline code hold examples, not links.
const prose = (text) => text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');

// GitHub's heading ids: the heading's text, lower-cased, with everything but letters, digits,
// marks, connector punctuation (_), hyphens and spaces removed, spaces turned into hyphens, and
// -1, -2 ... added to repeats.
function slug(heading) {
  const text = heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/\*+/g, '');
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
}

const anchorCache = new Map();
function anchors(file) {
  if (!anchorCache.has(file)) {
    const seen = new Map();
    const out = new Set();
    for (const m of readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '').matchAll(/^#{1,6}[ \t]+(.+?)[ \t#]*$/gm)) {
      const base = slug(m[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      out.add(n ? `${base}-${n}` : base);
    }
    anchorCache.set(file, out);
  }
  return anchorCache.get(file);
}

test('every page in docs/ is linked from docs/index.md', () => {
  const index = readFileSync(join(ROOT, 'docs/index.md'), 'utf8');
  const linked = new Set([...prose(index).matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)].map((m) => resolve(join(ROOT, 'docs'), m[1])));
  const pages = readdirSync(join(ROOT, 'docs')).filter((n) => n.endsWith('.md') && n !== 'index.md');
  assert.ok(pages.length > 5, 'docs/ has its pages');
  assert.deepEqual(pages.filter((n) => !linked.has(join(ROOT, 'docs', n))), [], 'pages missing from docs/index.md');
});

/** The links in a Markdown file's prose: Markdown links, and the src, srcset and href of its HTML. */
function links(text) {
  const body = prose(text);
  const out = [...body.matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
  for (const m of body.matchAll(/<[a-z][^>]*>/gi)) {
    for (const a of m[0].matchAll(/\s(src|srcset|href)="([^"]*)"/gi)) {
      // A srcset lists candidates, "url 2x, url 3x": the URL is each one's first word.
      if (a[1].toLowerCase() === 'srcset') out.push(...a[2].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean));
      else out.push(a[2]);
    }
  }
  return out;
}

test('relative links and #anchors in the Markdown files resolve', () => {
  const files = markdownFiles();
  assert.ok(files.some((f) => f.endsWith('README.md')) && files.some((f) => f.endsWith('AGENTS.md')));
  const broken = [];
  for (const file of files) {
    for (const link of links(readFileSync(file, 'utf8'))) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue; // https:, mailto: ...
      const [path, hash] = link.split('#');
      const target = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      const where = `${relative(ROOT, file)}: ${link}`;
      // examples/ is optional: a designer may delete it, or any one example, when starting their
      // own plugin, so a link into a deleted example folder is not broken.
      const inExamples = relative(EXAMPLES, target).split(/[\\/]/);
      if (!existsSync(target) && inExamples[0] !== '..' && !existsSync(join(EXAMPLES, inExamples[0] || ''))) continue;
      if (!existsSync(target) && target === EXAMPLES) continue;
      if (!existsSync(target)) { broken.push(`${where} (no such file)`); continue; }
      if (!hash || !statSync(target).isFile()) continue;
      const id = decodeURIComponent(hash);
      if (target.endsWith('.md') && !anchors(target).has(id)) broken.push(`${where} (no heading with that id)`);
      if (target.endsWith('.svg') && !readFileSync(target, 'utf8').includes(`id="${id}"`)) broken.push(`${where} (no element with that id in the SVG)`);
    }
  }
  assert.deepEqual(broken, []);
});

test('the link check reads HTML attributes as well as Markdown links', () => {
  const found = links('[a](a.md) <img src="b.gif" alt="x"> <source srcset="c.svg#dark 1x, d.svg 2x"> <a href="#e">e</a>\n```html\n<img src="in-a-fence.png">\n```\n`<img src="inline-code.png">`');
  assert.deepEqual(found, ['a.md', 'b.gif', 'c.svg#dark', 'd.svg', '#e']);
});

test('heading ids follow GitHub', () => {
  assert.equal(slug('Customising `CONFIG`'), 'customising-config');
  assert.equal(slug('7. Text the sandbox rejects'), '7-text-the-sandbox-rejects');
  assert.equal(slug('Role → token cheat sheet'), 'role--token-cheat-sheet');
  assert.equal(slug('Fix-first list, inventory and first-week plan (sections 3, 7 and 10)'), 'fix-first-list-inventory-and-first-week-plan-sections-3-7-and-10');
  assert.equal(slug('`KIT_PROTOCOL` and **bold**'), 'kit_protocol-and-bold');
});
