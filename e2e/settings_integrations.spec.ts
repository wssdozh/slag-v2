import { test, expect } from './support/selfhostFixture';
import type { Locator, Page } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`integrations are a list with one open at a time at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    let scope;
    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Назад к папкам' }).click();
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
    await expect(scope.getByTestId('integration-telegram-settings')).toHaveAttribute('title', 'настройки telegram');
    // No descriptions in the list: the row is a name and two controls.
    await expect(scope.getByText('не подключён · напоминания и вопросы боту')).toHaveCount(0);
    await expect(scope.locator('button button')).toHaveCount(0);
    expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-integrations-${viewport.width}.png` });
    if (viewport.width === 1280) {
      await page.screenshot({ path: 'test-results/screenshots/integrations-gear.png' });
    }

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
    // No grey second line under a row: a label and its control, nothing else.
    await expect(scope.getByText('системные напоминания')).toHaveCount(0);
    await expect(scope.getByText('покажем тестовое уведомление')).toHaveCount(0);
    await expect(scope.getByText('Раз в день в 10:00')).toHaveCount(0);
    // Quiet hours are one mode, not two free-text clocks.
    await expect(scope.locator('input[type="text"]')).toHaveCount(0);
    await expect(scope.locator('button button')).toHaveCount(0);
    expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await settle(page);
    await page.screenshot({ path: `test-results/screenshots/settings-notifications-${viewport.width}.png` });

    const quietToggle = scope.getByRole('switch', { name: 'Не беспокоить' });
    const quietFrom = scope.getByTestId('quiet-hours-from');
    await expect(quietToggle).toHaveAttribute('aria-checked', 'true');
    await expect(quietFrom).toHaveText('23:00');

    // Off folds the window away; the stored times are still there when it comes back.
    await quietToggle.click();
    await expect(quietFrom).toHaveCount(0);
    await expect(scope.getByTestId('quiet-hours-to')).toHaveCount(0);
    await quietToggle.click();
    await expect(quietFrom).toHaveText('23:00');

    // The row opens a wheel dialog: hours and minutes, snapped one row at a time.
    await quietFrom.click();
    const picker = page.getByRole('dialog', { name: 'начало тихих часов' });
    await expect(picker).toBeVisible();
    await expect(picker.getByTestId('time-picker-hour')).toHaveCSS('scroll-snap-type', 'y mandatory');
    await expect(picker.getByTestId('time-picker-hour-23')).toHaveAttribute('aria-selected', 'true');
    await expect(picker.getByTestId('time-picker-minute-0')).toHaveAttribute('aria-selected', 'true');
    await settleDialog(picker);
    await page.screenshot({
      path: `test-results/screenshots/notify-quiet-${viewport.width < 768 ? 'mobile' : 'desktop'}.png`,
    });

    // Escape is a cancel: the dialog closes, the settings screen behind it stays, nothing is saved.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(scope.getByTestId('quiet-hours-from')).toHaveText('23:00');
    await expect(scope).toBeVisible();

    // Only the footer's "готово" writes, and it writes the wheel's row.
    await scope.getByTestId('quiet-hours-from').click();
    await expect(picker).toBeVisible();
    await picker.getByTestId('time-picker-hour-21').click();
    await picker.getByTestId('time-picker-minute-5').click();
    await expect(picker.getByTestId('time-picker-hour-21')).toHaveAttribute('aria-selected', 'true');
    await picker.getByTestId('time-picker-apply').click();
    await expect(picker).toHaveCount(0);
    await expect(scope.getByTestId('quiet-hours-from')).toHaveText('21:05');

    // The wheel answers the keyboard: an arrow steps one row, Enter is the same "готово".
    await scope.getByTestId('quiet-hours-from').click();
    await expect(picker).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(picker.getByTestId('time-picker-hour-20')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    await expect(scope.getByTestId('quiet-hours-from')).toHaveText('20:05');

    // "отмена" is the same no-op as Escape.
    const toPicker = page.getByRole('dialog', { name: 'конец тихих часов' });
    await scope.getByTestId('quiet-hours-to').click();
    await expect(toPicker).toBeVisible();
    await toPicker.getByTestId('time-picker-minute-30').click();
    await toPicker.getByTestId('time-picker-cancel').click();
    await expect(scope.getByTestId('quiet-hours-to')).toHaveText('08:00');
  });
}

/** Waits out the dialog's own entrance so the screenshot is not a half-transparent frame. */
async function settleDialog(dialog: Locator): Promise<void> {
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
}

/** Waits out the tab fade so the screenshot is not a half-transparent frame. */
async function settle(page: Page): Promise<void> {
  await page.locator('.motion-settings-tab').last().evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
}
