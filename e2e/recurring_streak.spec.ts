import { test, expect } from '@playwright/test';

test.describe('Recurring Tasks & Streak Engine E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. Recurring task creation, initial 🔥 0 badge, completion to 🔥 1 and revert', async ({ page }) => {
    // Switch to Task type in composer
    const typeDropdownButton = page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first();
    await typeDropdownButton.click();
    await page.locator('button', { hasText: 'Таска' }).click();

    const composerTextarea = page.locator('main textarea');
    const taskTitle = 'Утренняя пробежка ' + Date.now();
    await composerTextarea.fill(`${taskTitle} каждый день`);

    // Submit task
    await page.locator('button[title*="Отправить"]').click();

    // Verify task card appeared in feed
    const taskCard = page.locator('.group', { hasText: taskTitle });
    await expect(taskCard).toBeVisible({ timeout: 10000 });

    // Verify flame streak badge is visible and starts at 0 with rose accent
    const streakBadge = taskCard.locator('span[title*="Серия"]');
    await expect(streakBadge).toBeVisible();
    await expect(streakBadge).toContainText('🔥');
    await expect(streakBadge).toContainText('0');

    // Screenshot of initial 🔥 0 state
    await taskCard.screenshot({
      path: 'test-results/screenshots/recurring-task-initial-streak-0.png',
    });

    // Toggle completion directly in feed
    const checkbox = taskCard.locator('button[aria-label="Изменить статус задачи"]');
    await checkbox.click();

    // Verify completion toast
    await expect(page.locator('text=/Задача выполнена/')).toBeVisible();

    // Verify card remains in feed as completed (no instant respawn)
    await expect(taskCard).toBeVisible();
    await expect(taskCard.locator('h3')).toHaveClass(/line-through/);

    // Verify streak increased to 1
    await expect(streakBadge).toContainText('1');

    // Screenshot of completed 🔥 1 state
    await taskCard.screenshot({
      path: 'test-results/screenshots/recurring-task-completed-streak-1.png',
    });

    // Revert completion on the same day
    await checkbox.click();
    await expect(page.locator('text=Задача возобновлена')).toBeVisible();
    await expect(taskCard.locator('h3')).not.toHaveClass(/line-through/);
    await expect(streakBadge).toContainText('0');
  });

  test('2. Rapid atypical toggle actions stay resilient and never produce negative streaks', async ({ page }) => {
    const typeDropdownButton = page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first();
    await typeDropdownButton.click();
    await page.locator('button', { hasText: 'Таска' }).click();

    const composerTextarea = page.locator('main textarea');
    const taskTitle = 'Стресс-тест кликов ' + Date.now();
    await composerTextarea.fill(`${taskTitle} каждый день`);
    await page.locator('button[title*="Отправить"]').click();

    const taskCard = page.locator('.group', { hasText: taskTitle });
    await expect(taskCard).toBeVisible();
    const checkbox = taskCard.locator('button[aria-label="Изменить статус задачи"]');
    const streakBadge = taskCard.locator('span[title*="Серия"]');

    // Rapid toggle sequence 4 times
    await checkbox.click();
    await checkbox.click();
    await checkbox.click();
    await checkbox.click();

    // After an even number of clicks from todo: should settle in todo with streak 0 (not negative)
    await expect(taskCard.locator('h3')).not.toHaveClass(/line-through/);
    await expect(streakBadge).toContainText('0');
  });

  test('3. Overnight rollover simulation: completed task respawns with streak intact, overdue task resets to 🔥 0', async ({ page }) => {
    // Inject two test tasks into current vault via localStorage
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const testItemDoneId = 'recur_done_' + Date.now();
    const testItemOverdueId = 'recur_overdue_' + Date.now();

    await page.evaluate(({ doneId, overdueId, yDate }) => {
      const vaultKey = 'slag_current_vault';
      const vaultRaw = localStorage.getItem(vaultKey);
      const vault = vaultRaw ? JSON.parse(vaultRaw) : { id: 'default_vault' };
      const itemsKey = `slag_items_${vault.id}`;

      const raw = localStorage.getItem(itemsKey);
      const items = raw ? JSON.parse(raw) : [];

      // 1. Task completed yesterday (streak: 3)
      items.unshift({
        id: doneId,
        type: 'task',
        title: 'Вчерашняя выполненная рутина',
        content: '',
        folder: 'Входящие',
        tags: [],
        attachments: [],
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
        status: 'done',
        dueDate: yDate,
        lastCompletedDate: yDate,
        streak: 3,
        history: [yDate],
        recurrence: { freq: 'daily', interval: 1, resetSubtasks: true },
      });

      // 2. Task uncompleted yesterday (streak was 5)
      items.unshift({
        id: overdueId,
        type: 'task',
        title: 'Вчерашняя пропущенная рутина',
        content: '',
        folder: 'Входящие',
        tags: [],
        attachments: [],
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
        status: 'todo',
        dueDate: yDate,
        streak: 5,
        recurrence: { freq: 'daily', interval: 1, resetSubtasks: true },
      });

      localStorage.setItem(itemsKey, JSON.stringify(items));
    }, { doneId: testItemDoneId, overdueId: testItemOverdueId, yDate: yStr });

    // Reload page to simulate morning app launch
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible();

    // 1. Verify previously completed task respawned for today as 'todo', keeping streak 3
    const respawnedCard = page.locator('.group', { hasText: 'Вчерашняя выполненная рутина' });
    await expect(respawnedCard).toBeVisible();
    await respawnedCard.scrollIntoViewIfNeeded();
    await expect(respawnedCard.locator('h3')).not.toHaveClass(/line-through/);
    const respawnedBadge = respawnedCard.locator('span[title*="Серия"]');
    await expect(respawnedBadge).toContainText('3');

    // 2. Verify previously missed task rolled over to today as 'todo', resetting streak to 0
    const missedCard = page.locator('.group', { hasText: 'Вчерашняя пропущенная рутина' });
    await expect(missedCard).toBeVisible();
    await missedCard.scrollIntoViewIfNeeded();
    await expect(missedCard.locator('h3')).not.toHaveClass(/line-through/);
    const missedBadge = missedCard.locator('span[title*="Серия"]');
    await expect(missedBadge).toContainText('0');

    // Screenshot of rollover tasks in feed
    await missedCard.screenshot({
      path: 'test-results/screenshots/recurring-overnight-rollover.png',
    });
  });
});
