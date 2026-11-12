import { defineConfig, devices } from '@playwright/test';

// A second checkout (a worktree for the orb work) keeps its own dev server on 5173 and
// `reuseExistingServer` would silently test that code instead. Set SLAG_E2E_PORT to run
// this tree on its own port.
const port = Number(process.env.SLAG_E2E_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;

// The UI playground boots only on its own origin (`src/demo.tsx` refuses every other port), so
// the runner starts a second server for it. When this tree already runs there, one server is
// enough: it serves both the app and `/demo.html`.
const PLAYGROUND_PORT = 5174;
const playgroundURL = `http://127.0.0.1:${PLAYGROUND_PORT}`;

// Every server this runner starts keeps its own pre-bundled deps: worktrees share one
// node_modules, and two Vite instances rewriting `.vite/deps` at once end in EPERM and
// 504 responses from whichever lost the race.
const cacheEnv = { SLAG_VITE_CACHE_DIR: 'node_modules/.vite-e2e' };

const servers: Parameters<typeof defineConfig>[0]['webServer'] = [
  {
    command: `npx vite --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30000,
    env: cacheEnv,
  },
];

if (port !== PLAYGROUND_PORT) {
  servers.push({
    command: `npx vite --port ${PLAYGROUND_PORT} --host 127.0.0.1`,
    url: `${playgroundURL}/demo.html`,
    reuseExistingServer: true,
    timeout: 30000,
    env: cacheEnv,
  });
}

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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: servers,
});
