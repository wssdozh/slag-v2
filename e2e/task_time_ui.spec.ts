// The editor writes the reminder as an ISO moment with an explicit offset: typing `10:45` must
// land `T10:45` on the same local day, and moving the date must carry the time along.
import { test, expect } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

const TASK_ID = 'task_time_contract_ui';

test.describe('reminder time in the focus editor', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
  });

  test('typing a time writes an ISO moment, moving the date keeps the clock', async ({ page }) => {
    // A legacy value on purpose: `09:30` as bare wall time, no offset, no zone.
    const seeded = await page.evaluate(async (id) => {
      const { storage } = await import('/src/lib/storage/index.ts');
      const pad = (value: number) => String(value).padStart(2, '0');
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      storage.saveItem({
        id,
        type: 'task',
        title: 'Контракт времени',
        content: 'Проверка reminder',
        folder: 'Входящие',
        tags: [],
        attachments: [],
        status: 'todo',
        priority: 'none',
        dueDate: iso(now),
        reminder: '09:30',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { dueDate: iso(now), tomorrow: iso(tomorrow) };
    }, TASK_ID);

    await page.reload({ waitUntil: 'commit' });
    const card = page.locator(`#item-${TASK_ID}`);
    await expect(card).toBeVisible({ timeout: 120000 });

    const openEditor = async () => {
      await card.click({ button: 'right' });
      await page.locator('.fixed.z-50 button', { hasText: 'Фокус-редактор' }).first().click();
      await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).toBeVisible();
    };
    const savedItem = async () =>
      page.evaluate(async (id) => {
        const { storage } = await import('/src/lib/storage/index.ts');
        const item = storage.getItemById(id);
        return item ? { reminder: item.reminder ?? null, dueDate: item.dueDate ?? null } : null;
      }, TASK_ID);

    await openEditor();

    const editor = page.locator('[data-testid="fullscreen-editor-modal"]');
    const dueButton = editor.locator('button[aria-label^="Срок"]');
    // The legacy bare time is read and shown, not treated as a broken value.
    await expect(dueButton).toHaveAttribute('aria-label', /09:30/);

    await dueButton.click();
    const timeField = page.locator('[data-testid="date-popover-time"]');
    await expect(timeField).toHaveValue('09:30');
    await timeField.fill('10:45');
    await timeField.press('Enter');

    // Autosave is debounced; the id and the offset are what the contract is about.
    await expect
      .poll(async () => (await savedItem())?.reminder)
      .toMatch(new RegExp(`^${seeded.dueDate}T10:45:00[+-]\\d{2}:\\d{2}$`));

    await page.screenshot({ path: 'test-results/screenshots/task-time-contract-editor.png' });

    // Moving the date carries the same wall clock to the new day. The popover stays open on a
    // pick, so the time field is right there — no second trip through the calendar.
    await page.getByRole('button', { name: 'Завтра', exact: true }).click();
    await expect(page.locator('[data-testid="date-popover"]')).toBeVisible();
    await expect(page.locator('[data-testid="date-popover-time"]')).toHaveValue('10:45');
    await expect
      .poll(async () => (await savedItem())?.reminder)
      .toMatch(new RegExp(`^${seeded.tomorrow}T10:45:00[+-]\\d{2}:\\d{2}$`));

    const afterMove = await savedItem();
    expect(afterMove?.dueDate).toBe(seeded.tomorrow);

    // Reopening reads the stored moment back into the field, in the device zone.
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    await openEditor();
    await editor.locator('button[aria-label^="Срок"]').click();
    await expect(page.locator('[data-testid="date-popover-time"]')).toHaveValue('10:45');
  });
});
