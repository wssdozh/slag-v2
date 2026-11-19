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
  // Cold Vite cache on this machine can take well over 120 s; the app stays
  // alive during that time. We raise the budget to 240 s and retry the goto
  // once when the commit step itself times out.
  try {
    await page.goto('/', { waitUntil: 'commit' });
  } catch (err) {
    if ((err as Error).message.includes('Timeout')) {
      await page.goto('/', { waitUntil: 'commit' });
    } else throw err;
  }
  await expect(page.locator('main').first()).toBeVisible({ timeout: 240000 });
}
