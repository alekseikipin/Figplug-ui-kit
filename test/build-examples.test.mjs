// scripts/build-examples.mjs without a local TypeScript falls back to a global tsc from PATH. The
// project path must reach tsc as one argument, whatever the folder is called (a space, a quote, a
// shell metacharacter), and a missing tsc must say so. The script runs from a copy in a temp tree
// whose PATH holds a tsc stand-in that records its arguments. The local-tsc path is what
// `npm run build:examples` (and `npm run check`) runs on the real examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/build-examples.mjs', import.meta.url));
const posixOnly = process.platform === 'win32' ? 'the tsc stand-in is a POSIX shell script' : false;

// A temp tree with scripts/build-examples.mjs, one examples/<name>/tsconfig.json per name, no
// node_modules, and bin/tsc (when withTsc) appending each call's arguments, one per line, to calls.log.
function tree(names, withTsc = true) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-build-examples-'));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(script, join(dir, 'scripts', 'build-examples.mjs'));
  for (const name of names) {
    mkdirSync(join(dir, 'examples', name), { recursive: true });
    writeFileSync(join(dir, 'examples', name, 'tsconfig.json'), '{}\n');
  }
  mkdirSync(join(dir, 'bin'));
  if (withTsc) {
    const tsc = join(dir, 'bin', 'tsc');
    writeFileSync(tsc, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done >> '${join(dir, 'calls.log')}'\nprintf -- '--\\n' >> '${join(dir, 'calls.log')}'\n`);
    chmodSync(tsc, 0o755);
  }
  return dir;
}

function run(dir) {
  return spawnSync(process.execPath, [join(dir, 'scripts', 'build-examples.mjs')], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: join(dir, 'bin'), NODE_OPTIONS: '' },
  });
}

test('with a global tsc, each example reaches tsc as -p and one path, even with a space or a quote in its name', { skip: posixOnly }, () => {
  const names = ['my plugin', 'ok', `it's; echo pwned`];
  const dir = tree(names);
  try {
    const result = run(dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /build-examples: 3 of 3 example\(s\) compiled/);
    assert.doesNotMatch(result.stderr, /DEP0190/);
    const calls = readFileSync(join(dir, 'calls.log'), 'utf8').split('--\n').filter(Boolean).map((c) => c.trimEnd().split('\n'));
    assert.deepEqual(calls, [...names].sort().map((name) => ['-p', join('examples', name)]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no tsc at all, the build fails and says how to get one', { skip: posixOnly }, () => {
  const dir = tree(['ok'], false);
  try {
    const result = run(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not run tsc .*npm install/);
    assert.match(result.stdout, /build-examples: 0 of 1 example\(s\) compiled/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no examples/ folder, there is nothing to build and the build passes', () => {
  const dir = tree([]);
  try {
    const result = run(dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no examples\/ folders, nothing to build/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
