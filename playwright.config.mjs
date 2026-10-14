// playwright.config.mjs · kit v0.4.0
// End-to-end tests (e2e/*.spec.mjs) against preview.html, served by scripts/serve.mjs. Chromium
// only: Figma's desktop app is Chromium-based. `npm run test:e2e` runs them; the first run needs
// `npx playwright install chromium`. Screenshots for the docs: UPDATE_SCREENSHOTS=1 npx playwright
// test --grep @screenshots (otherwise they are skipped).
//
// The tests serve this checkout on port 4173, or on KIT_PREVIEW_PORT. Locally they reuse a server
// already on that port only when it serves this same folder (scripts/serve.mjs answers
// /__kit-root?id=... with 200 for its own folder, 409 for another). Another checkout's server on
// the port is never reused: the run stops with "port N is in use". Give each checkout or worktree
// its own port, e.g. KIT_PREVIEW_PORT=4174 npm run test:e2e.

import { defineConfig, devices } from '@playwright/test';
import { REPO, rootId } from './scripts/serve.mjs';

const RAW_PORT = process.env.KIT_PREVIEW_PORT;
const PORT = RAW_PORT ? Number(RAW_PORT) : 4173;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`KIT_PREVIEW_PORT must be a port number from 1 to 65535, got "${RAW_PORT}"`);
}
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/__kit-root?id=${rootId(REPO)}`,
    reuseExistingServer: !CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 15_000,
  },
});
