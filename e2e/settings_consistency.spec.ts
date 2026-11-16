import { test, expect } from './support/selfhostFixture';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  test(`settings share groups and keep instant settings footer honest at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    if (viewport.width < 768) {
      await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
      await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
      await page.screenshot({ path: 'test-results/screenshots/settings-root-375.png' });
      await page.getByRole('button', { name: 'ИИ & Провайдеры' }).click();
    } else {
      await page.getByTestId('sidebar-settings-btn').click();
    }
    const dialog = page.getByRole('dialog', { name: 'Настройки', exact: true });
    // Desktop modal has no accessible name; use the tab container as a stable scope.
    const scope = viewport.width < 768 ? dialog : page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="ai"]') });
    for (const tab of ['account', 'ai', 'vault', 'notifications', 'ui', 'shortcuts', 'sync', 'devices', 'updates', 'logs']) {
      await scope.locator(`[data-tab="${tab}"]`).click();
      if (tab === 'ai') await expect(scope.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible();
      else await expect(scope.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
      if (tab === 'account') {
        await expect(scope.getByText('Тариф', { exact: true })).toBeVisible();
        await expect(scope.getByTestId('sync-to-devices-btn')).toHaveJSProperty('tagName', 'BUTTON');
      }
      if (tab === 'ui') await expect(scope.getByText('Заголовок заметки или ключевая задача')).toHaveCount(viewport.width < 768 ? 0 : 1);
      if (tab === 'vault') {
        // Autobackup and the restore points sit in the «бэкапы» subsection of the vault tab.
        await scope.getByRole('button', { name: 'бэкапы' }).click();
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
      if (tab === 'updates') {
        // No native backend in a browser: the tab says so instead of offering a dead button.
        await expect(scope.getByTestId('update-web-hint')).toBeVisible();
        await expect(scope.getByTestId('update-check-btn')).toHaveCount(0);
        await expect(scope.getByTestId('update-current-version')).toHaveText('—');
      }
      if (tab === 'sync') {
        await expect(scope.getByRole('status')).toBeVisible();
        await expect(scope.getByRole('textbox', { name: 'Адрес сервера синхронизации' })).toHaveCSS('font-size', '12px');
        await expect(scope.getByRole('button', { name: 'Проверить', exact: true })).toHaveText('');
        await page.route('**/health', route => route.fulfill({ status: 503 }));
        await scope.getByRole('button', { name: 'Проверить', exact: true }).click();
        await expect(page.getByTestId('toast').filter({ hasText: 'Не удалось проверить сервер: HTTP 503' })).toBeVisible();
        await expect(scope.getByText(/HTTP 503/)).toHaveCount(0);
        await expect(page.getByTestId('toast').filter({ hasText: 'Не удалось проверить сервер: HTTP 503' })).toHaveCount(1);
      }
      if (tab === 'vault') {
        await expect(scope.getByText('Последний снимок', { exact: true })).toBeVisible();
        await expect(scope.getByTestId('btn-create-snapshot')).toHaveText('');
        await expect(scope.getByTestId('btn-create-snapshot')).toHaveAccessibleName('Создать снимок');
        const labels = scope.locator('section').filter({ hasText: 'Резервное копирование' }).locator('.flex-1 > .text-xs');
        const leftEdges = await labels.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().left));
        expect(new Set(leftEdges).size).toBe(1);
      }
      expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(scope.locator(`[data-tab="${tab}"]`)).toHaveClass(/bg-surface-active/);
      if (viewport.width < 768) {
        const pane = scope.locator('.motion-settings-tab');
        await expect(pane).toHaveCSS('transition-property', 'opacity, scale, translate');
        if (tab === 'devices') {
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await expect(pane).toHaveCSS('translate', 'none');
          await page.emulateMedia({ reducedMotion: 'no-preference' });
        }
      }
      await scope.locator('.motion-settings-tab').evaluate(async (element) => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
      });
      await page.screenshot({ path: `test-results/screenshots/settings-${tab}-${viewport.width}.png` });
    }
  });
}
