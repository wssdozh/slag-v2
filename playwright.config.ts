import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Files run in parallel across workers; tests inside one file stay serial
  // (fullyParallel is off), so stateful specs keep their order. Override with
  // PLAYWRIGHT_WORKERS=1 when chasing a flake.
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? 6),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
    command: 'npx vite --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
