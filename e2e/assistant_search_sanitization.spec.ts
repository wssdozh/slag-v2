import { test, expect } from '@playwright/test';

test.describe('Assistant Search Sanitization & Fallback Formatting', () => {
  test('cleanSnippetText strips headings, lists, horizontal rules, and collapses whitespace', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const sanitized = await page.evaluate(async () => {
      const { cleanSnippetText } = await import('/src/lib/ai/orchestrator.ts');
      const rawMarkdown = `# ДРАМАТИК ИГРА\n\nКратко: Идеи и заметки.\n#юнити #идея\n---\n1. Как привлечь внимание\n2. Соцсети инструмент\n* вид с верху`;
      return cleanSnippetText(rawMarkdown);
    });

    // Verify all heading markers, bullets, and linebreaks are gone
    expect(sanitized).not.toContain('#');
    expect(sanitized).not.toContain('\n');
    expect(sanitized).not.toContain('---');
    expect(sanitized).not.toContain('1.');
    expect(sanitized).toContain('ДРАМАТИК ИГРА');
    expect(sanitized).toContain('Кратко: Идеи и заметки.');
  });

  test('Fallback search formats notes cleanly as single-line items and activates feedFilter', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const chatResponse = await page.evaluate(async () => {
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      const now = Date.now();

      const items: any[] = [
        {
          id: 'note_video_ideas',
          type: 'note',
          title: 'Идеи тем для роликов и блогов',
          content: '#идеи #видео\n\nидеи для роликов:\n1. Как привлечь внимание\n2. Соцсети это инструмент\n3. Почему ты ребенок в 25',
          folder: 'Личное/Контент',
          tags: ['видео', 'идеи'],
          createdAt: now,
          updatedAt: now,
        },
      ];

      return assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'идеи для роликов' }],
        currentFolder: 'Входящие',
        settings: {
          provider: 'groq',
          groqApiKey: '', // empty key forces local agent fallback
          model: 'openai/gpt-oss-120b',
          reasoningEffort: 'low',
        } as any,
        folders: [{ id: 'f1', name: 'Личное/Контент', path: 'Личное/Контент' }] as any,
        allItems: items,
      });
    });

    // Content must not contain multiline markdown dumps with raw list numbers or headers
    expect(chatResponse.content).toContain('• [[Идеи тем для роликов и блогов]] (Личное/Контент)');
    expect(chatResponse.content).toContain('Как привлечь внимание');
    // Verify feedFilter is activated
    expect(chatResponse.feedFilter).toBeDefined();
    expect(chatResponse.feedFilter?.itemIds).toContain('note_video_ideas');
  });

  test('Decomposition intent splits note into tasks without triggering vault stats', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const chatResponse = await page.evaluate(async () => {
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      const now = Date.now();

      const items: any[] = [
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
      ];

      return assistantOrchestrator.runChat({
        messages: [
          { role: 'assistant', content: 'Вот заметка: [[Пул игровых концептов]]' },
          { role: 'user', content: 'раздели эту заметку на несколько' },
        ],
        currentFolder: 'Проекты/Идеи',
        settings: {
          provider: 'groq',
          groqApiKey: '',
          model: 'openai/gpt-oss-120b',
        } as any,
        folders: [{ id: 'f1', name: 'Проекты/Идеи', path: 'Проекты/Идеи' }] as any,
        allItems: items,
      });
    });

    // Content must not be stats summary
    expect(chatResponse.content).not.toContain('Сводка по хранилищу');
    expect(chatResponse.suggestedAction).toBeDefined();
    expect(chatResponse.suggestedAction?.type).toBe('batch_update');
    expect(chatResponse.suggestedAction?.batchUpdateItems?.length).toBe(3);
  });
});
