import { test, expect } from './support/selfhostFixture';
import type { Page } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`integrations are a list with one open at a time at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    let scope;
    if (viewport.width < 768) {
      await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
      await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
      // The phone lists every tab as a row; the integrations row must exist there too.
      await page.getByTestId('mobile-settings-integrations').click();
      scope = page.getByRole('dialog', { name: 'Настройки', exact: true });
    } else {
      await page.getByTestId('sidebar-settings-btn').click();
      scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="integrations"]') });
    }

    await scope.locator('[data-tab="integrations"]').click();
    // Two blocks: one switch over everything, then one line per channel — name, gear, switch.
    const master = scope.getByRole('switch', { name: 'Включить интеграции' });
    const channelToggle = scope.getByRole('switch', { name: 'канал telegram' });
    await expect(master).toHaveAttribute('aria-checked', 'true');
    await expect(channelToggle).toHaveAttribute('aria-checked', 'true');
    await expect(scope.getByTestId('integration-telegram-settings')).toBeVisible();
    // No descriptions in the list: the row is a name and two controls.
    await expect(scope.getByText('не подключён · напоминания и вопросы боту')).toHaveCount(0);
    await expect(scope.locator('button button')).toHaveCount(0);
    expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-integrations-${viewport.width}.png` });

    // The master takes the channel down with it, and the channel cannot outvote it.
    await master.click();
    await expect(channelToggle).toHaveAttribute('aria-checked', 'false');
    await expect(channelToggle).toBeDisabled();
    await master.click();
    await expect(channelToggle).toHaveAttribute('aria-checked', 'true');
    await channelToggle.click();
    await expect(channelToggle).toHaveAttribute('aria-checked', 'false');
    await channelToggle.click();
    await expect(channelToggle).toHaveAttribute('aria-checked', 'true');

    // The gear opens the one integration: its description first, its settings below.
    await scope.getByTestId('integration-telegram-settings').click();
    await expect(scope.getByText('Канал в telegram', { exact: true })).toBeVisible();
    await expect(scope.getByText('Скрывать текст под спойлером')).toBeVisible();
    await expect(scope.getByText('Ассистент в telegram', { exact: true })).toBeVisible();
    await expect(scope.getByTestId('assistant-mode-risky')).toBeVisible();
    await expect(scope.locator('button button')).toHaveCount(0);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-integrations-telegram-${viewport.width}.png` });

    await scope.getByRole('button', { name: 'все интеграции' }).click();
    await expect(scope.getByTestId('integration-telegram-settings')).toBeVisible();

    await scope.locator('[data-tab="notifications"]').click();
    // Notifications answer "what and when", not "where": no telegram wording may leak back in.
    await expect(scope.getByText('Напоминания задач')).toBeVisible();
    await expect(scope.getByText('Тихие часы', { exact: true })).toBeVisible();
    await expect(scope.getByText('На этом устройстве', { exact: true })).toBeVisible();
    await expect(scope.getByTestId('system-notify-test')).toBeVisible();
    await expect(scope.getByText(/telegram/i)).toHaveCount(0);
    await expect(scope.getByText('Скрывать текст под спойлером')).toHaveCount(0);
    await expect(scope.locator('button button')).toHaveCount(0);
    expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-notifications-${viewport.width}.png` });
  });
}

/** Waits out the tab fade so the screenshot is not a half-transparent frame. */
async function settle(page: Page): Promise<void> {
  await page.locator('.motion-settings-tab').last().evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
}
