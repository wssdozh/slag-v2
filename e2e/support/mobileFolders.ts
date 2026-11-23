import { expect, type Page } from '@playwright/test';
import { openViewModal } from './slagSetup';

export const mobileFolderTrigger = (page: Page) =>
  page.locator('header').getByRole('button', { name: /^Переключить папку:/ }).first();

export const folderPickerList = (page: Page) => page.getByRole('listbox', { name: 'Папки', exact: true });

export async function chooseMobileFolder(page: Page, name: string) {
  await mobileFolderTrigger(page).click();
  await folderPickerList(page).getByRole('option', { name, exact: true }).click();
  await expect(mobileFolderTrigger(page)).toHaveAccessibleName(`Переключить папку: ${name}`);
}

export async function openMobileFolderProfile(page: Page) {
  const menu = await openViewModal(page);
  await menu.getByRole('button', { name: 'Информация о папке', exact: true }).click();
  const profile = page.locator('[data-testid="folder-profile"][data-variant="screen"]');
  await expect(profile).toBeVisible();
  return profile;
}

export async function openMobileNoteSearch(page: Page) {
  const menu = await openViewModal(page);
  await menu.getByRole('button', { name: 'Поиск по записям', exact: true }).click();
  const input = page.getByPlaceholder(/Поиск по заметкам/);
  await expect(input).toBeVisible();
  return input;
}
