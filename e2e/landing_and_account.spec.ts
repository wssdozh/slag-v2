import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * `?page=landing` is a signpost now, not a marketing page: the site lives in its own repository.
 * What this verifies is that an old link still lands somewhere honest — no button that pretends
 * to download a build — and that the cabinet behind it still works.
 */
test.describe('Site signpost and account cabinet', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('points at the site and keeps the cabinet reachable', async ({ page }) => {
    await page.goto('/?page=landing');
    await page.waitForLoadState('domcontentloaded');

    // The app is one lazy chunk graph: on a cold dev server the first paint lands well after
    // `domcontentloaded`, so the signpost waits like every other screen in this suite.
    await expect(page.getByRole('heading', { name: 'SLAG живёт на slag.app' })).toBeVisible({ timeout: 60000 });
    await expect(page.getByText('https://slag.app')).toBeVisible();

    // The page that used to promise a download is gone; nothing here may look like one.
    await expect(page.getByRole('button', { name: /Скачать/ })).toHaveCount(0);
    await expect(page.getByText('199 ₽')).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/screenshots/landing_signpost.png',
      fullPage: false,
    });

    await page.getByRole('button', { name: 'Личный кабинет' }).click();
    await expect(page.getByRole('heading', { name: 'SLAG ID' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Войти по seed' })).toBeVisible();

    // Create-account tab pre-generates a seed phrase for the user to save
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.getByTestId('account-generated-seed')).toBeVisible();
    await expect(page.getByText('Сохраните фразу восстановления')).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/account_cabinet.png',
      fullPage: false,
    });
  });
});
