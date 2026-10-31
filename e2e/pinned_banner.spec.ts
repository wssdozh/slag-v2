import { test, expect } from '@playwright/test';

test.describe('Telegram-style Pinned Messages Banner & Feed Retention', () => {
  test('Pinned messages stay in chronological place and Telegram-style banner controls navigation and filtering', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const cards = page.locator('[id^="item-"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3);

    // Pick 2nd card to pin
    const secondCard = cards.nth(1);
    const secondCardId = await secondCard.getAttribute('id');

    // 1. Right click on 2nd card -> Pin it
    await secondCard.click({ button: 'right' });
    const contextMenu = page.locator('.fixed.z-50', { hasText: 'Ответить' });
    await expect(contextMenu).toBeVisible();
    await contextMenu.locator('button', { hasText: 'Закрепить' }).click();

    // Verify toast
    await expect(page.locator('text=Запись закреплена').last()).toBeVisible();

    // 2. CRITICAL VERIFICATION: Note does NOT move to top of the feed!
    // The second card must STILL be at index 1 (not index 0)!
    const cardAfterPin = page.locator('[id^="item-"]').nth(1);
    expect(await cardAfterPin.getAttribute('id')).toBe(secondCardId);

    // 3. Verify Telegram-style Pinned Banner appeared at top of feed
    const banner = page.locator('[data-testid="pinned-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner.locator('text=Закреплённое сообщение')).toBeVisible();

    // Capture screenshot of Telegram-style pinned banner
    await page.screenshot({
      path: 'test-results/screenshots/telegram_pinned_banner.png',
      fullPage: false,
    });

    // 4. Pin a 3rd card as well to test multiple pins and cycling
    const thirdCard = cards.nth(2);
    await thirdCard.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();
    await contextMenu.locator('button', { hasText: 'Закрепить' }).click();
    await expect(page.locator('text=Запись закреплена').last()).toBeVisible();

    // Banner should now show counter (1 / 2)
    await expect(banner.locator('text=1 / 2')).toBeVisible();

    // 5. Click banner -> should magnetize/scroll to first pinned note and advance to 2 / 2
    await banner.click();
    await expect(banner.locator('text=2 / 2')).toBeVisible();

    // 6. Test Right Filter Button: show ONLY pinned messages
    const filterBtn = banner.locator('button[aria-label="Фильтр закрепленных записей"]');
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();

    // Feed should now only have 2 cards (the 2 pinned notes)
    await page.waitForTimeout(300);
    const filteredCount = await page.locator('[id^="item-"]').count();
    expect(filteredCount).toBe(2);

    // Capture screenshot of filtered pinned messages
    await page.screenshot({
      path: 'test-results/screenshots/telegram_pinned_filtered.png',
      fullPage: false,
    });

    // 7. Click filter button again -> restores all notes
    await filterBtn.click();
    await page.waitForTimeout(300);
    const restoredCount = await page.locator('[id^="item-"]').count();
    expect(restoredCount).toBe(cardCount);
  });
});
