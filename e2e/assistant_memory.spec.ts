import { test, expect } from '@playwright/test';

/**
 * Память ассистента:
 * 1. чистая логика — стемы, дедуп, вытеснение, удаление, ранжирование;
 * 2. цикл модели: тул memory объявлен, пишет факт, а следующая реплика уже видит его в промпте;
 * 3. forget и recall через тот же тул;
 * 4. экспорт/импорт хранилища забирает память с собой;
 * 5. панель памяти в настройках: показать, удалить строку, стереть всё.
 */

const MEMORY_KEY = 'slag_memory_default_vault';

const groqSettings = {
  sourceMode: 'byok',
  provider: 'groq',
  groqApiKey: 'gsk_test_key',
  model: 'openai/gpt-oss-120b',
  reasoningEffort: 'low',
  webSearchEnabled: false,
};

test.describe('assistant memory', () => {
  test('1. стемы, дедуп, вытеснение и удаление', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const now = Date.now();

      const created = memory.applyRemember([], {
        text: 'не любит созвон-митинги до полудня',
        kind: 'pref',
        tag: 'Работа',
        importance: 2,
      }, ['работа'], now);
      if (!created) throw new Error('факт не создался');

      // тот же смысл, другой падеж: новая запись не нужна
      const merged = memory.applyRemember(created.items, {
        text: 'не любит созвон митинга до полудня',
      }, ['работа'], now + 1000);

      const replaced = merged && memory.applyRemember(merged.items, {
        text: 'созвоны переносит на вечер',
        kind: 'pref',
        tag: 'работа',
        importance: 4,
        replaces: created.item.id,
      }, ['работа'], now + 2000);

      const superseded = replaced?.items.find((item: { id: string }) => item.id === created.item.id);
      const visible = memory.selectMemory(replaced?.items ?? [], { query: 'созвоны', limit: 5 }, now + 3000);
      const forgotten = replaced && memory.applyForget(replaced.items, replaced.item.id, now + 4000);

      return {
        kind: created.item.kind,
        tag: created.item.tag,
        importance: created.item.importance,
        normalized: created.item.normalized,
        mergedStatus: merged?.status,
        mergedMentions: merged?.item.mentions,
        mergedCount: merged?.items.length,
        replacedStatus: replaced?.status,
        supersededValidTo: superseded?.validTo ?? null,
        supersededBy: superseded?.supersededBy ?? null,
        visibleTexts: visible.map((item: { text: string }) => item.text),
        forgottenRemoved: forgotten?.removed,
        afterForgetLive: (forgotten?.items ?? []).filter(
          (item: { id: string; deletedAt?: number; validTo?: number }) =>
            item.id === replaced?.item.id && !item.deletedAt && !item.validTo
        ).length,
      };
    });

    // нормализация и тип
    expect(result.kind).toBe('pref');
    expect(result.normalized).toContain('созвон');
    // «Работа» → строчная тема из словаря
    expect(result.tag).toBe('работа');
    // importance ниже пола для pref поднят до 3
    expect(result.importance).toBe(3);

    // второй падеж слился в ту же запись
    expect(result.mergedStatus).toBe('merged');
    expect(result.mergedMentions).toBe(2);
    expect(result.mergedCount).toBe(1);

    // вытеснение: старая версия жива, но с датой
    expect(result.replacedStatus).toBe('replaced');
    expect(result.supersededValidTo).toBeGreaterThan(0);
    expect(result.supersededBy).toBeTruthy();
    expect(result.visibleTexts).toContain('созвоны переносит на вечер');
    expect(result.visibleTexts).not.toContain('не любит созвон-митинги до полудня');

    // удаление выводит из живых
    expect(result.forgottenRemoved).toBe(true);
    expect(result.afterForgetLive).toBe(0);
  });

  test('2. тул пишет факт, следующая реплика видит его в промпте', async ({ page }) => {
    const requests: any[] = [];

    await page.route('**/api.groq.com/**', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      requests.push(payload);

      const isSecondRound = payload.messages.some((m: any) => m.role === 'tool');
      const body = isSecondRound
        ? { choices: [{ message: { role: 'assistant', content: 'Запомнил.' } }] }
        : {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_memory_1',
                      type: 'function',
                      function: {
                        name: 'memory',
                        arguments: JSON.stringify({
                          op: 'remember',
                          text: 'не любит созвон-митинги до полудня',
                          kind: 'pref',
                          tag: 'Работа',
                          importance: 9,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          };

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const first = await page.evaluate(async (settings) => {
      const { assistantOrchestrator } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
      const response = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'запомни: я не люблю созвон-митинги до полудня' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings,
      } as any);
      return { content: response.content, toolCalls: (response.toolCalls || []).map((tc) => tc.name) };
    }, groqSettings as any);

    // схема тула уехала модели, с закрытым списком типов
    const memoryTool = requests[0].tools.find((tool: any) => tool.function?.name === 'memory');
    expect(memoryTool).toBeTruthy();
    expect(memoryTool.function.parameters.properties.kind.enum).toEqual([
      'rule', 'pref', 'fact', 'event', 'note',
    ]);
    expect(memoryTool.function.parameters.properties.op.enum).toContain('recall');

    // в промпте есть правила памяти и пустой блок
    const systemPrompt = requests[0].messages.find((m: any) => m.role === 'system')?.content;
    expect(systemPrompt).toContain('ТВОЯ ПАМЯТЬ ОБ ЭТОМ ЧЕЛОВЕКЕ');
    expect(systemPrompt).toContain('memory({op:\'remember\'})');

    expect(first.toolCalls).toContain('memory');

    // факт лёг на диск: importance зажат до 5, тег нормализован
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), MEMORY_KEY);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('не любит созвон-митинги до полудня');
    expect(stored[0].kind).toBe('pref');
    expect(stored[0].tag).toBe('работа');
    expect(stored[0].importance).toBe(5);
    expect(stored[0].mentions).toBe(1);

    // вторая реплика: тот же факт уже в системном промпте, с id для замены
    requests.length = 0;
    await page.route('**/api.groq.com/**', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      requests.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Помню.' } }] }),
      });
    });

    await page.evaluate(async (settings) => {
      const { assistantOrchestrator } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
      await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'можем созвониться завтра?' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings,
      } as any);
    }, groqSettings as any);

    const secondPrompt = requests[0].messages.find((m: any) => m.role === 'system')?.content;
    expect(secondPrompt).toContain('не любит созвон-митинги до полудня');
    expect(secondPrompt).toMatch(/id m_[a-z0-9]+/);
  });

  test('3. forget и recall через тул', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const seeded = await page.evaluate(async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const result = memoryService.remember({
        text: 'работает по ночам',
        kind: 'fact',
        tag: 'работа',
        importance: 3,
      });
      return result?.item.id ?? null;
    });
    expect(seeded).toBeTruthy();

    const requests: any[] = [];
    let round = 0;
    await page.route('**/api.groq.com/**', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      requests.push(payload);
      round += 1;
      const isToolResult = payload.messages.some((m: any) => m.role === 'tool');

      const body = isToolResult
        ? { choices: [{ message: { role: 'assistant', content: 'Готово.' } }] }
        : {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_memory_2',
                      type: 'function',
                      function: {
                        name: 'memory',
                        arguments: JSON.stringify({ op: 'recall', text: 'ночам', kind: 'fact', limit: 5 }),
                      },
                    },
                  ],
                },
              },
            ],
          };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.evaluate(async (settings) => {
      const { assistantOrchestrator } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
      await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'что ты помнишь про мой график?' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings,
      } as any);
    }, groqSettings as any);

    expect(round).toBe(2);
    const toolMessage = requests[1].messages.find((m: any) => m.role === 'tool');
    expect(toolMessage.content).toContain('работает по ночам');

    // и forget по тексту убирает факт из живых
    const forgotten = await page.evaluate(async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const removed = memoryService.forget('работает по ночам');
      return { removed, live: memoryService.all().length };
    });
    expect(forgotten.removed).toBe(true);
    expect(forgotten.live).toBe(0);
  });

  test('4. память переезжает с экспортом хранилища', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const roundTrip = await page.evaluate(async (key) => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');

      memoryService.remember({ text: 'живёт в Москве', kind: 'fact', tag: 'быт' });
      const exported = storage.exportVaultAsJson();
      localStorage.removeItem(key);
      const cleared = storage.getMemory().length;
      const restored = storage.importVaultFromJson(exported);
      return {
        exportedHasMemory: exported.includes('живёт в Москве'),
        cleared,
        restored,
        live: memoryService.all().length,
      };
    }, MEMORY_KEY);

    expect(roundTrip.exportedHasMemory).toBe(true);
    expect(roundTrip.cleared).toBe(0);
    expect(roundTrip.restored).toBe(true);
    expect(roundTrip.live).toBe(1);
  });

  test('5. панель памяти в настройках', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      memoryService.remember({ text: 'не любит созвон-митинги до полудня', kind: 'pref', tag: 'работа', importance: 4 });
      memoryService.remember({ text: 'пиши коротко, без вступлений', kind: 'rule', importance: 5 });
    });

    await page.locator('button[title*="Настройки"]').first().click();
    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();
    await settingsModal.locator('button', { hasText: 'ИИ & Провайдеры' }).first().click();

    await expect(settingsModal.locator('text=Память ассистента')).toBeVisible();
    await expect(settingsModal.locator('text=не любит созвон-митинги до полудня')).toBeVisible();
    await expect(settingsModal.locator('text=пиши коротко, без вступлений')).toBeVisible();

    // Блок живёт внизу вкладки: без прокрутки на снимке его просто нет.
    await settingsModal.locator('text=Память ассистента').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/memory-panel.png' });

    // удаление строки: факт уходит и из списка, и из живых
    await settingsModal
      .getByRole('button', { name: 'Удалить из памяти: не любит созвон-митинги до полудня' })
      .click();
    await expect(settingsModal.locator('text=не любит созвон-митинги до полудня')).toHaveCount(0);

    const live = await page.evaluate(async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      return memoryService.all().map((item: { text: string }) => item.text);
    });
    expect(live).toEqual(['пиши коротко, без вступлений']);
  });

  test('6. словарь тем уезжает в промпт, чтобы модель не изобретала новую', async ({ page }) => {
    const requests: any[] = [];
    await page.route('**/api.groq.com/**', async (route) => {
      requests.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Ок.' } }] }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      memoryService.remember({ text: 'работает по ночам', kind: 'fact', tag: 'работа' });
      memoryService.remember({ text: 'не любит созвоны до полудня', kind: 'pref', tag: 'работа' });
      memoryService.remember({ text: 'бегает по утрам', kind: 'fact', tag: 'здоровье' });
    });

    await page.evaluate(async (settings) => {
      const { assistantOrchestrator } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
      await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'как у меня с режимом?' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings,
      } as any);
    }, groqSettings as any);

    const systemPrompt = requests[0].messages.find((m: any) => m.role === 'system')?.content;
    expect(systemPrompt).toContain('Тему (tag) бери из словаря памяти:');
    // чаще употребляемая тема идёт первой
    expect(systemPrompt).toMatch(/работа, здоровье/);
  });

  test('7. тема памяти берётся из тегов заметок, а не заводится заново', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const tag = await page.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');

      storage.saveItem({
        id: 'note_tag_vocabulary',
        type: 'note',
        title: 'Референсы интерфейса',
        content: 'подборка',
        folder: 'Входящие',
        tags: ['дизайн'],
        attachments: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // «Дизайн» с большой буквы должен прилипнуть к существующему тегу заметки
      const result = memoryService.remember({ text: 'любит минимализм', kind: 'pref', tag: 'Дизайн' });
      return result?.item.tag ?? null;
    });

    expect(tag).toBe('дизайн');
  });

  test('8. полярность не склеивается и не путается в выдаче', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const now = Date.now();

      const positive = memory.applyRemember([], { text: 'люблю рыбу', kind: 'pref' }, [], now);
      const both = positive && memory.applyRemember(positive.items, { text: 'не люблю рыбу', kind: 'pref' }, [], now + 1000);
      const live = (both?.items ?? []).filter((item: { validTo?: number; deletedAt?: number }) => !item.validTo && !item.deletedAt);

      const likes = memory.selectMemory(both?.items ?? [], { query: 'что я люблю', limit: 5 }, now + 2000);
      const dislikes = memory.selectMemory(both?.items ?? [], { query: 'что я не люблю', limit: 5 }, now + 2000);

      return {
        count: live.length,
        texts: live.map((item: { text: string }) => item.text),
        mentions: live.map((item: { mentions: number }) => item.mentions),
        normalized: live.map((item: { normalized: string }) => item.normalized),
        likesTop: likes[0]?.text ?? null,
        dislikesTop: dislikes[0]?.text ?? null,
      };
    });

    // «не люблю» — не тот же факт, что «люблю»
    expect(result.count).toBe(2);
    expect(result.texts).toContain('люблю рыбу');
    expect(result.texts).toContain('не люблю рыбу');
    expect(result.mentions).toEqual([1, 1]);
    expect(new Set(result.normalized).size).toBe(2);

    // и полярность запроса ведёт за собой выдачу
    expect(result.likesTop).toBe('люблю рыбу');
    expect(result.dislikesTop).toBe('не люблю рыбу');
  });
});
