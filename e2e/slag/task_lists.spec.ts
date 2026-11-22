import { expect, test, type Page } from '@playwright/test';
import { matchesTaskQuickFilter, type TaskQuickFilterId } from '../../src/lib/tasks/taskQuickFilter';
import type { SlagItem } from '../../src/types';
import { switchToView } from '../support/slagSetup';

const now = new Date('2026-11-22T12:00:00+03:00');
const make = (id: string, title: string, patch: Partial<SlagItem> = {}): SlagItem => ({
  id, title, content: '', folder: 'Проекты', type: 'task', status: 'todo',
  tags: [], attachments: [], createdAt: +now, updatedAt: +now, ...patch,
});
const fixtures = [
  make('late', 'Согласовать сценарий', { dueDate: '2026-11-20' }),
  make('today', 'Проверить задачи на неделю', { folder: 'Проекты/Видео', dueDate: '2026-11-22' }),
  make('tomorrow', 'Обновить план проекта', { dueDate: '2026-11-23', recurrence: { freq: 'daily' } }),
  make('backlog', 'Собрать идеи', { status: 'backlog', reminder: '2026-11-22T14:00:00+03:00' }),
  make('done', 'Разобрать черновики', { status: 'done' }),
  make('note', 'Заметка с датой', { type: 'note', dueDate: '2026-11-22' }),
  make('other', 'Задача другой папки', { folder: 'Карьера', dueDate: '2026-11-22' }),
];

test.use({ timezoneId: 'Europe/Moscow', viewport: { width: 1440, height: 900 } });

test('classifies by saved deadline and task status', () => {
  const expected: Record<TaskQuickFilterId, string[]> = {
    today: ['late', 'today', 'other'], upcoming: ['tomorrow'], undated: ['backlog'], completed: ['done'],
  };
  for (const id of Object.keys(expected) as TaskQuickFilterId[]) {
    expect(fixtures.filter(item => matchesTaskQuickFilter(item, { id, today: '2026-11-22' })).map(item => item.id)).toEqual(expected[id]);
  }
});

async function openProjects(page: Page, extras = 0) {
  await page.addInitScript(({ items, extras }) => {
    if (localStorage.getItem('slag_items_default_vault')) return;
    localStorage.setItem('slag_items_default_vault', JSON.stringify([...items, ...Array.from({ length: extras }, (_, i) => ({
      id: `extra-${i}`, type: 'note', title: `Material ${i}`, content: '', folder: 'Проекты', tags: [],
      createdAt: items[0].createdAt, updatedAt: items[0].updatedAt + i,
    }))]));
  }, { items: fixtures, extras });
  await page.goto('/', { waitUntil: 'commit' });
  const filters = page.getByTestId('task-quick-filters');
  await expect(filters).toBeVisible({ timeout: 240000 });
  await page.locator('aside').getByText('Проекты', { exact: true }).click();
  return filters;
}

test('filters the current feed in one click without replacing it', async ({ page }) => {
  await page.clock.setFixedTime(now);
  const filters = await openProjects(page);
  const feed = page.getByTestId('feed-list-container');
  const cards = feed.locator('[data-flip-id]');
  const originalFeed = await feed.elementHandle();
  const cases = [
    ['Сегодня', ['Согласовать сценарий', 'Проверить задачи на неделю']],
    ['Предстоящие', ['Обновить план проекта']],
    ['Без даты', ['Собрать идеи']],
    ['Выполненные', ['Разобрать черновики']],
  ] as const;
  for (const [label, titles] of cases) {
    const button = filters.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(titles.length);
    for (const title of titles) await expect(feed.getByText(title, { exact: true })).toBeVisible();
    if (label === 'Сегодня') await page.screenshot({ path: 'test-results/screenshots/task-quick-filter-feed.png' });
  }
  const completed = filters.getByRole('button', { name: 'Выполненные' });
  await completed.click();
  await expect(completed).toHaveAttribute('aria-pressed', 'false');
  await expect(feed.getByText('Заметка с датой', { exact: true })).toBeVisible();
  expect(await originalFeed?.evaluate(el => el.isConnected)).toBe(true);
  await expect(page.getByTestId('composer-dock')).toBeVisible();
  await completed.click();
  await page.locator('aside').getByText('Карьера', { exact: true }).click();
  await expect(completed).toHaveAttribute('aria-pressed', 'false');
  await expect(feed.getByText('Задача другой папки', { exact: true })).toBeVisible();
});

