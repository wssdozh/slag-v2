import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

// Промпт и персона живут в модалке, а не в списке настроек: проверяем открытие, сохранение
// в workspace state и то, что значения переезжают через перезагрузку.
test('prompt dialog saves instructions and persona into the synced workspace state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();

  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  const instructions = page.getByLabel('Инструкции');
  await expect(instructions).toBeVisible();
  await instructions.fill('Отвечай коротко, без вступлений. Списки — по пункту на строку.');
  await page.getByLabel('Своя персона').click();
  await page.getByLabel('Персона ассистента').fill('Виолетта, язвительная напарница.');
  await page.screenshot({ path: 'test-results/screenshots/ai-prompt-modal.png' });
  await page.getByTestId('ai-prompt-save').click();

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

  await page.reload();
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.getByTestId('settings-tab-ai').click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(page.getByLabel('Инструкции')).toHaveValue(/по пункту на строку/);
  await expect(page.getByLabel('Персона ассистента')).toHaveValue(/Виолетта/);
});
