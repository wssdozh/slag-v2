import { test, expect } from '@playwright/test';

// A search hit can be older than the feed's render window. Picking it must grow the window
// around the target and centre the card, the same way a wiki-link does — otherwise the feed
// switches folder, stays pinned to the newest 15 notes, and the chosen note is simply absent.
const FAR_TARGET_ID = 'search-far-target';
const FAR_TARGET_TITLE = 'Далёкая карточка навигации';

test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

test('результат поиска открывает заметку за пределами стартового окна ленты', async ({ page }) => {
  await page.addInitScript(({ targetId, targetTitle }) => {
    const now = Date.now();
    const note = (id: string, title: string, folder: string, ageMinutes: number) => ({
      id,
      type: 'note',
      title,
      content: `Тело заметки ${title}`,
      folder,
      tags: [],
      attachments: [],
      createdAt: now - ageMinutes * 60_000,
      updatedAt: now - ageMinutes * 60_000,
    });
    const archive = Array.from({ length: 24 }, (_, i) =>
      note(`archive-${i}`, `Архивная запись ${i}`, 'Архив', 30 - i),
    );
    const inbox = Array.from({ length: 3 }, (_, i) =>
      note(`inbox-${i}`, `Свежая запись ${i}`, 'Входящие', 2 - i),
    );
    const items = [
      // The oldest note in the archive, well outside the initial window of 15 cards.
      note(targetId, targetTitle, 'Архив', 90),
      ...archive,
      ...inbox,
    ];
    localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
  }, { targetId: FAR_TARGET_ID, targetTitle: FAR_TARGET_TITLE });

  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 240000 });

  const feed = page.getByTestId('feed-list-container');
  // The target is not mounted before the search pick: the window holds the newest 15 notes.
  await expect(feed.locator(`#item-${FAR_TARGET_ID}`)).toHaveCount(0);

  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder*="Поиск по заметкам"]');
  await expect(input).toBeVisible();
  await input.fill('карточка навигации');
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.getByText(FAR_TARGET_TITLE).first().click();
  await expect(input).toBeHidden();

  const card = feed.locator(`#item-${FAR_TARGET_ID}`);
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card).toBeInViewport();
  await page.screenshot({ path: 'test-results/screenshots/search-result-navigation.png' });
});
