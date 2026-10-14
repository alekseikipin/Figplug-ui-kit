// scripts/serve.mjs: MIME types, the redirect, and that nothing outside the repo (or inside a
// dot-folder) is ever served. Raw node:http requests, because browsers and fetch() normalise ".."
// away before a request is sent.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { resolveFile, createPreviewServer } from '../scripts/serve.mjs';

/** GET (or another method) with the path sent exactly as written. */
function raw(baseURL, path, method = 'GET') {
  const { hostname, port } = new URL(baseURL);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path, method }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves repo files with the right content types and no caching', async ({ baseURL }) => {
  const cases = {
    '/preview.html': 'text/html; charset=utf-8',
    '/ui.html': 'text/html; charset=utf-8',
    '/code.js': 'text/javascript; charset=utf-8',
    '/tokens.figma-fallback.css': 'text/css; charset=utf-8',
    '/manifest.json': 'application/json; charset=utf-8',
    '/docs/tokens.md': 'text/markdown; charset=utf-8',
    '/code.ts': 'text/plain; charset=utf-8',
    '/LICENSE': 'text/plain; charset=utf-8',
  };
  for (const [path, type] of Object.entries(cases)) {
    const res = await raw(baseURL, path);
    expect(res.status, path).toBe(200);
    expect(res.type, path).toBe(type);
    expect(res.headers['cache-control'], path).toBe('no-store');
    expect(res.headers['x-content-type-options'], path).toBe('nosniff');
  }
  const root = await raw(baseURL, '/');
  expect(root.status).toBe(302);
  expect(root.headers.location).toBe('/preview.html');
  expect((await raw(baseURL, '/ui.html', 'HEAD')).status).toBe(200);
  expect((await raw(baseURL, '/ui.html', 'POST')).status).toBe(405);
});

test('refuses paths outside the repo, dotfiles, directories and malformed paths', async ({ baseURL }) => {
  for (const path of [
    '/../package.json', '/../../../../etc/passwd', '/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    '/docs/..%2f..%2f..%2fetc%2fhosts', '/.git/HEAD', '/.gitignore', '/scripts/', '/docs', '/ui.html%00', '/%E0%A4%A', '/nope.html',
    '/..\\package.json',
  ]) {
    const res = await raw(baseURL, path);
    // URL parsing turns these two into /package.json, inside the repo: allowed, never an escape.
    if (path === '/../package.json' || path === '/..\\package.json') expect([200, 404], path).toContain(res.status);
    else expect(res.status, path).toBe(404);
  }
});

test('a symlink that leaves the root is not followed', async () => {
  const outside = mkdtempSync(join(tmpdir(), 'kit-serve-outside-'));
  const root = mkdtempSync(join(tmpdir(), 'kit-serve-root-'));
  try {
    writeFileSync(join(outside, 'secret.txt'), 'secret');
    writeFileSync(join(root, 'ok.txt'), 'ok');
    mkdirSync(join(root, 'sub'));
    symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.txt'));
    symlinkSync(outside, join(root, 'sub', 'dir'));
    expect(await resolveFile(root, '/ok.txt')).toMatchObject({ size: 2 });
    expect(await resolveFile(root, '/leak.txt')).toBeNull();
    expect(await resolveFile(root, '/sub/dir/secret.txt')).toBeNull();
    // And through the server, on a random port.
    const server = createPreviewServer(root);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      expect((await raw(base, '/ok.txt')).status).toBe(200);
      expect((await raw(base, '/leak.txt')).status).toBe(404);
    } finally {
      server.close();
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('the CLI listens on 127.0.0.1 only and prints the preview address', async () => {
  const script = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const out = await new Promise((resolve, reject) => {
      let text = '';
      child.stdout.on('data', (d) => { text += d; if (/only\./.test(text)) resolve(text); });
      child.on('exit', (code) => reject(new Error(`exited ${code}: ${text}`)));
      setTimeout(() => reject(new Error(`timeout: ${text}`)), 5000);
    });
    expect(out).toMatch(/^Kit preview: http:\/\/localhost:\d+\/preview\.html$/m);
    expect(out).toMatch(/ on 127\.0\.0\.1:\d+ only\./);
  } finally {
    child.kill('SIGTERM');
  }
  const bad = spawn(process.execPath, [script, '--port', 'nope'], { stdio: 'pipe' });
  expect(await new Promise((r) => bad.on('exit', r))).toBe(2);
});
