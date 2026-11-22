import { test, expect, type Locator, type Page } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';

const STAT_KEYS = ['notes', 'tasks', 'articles', 'media', 'audio', 'links'] as const;

const folderRow = (page: Page, folderPath: string) =>
  page.locator(`[data-testid="folder-tree-row"][data-folder-path="${folderPath}"]`);

const dockProfile = (page: Page) => page.locator('[data-testid="folder-profile"][data-variant="dock"]');
const modalProfile = (page: Page) => page.locator('[data-testid="folder-profile"][data-variant="modal"]');

async function readStats(scope: Locator): Promise<string[]> {
  const values: string[] = [];
  for (const key of STAT_KEYS) {
    values.push((await scope.getByTestId(`folder-stat-${key}-value`).innerText()).trim());
  }
  return values;
}

async function seedDemo(page: Page) {
  const seedButton = page.locator('button', { hasText: 'Сгенерировать демо-заметки и папки' });
  if (await seedButton.count()) {
    await seedButton.first().click();
    await page.waitForTimeout(1000);
  }
}

async function openProfileModal(page: Page) {
  await page.locator('header button[title*="Информация и медиа папки"]').first().click();
  const profile = modalProfile(page);
  await expect(profile).toBeVisible();
  return profile;
}

test.describe('Folder profile', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
    await seedDemo(page);
  });

  test('dock panel and modal share one set of counters that feed filters do not touch', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await folderRow(page, 'Проекты').click();

    const dock = dockProfile(page);
    await expect(dock.getByText('Проекты', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/folder-profile-dock.png' });
    await dock.screenshot({ path: 'test-results/screenshots/folder-profile-dock-panel.png' });
    const dockValues = await readStats(dock);
    expect(dockValues[0]).not.toBe('0');

    // Switching the feed to tasks only must not move the folder counters.
    await page.locator('header button[aria-label="Вид и фильтры папки"]').first().click();
    const view = page.getByRole('dialog', { name: 'Вид и фильтры' });
    await view.getByRole('button', { name: 'Фильтры' }).click();
    await view.getByRole('button', { name: 'Таски', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(await readStats(dock)).toEqual(dockValues);

    const modal = await openProfileModal(page);
    expect(await readStats(modal)).toEqual(dockValues);
  });

  test('the folder icon and color can be changed from navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const row = folderRow(page, 'Проекты');
    const icon = row.getByRole('button', { name: 'Сменить иконку папки' });
    await icon.click();
    const slider = page.getByRole('slider', { name: 'Цвет иконки' });
    await expect(slider).toHaveAttribute('aria-valuetext', 'Стандартный');
    const track = (await slider.boundingBox())!;
    const y = track.y + track.height / 2;
    await page.mouse.move(track.x + 8, y);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 2, y, { steps: 8 });
    const hue = Number(await slider.inputValue());
    expect(hue).toBeGreaterThan(170);
    expect(hue).toBeLessThan(190);
    await expect(icon).not.toHaveAttribute('data-folder-color', `hue:${hue}`);
    await expect(page.getByRole('button', { name: /^Иконка:/ }).first().locator(':scope > span')).toHaveCSS('color', `oklch(0.72 0.075 ${hue})`);
    await page.mouse.up();
    await expect(icon).toHaveAttribute('data-folder-color', `hue:${hue}`);
    await slider.press('ArrowLeft');
    const color = `hue:${hue - 1}`;
    await expect(slider).toHaveValue(String(hue - 1));
    await expect(icon).toHaveAttribute('data-folder-color', color);
    const choice = page.getByRole('button', { name: 'Иконка: Покупки', exact: true });
    const chosenName = await choice.getAttribute('aria-label');
    await choice.click();
    await expect(icon).toHaveAttribute('data-folder-color', color);
    await expect(page.getByRole('button', { name: chosenName! })).toHaveAttribute('aria-pressed', 'true');
    const spectrum = slider.locator('..').locator('.folder-color-spectrum');
    await expect(spectrum).toHaveCSS('background-image', /linear-gradient/);
    await slider.locator('xpath=../..').screenshot({ path: 'test-results/screenshots/folder-icons-scroll.png', animations: 'disabled' });
    await page.keyboard.press('Escape');
    await icon.click();
    await expect(slider).toHaveValue(String(hue - 1));
    await page.keyboard.press('Escape');
    await row.getByText('Проекты', { exact: true }).click();
    await expect(dockProfile(page).getByRole('button', { name: 'Сменить иконку папки' })).toHaveAttribute('data-folder-color', color);
  });

  test('folder icon picker stays accessible near the bottom edge and after resizing', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 460 });
    const icon = page.getByTestId('folder-tree-row').last().getByRole('button', { name: 'Сменить иконку папки' });
    await icon.click();

    const slider = page.getByRole('slider', { name: 'Цвет иконки' });
    const popover = slider.locator('xpath=../../..');
    await expect(popover).toHaveAttribute('data-motion-state', 'open');
    const bounds = () => popover.evaluate(el => {
      const { top, right, bottom, left } = el.getBoundingClientRect();
      return { top, right: innerWidth - right, bottom: innerHeight - bottom, left };
    });
    await expect.poll(async () => Math.min(...Object.values(await bounds()))).toBeGreaterThanOrEqual(7);
    expect((await popover.boundingBox())!.y).toBeLessThan((await icon.boundingBox())!.y);
    await page.screenshot({ path: 'test-results/screenshots/folder-picker-at-window-edge.png' });

    await page.setViewportSize({ width: 1100, height: 265 });
    await expect.poll(async () => Math.min(...Object.values(await bounds()))).toBeGreaterThanOrEqual(7);
    const lastChoice = popover.getByRole('button', { name: 'Иконка: Безопасность', exact: true });
    await expect(lastChoice).not.toBeInViewport();
    await lastChoice.click();
    await expect(lastChoice).toHaveAttribute('aria-pressed', 'true');
    await expect(slider).toBeInViewport();
  });

  test('inline rename moves the folder and keeps its records', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await folderRow(page, 'Проекты').click();
    const modal = await openProfileModal(page);
    const before = await readStats(modal);
    const foldersBefore = await page.locator('[data-testid="folder-tree-row"]').count();

    await modal.locator('button[title="Переименовать папку"]').click();
    const nameInput = modal.locator('input[aria-label="Название папки"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Проекты Тест');
    await nameInput.press('Enter');

    await expect(folderRow(page, 'Проекты Тест')).toBeVisible();
    await expect(folderRow(page, 'Проекты')).toHaveCount(0);
    expect(await page.locator('[data-testid="folder-tree-row"]').count()).toBe(foldersBefore);
    expect(await readStats(modal)).toEqual(before);
  });

  test('description saves inline and stays with the folder', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const description = 'Тестовое описание: проектные заметки и задачи';

    await folderRow(page, 'Проекты').click();
    let modal = await openProfileModal(page);
    await modal.locator('button[title="Изменить описание для ИИ"]').click();
    const textarea = modal.getByLabel('Описание папки для ИИ');
    await expect(textarea).toBeVisible();
    await textarea.fill(description);
    await textarea.press('Control+Enter');
    await expect(modal.getByText(description, { exact: true })).toBeVisible();

    // No reload here on purpose: folder metadata lives in the vault's `state.json`, and the browser
    // build has no disk to write it to. A reload assertion would be testing the harness, not the app.
    await page.keyboard.press('Escape');
    await folderRow(page, 'Карьера').click();
    modal = await openProfileModal(page);
    await expect(modal.getByText(description, { exact: true })).not.toBeVisible();
    await page.keyboard.press('Escape');
    await folderRow(page, 'Проекты').click();
    modal = await openProfileModal(page);
    await expect(modal.getByText(description, { exact: true })).toBeVisible();
  });

  test('deleting a folder asks first and removes it only after confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await folderRow(page, 'Архив').click();
    const modal = await openProfileModal(page);

    await modal.locator('button[aria-label="Действия с папкой"]').click();
    await page.getByRole('button', { name: 'Удалить папку' }).click();
    await expect(page.getByText('Удалить папку «Архив»?')).toBeVisible();
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(folderRow(page, 'Архив')).toBeVisible();

    await modal.locator('button[aria-label="Действия с папкой"]').click();
    await page.getByRole('button', { name: 'Удалить папку' }).click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(folderRow(page, 'Архив')).toHaveCount(0);
    await expect(modal).toBeHidden();
  });

  test('the actions menu is its own layer: Escape and an outside click leave the profile open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await folderRow(page, 'Проекты').click();
    const modal = await openProfileModal(page);
    const renameItem = page.getByRole('button', { name: 'Переименовать' });

    await modal.locator('button[aria-label="Действия с папкой"]').click();
    await expect(renameItem).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(renameItem).toHaveCount(0);
    await expect(modal).toBeVisible();

    await modal.locator('button[aria-label="Действия с папкой"]').click();
    await expect(renameItem).toBeVisible();
    await page.mouse.click(20, 20);
    await expect(renameItem).toHaveCount(0);
    await expect(modal).toBeVisible();
  });

  test('moving a folder opens a dialog over the profile and keeps the profile in place', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await folderRow(page, 'Проекты').click();
    const modal = await openProfileModal(page);
    await page.waitForTimeout(400);
    const before = await modal.boundingBox();

    const openMove = async () => {
      await modal.locator('button[aria-label="Действия с папкой"]').click();
      await page.getByRole('button', { name: 'Переместить' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Переместить папку' });
      await expect(dialog).toBeVisible();
      return dialog;
    };

    // The action is a dialog of its own, not an inline panel: the menu closes and the
    // profile keeps its geometry underneath.
    const moveDialog = await openMove();
    await expect(page.getByRole('button', { name: 'Переименовать' })).toHaveCount(0);
    await page.waitForTimeout(400);
    const after = await modal.boundingBox();
    expect(after && before).toBeTruthy();
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
    expect(Math.abs(after!.width - before!.width)).toBeLessThan(1);
    expect(Math.abs(after!.height - before!.height)).toBeLessThan(1);
    await page.screenshot({ path: 'test-results/screenshots/folder-profile-move-dialog.png' });

    // LIFO: Escape and a click outside close the dialog, not the profile under it.
    await page.keyboard.press('Escape');
    await expect(moveDialog).not.toBeVisible();
    await expect(modal).toBeVisible();

    await openMove();
    await page.mouse.click(20, 20);
    await expect(moveDialog).not.toBeVisible();
    await expect(modal).toBeVisible();

    await openMove();
    await moveDialog.getByRole('button', { name: 'Новая родительская папка' }).click();
    await page.getByRole('option', { name: 'Личное' }).click();
    await moveDialog.getByRole('button', { name: 'Переместить', exact: true }).click();
    await expect(folderRow(page, 'Личное/Проекты')).toBeVisible();
    await expect(moveDialog).not.toBeVisible();
    await expect(modal).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/folder-profile-move.png' });
  });

  test('inbox profile offers no rename or delete', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const modal = await openProfileModal(page);

    await expect(modal.getByText('Входящие', { exact: true })).toBeVisible();
    await expect(modal.locator('button[title="Переименовать папку"]')).toHaveCount(0);
    await expect(modal.locator('button[aria-label="Действия с папкой"]')).toHaveCount(0);
    expect(await readStats(modal)).toHaveLength(6);
  });

  test('mobile profile shows six counters and renames in place', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label*="Папки"]').first().click();
    await page.getByRole('button', { name: 'Проекты', exact: true }).click();
    await page.locator('button[aria-label="Информация о папке"]').first().click();

    const profile = page.locator('[data-testid="folder-profile"][data-variant="screen"]');
    await expect(profile).toBeVisible();
    for (const key of STAT_KEYS) {
      await expect(profile.getByTestId(`folder-stat-${key}`)).toBeVisible();
    }
    await expect(profile.locator('h1')).toHaveText('Проекты');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/screenshots/folder-profile-mobile.png' });

    await profile.locator('button[title="Переименовать папку"]').click();
    const nameInput = profile.locator('input[aria-label="Название папки"]');
    await nameInput.fill('Проекты Мобайл');
    await nameInput.press('Enter');
    await expect(profile.locator('h1')).toHaveText('Проекты Мобайл');
  });
});
