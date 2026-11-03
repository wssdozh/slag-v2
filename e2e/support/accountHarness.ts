import { test as base, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export const test = base.extend<{}, { fullAccountApp: boolean; accountHarness: { appUrl: string; relayUrl: string } }>({
  fullAccountApp: [false, { scope: 'worker', option: true }],
  accountHarness: [async ({ browserName, fullAccountApp }, provide) => {
    expect(browserName).toBe('chromium');
    const directory = await mkdtemp(join(tmpdir(), 'slag-account-e2e-'));
    const database = join(directory, 'relay.sqlite');
    const relay = spawn(process.env.PYTHON || 'python', [resolve('e2e/support/account_relay.py'), database], {
      env: { ...process.env, SLAG_REQUIRE_ACCOUNT_AUTH: 'true', PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(relay, 'exit');
    let errors = '';
    relay.stderr.on('data', (data) => { errors += String(data); });
    const lines = createInterface({ input: relay.stdout });
    const vite = await createServer({
      configFile: false,
      cacheDir: join(directory, 'vite-cache'),
      optimizeDeps: fullAccountApp
        ? { entries: ['index.html'] }
        : { noDiscovery: true, include: ['@noble/curves/nist.js', 'fflate'] },
      root: resolve('.'),
      server: { host: '127.0.0.1', port: 0, hmr: false },
      plugins: [react(), tailwindcss(), {
        name: 'account-test-document',
        configureServer(server) {
          server.middlewares.use('/account-harness', (_request, response) => {
            response.setHeader('Content-Type', 'text/html');
            response.end('<!doctype html><title>isolated account integration</title>');
          });
        },
      }],
    });
    try {
      const relayUrl = await new Promise<string>((accept, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Relay startup timed out: ${errors}`)), 15_000);
        lines.once('line', (line) => {
          clearTimeout(timeout);
          try { accept(JSON.parse(line).url); } catch (error) { reject(error); }
        });
        relay.once('error', (error) => { clearTimeout(timeout); reject(error); });
        relay.once('exit', () => { clearTimeout(timeout); reject(new Error(`Relay exited: ${errors}`)); });
      });
      await vite.listen();
      const address = vite.httpServer!.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind a TCP port');
      await provide({ appUrl: `http://127.0.0.1:${address.port}/account-harness`, relayUrl });
    } finally {
      await vite.close();
      lines.close();
      if (relay.exitCode === null) relay.kill();
      await exited;
      // Only remove the exact absolute test directory returned by mkdtemp above.
      await rm(directory, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],
});

export { expect };
