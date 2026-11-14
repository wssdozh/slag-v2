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
    // The tab is a list: one switch over all outbound channels, then the channels themselves.
    const master = scope.getByRole('switch', { name: 'Включить интеграции' });
    await expect(master).toHaveAttribute('aria-checked', 'true');
    await expect(scope.getByTestId('integration-telegram')).toBeVisible();
    await expect(scope.getByText('не подключён · напоминания и вопросы боту')).toBeVisible();
    await expect(scope.locator('button button')).toHaveCount(0);
    expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-integrations-${viewport.width}.png` });

    // Off is a promise the row keeps: the integration says it went down with the rest.
    await master.click();
    await expect(master).toHaveAttribute('aria-checked', 'false');
    await expect(scope.getByText('выключено вместе с остальными')).toBeVisible();
    await master.click();
    await expect(master).toHaveAttribute('aria-checked', 'true');

    // The gear opens the one integration: its description first, its settings below.
    await scope.getByTestId('integration-telegram').click();
    await expect(scope.getByText('Канал в telegram', { exact: true })).toBeVisible();
    await expect(scope.getByText('Скрывать текст под спойлером')).toBeVisible();
    await expect(scope.getByText('Ассистент в telegram', { exact: true })).toBeVisible();
    await expect(scope.getByTestId('assistant-mode-risky')).toBeVisible();
    await expect(scope.locator('button button')).toHaveCount(0);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-integrations-telegram-${viewport.width}.png` });

    await scope.getByRole('button', { name: 'все интеграции' }).click();
    await expect(scope.getByTestId('integration-telegram')).toBeVisible();

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
