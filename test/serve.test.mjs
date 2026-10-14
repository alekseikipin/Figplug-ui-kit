// Tests for scripts/serve.mjs that need no browser: a malformed request target gets a 400 and the
// server keeps answering, a Host header that does not name this machine gets a 403 (DNS
// rebinding), a request that fails inside the handler gets a 500 instead of stopping Node, and
// `npm run test:e2e` reuses a running server only when it serves this checkout (/__kit-root).
// MIME types, the redirect and path traversal are covered in e2e/serve.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPreviewServer, isLocalHost, REPO, rootId } from '../scripts/serve.mjs';

// The status code of one raw HTTP/1.1 request, sent byte for byte as written.
function rawStatus(port, target, host = `127.0.0.1:${port}`, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`${method} ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`); // the server closes
    });
    let text = '';
    socket.on('data', (d) => { text += d; });
    socket.on('end', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0)));
    socket.on('error', reject);
  });
}

async function withServer(root, fn) {
  const server = createPreviewServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('a malformed request target gets a 400, and the server keeps serving', async () => {
  await withServer(REPO, async (port) => {
    assert.equal(await rawStatus(port, 'http://[/ui.html'), 400);
    assert.equal(await rawStatus(port, '/ui.html'), 200);
  });
});

test('only requests whose Host names this machine are answered', async () => {
  await withServer(REPO, async (port) => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `kit.localhost:${port}`, 'LOCALHOST']) {
      assert.equal(await rawStatus(port, '/ui.html', host), 200, host);
    }
    for (const host of [`evil.example:${port}`, 'evil.example', `127.0.0.1.evil.example:${port}`, `localhost.evil.example`]) {
      assert.equal(await rawStatus(port, '/ui.html', host), 403, host);
    }
  });
});

test('isLocalHost: localhost, *.localhost, 127.0.0.1 and [::1], with or without a port', () => {
  assert.equal(isLocalHost(undefined), true);
  for (const host of ['localhost', 'localhost:4173', 'a.localhost:1', '127.0.0.1', '127.0.0.1:4173', '[::1]', '[::1]:4173']) {
    assert.equal(isLocalHost(host), true, host);
  }
  for (const host of ['', 'example.com', 'localhost.example.com', '127.0.0.2', '[::2]:4173', '0.0.0.0', 'mylocalhost']) {
    assert.equal(isLocalHost(host), false, host);
  }
});

test('a request that fails inside the handler gets a 500 and does not stop the server', async () => {
  // A root that does not exist makes the file lookup throw on every request.
  await withServer(join(tmpdir(), 'kit-serve-no-such-root', String(process.pid)), async (port) => {
    assert.equal(await rawStatus(port, '/ui.html'), 500);
    assert.equal(await rawStatus(port, '/ui.html'), 500);
  });
});

test('/__kit-root answers 200 only for the id of the folder the server serves', async () => {
  const other = mkdtempSync(join(tmpdir(), 'kit-serve-other-'));
  try {
    writeFileSync(join(other, 'preview.html'), '<!doctype html><title>another checkout</title>');
    assert.match(rootId(REPO), /^[0-9a-f]{64}$/);
    assert.notEqual(rootId(other), rootId(REPO));
    await withServer(REPO, async (port) => {
      assert.equal(await rawStatus(port, `/__kit-root?id=${rootId(REPO)}`), 200);
      assert.equal(await rawStatus(port, `/__kit-root?id=${rootId(REPO)}`, undefined, 'HEAD'), 200);
      assert.equal(await rawStatus(port, `/__kit-root?id=${rootId(other)}`), 409);
      assert.equal(await rawStatus(port, '/__kit-root'), 409);
      assert.equal(await rawStatus(port, `/__kit-root?id=${rootId(REPO)}`, 'evil.example'), 403);
    });
    await withServer(other, async (port) => {
      assert.equal(await rawStatus(port, '/preview.html'), 200);
      assert.equal(await rawStatus(port, `/__kit-root?id=${rootId(REPO)}`), 409);
      assert.equal(await rawStatus(port, `/__kit-root?id=${rootId(other)}`), 200);
    });
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});

// Playwright reuses the server on its port when webServer.url answers 200 to 403 (isURLAvailable
// in playwright-core); 404 and above mean "not this server", so it starts its own.
test('playwright.config.mjs reuses a running server only when it serves this checkout', async () => {
  const { default: config } = await import('../playwright.config.mjs');
  const url = new URL(config.webServer.url);
  assert.equal(url.pathname, '/__kit-root');
  assert.equal(url.searchParams.get('id'), rootId(REPO));
  assert.equal(new URL(config.use.baseURL).port, url.port, 'baseURL and webServer.url share one port');
  const reused = (status) => status >= 200 && status < 404;
  const target = url.pathname + url.search;
  await withServer(REPO, async (port) => assert.ok(reused(await rawStatus(port, target)), 'this checkout'));
  const other = mkdtempSync(join(tmpdir(), 'kit-serve-other-'));
  try {
    writeFileSync(join(other, 'preview.html'), '<!doctype html>');
    await withServer(other, async (port) => assert.ok(!reused(await rawStatus(port, target)), 'another checkout'));
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});

test('the CLI exits with 1 and names KIT_PREVIEW_PORT when its port is taken', async () => {
  await withServer(REPO, async (port) => {
    const script = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
    const child = spawn(process.execPath, [script, '--port', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const code = await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(code, 1);
    assert.match(stderr, new RegExp(`port ${port} is in use.*KIT_PREVIEW_PORT`));
  });
});

test('playwright.config.mjs refuses a KIT_PREVIEW_PORT that is not a port, instead of falling back to 4173', () => {
  const config = new URL('../playwright.config.mjs', import.meta.url).href;
  for (const value of ['abc', '0', '4173.5', '70000']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(config)})`],
      { encoding: 'utf8', env: { ...process.env, KIT_PREVIEW_PORT: value } });
    assert.notEqual(result.status, 0, value);
    assert.match(result.stderr, /KIT_PREVIEW_PORT must be a port number from 1 to 65535/, value);
  }
});
