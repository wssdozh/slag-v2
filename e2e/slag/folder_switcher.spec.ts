import { test, expect } from '@playwright/test';
import { folderPickerList, mobileFolderTrigger, chooseMobileFolder, openMobileFolderProfile } from '../support/mobileFolders';
import { switchToView } from '../support/slagSetup';

const inbox = 'Входящие';
const fixtureFolders = [inbox, 'Проекты', 'Проекты/Идеи', 'Личное', 'Личное/Идеи'].map(path => ({
  path, name: path.split('/').at(-1), description: '',
}));
const now = Date.now();
const fixtureNotes = [inbox, 'Проекты/Идеи'].map((folder, i) => ({
  id: `picker-${i}`, type: 'note', title: '', content: ['Заметка во Входящих', 'Черновик сценария'][i],
  folder, tags: [], attachments: [], createdAt: now + i, updatedAt: now + i,
}));

test.describe('Phone folder switcher', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ folders, notes }) => {
      localStorage.setItem('slag_registry_folders_default_vault', JSON.stringify(folders));
      localStorage.setItem('slag_items_default_vault', JSON.stringify(notes));
      localStorage.setItem('slag_drafts_default_vault', JSON.stringify({
        Входящие: { content: '', itemType: 'note', priority: 'none', attachments: [], tags: [],
          replyTarget: notes[0], updatedAt: Date.now() },
        'Проекты/Идеи': { content: 'Черновик проекта', itemType: 'note', priority: 'none', attachments: [], tags: [], updatedAt: Date.now() },
      }));
      localStorage.setItem('slag_workspace_state_default_vault', JSON.stringify({
        currentFolder: 'Личное', activeMobileTab: 'settings', feedViewMode: 'kanban',
      }));
    }, { folders: fixtureFolders, notes: fixtureNotes });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(mobileFolderTrigger(page)).toHaveAccessibleName(`Переключить папку: ${inbox}`, { timeout: 120_000 });
  });

  for (const engine of ['textarea', 'markdown'] as const) {
    test(`${engine}: one tap focuses search and cancellation keeps draft and feed`, async ({ page }) => {
      if (engine === 'markdown') {
        await page.addInitScript(() => localStorage.setItem('slag:composer-engine', 'markdown'));
        await page.reload({ waitUntil: 'commit' });
      }
      const trigger = mobileFolderTrigger(page);
      const dock = page.getByTestId('composer-dock');
      const field = engine === 'markdown' ? dock.locator('.cm-content') : dock.locator('textarea');
      const feed = page.getByTestId('feed-list-container');
      const tabs = page.getByRole('navigation', { name: 'Мобильная навигация' });
      await expect(tabs).toHaveCount(0);
      await expect(page.getByTestId('mobile-sync-btn')).toHaveCount(0);
      await expect(field).toBeVisible();
      await expect(dock.getByRole('button', { name: 'Отменить ответ' })).toBeVisible();
      if (engine === 'textarea') {
        await page.screenshot({ path: 'test-results/screenshots/mobile-inbox-no-dock.png' });
      }
      await field.fill('Черновик не из поиска');
      const attachment = dock.getByText('план.txt', { exact: true });
      if (engine === 'markdown') {
        await field.evaluate(node => {
          const clipboardData = new DataTransfer();
          clipboardData.items.add(new File(['план'], 'план.txt', { type: 'text/plain' }));
          node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        });
        await expect(attachment).toBeVisible();
      }
      const originalFeed = await feed.elementHandle();
      const feedBefore = (await feed.boundingBox())!;
      const originalField = await field.elementHandle();
      await trigger.tap();
      const search = page.getByRole('combobox', { name: 'Найти папку' });
      await expect(search).toBeFocused();
      expect(await feed.boundingBox()).toEqual(feedBefore);
      await expect(field).toBeHidden();
      await expect(folderPickerList(page).getByRole('option').first()).toHaveAttribute('aria-current', 'page');
      await expect(feed.getByText('Заметка во Входящих', { exact: true }).first()).toBeVisible();
      await search.fill('  иДЕи ');
      const options = folderPickerList(page).getByRole('option');
      await expect(options).toHaveCount(2);
      await expect(options.filter({ hasText: 'Проекты' })).toHaveCount(1);
      await expect(options.filter({ hasText: 'Личное' })).toHaveCount(1);
      await expect(trigger).toHaveAccessibleName(`Переключить папку: ${inbox}`);
      expect(await feed.evaluate((node, original) => node === original, originalFeed)).toBe(true);
      if (engine === 'textarea') {
        await page.screenshot({ path: 'test-results/screenshots/folder-switcher-mobile-search.png' });
        await page.setViewportSize({ width: 375, height: 390 });
        const list = (await folderPickerList(page).boundingBox())!;
        const input = (await search.boundingBox())!;
        expect(list.y).toBeLessThan(input.y);
        expect(list.y + list.height).toBeLessThanOrEqual(input.y);
        await search.fill('папка которой нет');
        await expect(page.getByRole('status').filter({ hasText: 'Папки не найдены' })).toBeVisible();
        await search.fill('Проекты/Идеи');
        await expect(options).toHaveCount(1);
        await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
        await expect(trigger).toHaveAccessibleName(`Переключить папку: ${inbox}`);
      }
      await page.keyboard.press('Escape');
      await expect(search).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(field).toBeVisible();
      if (engine === 'markdown') {
        await expect(dock.getByRole('button', { name: 'Отменить ответ' })).toBeVisible();
        await expect(field).toHaveText('Черновик не из поиска');
        await expect(attachment).toBeVisible();
      } else await expect(field).toHaveValue('Черновик не из поиска');
      expect(await field.evaluate((node, original) => node === original, originalField)).toBe(true);
    });
  }

  test('selects a nested path, keeps per-folder drafts and gives Back to the picker first', async ({ page }) => {
    const trigger = mobileFolderTrigger(page);
    const field = page.getByTestId('composer-dock').locator('textarea');
    await field.fill('Черновик входящих');
    await trigger.tap();
    const search = page.getByRole('combobox', { name: 'Найти папку' });
    await search.fill('проекты/идеи');
    await search.press('Enter');
    await expect(trigger).toContainText('Проекты/Идеи');
    await expect(field).toHaveValue('Черновик проекта');
    await expect(page.getByTestId('composer-dock').getByRole('button', { name: 'Отменить ответ' })).toHaveCount(0);
    await trigger.tap();
    await expect(search).toBeFocused();
    await page.goBack();
    await expect(search).toBeHidden();
    await expect(trigger).toContainText('Проекты/Идеи');
    await page.goBack();
    await expect(trigger).toHaveAccessibleName('Переключить папку: Проекты');
    await page.goBack();
    await expect(page.getByTestId('mobile-vault-switcher-btn')).toBeVisible();
    await page.getByRole('button', { name: /^Входящие/ }).click();
    await expect(trigger).toHaveAccessibleName(`Переключить папку: ${inbox}`);
    await expect(field).toHaveValue('Черновик входящих');
    await expect(page.getByTestId('composer-dock').getByRole('button', { name: 'Отменить ответ' })).toBeVisible();
  });

  test('Inbox Back opens the folder root with sync and dock; a root folder has neither', async ({ page }) => {
    const back = page.getByRole('button', { name: 'Назад к папкам' });
    await back.tap();
    await expect(page.getByTestId('mobile-vault-switcher-btn')).toBeVisible();
    await expect(page.getByTestId('mobile-sync-btn')).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Мобильная навигация' });
    await expect(tabs).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/mobile-folders-root.png' });
    await page.getByRole('button', { name: 'Проекты', exact: true }).tap();
    await expect(mobileFolderTrigger(page)).toHaveAccessibleName('Переключить папку: Проекты');
    await expect(tabs).toBeHidden();
    await expect(page.getByTestId('mobile-sync-btn')).toHaveCount(0);
    await back.tap();
    await expect(page.getByTestId('mobile-vault-switcher-btn')).toBeVisible();
  });

  test('opens folder search over Kanban and Calendar; folder info is still available', async ({ page }) => {
    const trigger = mobileFolderTrigger(page);
    for (const view of ['kanban', 'calendar'] as const) {
      await switchToView(page, view);
      await expect(page.getByTestId('composer-dock')).toHaveCount(0);
      await trigger.tap();
      await expect(page.getByRole('combobox', { name: 'Найти папку' })).toBeFocused();
      await page.getByRole('button', { name: 'Закрыть поиск папок' }).tap();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId('composer-dock')).toHaveCount(0);
    }
    await chooseMobileFolder(page, 'Проекты');
    const profile = await openMobileFolderProfile(page);
    await expect(profile.getByRole('heading', { name: 'Проекты' })).toBeVisible();
  });
});

test('Desktop title navigates; folder context menu restores one Info tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'commit' });
  const trigger = page.locator('header').getByRole('button', { name: /^Переключить папку:/ }).first();
  await expect(trigger).toBeVisible({ timeout: 120_000 });
  await trigger.click();
  const projects = page.getByRole('listbox').getByRole('option', { name: 'Проекты', exact: true });
  await expect(projects).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/folder-switcher-desktop.png' });
  await projects.click();
  await expect(trigger).toHaveAccessibleName('Переключить папку: Проекты');
  await expect(page.getByRole('dialog', { name: 'Проекты' })).toHaveCount(0);

  const infoTabs = page.locator('.dv-tab').filter({ hasText: /^Инфо$/ });
  const showInfo = async () => {
    await page.locator('[data-folder-path="Личное"]').first().click({ button: 'right' });
    await page.getByRole('button', { name: 'Информация и медиа', exact: true }).click();
    await expect(page.getByTestId('folder-profile').getByText('Личное', { exact: true })).toBeVisible();
    await expect(infoTabs).toHaveCount(1);
  };
  await showInfo();
  const close = infoTabs.locator('.dv-default-tab-action');
  await close.click();
  await expect(infoTabs).toHaveCount(0);
  await showInfo();
  await showInfo();
});
