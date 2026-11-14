import { test, expect } from './support/selfhostFixture';

test.setTimeout(300_000);

// Промпт и персона — две отдельные модалки: каждая пишет своё поле в workspace state,
// а не общий объект настроек.
test('prompt and persona dialogs save separately into the synced workspace state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();

  await page.getByTestId('ai-prompt-open').click();
  await page.getByTestId('ai-prompt-text').fill('Отвечай коротко, без вступлений. Списки — по пункту на строку.');
  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-modal.png' });
  await page.getByTestId('ai-prompt-save').click();

  await page.getByTestId('ai-persona-open').click();
  // Тумблер подписан не только для скринридера: рядом с ним видно, что он включает.
  await expect(page.getByTestId('ai-persona-switch-row')).toContainText('Персона включена');
  await page.getByLabel('Персона включена').click();
  await page.getByTestId('ai-persona-text').fill('Виолетта, язвительная напарница.');
  await page.screenshot({ path: 'test-results/screenshots/ai-persona-modal.png' });
  await page.getByTestId('ai-persona-save').click();

  const saved = await page.evaluate(async () => {
    const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const workspace = storage.getWorkspaceState();
    return {
      prompt: workspace.aiPrompt ?? '',
      persona: workspace.aiPersona ?? '',
      enabled: workspace.aiPersonaEnabled === true,
      promptAt: workspace.aiPromptAt ?? 0,
      personaAt: workspace.aiPersonaAt ?? 0,
    };
  });

  expect(saved.prompt).toContain('по пункту на строку');
  expect(saved.persona).toContain('Виолетта');
  expect(saved.enabled).toBe(true);
  // Время правки едет вместе с текстом: по нему принимается решение «чей текст новее».
  expect(saved.promptAt).toBeGreaterThan(0);
  expect(saved.personaAt).toBeGreaterThan(0);

  // Обе модалки закрыты после сохранения: остались настройки, а не диалог.
  await expect(page.getByTestId('ai-prompt-text')).toHaveCount(0);
  await expect(page.getByTestId('ai-persona-text')).toHaveCount(0);
});

// На телефоне настройки — полноэкранный слой, и диалог внутри него позиционировался по нему,
// а не по вьюпорту: карточка висела посреди списка. Теперь это отдельный лист на весь экран.
test.describe('на телефоне', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('редактор персоны открывается листом на весь экран', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-tab-id="settings"]')).toBeVisible({ timeout: 120_000 });
    await page.locator('[data-tab-id="settings"]').click();
    await page.getByTestId('mobile-settings-ai').click();
    await page.getByTestId('ai-persona-open').click();

    const sheet = page.getByTestId('ai-persona-text');
    await expect(sheet).toBeVisible();
    // The sheet fades in: a screenshot taken on the first frame catches it transparent.
    await page.waitForTimeout(400);
    const box = await sheet.boundingBox();
    // Лист занимает почти всю ширину телефона, а не висит карточкой по центру.
    expect(box!.width).toBeGreaterThan(330);
    await page.screenshot({ path: 'test-results/screenshots/ai-persona-modal-mobile.png' });
  });
});
