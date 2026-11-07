import { test, expect } from '@playwright/test';

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
      expect(await scope.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(scope.locator(`[data-tab="${tab}"]`)).toHaveClass(/bg-surface-active/);
      await scope.locator('form > .motion-fade').evaluate(async (element) => {
        await Promise.all(element.getAnimations().map(animation => animation.finished));
      });
      await page.screenshot({ path: `test-results/screenshots/settings-${tab}-${viewport.width}.png` });
    }
  });
}
