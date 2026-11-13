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
    };
  });

  expect(saved.prompt).toContain('по пункту на строку');
  expect(saved.persona).toContain('Виолетта');
  expect(saved.enabled).toBe(true);

  // Обе модалки закрыты после сохранения: остались настройки, а не диалог.
  await expect(page.getByTestId('ai-prompt-text')).toHaveCount(0);
  await expect(page.getByTestId('ai-persona-text')).toHaveCount(0);
});
