// playwright.config.mjs · kit v0.3.0
// End-to-end tests (e2e/*.spec.mjs) against preview.html, served by scripts/serve.mjs. Chromium
// only: Figma's desktop app is Chromium-based. `npm run test:e2e` runs them; the first run needs
// `npx playwright install chromium`. Screenshots for the docs: UPDATE_SCREENSHOTS=1 npx playwright
// test --grep @screenshots (otherwise they are skipped).

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.KIT_PREVIEW_PORT) || 4173;
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
    url: `http://127.0.0.1:${PORT}/preview.html`,
    reuseExistingServer: !CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 15_000,
  },
});
