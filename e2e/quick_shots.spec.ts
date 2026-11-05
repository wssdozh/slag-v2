import { test } from '@playwright/test';
import * as path from 'path';

const outDir = path.join(process.cwd(), 'test-results', 'screenshots');

test.describe('Quick Shots Suite', () => {
  test('desktop settings shots', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // open settings
    const btn = page.locator('button[title*="Настройки"], button[aria-label*="Настройки"]').first();
    await btn.click();
    await page.waitForTimeout(200);

    const tabs = ['ai', 'vault', 'sync', 'ui', 'shortcuts', 'logs'];
    for (const tab of tabs) {
      await page.locator(`button[data-tab="${tab}"]`).first().click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, `desktop_settings_${tab}.png`) });
    }
  });

  test('mobile settings shots', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // mobile dock settings
    const dockSettings = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').first();
    await dockSettings.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, 'mobile_settings_root.png') });

    const tabs = [
      { id: 'ai', text: 'ИИ & Провайдеры' },
      { id: 'vault', text: 'Хранилище & Бэкап' },
      { id: 'sync', text: 'Синхронизация' },
      { id: 'ui', text: 'Интерфейс, масштаб и плотность' },
      { id: 'shortcuts', text: 'Горячие клавиши' },
    ];

    for (const tab of tabs) {
      const inModal = page.locator(`button[data-tab="${tab.id}"]`).first();
      if (await inModal.isVisible()) {
        await inModal.click();
      } else {
        const row = page.locator(`button:has-text("${tab.text}")`).first();
        if (await row.isVisible()) await row.click();
      }
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, `mobile_settings_${tab.id}.png`) });
    }
  });
});
