import { test, expect } from '@playwright/test';

/** The one origin the playground boots on: `src/demo.tsx` refuses every other port. */
const PLAYGROUND_PORT = '5174';

test('temporary playground opens real dialogs and toast variants on isolated origin', async ({ page, baseURL }) => {
  // `playwright.config.ts` starts a single server on `SLAG_E2E_PORT`, so an ordinary
  // run serves the app somewhere else and `/demo.html` answers with the playground's
  // own "wrong port" notice. That is not a broken playground — it has no origin here.
  test.skip(
    !baseURL || new URL(baseURL).port !== PLAYGROUND_PORT,
    `the playground needs its own origin: SLAG_E2E_PORT=${PLAYGROUND_PORT} npx playwright test e2e/ui_playground.spec.ts`,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo.html');
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
  await expect(page.getByRole('button', { name: 'Закрыть уведомление' })).toHaveCount(0);
  const undo = page.getByTestId('toast').getByRole('button', { name: 'Отменить', exact: true });
  await expect(undo).toHaveText('');
  await expect(undo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await undo.click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Действие отменено' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Обычная модалка' })).toBeHidden();
  await page.getByRole('button', { name: 'настройки · все вкладки' }).click();
  await expect(page.locator('[data-tab="ai"]')).toBeVisible();
});
