import { test, expect } from '@playwright/test';

test.describe('Note Filename & AI Triage Title Normalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('Creating note sets human-readable title and filename in storage', async ({ page }) => {
    const composerTextarea = page.locator('main textarea');
    await expect(composerTextarea).toBeVisible();

    const noteText = 'Купить фермерское молоко и хлеб';
    await composerTextarea.fill(noteText);
    await composerTextarea.press('Enter');

    // Verify item appeared in feed
    const createdCard = page.locator('.group', { hasText: noteText }).first();
    await expect(createdCard).toBeVisible({ timeout: 5000 });

    // Inspect localStorage to verify SlagItem has filename and id
    const itemsJson = await page.evaluate(() => localStorage.getItem('slag_items_default_vault'));
    expect(itemsJson).toBeTruthy();
    const items = JSON.parse(itemsJson!);
    const created = items.find((i: any) => i.content === noteText || i.title === noteText);
    expect(created).toBeTruthy();
    expect(created.filename).toBe('Купить фермерское молоко и хлеб.md');
    expect(created.id).toBeTruthy();
    expect(created.id.startsWith('item_')).toBe(true);
  });

  test('Triage modal displays suggested normalized title and updates note on apply', async ({ page }) => {
    // Inject an inbox note with raw unstructured text into localStorage
    await page.evaluate(() => {
      const items = [
        {
          id: 'test_raw_inbox_1',
          type: 'note',
          title: 'надо сделать нормальный экспорт в обсидиан и проверить пути',
          content: 'надо сделать нормальный экспорт в обсидиан и проверить пути к файлам и папкам',
          folder: 'Входящие',
          tags: [],
          attachments: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
    });
    await page.reload();
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Verify inbox item is visible
    await expect(page.locator('text=надо сделать нормальный экспорт в обсидиан').first()).toBeVisible({ timeout: 5000 });

    // Open Triage Modal via UI header button
    const triageBtn = page.locator('button[aria-label="Запустить ИИ-Сортировку"]').first();
    await expect(triageBtn).toBeVisible({ timeout: 5000 });
    await triageBtn.click();

    // Wait for triage modal dialog
    await expect(page.locator('text=AI Triage — Сортировка Входящих')).toBeVisible({ timeout: 5000 });

    // Ensure test screenshot directory exists and save screenshot
    await page.screenshot({ path: 'test-results/screenshots/note_filename_triage.png', fullPage: true });

    // Inspect modal items
    const modalTitle = page.locator('text=надо сделать нормальный экспорт в обсидиан').first();
    await expect(modalTitle).toBeVisible();

    // Verify applying triage updates note
    const applyBtn = page.locator('button:has-text("Применить")').first();
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // Verify toast notification
    await expect(page.locator('text=нормализовал названия')).toBeVisible({ timeout: 5000 });

    // Verify updated item in localStorage
    const updatedItems = await page.evaluate(() => {
      const raw = localStorage.getItem('slag_items_default_vault');
      return raw ? JSON.parse(raw) : [];
    });
    const target = updatedItems.find((i: any) => i.id === 'test_raw_inbox_1');
    expect(target).toBeTruthy();
    expect(target.filename).toBeTruthy();
    expect(target.filename.endsWith('.md')).toBe(true);
  });

  test('Sanitization of forbidden characters in filename', async ({ page }) => {
    const composerTextarea = page.locator('main textarea');
    await expect(composerTextarea).toBeVisible();

    const rawTitle = 'Ядро v2: что делать? / "важно" | тест';
    await composerTextarea.fill(rawTitle);
    await composerTextarea.press('Enter');

    const createdCard = page.locator('.group', { hasText: 'Ядро v2' }).first();
    await expect(createdCard).toBeVisible({ timeout: 5000 });

    const itemsJson = await page.evaluate(() => localStorage.getItem('slag_items_default_vault'));
    const items = JSON.parse(itemsJson!);
    const created = items.find((i: any) => i.title.startsWith('Ядро v2'));
    expect(created).toBeTruthy();
    expect(created.filename).toBe('Ядро v2 что делать важно тест.md');
    expect(created.filename).not.toMatch(/[\\/:*?"<>|]/);
  });
});
