import { test, expect } from '@playwright/test';

test.describe('Feed surfaces: tone instead of borders, one motion per action', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
  });

  test('1. cards and composer carry no border', async ({ page }) => {
    const card = page.locator('[data-flip-id]').first();
    await expect(card).toBeVisible();
    const cardBorder = await card.evaluate(el => getComputedStyle(el).borderTopWidth);
    expect(cardBorder).toBe('0px');

    const composer = page.locator('[data-composer-panel]').first();
    const composerBorder = await composer.evaluate(el => getComputedStyle(el).borderTopWidth);
    expect(composerBorder).toBe('0px');

    await page.screenshot({ path: 'test-results/screenshots/feed-without-borders.png' });
  });

  test('2. no corner actions button on desktop, right click still opens the menu', async ({ page }) => {
    await expect(page.locator('button[title="Действия"]')).toHaveCount(0);

    const card = page.locator('[data-flip-id]').first();
    await card.click({ button: 'right' });
    await expect(page.getByText('Удалить', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('3. saving from the editor leaves no ghost draft in the composer', async ({ page }) => {
    const composerTextarea = page.locator('main textarea').first();
    await composerTextarea.fill('Заметка из редактора без призрака');

    await page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first().click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    await page.locator('header button[aria-label="Создать"]').first().click();
    await expect(page.locator('.cm-content')).toHaveCount(0, { timeout: 5000 });

    await page.waitForTimeout(400);
    await expect(composerTextarea).toHaveValue('');
    await expect(page.locator('[data-flip-id]', { hasText: 'Заметка из редактора без призрака' })).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screenshots/editor-save-no-ghost-draft.png' });
  });

  test('4. deleting a card removes it from the feed', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    const card = page.locator('[data-flip-id]').last();
    const cardId = await card.getAttribute('data-flip-id');
    await card.click({ button: 'right' });
    await page.getByText('Удалить', { exact: true }).click();
    await expect(page.locator(`[data-flip-id="${cardId}"]`)).toHaveCount(0, { timeout: 5000 });
  });

  test('5. the jump-to-bottom pill sits above the composer and the anchor lands flush', async ({ page }) => {
    const geometry = () => page.evaluate(() => {
      const list = document.querySelector('[data-testid="feed-list-container"]') as HTMLElement;
      const cards = Array.from(document.querySelectorAll('[data-flip-id]')) as HTMLElement[];
      const composer = (document.querySelector('[data-composer-root]') as HTMLElement).parentElement!;
      const pill = document.querySelector('button[aria-label="Прокрутить к последним заметкам"]') as HTMLElement;
      return {
        dist: Math.round(list.scrollHeight - list.scrollTop - list.clientHeight),
        lastBottom: Math.round(cards[cards.length - 1].getBoundingClientRect().bottom),
        composerTop: Math.round(composer.getBoundingClientRect().top),
        pillBottom: Math.round(pill.getBoundingClientRect().bottom),
      };
    });

    await page.evaluate(() => {
      const list = document.querySelector('[data-testid="feed-list-container"]') as HTMLElement;
      list.scrollTop = list.scrollHeight - list.clientHeight - 300;
    });
    await page.waitForTimeout(300);

    const floating = await geometry();
    expect(floating.pillBottom).toBeLessThanOrEqual(floating.composerTop);
    await page.screenshot({ path: 'test-results/screenshots/feed-scroll-pill-over-composer.png' });

    await page.locator('button[aria-label="Прокрутить к последним заметкам"]').click();
    await page.waitForTimeout(1200);

    const anchored = await geometry();
    expect(anchored.dist).toBe(0);
    // Lands on the composer, not a gap above it and not underneath it.
    expect(anchored.composerTop - anchored.lastBottom).toBeGreaterThanOrEqual(0);
    expect(anchored.composerTop - anchored.lastBottom).toBeLessThanOrEqual(6);
  });

  test('6. the gap between neighbouring notes follows the time between them', async ({ page }) => {
    const cards = await page.evaluate(() => {
      const stored = (window as any).storage.getItems() as { id: string; createdAt: number }[];
      const byId = new Map(stored.map(item => [item.id, item]));
      return Array.from(document.querySelectorAll('[data-flip-id]')).flatMap((el) => {
        const item = byId.get((el as HTMLElement).dataset.flipId || '');
        if (!item) return [];
        return [{
          created: item.createdAt,
          gap: parseFloat(getComputedStyle(el).marginTop) || 0,
        }];
      });
    });

    const spaced = cards.filter((_, index) => index > 0 && cards[index].gap > 0);
    expect(spaced.length).toBeGreaterThan(0);
    for (let i = 1; i < cards.length; i += 1) {
      if (cards[i].gap === 0) continue; // first card of a day: the bubble and the group gap own it
      const expected = Math.abs(cards[i].created - cards[i - 1].created) < 3600_000 ? 6 : 12;
      expect(cards[i].gap).toBe(expected);
    }
    await page.screenshot({ path: 'test-results/screenshots/notes-gap-buckets.png' });
  });
});

test.describe('Mobile: composer island over the feed', () => {
  test('island is a hair wider than the notes and the feed scrolls under it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(400);

    const geometry = await page.evaluate(() => {
      const card = document.querySelector('[data-flip-id]') as HTMLElement;
      const composer = document.querySelector('[data-composer-panel]') as HTMLElement;
      const list = document.querySelector('[data-testid="feed-list-container"]') as HTMLElement;
      const cardBox = card.getBoundingClientRect();
      const composerBox = composer.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        cardLeft: Math.round(cardBox.left),
        cardRight: Math.round(cardBox.right),
        composerLeft: Math.round(composerBox.left),
        composerRight: Math.round(composerBox.right),
        composerTop: Math.round(composerBox.top),
        listBottom: Math.round(listBox.bottom),
      };
    });

    expect(geometry.cardLeft).toBe(16);
    expect(geometry.composerLeft).toBe(12);
    expect(geometry.cardRight).toBe(374);
    expect(geometry.composerRight).toBe(378);
    // The list runs under the island instead of ending above it.
    expect(geometry.listBottom).toBeGreaterThan(geometry.composerTop);
    await page.screenshot({ path: 'test-results/screenshots/mobile-composer-island.png' });
  });
});
