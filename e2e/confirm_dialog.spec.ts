import { test, expect } from '@playwright/test';

test('deleting a note asks nothing and undoes from the toast', async ({ page }) => {
  const systemDialogs: string[] = [];
  page.on('dialog', (dialog) => {
    systemDialogs.push(dialog.message());
    void dialog.accept();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);

  const cards = page.locator('[id^="item-"]');
  const before = await cards.count();
  expect(before).toBeGreaterThan(0);

  await cards.first().click({ button: 'right' });
  const menu = page.locator('.fixed.z-50', { hasText: 'Ответить' });
  await expect(menu).toBeVisible();
  await menu.locator('button', { hasText: 'Удалить' }).first().click();

  // The point of the change: no browser/OS question, the note is in .trash and the toast offers it back.
  const toast = page.getByTestId('toast').filter({ hasText: 'Запись в корзине' }).first();
  await expect(toast).toBeVisible();
  expect(systemDialogs).toEqual([]);
  await expect.poll(() => cards.count(), { timeout: 5000 }).toBe(before - 1);

  await toast.getByRole('button', { name: 'Вернуть' }).click();
  await expect.poll(() => cards.count(), { timeout: 5000 }).toBe(before);
});

test('an irreversible action asks in the app dialog, not in the system one', async ({ page }) => {
  const systemDialogs: string[] = [];
  page.on('dialog', (dialog) => {
    systemDialogs.push(dialog.message());
    void dialog.accept();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);

  await page.keyboard.press('Control+,');
  await page.locator('button[data-tab="vault"]').click();
  // Export/import live in the «перенос» subsection of the vault tab.
  await page.getByTestId('vault-subtab-transfer').click();

  // Replacing the vault from an archive is the irreversible kind: cancelling must stop before
  // anything touches the notes, and the question must be ours.
  await page.locator('input[aria-label="Восстановить из файла (.zip / .json)"]').setInputFiles({
    name: 'snapshot.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK\x05\x06' + '\x00'.repeat(18), 'binary'),
  });

  const dialog = page.locator('[role="alertdialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('snapshot.zip');
  await expect(dialog.getByRole('button', { name: 'Восстановить' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/confirm-dialog.png' });

  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);
  expect(systemDialogs).toEqual([]);
});
