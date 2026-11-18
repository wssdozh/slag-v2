import { test, expect, type Page } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

const row = (page: Page, path: string) => page.locator(`[data-testid="folder-tree-row"][data-folder-path="${path}"]`);
const rootPaths = async (page: Page): Promise<string[]> => {
  const paths = await page.locator('[data-testid="folder-tree-row"]').evaluateAll((rows) =>
    rows.map((element) => element.getAttribute('data-folder-path') || '')
  );
  return paths.filter((path) => path && !path.includes('/'));
};

type Band = 'into' | 'before' | 'after';

/** A native HTML5 drag, dispatched by hand: the bands of the row are what decide the drop. */
async function dragRow(page: Page, from: string, to: string, band: Band) {
  await page.evaluate(
    ({ from, to, band }) => {
      const source = document.querySelector<HTMLElement>(`[data-testid="folder-tree-row"][data-folder-path="${from}"]`);
      const target = document.querySelector<HTMLElement>(`[data-testid="folder-tree-row"][data-folder-path="${to}"]`);
      if (!source || !target) throw new Error(`no row ${from} -> ${to}`);
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));
      const rect = target.getBoundingClientRect();
      const clientY = band === 'before' ? rect.top + 2 : band === 'after' ? rect.bottom - 2 : rect.top + rect.height / 2;
      const init = { dataTransfer, bubbles: true, cancelable: true, clientX: rect.left + 60, clientY };
      target.dispatchEvent(new DragEvent('dragover', init));
      target.dispatchEvent(new DragEvent('drop', init));
      source.dispatchEvent(new DragEvent('dragend', init));
    },
    { from, to, band }
  );
}

/** Dropping on the free area of the tree means "back to the root". */
async function dragToRoot(page: Page, from: string) {
  await page.evaluate((from) => {
    const source = document.querySelector<HTMLElement>(`[data-testid="folder-tree-row"][data-folder-path="${from}"]`);
    const tree = document.querySelector<HTMLElement>('[data-testid="folder-tree"]');
    if (!source || !tree) throw new Error(`no row for ${from}`);
    // The drop lands where a pointer would: on whatever is under the free space of the tree.
    const rect = tree.getBoundingClientRect();
    const x = rect.left + 20;
    const y = Math.max(rect.top + 40, rect.bottom - 6);
    const target = document.elementFromPoint(x, y);
    if (!target || !tree.contains(target)) throw new Error('the free area of the tree is not under the pointer');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));
    const init = { dataTransfer, bubbles: true, cancelable: true, clientX: x, clientY: y };
    target.dispatchEvent(new DragEvent('dragover', init));
    target.dispatchEvent(new DragEvent('drop', init));
    source.dispatchEvent(new DragEvent('dragend', init));
  }, from);
}

async function storedFolders(page: Page): Promise<Array<{ path: string; order?: number }>> {
  return page.evaluate(() => {
    const store = (window as unknown as { storage: { getFolders: () => Array<{ path: string; order?: number }> } }).storage;
    return store.getFolders().map((folder) => ({ path: folder.path, order: folder.order }));
  });
}

