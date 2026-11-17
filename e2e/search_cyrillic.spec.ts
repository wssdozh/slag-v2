import { test, expect } from '@playwright/test';

test.describe('Поиск: кириллица и опечатки', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('находит русскую заметку и терпит одну опечатку', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(input).toBeVisible();

    const dialog = page.locator('[role="dialog"]').first();
    const title = dialog.getByText('Обновить резюме и портфолио проектов');

    await input.fill('портфолио');
    await expect(title).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/search-cyrillic.png' });

    await input.fill('партфолио');
    await expect(title).toBeVisible();
  });

  test('общий индекс следует актуальному набору заметок каждого caller', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const { initSearchIndex, querySearch } = await import('/src/lib/searchService.ts');
      const icon = {
        id: 'search_icons', type: 'note' as const, title: 'иконки rounded',
        content: 'иконки rounded https://lucide.dev', tags: ['иконки'],
        folder: 'База знаний/ForDevelop', createdAt: 1, updatedAt: 1,
      };
      const other = { ...icon, id: 'search_other', title: 'другая запись', content: '', tags: [] };
      // A materials dock can initialize the shared index with only its own folder.
      const building = initSearchIndex([other]);
      const all = [other, icon];
      const found = await querySearch('икон', all);
      await building;
      const filtered = await querySearch('икон', all, 'task');
      const changed = { ...icon, title: 'шрифты rounded', content: 'шрифты', tags: [], updatedAt: 2 };
      const updated = await querySearch('шрифт', [other, changed]);
      const removed = await querySearch('шрифт', [other]);
      const [icons, fonts] = await Promise.all([
        querySearch('икон', [icon]),
        querySearch('шрифт', [{ ...changed, id: 'search_fonts' }]),
        initSearchIndex([other]),
      ]);
      return {
        concurrent: [icons.map(item => item.id), fonts.map(item => item.id)],
        found: found.map(item => item.id), filtered: filtered.map(item => item.id),
        updated: updated.map(item => item.id), removed: removed.map(item => item.id),
      };
    });
    expect(results).toEqual({
      found: ['search_icons'], filtered: [], updated: ['search_icons'], removed: [],
      concurrent: [['search_icons'], ['search_fonts']],
    });
  });

  test('новая заметка попадает в индекс без полной перестройки', async ({ page }) => {
    // Build the index once, so the second open goes through the incremental sync.
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(input).toBeVisible();
    await input.fill('портфолио');
    await expect(page.locator('[role="dialog"]').first().getByText('Обновить резюме и портфолио проектов')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();

    const composer = page.locator('.composer-surface').first();
    await composer.locator('textarea').fill('иконки rounded');
    await composer.getByTitle('Отправить (Enter)', { exact: true }).click();
    await expect(page.getByText('иконки rounded').first()).toBeVisible();

    await page.keyboard.press('Control+k');
    await expect(input).toBeVisible();
    await input.fill('икон');
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog.getByText('Обновить резюме и портфолио проектов')).toBeHidden();
    await expect(dialog).toContainText('иконки rounded');
    await page.screenshot({ path: 'test-results/screenshots/search-icons-prefix.png' });
  });
});
