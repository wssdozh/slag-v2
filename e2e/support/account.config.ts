import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '..',
  outputDir: '../../test-results/account-integration-artifacts',
  testMatch: ['account_sync.spec.ts', 'account_ui.spec.ts'],
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], actionTimeout: 30_000, trace: 'retain-on-failure' },
});
