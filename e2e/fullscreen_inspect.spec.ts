import { test, expect } from '@playwright/test';

test('Capture Fullscreen Editor Teletype Top Utilities and Object Context', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

  // Open Fullscreen Editor via Composer Maximize
  const expandBtn = page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first();
  await expandBtn.click();

  const editorModal = page.locator('[data-testid="fullscreen-editor-modal"]');
  await expect(editorModal).toBeVisible();

  // 1. Task Mode with title, tags, and content
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

  // Capture Teletype Top Bar with clean bottom (NO floating dock!)
  await page.screenshot({ path: 'test-results/screenshots/teletype_top_bar_overview.png' });

  // 2. Open "Aa" Text Styles Dropdown in Top Bar
  console.log('Step 2: Clicking Aa dropdown');
  const aaBtn = page.locator('header button[title*="Стили текста"]').first();
  await expect(aaBtn).toBeVisible({ timeout: 5000 });
  await aaBtn.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/screenshots/teletype_aa_dropdown.png' });

  // Close dropdown by clicking in editor
  console.log('Closing dropdown');
  await cmContent.click();
  await page.waitForTimeout(200);

  // 3. Attach an image to test Selected Object Context at the top
  console.log('Step 3: Pasting image');
  const fullscreenEditorRoot = page.locator('#fullscreen-editor-root');
  await fullscreenEditorRoot.evaluate((node) => {
    const dt = new DataTransfer();
    const file = new File(['mock_image_bytes'], 'arch_diagram.png', { type: 'image/png' });
    dt.items.add(file);
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(500);

  // Click on the newly added attachment to select it
  console.log('Step 4: Clicking attachment card');
  const attCard = page.locator('text=arch_diagram.png').first();
  await expect(attCard).toBeVisible({ timeout: 5000 });
  await attCard.click();
  await page.waitForTimeout(300);

  console.log('Step 5: Verifying top header transformed');
  await expect(page.locator('header', { hasText: 'Просмотр' })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshots/teletype_image_object_selected.png' });

  // 4. Test Zen Mode Toggle
  console.log('Step 6: Zen mode');
  await page.keyboard.press('ControlOrMeta+Shift+F');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/fullscreen_editor_zen_mode.png' });

  // Exit Zen Mode
  await page.keyboard.press('ControlOrMeta+Shift+F');
  await page.waitForTimeout(200);

  // Close Editor
  console.log('Step 7: Close editor');
  await page.keyboard.press('Escape');
  await expect(editorModal).not.toBeVisible({ timeout: 5000 });
  console.log('Done!');
});
