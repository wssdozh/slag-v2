import { test, expect } from '@playwright/test';

test('temporary playground opens real dialogs and toast variants on isolated origin', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5174/demo.html');
  await expect(page.getByRole('heading', { name: 'ui playground' })).toBeVisible();
  for (const label of ['успех', 'ошибка', 'информация', 'с действием']) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await expect(page.getByTestId('toast')).toHaveCount(3);
  await page.getByRole('button', { name: 'обычная модалка', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Обычная модалка' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Обычная модалка' }).evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
  await page.screenshot({ path: 'test-results/screenshots/ui-playground.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Обычная модалка' })).toBeHidden();
  await page.getByRole('button', { name: 'настройки · все вкладки' }).click();
  await expect(page.locator('[data-tab="ai"]')).toBeVisible();
});
