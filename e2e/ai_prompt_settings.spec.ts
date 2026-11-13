import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

// Одноразовая проверка нового блока: поля промпта и персоны пишутся в workspace state.
test('ai prompt fields persist into the synced workspace state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();

  const promptField = page.getByLabel('Дополнительные инструкции к промпту');
  await expect(promptField).toBeVisible();
  await promptField.fill('Отвечай коротко, без вступлений. Списки — по пункту на строку.');
  await page.getByLabel('Своя персона').click();
  await page.getByLabel('Персона ассистента').fill('Виолетта, язвительная напарница.');

  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-settings.png' });

  const saved = await page.evaluate(async () => {
    const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
    await new Promise((resolve) => setTimeout(resolve, 700));
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

  // Перезагрузка: значения читаются из того же хранилища, а не из памяти формы.
  await page.reload();
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();
  await expect(page.getByLabel('Дополнительные инструкции к промпту')).toHaveValue(/по пункту на строку/);
  await expect(page.getByLabel('Персона ассистента')).toHaveValue(/Виолетта/);
});
