import { expect, test, type Page } from '@playwright/test';
import type { SlagItem } from '../src/types';

const old = Date.parse('2026-11-01T12:00:00+03:00');
const now = '2026-11-22T23:59:50+03:00';
const note = (id: string, title: string, createdAt = old): SlagItem => ({
  id, title, createdAt, updatedAt: createdAt, type: 'note', content: '', folder: 'Входящие', tags: [], attachments: [],
});
const task = (id: string, title: string, dueDate: string): SlagItem => ({ ...note(id, title), type: 'task', status: 'todo', dueDate });
const repeat: SlagItem = {
  ...task('routine', 'Разобрать входящие', '2026-11-22'), status: 'done',
  recurrence: { freq: 'daily', resetSubtasks: true }, history: ['2026-11-22'], lastCompletedDate: '2026-11-22', streak: 3,
};
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function seed(page: Page, items: SlagItem[], time = now) {
  await page.clock.install({ time: new Date(time) });
  await page.clock.pauseAt(new Date(new Date(time).getTime() + 100));
  await page.addInitScript((items) => {
    if (!localStorage.getItem('slag_items_default_vault')) {
      localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
    }
  }, items);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.clock.resume();
}

async function snapshot(page: Page) {
  return page.evaluate((): SlagItem[] => JSON.parse(localStorage.getItem('slag_items_default_vault') ?? '[]'));
}

test.use({ timezoneId: 'Europe/Moscow', reducedMotion: 'reduce' });

test('on midnight: old one-offs, same recurrence ID and unchanged history', async ({ page }) => {
  const report = task('report', 'Отправить отчёт', '2026-11-22');
  await seed(page, [repeat, report, task('bank', 'Позвонить в банк', '2026-11-23'), task('invalid', 'Неверный срок', '2026-02-30'),
    ...Array.from({ length: 22 }, (_, i) => note(`n${i}`, `Заметка ${i}`, old + (i + 1) * 600_000))]);
  await expect(section(page, 'Сегодня').locator('#item-report')).toBeVisible();
  await expect(section(page, 'Сегодня').locator('#item-bank')).toHaveCount(0);
  await expect(section(page, 'Просрочено')).toHaveCount(0);
  await page.clock.fastForward(12_000);
  await expect(section(page, 'Сегодня').locator('#item-routine')).toBeVisible();
  await expect(section(page, 'Сегодня').locator('#item-bank')).toBeVisible();
  await expect(section(page, 'Просрочено').locator('#item-report')).toBeVisible();
  await expect(section(page, 'Просрочено').locator('#item-invalid')).toHaveCount(0);
  await expect(page.locator('#item-report')).toHaveCount(1);
  const items = await snapshot(page);
  expect(items.find(i => i.id === 'routine')).toMatchObject({ id: 'routine', createdAt: old, history: ['2026-11-22'], lastCompletedDate: '2026-11-22', dueDate: '2026-11-23', status: 'todo' });
  expect(items.find(i => i.id === 'report')).toMatchObject(report);
  expect(items.find(i => i.id === 'n0')).toMatchObject({ updatedAt: old + 600_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } })));
  await page.clock.runFor(100);
  expect(await snapshot(page)).toEqual(items);
  await page.screenshot({ path: 'test-results/screenshots/task-feed-desktop.png' });
});

test('wake after multiple days and coalesce an incoming recurrence', async ({ page }) => {
  await seed(page, [task('report', 'Отправить отчёт', '2026-11-22')]);
  await expect(section(page, 'Сегодня').locator('#item-report')).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-11-25T08:00:00+03:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(section(page, 'Просрочено').locator('#item-report')).toBeVisible();
  await page.evaluate(async (item) => {
    const storagePath = '/src/lib/storage/index.ts';
    const { storage } = await import(/* @vite-ignore */ storagePath);
    storage.saveItems([item], 'remote');
    window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } }));
    window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } }));
  }, repeat);
  await expect(section(page, 'Сегодня').locator('#item-routine')).toBeVisible();
  expect((await snapshot(page)).find(i => i.id === 'routine')).toMatchObject({ status: 'todo', dueDate: '2026-11-25', streak: 0, history: ['2026-11-22'] });
});

