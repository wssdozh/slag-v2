import { test, expect } from './support/selfhostFixture';

for (const width of [1280, 390]) {
  test(`initial sync blocks editing and retries at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('main').first()).toBeVisible();
    const setStatus = async (state: string, vaultId = 'default_vault', rejected = 0) => {
      await page.evaluate(async ({ state, vaultId, rejected }) => {
        // Reuse the UI's module URL, including Vite's HMR timestamp, to avoid a second singleton.
        const modulePath = performance.getEntriesByType('resource')
          .map(({ name }) => name).find((url) => new URL(url).pathname === '/src/lib/sync/syncEngine.ts');
        if (!modulePath) throw new Error('UI syncEngine module was not loaded');
        const { syncEngine } = await import(/* @vite-ignore */ modulePath);
        syncEngine.status.initialSync = { vaultId, state, processed: 7, rejected };
        syncEngine.retryInitialSync = async () => {
          syncEngine.status.initialSync.state = 'loading';
          syncEngine.notify();
        };
        syncEngine.notify();
      }, { state, vaultId, rejected });
    };

    await setStatus('loading', 'another-vault');
    await expect(page.getByText('загружаем хранилище…')).toHaveCount(0);
    await setStatus('loading');
    await expect(page.getByText('загружаем хранилище…')).toBeVisible();
    await expect(page.getByText('обработано пакетов: 7')).toBeVisible();
    await expect(page.locator('[contenteditable="true"], textarea')).toHaveCount(0);
    await page.getByRole('button', { name: 'сменить хранилище' }).click();
    await expect(page.getByText('Ваши хранилища', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await setStatus('error', 'default_vault', 2);
    await expect(page.getByRole('alert').filter({ hasText: 'отклонено пакетов: 2' })).toContainText('отклонено пакетов: 2');
    await page.screenshot({ path: test.info().outputPath(`initial_sync_error_${width}.png`) });
    await page.getByRole('button', { name: 'повторить загрузку' }).click();
    await expect(page.getByText('загружаем хранилище…')).toBeVisible();
    await setStatus('ready', 'default_vault', 2);
    await expect(page.getByText('загружаем хранилище…')).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'отклонено пакетов: 2' })).toContainText('отклонено пакетов: 2');
  });
}
