import { test } from '@playwright/test';
import * as path from 'path';

const outDir = path.join(process.cwd(), 'docs', 'screenshots');

test.describe('Quick Shots Suite', () => {
  test('desktop settings shots', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // open settings
    const btn = page.locator('button[title*="Настройки"], button[aria-label*="Настройки"]').first();
    await btn.click();
    await page.waitForTimeout(200);

    const tabs = ['account', 'ai', 'vault', 'devices', 'sync', 'notifications', 'ui', 'shortcuts', 'logs'];
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

    await page.getByRole('button', { name: 'Назад к папкам' }).click();
    // mobile dock settings
    const dockSettings = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').first();
    await dockSettings.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, 'mobile_settings_root.png') });

    const tabs = [
      { id: 'ai', text: 'ИИ & Провайдеры' },
      { id: 'vault', text: 'Хранилище & Бэкап' },
      { id: 'devices', text: 'Устройства' },
      { id: 'sync', text: 'Синхронизация' },
      { id: 'notifications', text: 'Уведомления' },
      { id: 'ui', text: 'Интерфейс & Панели' },
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

    // Capture mobile vault switcher sheet via clicking profile card
    const closeBtn = page.locator('button[title="Назад"]').first();
    if (await closeBtn.isVisible()) await closeBtn.click();
    await page.waitForTimeout(200);

    const vaultCard = page.locator('button:has-text("Obsidian")').first();
    if (await vaultCard.isVisible()) {
      await vaultCard.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(outDir, 'mobile_vault_sheet.png') });

      // Click outside / escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }

    const dockFolders = page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('button', { name: 'Папки' });
    await dockFolders.click();
    await page.getByRole('button', { name: /^Входящие/ }).click();
    await page.locator('header').getByRole('button', { name: /^Переключить папку:/ }).click();
    await page.getByRole('combobox', { name: 'Найти папку' }).waitFor();
    await page.screenshot({ path: path.join(outDir, 'mobile_folder_dropdown.png'), animations: 'disabled' });
  });
});
