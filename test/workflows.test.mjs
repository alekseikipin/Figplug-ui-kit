// .github/workflows/ci.yml's build step says every committed code.js matches its code.ts. It
// rebuilds the root (npm run build), every examples/<name>/ (npm run build:examples) and every
// contrib/<project>/<sample>/ with a tsconfig.json, then fails on any changed file. This test
// keeps the claim true: a folder with a code.ts anywhere else fails here until the step builds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'test-results', 'playwright-report']);

// The run: | block of the step with this name, unindented.
function stepScript(name) {
  const yml = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const at = yml.indexOf(`- name: ${name}\n`);
  assert.notEqual(at, -1, `ci.yml has no step named "${name}"`);
  const m = /^( +)run: \|\n((?:\1 +.*\n|\n)+)/m.exec(yml.slice(at));
  assert.ok(m, `the step "${name}" has no run: | block`);
  const indent = /^ +/.exec(m[2])[0].length;
  return m[2].split('\n').map((line) => line.slice(indent)).join('\n');
}

// Every folder (repo-relative, '/'-separated, '' for the root) holding a code.ts, outside test/fixtures.
function codeTsFolders(dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory() && relative(root, path) !== join('test', 'fixtures')) codeTsFolders(path, out);
    else if (entry.name === 'code.ts') out.push(relative(root, dir).split(sep).join('/'));
  }
  return out;
}

const STEP = 'Build, and check that every committed code.js matches its code.ts';

test('the CI build step builds the root, the examples and the contrib samples, then checks for changes', () => {
  const script = stepScript(STEP);
  const order = ['npm run build\n', 'npm run build:examples\n', 'for config in contrib/*/*/tsconfig.json', 'npx tsc -p "$(dirname "$config")"', 'git diff --exit-code', 'git status --porcelain', 'exit 1'];
  let from = 0;
  for (const part of order) {
    const at = script.indexOf(part, from);
    assert.ok(at !== -1, `the step should run ${part.trim()} (after the parts before it):\n${script}`);
    from = at + part.length;
  }
});

test('every folder with a code.ts is one the CI build step compiles', () => {
  const folders = codeTsFolders();
  assert.ok(folders.includes(''), 'the root code.ts was found');
  for (const folder of folders) {
    const covered = folder === '' // npm run build
      || /^examples\/[^/]+$/.test(folder) // npm run build:examples
      || /^contrib\/[^/]+\/[^/]+$/.test(folder); // the contrib/*/*/tsconfig.json loop
    assert.ok(covered, `${folder}/code.ts is built by no step in ci.yml; add it to "${STEP}"`);
    assert.ok(existsSync(join(root, folder, 'tsconfig.json')), `${folder || '.'}/tsconfig.json is missing, so tsc -p cannot build ${folder || 'the root'}`);
    assert.ok(existsSync(join(root, folder, 'code.js')), `${folder || '.'}/code.js is not committed next to its code.ts`);
  }
});
