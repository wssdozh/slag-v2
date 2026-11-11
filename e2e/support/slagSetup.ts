import { expect, type Page, type TestInfo } from '@playwright/test';

export async function openViewModal(page: Page) {
  const dotsBtn = page.locator('header button[aria-label="Вид и фильтры папки"]').first();
  await dotsBtn.click();
  const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
  await expect(modal).toBeVisible();
  return modal;
}

export async function switchToView(page: Page, mode: 'feed' | 'kanban' | 'calendar') {
  const modal = await openViewModal(page);
  const label = mode === 'kanban' ? 'Канбан' : mode === 'calendar' ? 'Календарь' : 'Лента';
  await modal.locator('button', { hasText: label }).click();
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
}

export async function setupSlag(page: Page, testInfo: TestInfo) {
  if (/^(?:11|12|13|16|23|24|25(?:\.[1-7])?|57)\. |Unified AI Categorization/.test(testInfo.title)) {
    await page.addInitScript(() => {
      localStorage.setItem('slag_ai_settings_v2', JSON.stringify({ sourceMode: 'byok' }));
    });
  }
  // `domcontentloaded` waits for the whole dev module graph to execute — seven
  // hundred untransformed modules on a cold Vite cache. We do not care about that
  // event, only that the app mounted.
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 60000 });
}
