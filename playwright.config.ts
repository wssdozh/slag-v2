import { defineConfig, devices } from '@playwright/test';

// A second checkout (a worktree for the orb work) keeps its own dev server on 5173 and
// `reuseExistingServer` would silently test that code instead. Set SLAG_E2E_PORT to run
// this tree on its own port.
const port = Number(process.env.SLAG_E2E_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  // The first page load after a dependency change pays Vite's cold prebundle
  // (~45s on this machine); every later load is 2s. 45s cut that first load off.
  timeout: 90000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Files run in parallel across workers; tests inside one file stay serial
  // (fullyParallel is off), so stateful specs keep their order. Override with
  // PLAYWRIGHT_WORKERS=1 when chasing a flake.
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? 6),
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    permissions: ['microphone', 'camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // Headless Chromium refuses software WebGL without this, and the orb
        // canvas renders nothing (no debug state either) when it is missing.
        '--enable-unsafe-swiftshader',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--no-sandbox',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx vite --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
