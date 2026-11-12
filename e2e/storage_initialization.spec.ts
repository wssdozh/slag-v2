import { test, expect } from '@playwright/test';

// Desktop-only: initTauriFs returns false without a Tauri runtime and never touches the disk,
// so in a browser there is no load to be concurrent about.
test.skip('concurrent native initialization callers await the same disk load', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { StorageService } = await import('/src/lib/storage/index.ts');
    const service = new StorageService();
    let finish!: (value: boolean) => void;
    const diskLoad = new Promise<boolean>(resolve => { finish = resolve; });
    let scans = 0;
    const native = service as unknown as {
      migrateLegacyNotesToVaults: () => Promise<void>;
      syncCurrentVaultFs: () => Promise<boolean>;
    };
    native.migrateLegacyNotesToVaults = async () => {};
    native.syncCurrentVaultFs = () => { scans++; return diskLoad; };
    Object.defineProperty(window, 'isTauri', { value: {}, configurable: true });
    try {
      const first = service.initTauriFs();
      const second = service.initTauriFs();
      let settled = false;
      void second.then(() => { settled = true; });
      await Promise.resolve();
      await Promise.resolve();
      const early = settled;
      finish(true);
      return { same: first === second, early, values: await Promise.all([first, second]), scans };
    } finally {
      delete (window as unknown as Record<string, unknown>).isTauri;
    }
  });
  expect(result).toEqual({ same: true, early: false, values: [true, true], scans: 1 });
});
