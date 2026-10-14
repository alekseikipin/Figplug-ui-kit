// Tests for scripts/serve.mjs that need no browser: a malformed request target gets a 400 and the
// server keeps answering, a Host header that does not name this machine gets a 403 (DNS
// rebinding), and a request that fails inside the handler gets a 500 instead of stopping Node.
// MIME types, the redirect and path traversal are covered in e2e/serve.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPreviewServer, isLocalHost, REPO } from '../scripts/serve.mjs';

// The status code of one raw HTTP/1.1 request, sent byte for byte as written.
function rawStatus(port, target, host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`); // the server closes
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