test.describe('Folder tree drag and drop', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
    await expect(row(page, 'Проекты')).toBeVisible();
  });

  test('a folder dropped in the middle of another becomes its child', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await dragRow(page, 'Архив', 'Личное', 'into');

    await expect(row(page, 'Личное/Архив')).toBeVisible();
    await expect(row(page, 'Личное')).toHaveCount(1);
    const folders = await storedFolders(page);
    expect(folders.map((folder) => folder.path)).toContain('Личное/Архив');
    expect(folders.find((folder) => folder.path === 'Архив')).toBeUndefined();

    await page.locator('aside').filter({ has: page.locator('[data-testid="folder-tree"]') }).last().screenshot({ path: 'test-results/screenshots/folder-dnd-into.png' });
  });

  test('a folder dropped between two rows takes their place in the order', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => (await rootPaths(page)).join(',')).toBe('Карьера,Проекты,Личное,База знаний,Архив');

    await dragRow(page, 'Архив', 'Карьера', 'before');
    await expect.poll(async () => (await rootPaths(page)).join(',')).toBe('Архив,Карьера,Проекты,Личное,База знаний');

    await dragRow(page, 'Карьера', 'Проекты', 'after');
    await expect.poll(async () => (await rootPaths(page)).join(',')).toBe('Архив,Проекты,Карьера,Личное,База знаний');

    const orders = (await storedFolders(page))
      .filter((folder) => folder.order !== undefined)
      .map((folder) => folder.order)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(orders.length).toBeGreaterThan(0);
    orders.forEach((order, index) => expect(order).toBe(index));
  });

  test('a folder cannot be dropped into itself or its own child', async ({ page }) => {
    await dragRow(page, 'Архив', 'Личное', 'into');
    await expect(row(page, 'Личное/Архив')).toBeVisible();

    await dragRow(page, 'Личное/Архив', 'Личное/Архив', 'into');
    await expect(row(page, 'Личное/Архив/Архив')).toHaveCount(0);
    await expect(row(page, 'Личное/Архив')).toBeVisible();

    await dragRow(page, 'Личное', 'Личное/Архив', 'into');
    await expect(row(page, 'Личное/Архив/Личное')).toHaveCount(0);
    await expect(row(page, 'Личное')).toBeVisible();
    expect((await storedFolders(page)).map((folder) => folder.path)).toContain('Личное/Архив');
  });

  test('dropping on the free area of the tree brings a nested folder back to the root', async ({ page }) => {
    await dragRow(page, 'Архив', 'Личное', 'into');
    await expect(row(page, 'Личное/Архив')).toBeVisible();

    await dragToRoot(page, 'Личное/Архив');
    await expect(page.locator('[data-testid="folder-tree-row"][data-folder-path="Архив"]')).toBeVisible();
    expect((await storedFolders(page)).map((folder) => folder.path)).toContain('Архив');
  });

  test('the row shows where the drop will land before it happens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const target = row(page, 'Проекты');
    const rect = (await target.boundingBox()) ?? { x: 0, y: 0, width: 10, height: 20 };
    const source = row(page, 'Архив');

    await page.evaluate(
      ({ x, y }) => {
        const sourceRow = document.querySelector<HTMLElement>('[data-testid="folder-tree-row"][data-folder-path="Архив"]');
        const targetRow = document.querySelector<HTMLElement>('[data-testid="folder-tree-row"][data-folder-path="Проекты"]');
        if (!sourceRow || !targetRow) throw new Error('no rows');
        const dataTransfer = new DataTransfer();
        sourceRow.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }));
        targetRow.dispatchEvent(
          new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true, clientX: x, clientY: y })
        );
      },
      { x: rect.x + 60, y: rect.y + 4 }
    );

    await expect(target).toHaveAttribute('data-drop-hint', 'before');
    await page.locator('aside').filter({ has: page.locator('[data-testid="folder-tree"]') }).last().screenshot({ path: 'test-results/screenshots/folder-dnd-hint.png' });

    // The drag only ends when the pointer leaves; a fresh page also keeps the next spec clean.
    await source.dispatchEvent('dragend');
  });
});

test.describe('Folder tree in the @ menu', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
    await expect(row(page, 'Проекты')).toBeVisible();
  });

  test('nested folders read as branches with their lines', async ({ page }) => {
    await dragRow(page, 'Архив', 'Личное', 'into');
    await expect(row(page, 'Личное/Архив')).toBeVisible();

    const textarea = page.locator('main textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();
    await textarea.pressSequentially('Заметка @');

    const nested = page.locator('[data-folder-item="Личное/Архив"]');
    await expect(nested).toBeVisible();
    await expect(nested).toHaveAttribute('data-depth', '1');
    await expect(nested).toHaveAttribute('data-branch', 'last');
    await expect(nested).toContainText('Архив');
    // The menu fades in; a screenshot taken mid-transition shows the feed through it.
    await expect(nested).toHaveAttribute('data-selected', /true|false/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/screenshots/folder-menu-tree.png' });

    await nested.click();
    await expect(textarea).toHaveValue('Заметка @Архив ');
  });
});