test('filters active Kanban and Calendar tabs, not the previous tab', async ({ page }) => {
  await page.clock.setFixedTime(now);
  const filters = await openProjects(page);
  const center = page.locator('.dv-groupview').filter({ has: page.getByTestId('feed-list-container') });
  const add = center.getByTitle('Добавить вкладку в эту группу');
  await add.click();
  await page.getByRole('button', { name: 'Канбан', exact: true }).click();
  const board = page.getByTestId('kanban-columns-container');
  const today = filters.getByRole('button', { name: 'Сегодня', exact: true });
  await today.click();
  await expect(board.getByText('Согласовать сценарий', { exact: true })).toBeVisible();
  await expect(board.getByText('Обновить план проекта', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/task-quick-filter-kanban.png' });
  await page.locator('.dv-tab').filter({ hasText: /^Инфо$/ }).click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await filters.getByRole('button', { name: 'Предстоящие' }).click();
  await expect(board.getByText('Обновить план проекта', { exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'Без даты' }).click();
  await expect(board.getByText('Собрать идеи', { exact: true })).toBeVisible();
  const completed = filters.getByRole('button', { name: 'Выполненные' });
  await completed.click();
  await expect(board.getByText('Разобрать черновики', { exact: true })).toBeInViewport();
  await page.locator('.dv-tab').filter({ hasText: /^Проекты$/ }).click();
  await expect(completed).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('feed-list-container').getByText('Обновить план проекта', { exact: true })).toBeVisible();

  await today.click();
  await switchToView(page, 'calendar');
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  const week = page.getByTestId('calendar-week-scroll-container');
  await expect(week.getByText('Проверить задачи на неделю', { exact: true })).toBeVisible();
  await expect(week.getByText('Согласовать сценарий', { exact: true })).toHaveCount(0);
  const drawer = page.getByTestId('calendar-drawer-task');
  await expect(drawer.getByText('Согласовать сценарий', { exact: true })).toBeInViewport();
  await expect(week.getByText('Проверить задачи на неделю', { exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/screenshots/task-quick-filter-calendar.png' });
  await filters.getByRole('button', { name: 'Без даты' }).click();
  await expect(drawer.getByText('Собрать идеи', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Завтра' }).click();
  await expect(drawer.getByText('Собрать идеи', { exact: true })).toHaveCount(0);
  await filters.getByRole('button', { name: 'Предстоящие' }).click();
  await expect(week.getByText('Собрать идеи', { exact: true })).toBeVisible();
  await expect(week.getByText('Обновить план проекта', { exact: true })).toHaveCount(7);
  await page.getByRole('button', { name: 'Месяц', exact: true }).click();
  await filters.getByRole('button', { name: 'Выполненные' }).click();
  await expect(week).toHaveCount(0);
  const done = drawer.getByRole('checkbox', { name: 'Выполнена: Разобрать черновики' });
  await expect(done).toBeChecked();
  await done.click();
  await expect(done).toHaveCount(0);
});

test('an active feed filter refreshes across midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-22T23:59:00+03:00') });
  const filters = await openProjects(page);
  await filters.getByRole('button', { name: 'Сегодня', exact: true }).click();
  const feed = page.getByTestId('feed-list-container');
  await expect(feed.getByText('Обновить план проекта', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(61_000);
  await expect(feed.getByText('Обновить план проекта', { exact: true })).toBeVisible();
});

test('measures filter updates in a folder with 5000 other records', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(now);
  const filters = await openProjects(page, 5000);
  const today = filters.getByRole('button', { name: 'Сегодня', exact: true });
  const feed = page.getByTestId('feed-list-container');
  const timings = [];
  for (let i = 0; i < 5; i++) {
    // Measure the browser's input-to-DOM interval, excluding Playwright transport.
    const measured = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="task-quick-filters"] button');
      const list = document.querySelector<HTMLElement>('[data-testid="feed-list-container"]');
      if (!button || !list) throw new Error('Filter controls were not mounted');
      return new Promise<number>((resolve, reject) => {
        const start = performance.now();
        const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error('Filter did not commit')); }, 5000);
        const observer = new MutationObserver(() => {
          if (list.querySelectorAll('[data-flip-id]').length !== 2) return;
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve(performance.now() - start);
        });
        observer.observe(list, { childList: true, subtree: true });
        button.click();
      });
    });
    timings.push(measured);
    await today.click();
    await expect(feed.locator('[data-flip-id]')).not.toHaveCount(2);
  }
  timings.sort((a, b) => a - b);
  testInfo.annotations.push({ type: 'filter-median-ms', description: timings[2].toFixed(1) });
  console.log(`Quick filter median out of 5 runs: ${timings[2].toFixed(1)} ms`);
});
