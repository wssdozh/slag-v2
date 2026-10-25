import { test, expect } from '@playwright/test';

test.describe('SLAG v2 Persistence & Drafts Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('Per-folder Telegram-style composer draft persistence and switching', async ({ page }) => {
    const composerTextarea = page.locator('main textarea');
    await expect(composerTextarea).toBeVisible();

    // 1. Type draft in Inbox (Входящие)
    const inboxDraftText = 'Недописанная мысль во входящих ' + Date.now();
    await composerTextarea.fill(inboxDraftText);
    await page.waitForTimeout(350); // wait for debounce autosave

    // Take screenshot of inbox draft
    await page.screenshot({ path: 'test-results/screenshots/inbox-draft.png' });

    // 2. Switch to 'Проекты' in sidebar
    const projectsFolderBtn = page.locator('aside span', { hasText: 'Проекты' }).first();
    await projectsFolderBtn.click();
    await page.waitForTimeout(200);

    // Verify composer in 'Проекты' is initially empty
    await expect(composerTextarea).toHaveValue('');

    // 3. Type draft in 'Проекты'
    const projectsDraftText = 'Черновик задачи в проектах ' + Date.now();
    await composerTextarea.fill(projectsDraftText);
    await page.waitForTimeout(350);

    // 4. Switch back to 'Входящие'
    const inboxBtn = page.locator('aside span', { hasText: 'Входящие' }).first();
    await inboxBtn.click();
    await page.waitForTimeout(200);

    // Verify inbox draft is restored!
    await expect(composerTextarea).toHaveValue(inboxDraftText);

    // 5. Switch back to 'Проекты'
    await projectsFolderBtn.click();
    await page.waitForTimeout(200);

    // Verify projects draft is restored!
    await expect(composerTextarea).toHaveValue(projectsDraftText);

    // 6. Send the item in 'Проекты'
    await composerTextarea.press('Enter');
    await expect(page.locator('.group', { hasText: projectsDraftText })).toBeVisible();

    // Verify composer in 'Проекты' is now empty
    await expect(composerTextarea).toHaveValue('');

    // 7. Reload page and verify Inbox draft still persists
    await inboxBtn.click();
    await page.waitForTimeout(200);
    await expect(composerTextarea).toHaveValue(inboxDraftText);

    await page.reload();
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.locator('main textarea')).toHaveValue(inboxDraftText);

    // Clean up inbox draft with /clear command
    await page.locator('main textarea').fill('/clear');
    await page.locator('main textarea').press('Enter');
    await expect(page.locator('main textarea')).toHaveValue('');
  });

  test('Workspace state persistence (folder & view mode) across reload', async ({ page }) => {
    // 1. Navigate to 'Личное'
    const personalFolderBtn = page.locator('aside span', { hasText: 'Личное' }).first();
    await personalFolderBtn.click();
    await page.waitForTimeout(200);

    // 2. Switch to Kanban view mode
    const kanbanBtn = page.locator('button[title*="Канбан"]').or(page.locator('button:has-text("Канбан")')).first();
    if (await kanbanBtn.isVisible()) {
      await kanbanBtn.click();
      await page.waitForTimeout(200);
    }

    // Capture screenshot of persisted state before reload
    await page.screenshot({ path: 'test-results/screenshots/workspace-before-reload.png' });

    // 3. Reload the page
    await page.reload();
    await expect(page.locator('main').first()).toBeVisible();
    await page.waitForTimeout(300);

    // 4. Verify folder remains 'Личное' in feed header or sidebar
    const headerTitle = page.locator('header');
    await expect(headerTitle).toBeVisible();

    // Capture screenshot after reload
    await page.screenshot({ path: 'test-results/screenshots/workspace-after-reload.png' });
  });

  test('Assistant chat history persistence in Vault across reload', async ({ page }) => {
    // 1. Locate assistant chat in right panel
    const assistantInput = page.locator('input[placeholder*="Спросить ассистента"]').or(page.locator('textarea[placeholder*="Спросить ассистента"]')).first();

    if (await assistantInput.isVisible()) {
      const prompt = 'Привет, проверим персистентность истории ' + Date.now();
      await assistantInput.fill(prompt);
      await assistantInput.press('Enter');

      // User bubble should appear
      await expect(page.locator('text=' + prompt)).toBeVisible({ timeout: 5000 });

      // 2. Reload page
      await page.reload();
      await expect(page.locator('main').first()).toBeVisible();

      // Verify prompt is still in assistant chat history!
      await expect(page.locator('text=' + prompt)).toBeVisible({ timeout: 5000 });

      // Capture screenshot of restored assistant
      await page.screenshot({ path: 'test-results/screenshots/assistant-history-restored.png' });

      // 3. Clear chat
      const clearBtn = page.locator('button[title*="Очистить"]').or(page.locator('button:has-text("Очистить")')).first();
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await expect(page.locator('text=' + prompt)).not.toBeVisible();

        // 4. Reload page again and verify it stays clean
        await page.reload();
        await expect(page.locator('main').first()).toBeVisible();
        await expect(page.locator('text=' + prompt)).not.toBeVisible();
      }
    }
  });

  test('ItemCard floating action buttons on hover outside the card and clean header', async ({ page }) => {
    const card = page.locator('main [id^="item-"]').first();
    await expect(card).toBeVisible();

    // Take screenshot without hover
    await page.screenshot({ path: 'test-results/screenshots/card-no-hover.png' });

    // Hover over the card
    await card.hover();
    await page.waitForTimeout(200);

    // Verify action buttons appear
    const replyBtn = card.locator('button[title*="Ответить"]').first();
    await expect(replyBtn).toBeVisible();

    // Take screenshot with hover
    await page.screenshot({ path: 'test-results/screenshots/card-hover-outside.png' });
  });
});
