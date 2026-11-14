import { test, expect } from './support/selfhostFixture';

test.setTimeout(300_000);

// Промпт и персона едут отдельным каналом, где побеждает более новый текст по времени, а не
// тот, что приехал последним. Без этого устройство со старой копией перетирало новую.
test('an older assistant prompt never overwrites a newer one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120_000 });

  const result = await page.evaluate(async () => {
    const { mergeAssistantPrompt } = await import(/* @vite-ignore */ '/src/lib/sync/applyBundle.ts');

    const base = {
      currentFolder: 'Входящие',
      feedViewMode: 'list',
      inboxMode: 'all',
      activeTypeFilter: 'all',
      activeTagFilter: null,
      activeMobileTab: 'feed',
      aiPrompt: 'новый текст',
      aiPromptAt: 200,
      aiPersona: 'новая персона',
      aiPersonaEnabled: true,
      aiPersonaAt: 200,
    } as unknown as Parameters<typeof mergeAssistantPrompt>[0];

    const stale = mergeAssistantPrompt(base, {
      prompt: 'старый текст', persona: 'старая персона', personaEnabled: false,
      promptAt: 100, personaAt: 100,
    });
    const newer = mergeAssistantPrompt(base, {
      prompt: 'ещё новее', persona: 'ещё новее', personaEnabled: false,
      promptAt: 300, personaAt: 150,
    });
    const onlyPersona = mergeAssistantPrompt(base, {
      prompt: '', persona: 'персона с телефона', personaEnabled: false,
      promptAt: 0, personaAt: 500,
    });

    return {
      stale,
      newerPrompt: newer?.aiPrompt,
      newerPersona: newer?.aiPersona,
      newerAt: newer?.aiPromptAt,
      personaOnly: onlyPersona?.aiPersona,
      personaOnlyKeptPrompt: onlyPersona?.aiPrompt,
      personaOnlyEnabled: onlyPersona?.aiPersonaEnabled,
    };
  });

  // Старая копия не меняет ничего: ни текста, ни тумблера.
  expect(result.stale).toBeNull();
  expect(result.newerPrompt).toBe('ещё новее');
  expect(result.newerAt).toBe(300);
  // Персона с более старым временем остаётся местной, пока не придёт её собственное обновление.
  expect(result.newerPersona).toBe('новая персона');
  // Правка одной персоны не трогает инструкции, даже если они пришли пустыми.
  expect(result.personaOnly).toBe('персона с телефона');
  expect(result.personaOnlyKeptPrompt).toBe('новый текст');
  expect(result.personaOnlyEnabled).toBe(false);
});
