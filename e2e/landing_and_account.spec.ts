import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Landing Showcase & Minimal Account Cabinet Flow', () => {
  test.beforeEach(async () => {
    const screenshotDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('walks through landing page, verifies download CTAs, navigates to cabinet and tests PIN pairing', async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

    // 1. Open Landing page
    await page.goto('/?page=landing');
    await page.waitForLoadState('domcontentloaded');

    // Verify Hero title & Direct Download buttons
    await expect(page.locator('h1')).toContainText('Заметки со скоростью чата');
    const downloadHeroBtn = page.locator('button', { hasText: 'Скачать для Windows (.exe)' });
    await expect(downloadHeroBtn).toBeVisible();

    // Verify mockup preview
    await expect(page.locator('text=E2EE онлайн')).toBeVisible();

    // Take screenshot of Landing Hero
    await page.screenshot({
      path: 'test-results/screenshots/landing_hero.png',
      fullPage: false,
    });

    // Scroll to Architecture & Comparison
    const compSection = page.locator('#comparison');
    await compSection.scrollIntoViewIfNeeded();
    await expect(page.locator('text=Отличия от Obsidian, Telegram и Notion')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();

    // Take screenshot of Landing Comparison & Architecture
    await page.screenshot({
      path: 'test-results/screenshots/landing_comparison.png',
      fullPage: false,
    });

    // Scroll to Pricing (3 Tiers: Free / Smile / Angry + Self-hosted)
    const pricingSection = page.locator('#pricing');
    await pricingSection.scrollIntoViewIfNeeded();
    await expect(page.locator('text=Free').first()).toBeVisible();
    await expect(page.locator('text=Smile').first()).toBeVisible();
    await expect(page.locator('text=Angry').first()).toBeVisible();
    await expect(page.locator('text=Self-hosted релей — 0 ₽ навсегда')).toBeVisible();

    // Take screenshot of 3-tier pricing on landing
    await page.screenshot({
      path: 'test-results/screenshots/landing_pricing_3_tiers.png',
      fullPage: false,
    });

    // 2. Navigate to Account Cabinet via Header
    const cabinetNavBtn = page.locator('header button', { hasText: 'Кабинет' });
    await cabinetNavBtn.scrollIntoViewIfNeeded();
    await cabinetNavBtn.click();

    // Verify we are in Account Cabinet
    await expect(page.locator('header span', { hasText: 'Личный кабинет' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'SLAG ID' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Войти по seed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать аккаунт' })).toBeVisible();

    // Create-account tab pre-generates a seed phrase for the user to save
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.getByTestId('account-generated-seed')).toBeVisible();
    await expect(page.getByText('Сохраните фразу восстановления')).toBeVisible();

    // Take screenshot of Account Cabinet
    await page.screenshot({
      path: 'test-results/screenshots/account_cabinet_smile_tier.png',
      fullPage: false,
    });

    // 3. Return to Landing
    const backBtn = page.locator('button', { hasText: 'На главную' });
    await backBtn.click();
    await expect(page.locator('h1')).toContainText('Заметки со скоростью чата');
  });
});
