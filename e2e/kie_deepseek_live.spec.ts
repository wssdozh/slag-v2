import { test, expect } from '@playwright/test';

const LIVE_KIE_KEY = process.env.KIE_API_KEY || '';

test.describe('KIE.AI DeepSeek V4.1 Flash Live Integration', () => {
  test('Executes tool calling and synthesizes Russian response via Responses API', async ({ page }) => {
    test.skip(!LIVE_KIE_KEY, 'KIE_API_KEY environment variable not set');
    test.setTimeout(30000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const result = await page.evaluate(async (apiKey) => {
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      const now = Date.now();

      return assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'найди заметки про идеи для роликов' }],
        currentFolder: 'Входящие',
        settings: {
          provider: 'kie',
          kieApiKey: apiKey,
          model: 'deepseek-v4-1-flash',
          reasoningEffort: 'low',
        } as any,
        folders: [
          { id: 'f1', name: 'Личное/Контент', path: 'Личное/Контент' },
        ] as any,
        allItems: [
          {
            id: 'note_video_ideas',
            type: 'note',
            title: 'Идеи тем для роликов и блогов',
            content: '1. Как привлечь внимание\n2. Соцсети это инструмент\n3. Почему ты ребенок в 25',
            folder: 'Личное/Контент',
            tags: ['видео', 'идеи'],
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
    }, LIVE_KIE_KEY);

    console.log('=== TEST RESULT ===');
    console.log('Content:', result.content);
    console.log('Reasoning:', result.reasoning);
    console.log('Tool calls:', result.toolCalls?.map((t: any) => t.name));

    // Must have successfully executed search_notes tool call
    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls?.some((t: any) => t.name === 'search_notes')).toBe(true);

    // Content must cite the note using wikilinks and formulate human answer
    expect(result.content).toContain('Идеи тем для роликов');
    // Must NOT be the fallback offline agent
    expect(result.reasoning).not.toContain('⚠️ Оффлайн-агент');
  });

  test('Decomposes note into multiple tasks with suggested action', async ({ page }) => {
    test.skip(!LIVE_KIE_KEY, 'KIE_API_KEY environment variable not set');
    test.setTimeout(30000);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const result = await page.evaluate(async (apiKey) => {
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      const now = Date.now();

      return assistantOrchestrator.runChat({
        messages: [
          {
            role: 'assistant',
            content: 'Вот заметка: [[Пул игровых концептов]] (Проекты/Идеи)',
          },
          {
            role: 'user',
            content: 'раздели эту заметку на несколько задач',
          },
        ],
        currentFolder: 'Проекты/Идеи',
        settings: {
          provider: 'kie',
          kieApiKey: apiKey,
          model: 'deepseek-v4-1-flash',
          reasoningEffort: 'low',
        } as any,
        folders: [
          { id: 'f2', name: 'Проекты/Идеи', path: 'Проекты/Идеи' },
        ] as any,
        allItems: [
          {
            id: 'note_pool',
            type: 'note',
            title: 'Пул игровых концептов',
            content: '- [ ] стать медиагигантом\n- [ ] ведение тг канала\n- [ ] ДРАМАТИК ИГРА',
            folder: 'Проекты/Идеи',
            tags: ['игры'],
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
    }, LIVE_KIE_KEY);

    console.log('=== DECOMPOSE RESULT ===');
    console.log('Content:', result.content);
    console.log('Reasoning:', result.reasoning);
    console.log('Action:', result.suggestedAction);

    expect(result.suggestedAction).toBeDefined();
    expect(result.reasoning).not.toContain('⚠️ Оффлайн-агент');
  });
});