test('keeps each active group bounded and expands it on request', async ({ page }) => {
  await seed(page, Array.from({ length: 21 }, (_, i) => task(`overdue-${i}`, `Просрочка ${i}`, '2026-11-20')), '2026-11-23T08:00:00+03:00');
  const overdue = section(page, 'Просрочено');
  await expect(overdue.locator('[data-flip-id]')).toHaveCount(15);
  await expect(section(page, 'Сегодня')).toHaveCount(0);
  await overdue.getByRole('button', { name: 'Показать ещё' }).click();
  await expect(overdue.locator('[data-flip-id]')).toHaveCount(21);
});

test('a link to an unmounted overdue card finds it in the active group', async ({ page }) => {
  await seed(page, [
    ...Array.from({ length: 21 }, (_, i) => task(`late-${i}`, `Просрочка ${i}`, '2026-11-20')),
    { ...note('jump', 'Ссылка на задачу', old + 1000), content: '[[Просрочка 20]]' },
  ], '2026-11-23T08:00:00+03:00');
  const target = section(page, 'Просрочено').locator('#item-late-20');
  await expect(target).toHaveCount(0);
  await page.locator('#item-jump').getByText('Просрочка 20', { exact: true }).click();
  await expect(target).toBeInViewport();
  await expect(page.locator('#item-late-20')).toHaveCount(1);
});

test('Telegram planner uses the same local overdue day without contacting the relay', async ({ page }) => {
  await seed(page, [], '2026-11-23T00:01:00+03:00');
  const delivered = await page.evaluate(async (items) => {
    const planPath = '/src/lib/notify/plan.ts';
    const accountPath = '/src/lib/sync/account.ts';
    const prefsPath = '/src/lib/notify/prefs.ts';
    const { reconcileNotifications } = await import(/* @vite-ignore */ planPath);
    const { accountClient } = await import(/* @vite-ignore */ accountPath);
    const { DEFAULT_NOTIFY_PREFS } = await import(/* @vite-ignore */ prefsPath);
    const calls: Array<{ itemKey: string; kind: string; fireAt: number }> = [];
    const originalAuth = accountClient.isAuthenticated;
    const originalArm = accountClient.armNotifications;
    accountClient.isAuthenticated = () => true;
    accountClient.armNotifications = async (delivery: typeof calls[number]) => {
      calls.push(delivery);
      return { armed: 1, dropped: [] };
    };
    try {
      await reconcileNotifications(items, 'test-vault', [{ token: 'test-channel', state: 'active' }], DEFAULT_NOTIFY_PREFS);
    } finally {
      accountClient.isAuthenticated = originalAuth;
      accountClient.armNotifications = originalArm;
    }
    return calls.map(({ itemKey, kind, fireAt }) => ({ itemKey, kind, fireAt }));
  }, [task('report', 'Отчёт', '2026-11-22'), task('today', 'Сегодня', '2026-11-23'), task('invalid', 'Неверный срок', '2026-02-30')]);
  expect(delivered).toEqual([{ itemKey: 'report', kind: 'overdue', fireAt: Date.parse('2026-11-23T10:00:00+03:00') / 1000 }]);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('shows the same two groups in the feed', async ({ page }) => {
    await seed(page, [repeat, task('report', 'Отправить отчёт', '2026-11-20'), note('plan', 'План на день', Date.parse('2026-11-23T07:00:00+03:00'))], '2026-11-23T08:00:00+03:00');
    if (!(await page.getByTestId('feed-list-container').isVisible())) {
      await page.locator('button', { hasText: 'Входящие' }).first().click();
    }
    await expect(section(page, 'Сегодня').locator('#item-routine')).toBeVisible();
    await expect(section(page, 'Просрочено').locator('#item-report')).toBeVisible();
    await expect(page.getByTestId('feed-list-container').getByText('Сегодня', { exact: true })).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screenshots/task-feed-mobile.png' });
  });
});
