// Every page in docs/ is reachable from docs/index.md, and every relative link and #anchor in the
// repo's Markdown resolves: the target file exists, and an anchor matches a heading the way GitHub
// makes heading ids. Plain file reads, so `npm run check` catches a renamed heading or file.
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

test('relative links and #anchors in the Markdown files resolve', () => {
  const files = markdownFiles();
  assert.ok(files.some((f) => f.endsWith('README.md')) && files.some((f) => f.endsWith('AGENTS.md')));
  const broken = [];
  for (const file of files) {
    for (const m of prose(readFileSync(file, 'utf8')).matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const link = m[1];
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
      if (hash && statSync(target).isFile() && target.endsWith('.md') && !anchors(target).has(decodeURIComponent(hash))) {
        broken.push(`${where} (no heading with that id)`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('heading ids follow GitHub', () => {
  assert.equal(slug('Customising `CONFIG`'), 'customising-config');
  assert.equal(slug('7. Text the sandbox rejects'), '7-text-the-sandbox-rejects');
  assert.equal(slug('Role → token cheat sheet'), 'role--token-cheat-sheet');
  assert.equal(slug('Fix-first list, inventory and first-week plan (sections 3, 7 and 10)'), 'fix-first-list-inventory-and-first-week-plan-sections-3-7-and-10');
  assert.equal(slug('`KIT_PROTOCOL` and **bold**'), 'kit_protocol-and-bold');
});
