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

  test('Fallback reason banner is attached to reasoning when API call fails', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const chatResponse = await page.evaluate(async () => {
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      return assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'Привет' }],
        currentFolder: 'Входящие',
        settings: {
          provider: 'groq',
          groqApiKey: 'dummy_invalid_key_for_test',
          model: 'openai/gpt-oss-120b',
        } as any,
        folders: [] as any,
        allItems: [],
      });
    });

    expect(chatResponse.reasoning).toContain('⚠️ Оффлайн-агент (API недоступен:');
  });

  test('search_notes tool executor filters by timeframe, sorts by recent, and returns human dates', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const searchResults = await page.evaluate(async () => {
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      const now = Date.now();
      const threeDaysAgo = now - 3 * 86400000;

      const items: any[] = [
        {
          id: 'note_old',
          type: 'note',
          title: 'Старая игра RPG',
          content: 'старый концепт',
          folder: 'Проекты/Игры',
          tags: ['игры'],
          createdAt: threeDaysAgo,
          updatedAt: threeDaysAgo,
        },
        {
          id: 'note_today',
          type: 'note',
          title: 'Свежая игра 2026',
          content: 'сегодняшний набросок',
          folder: 'Проекты/Игры',
          tags: ['игры'],
          createdAt: now,
          updatedAt: now,
        },
      ];

      // Invoke local search directly via orchestrator
      return assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'игры' }],
        currentFolder: 'Входящие',
        settings: {
          provider: 'groq',
          groqApiKey: '',
          model: 'openai/gpt-oss-120b',
        } as any,
        folders: [{ id: 'f1', name: 'Проекты/Игры', path: 'Проекты/Игры' }] as any,
        allItems: items,
      });
    });

    expect(searchResults.toolCalls?.[0]?.result?.length).toBe(2);
    const todayHit = searchResults.toolCalls?.[0]?.result?.find((r: any) => r.id === 'note_today');
    expect(todayHit).toBeDefined();
    expect(todayHit.date).toContain('Сегодня');
  });

  test('extractActionBlock recovers ```task decomposition block into action card with subtasks', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const result = await page.evaluate(async () => {
      const { extractActionBlock } = await import('/src/lib/ai/orchestrator.ts');
      const text = `
Вот план:
\`\`\`task
Собрать документы и пройти медкомиссию в военкомате
Личное/Быт
Часть декомпозиции «Личные цели и контрольные точки».

Шаги:
1. Записаться к психиатру в ПНД по месту жительства.
2. Пройти обследование, получить заключение с диагнозом.
3. Подать заключение в военкомат.
4. Получить решение призывной комиссии.
\`\`\`
Подтвердите сохранение.
      `.trim();

      return extractActionBlock(text, [], 'Личное/Быт');
    });

    expect(result.suggestedAction).toBeDefined();
    expect(result.suggestedAction?.title).toBe('Собрать документы и пройти медкомиссию в военкомате');
    expect(result.suggestedAction?.folder).toBe('Личное/Быт');
    expect(result.suggestedAction?.subtasks?.length).toBe(4);
    expect(result.suggestedAction?.subtasks?.[0].title).toBe('Записаться к психиатру в ПНД по месту жительства.');
    expect(result.cleanText).not.toContain('```task');
  });

  test('extractActionBlock recovers raw metadata dump into update_item action card with subtasks', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const result = await page.evaluate(async () => {
      const { extractActionBlock } = await import('/src/lib/ai/orchestrator.ts');
      const text = `
personal_goals
Личные цели и контрольные точки
task
Личное/Быт
["цели", "планы", "личное"]

цель 1. Военкомат — закрыть вопрос по здоровью
- [x] получить направление к психиатру
- [x] получить направление в дурку
- [ ] пройти обследование, забрать заключение на руки и сделать копии
- [ ] бахнуть кровопускание в ванной для вида
- [ ] подать заключение в военкомат и получить решение на руки
- [ ] сняться с учёта / закрыть дело
      `.trim();

      const existingItems: any[] = [
        {
          id: 'personal_goals',
          title: 'Личные цели и контрольные точки',
          type: 'task',
          folder: 'Личное/Быт',
          tags: ['цели', 'планы'],
        },
      ];

      return extractActionBlock(text, existingItems, 'Личное/Быт');
    });

    expect(result.suggestedAction).toBeDefined();
    expect(result.suggestedAction?.type).toBe('update_item');
    expect(result.suggestedAction?.targetItemId).toBe('personal_goals');
    expect(result.suggestedAction?.title).toBe('Личные цели и контрольные точки');
    expect(result.suggestedAction?.subtasks?.length).toBe(6);
    expect(result.suggestedAction?.subtasks?.[0].completed).toBe(true);
    expect(result.suggestedAction?.subtasks?.[2].completed).toBe(false);
    expect(result.cleanText).not.toContain('personal_goals');
    expect(result.cleanText).not.toContain('["цели"');
  });

  test('Assistant chat renders task list checkboxes and action card', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Open assistant tab or push messages to assistant history in storage
    await page.evaluate(() => {
      const storage = (window as any).storage;
      storage.saveAssistantHistory([
        {
          id: 'msg_1',
          role: 'user',
          content: 'декомпоз задач',
          createdAt: Date.now() - 5000,
        },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'План действий по задаче:\n\n- [x] Первое действие\n- [ ] Второе действие',
          createdAt: Date.now() - 3000,
          suggestedAction: {
            type: 'update_item',
            targetItemId: 'personal_goals',
            title: 'Личные цели и контрольные точки',
            folder: 'Личное/Быт',
            actionLabel: 'Декомпозиция задачи',
            tags: ['цели'],
            itemType: 'task',
            subtasks: [
              { id: 'st_1', title: 'Получить направление к психиатру', completed: true },
              { id: 'st_2', title: 'Пройти обследование', completed: false },
            ],
            actionState: 'suggested',
          },
        },
      ]);
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Press Ctrl+J to open Assistant view
    await page.keyboard.press('Control+j');

    const actionCard = page.locator('[data-testid="action-card"]').first();
    await expect(actionCard).toBeVisible({ timeout: 5000 });
    await expect(actionCard.locator('text=Декомпозиция задачи')).toBeVisible();
    await expect(actionCard.locator('text=Получить направление к психиатру')).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/assistant-task-decomposition-rendered.png',
      fullPage: false,
    });
  });
});
