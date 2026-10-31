import { test, expect } from '@playwright/test';

test('Capture Fullscreen Editor Refined Zen Experience', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

  // Open Fullscreen Editor via Composer Maximize
  const expandBtn = page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first();
  await expandBtn.click();

  const editorModal = page.locator('[data-testid="fullscreen-editor-modal"]');
  await expect(editorModal).toBeVisible();

  // 1. Task Mode with content and subtasks
  await page.locator('header button:has-text("Таска")').click();
  await page.waitForTimeout(200);

  // Type title
  const titleInput = page.locator('input[placeholder*="Название задачи"], input[placeholder*="Заголовок"]').first();
  await titleInput.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Карьера: 7 типичных ошибок начинающего разработчика');

  // Add tags
  const tagInput = page.locator('input[placeholder="+ тег"]').first();
  for (const tag of ['карьера', 'it', 'советы', 'опыт', 'сакутин', 'вебинар', 'игра', 'игры', 'заработок']) {
    await tagInput.fill(tag);
    await page.keyboard.press('Enter');
  }

  // Type subtasks in CodeMirror
  const cmContent = page.locator('.cm-content').first();
  await cmContent.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Ключевые этапы запуска и требования к архитектуре:\n\n');
  await page.keyboard.type('- [x] Собрать аналитику спроса и конкурентный анализ\n');
  await page.keyboard.type('- [ ] Разработать прототип интерфейса в Linear Dark стиле\n');
  await page.keyboard.type('- [ ] Провести E2E скриншот-верификацию и нагрузочные тесты\n\n');
  await page.keyboard.type('Важно уложиться в дедлайн без потери качества.');
  await page.waitForTimeout(400);

  // Capture Task with Content & Floating Dock
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_task_content.png' });

  // 2. Test Width Toggle (Focus -> Wide)
  const widthBtn = page.locator('header button[title*="Широкая"], header button[title*="ширина"]').first();
  await widthBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_wide_mode.png' });

  // Toggle back to Focus
  await widthBtn.click();
  await page.waitForTimeout(200);

  // 3. Test Zen Mode Toggle
  const zenBtn = page.locator('header button[title*="Zen"]').first();
  await zenBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_zen_mode.png' });

  // Exit Zen Mode
  await zenBtn.click();
  await page.waitForTimeout(200);

  // 4. Note Mode
  await page.locator('header button:has-text("Заметка")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_note_clean.png' });

  // Close Editor
  await page.locator('header button', { hasText: 'Назад' }).click();
  await expect(editorModal).not.toBeVisible();
});
