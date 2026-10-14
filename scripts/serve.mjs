#!/usr/bin/env node
// scripts/serve.mjs · kit v0.4.0 · zero dependencies, Node 24
// A static file server for the repo root, so preview.html can fetch ui.html and code.js (browsers
// block fetch() on file:// pages). Development only: it listens on 127.0.0.1, never on the network.
//
//   node scripts/serve.mjs [--port 4173]      (npm run preview)
//
// Then open http://localhost:4173/preview.html. GET and HEAD only; nothing outside the repo is
// served (no "..", no symlinks that leave it), dotfiles and dot-folders (.git, .github) are not
// served, and directories are never listed. Responses are never cached, so a reload shows edits.
// Requests must name this machine in their Host header (localhost, *.localhost, 127.0.0.1, [::1]),
// so a web page that rebinds its own domain to 127.0.0.1 cannot read the repo. A malformed
// request gets a 400 and an unexpected failure a 500; neither stops the server.
//
// GET /__kit-root?id=<rootId()> answers 200 when id names the folder this server serves and 409
// otherwise. playwright.config.mjs uses it as its webServer check, so `npm run test:e2e` reuses a
// running server only when it serves the same checkout (KIT_PREVIEW_PORT picks one port per
// checkout or worktree). The id is a hash, so the server never sends the folder's path.

import { createHash } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_PORT = 4173;
const HOST = '127.0.0.1';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '': 'text/plain; charset=utf-8', // LICENSE and other extensionless text files
};

const inside = (root, path) => path === root || path.startsWith(root + sep);
const idOf = (realRoot) => createHash('sha256').update(realRoot).digest('hex');

/** The id /__kit-root expects for a served folder: the SHA-256 (hex) of its real path. */
export const rootId = (root = REPO) => idOf(realpathSync(root));

/**
 * Maps a request path to a file under root, or null. Decoding happens once, here; any "." or ".."
 * segment, backslash, NUL or dot-prefixed name is refused before the file system is touched, and
 * the real path (symlinks resolved) must still be inside the real root.
 */
export async function resolveFile(root, urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed %-escape
  }
  if (path.includes('\0') || path.includes('\\')) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.some((s) => s.startsWith('.'))) return null; // "..", ".", .git, .env
  const realRoot = await realpath(root);
  let file = join(realRoot, ...segments);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const real = await realpath(file);
    if (!inside(realRoot, real)) return null;
    const info = await stat(real);
    return info.isFile() ? { path: real, size: info.size } : null;
  } catch {
    return null;
  }
}

/**
 * True when a Host header names this machine: localhost, *.localhost, 127.0.0.1 or [::1], with
 * any port. A missing header passes (HTTP/1.0 tools may omit it; browsers always send it).
 */
export function isLocalHost(host) {
  if (host === undefined) return true;
  const name = host.trim().toLowerCase().replace(/:\d*$/, '');
  return name === 'localhost' || name.endsWith('.localhost') || name === '127.0.0.1' || name === '[::1]';
}

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function sendText(res, status, body, extra = {}) {
  res.writeHead(status, { ...HEADERS, ...extra, 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

async function handle(root, req, res) {
  if (!isLocalHost(req.headers.host)) {
    sendText(res, 403, 'Forbidden: this preview server only answers requests for localhost\n');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed\n', { allow: 'GET, HEAD' });
    return;
  }
  const url = URL.parse(req.url ?? '/', 'http://localhost'); // null for a target such as "http://[/x"
  if (!url) {
    sendText(res, 400, 'Bad request\n');
    return;
  }
  if (url.pathname === '/') {
    res.writeHead(302, { ...HEADERS, location: '/preview.html' });
    res.end();
    return;
  }
  if (url.pathname === '/__kit-root') {
    const same = url.searchParams.get('id') === idOf(await realpath(root));
    sendText(res, same ? 200 : 409, same ? 'This server serves the folder that id names\n' : 'This server serves another folder\n');
    return;
  }
  const file = await resolveFile(root, url.pathname);
  if (!file) {
    sendText(res, 404, 'Not found\n');
    return;
  }
  const type = MIME[extname(file.path).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { ...HEADERS, 'content-type': type, 'content-length': file.size });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file.path).on('error', () => res.destroy()).pipe(res);
}

/** A node:http server for root. Not listening yet: call .listen(port, '127.0.0.1'). */
export function createPreviewServer(root = REPO) {
  return createServer((req, res) => {
    handle(root, req, res).catch(() => {
      // A failed request must never take the server down with it.
      if (res.headersSent) res.destroy();
      else sendText(res, 500, 'Internal error\n');
    });
  });
}

function parsePort(argv) {
  const i = argv.findIndex((a) => a === '--port' || a.startsWith('--port='));
  if (i === -1) return DEFAULT_PORT;
  const raw = argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port needs a number from 0 to 65535, got ${raw}`);
  return port;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('usage: node scripts/serve.mjs [--port 4173]   (serves the repo root on 127.0.0.1)');
    return;
  }
  let port;
  try {
    port = parsePort(argv);
  } catch (error) {
    console.error(`serve: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const server = createPreviewServer(REPO);
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `serve: port ${port} is in use (another program, or the preview server of another checkout); stop it or pass --port <number> (for npm run test:e2e, set KIT_PREVIEW_PORT=<number>)`
      : `serve: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    const actual = server.address().port;
    console.log(`Kit preview: http://localhost:${actual}/preview.html`);
    console.log(`Serving ${REPO} on ${HOST}:${actual} only. Ctrl+C stops it.`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// import.meta.main needs Node 24.2+; the path comparison covers 24.0 and 24.1.
if (import.meta.main ?? import.meta.filename === realpathSync(process.argv[1] ?? '.')) main(process.argv.slice(2));
