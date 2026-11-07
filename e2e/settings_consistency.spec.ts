import { test, expect } from './support/selfhostFixture';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`settings share groups and keep instant settings footer honest at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    if (viewport.width < 768) {
      await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
      await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
      await page.screenshot({ path: 'test-results/screenshots/settings-root-375.png' });
      await page.getByRole('button', { name: 'ИИ & Провайдеры' }).click();
    } else {
      await page.getByTestId('sidebar-settings-btn').click();
    }
    const dialog = page.getByRole('dialog', { name: 'Настройки', exact: true });
    // Desktop modal has no accessible name; use the tab container as a stable scope.
    const scope = viewport.width < 768 ? dialog : page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="ai"]') });
    for (const tab of ['ai', 'vault', 'ui', 'shortcuts', 'sync', 'devices', 'logs']) {
      await scope.locator(`[data-tab="${tab}"]`).click();
      if (tab === 'ai') await expect(scope.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
      else await expect(scope.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
      if (tab === 'ui') await expect(scope.getByText('Заголовок заметки или ключевая задача')).toHaveCount(viewport.width < 768 ? 0 : 1);
      if (tab === 'vault') {
        const toggle = scope.getByRole('switch', { name: 'Автобэкап раз в сутки' });
        const initial = await toggle.getAttribute('aria-checked');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', initial === 'true' ? 'false' : 'true');
        await toggle.click();
      }
      await expect(scope.locator('button button')).toHaveCount(0);
      if (tab === 'devices') {
        const deviceList = scope.locator('section').filter({ hasText: 'Подключённые устройства' });
        await expect(deviceList.getByText('Локальная синхронизация', { exact: true })).toHaveCount(0);
        await expect(scope.getByTestId('btn-open-pair-modal')).toHaveText('Привязать устройство');
      }
      if (tab === 'sync') {
        await expect(scope.getByRole('status')).toBeVisible();
        await expect(scope.getByTestId('sync-to-devices-btn')).toHaveJSProperty('tagName', 'BUTTON');
        await page.route('**/health', route => route.fulfill({ status: 503 }));
        await scope.getByRole('button', { name: 'Проверить', exact: true }).click();
        await expect(scope.getByRole('status').filter({ hasText: 'не удалось: HTTP 503' })).toBeVisible();
      }
      if (tab === 'vault') {
        await expect(scope.getByText('Последний снимок', { exact: true })).toBeVisible();
        await expect(scope.getByTestId('btn-create-snapshot')).toHaveText('Создать');
        await expect(scope.getByTestId('btn-create-snapshot')).toHaveAccessibleName('Создать снимок');
        const labels = scope.locator('section').filter({ hasText: 'Резервное копирование' }).locator('.flex-1 > .text-xs');
        const leftEdges = await labels.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().left));
        expect(new Set(leftEdges).size).toBe(1);
      }
      expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(scope.locator(`[data-tab="${tab}"]`)).toHaveClass(/bg-surface-active/);
      await scope.locator('form > .motion-fade').evaluate(async (element) => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
      });
      await page.screenshot({ path: `test-results/screenshots/settings-${tab}-${viewport.width}.png` });
    }
  });
}
