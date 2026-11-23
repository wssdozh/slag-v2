import { defineConfig, devices } from '@playwright/test';

// A second checkout (a worktree for the orb work) keeps its own dev server on 5173 and
// `reuseExistingServer` would silently test that code instead. Set SLAG_E2E_PORT to run
// this tree on its own port.
const port = Number(process.env.SLAG_E2E_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;
// Opt in to an installed Chromium channel without changing the default runner.
const channel = process.env.SLAG_E2E_CHANNEL || undefined;

// Each runner gets its own pre-bundled deps directory. Worktrees share one node_modules through
// a junction, and two Vite instances rewriting `.vite/deps` at once end in EPERM on the rename,
// after which the loser serves 504s and the page never mounts.
const cacheFor = (name: string) => ({ SLAG_VITE_CACHE_DIR: `${process.env.TEMP ?? '.'}/slag-vite-${name}` });

const webServer = {
  command: `npx vite --config config/vite.config.ts --port ${port} --host 127.0.0.1`,
  url: baseURL,
  reuseExistingServer: true,
  timeout: 30000,
  env: cacheFor(`app-${port}`),
};

export default defineConfig({
  testDir: './e2e',
  // The first page load after a dependency change pays Vite's cold transform of the
  // whole module graph (~80s on this machine); every later load is 2s.
  timeout: 180000,
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
      name: channel || 'chromium',
      use: { ...devices['Desktop Chrome'], channel },
    },
  ],
  webServer,
});
