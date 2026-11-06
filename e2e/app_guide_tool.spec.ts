import { test, expect } from '@playwright/test';

/**
 * Валидация инструмента get_app_guide:
 * 1. Чистая функция выборки разделов (все топики, фоллбэки, склейка).
 * 2. Реальный цикл ассистента: тул уходит в payload модели, исполняется
 *    и его результат возвращается в следующем раунде как role: 'tool'.
 */
test.describe('get_app_guide tool', () => {
  test('1. выдача разделов: все топики, фоллбэк и склейка', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const { getAppGuideContent, APP_GUIDE_TOPICS } = await import(
        /* @vite-ignore */ '/src/lib/ai/appGuide.ts'
      );

      const perTopic = APP_GUIDE_TOPICS.map((t) => {
        const text = getAppGuideContent([t as string]);
        return { topic: t, length: text.length, hasHeading: text.startsWith('### ') };
      });

      return {
        topics: APP_GUIDE_TOPICS as readonly string[],
        perTopic,
        // все 13 разделов разом
        allLength: getAppGuideContent([...APP_GUIDE_TOPICS]).length,
        // пустой массив → обзорный раздел
        emptyFallback: getAppGuideContent([]),
        // несуществующий топик → обзорный раздел
        junkFallback: getAppGuideContent(['нет-такого-раздела']),
        // не массив вообще
        wrongTypeFallback: getAppGuideContent(null),
        // валидный + мусор: мусор отбрасывается
        mixed: getAppGuideContent(['kanban', 'чушь']),
        multi: getAppGuideContent(['shortcuts', 'calendar']),
      };
    });

    // ровно 13 топиков, каждый отдаёт непустой раздел с заголовком
    expect(result.topics).toHaveLength(13);
    expect(result.perTopic.filter((t) => t.length < 80 || !t.hasHeading)).toEqual([]);
    expect(new Set(result.topics).size).toBe(13);
    // склейка всех разделов заметно больше одного
    expect(result.allLength).toBeGreaterThan(result.perTopic[0].length * 5);

    // фоллбэки всегда дают обзорный раздел
    for (const fallback of [
      result.emptyFallback,
      result.junkFallback,
      result.wrongTypeFallback,
    ]) {
      expect(fallback).toContain('Архитектура и концепция');
      expect(fallback).toContain('Local-First');
    }

    // мусор рядом с валидным топиком не ломает выдачу
    expect(result.mixed).toContain('Канбан-доска задач');
    expect(result.mixed).not.toContain('чушь');

    // несколько топиков склеиваются разделителем
    expect(result.multi).toContain('Полный реестр горячих клавиш');
    expect(result.multi).toContain('Календарное расписание');
    expect(result.multi).toContain('\n\n---\n\n');
  });

  test('2. цикл ассистента: тул в payload и его результат в следующем раунде', async ({ page }) => {
    const requests: any[] = [];

    // Подменяем Groq: первый раунд — просьба вызвать тул, второй — финальный ответ.
    await page.route('**/api.groq.com/**', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      requests.push(payload);

      const isSecondRound = payload.messages.some((m: any) => m.role === 'tool');
      const body = isSecondRound
        ? {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Переключись на «Канбан» в шапке папки и перетащи карточку в нужную колонку.',
                },
              },
            ],
          }
        : {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_guide_1',
                      type: 'function',
                      function: {
                        name: 'get_app_guide',
                        arguments: JSON.stringify({ topics: ['kanban'] }),
                      },
                    },
                  ],
                },
              },
            ],
          };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const chatResult = await page.evaluate(async () => {
      const { assistantOrchestrator } = await import(
        /* @vite-ignore */ '/src/lib/ai/orchestrator.ts'
      );

      const res = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'как подвинуть задачу по стадиям?' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings: {
          sourceMode: 'byok',
          provider: 'groq',
          groqApiKey: 'gsk_test_key',
          model: 'openai/gpt-oss-120b',
          reasoningEffort: 'low',
          webSearchEnabled: false,
        } as any,
      });

      return {
        content: res.content,
        toolCalls: (res.toolCalls || []).map((tc) => ({ name: tc.name, args: tc.args })),
      };
    });

    // первый запрос: тул объявлен модели вместе со схемой топиков
    expect(requests).toHaveLength(2);
    const firstPayload = requests[0];
    const guideTool = firstPayload.tools?.find(
      (t: any) => t.function?.name === 'get_app_guide'
    );
    expect(guideTool).toBeTruthy();
    expect(guideTool.function.description).toContain('интерфейс');
    const topicEnum = guideTool.function.parameters.properties.topics.items.enum;
    expect(topicEnum).toHaveLength(13);
    expect(topicEnum).toContain('kanban');
    expect(topicEnum).toContain('shortcuts');

    // первый запрос несёт правило обязательного вызова тула в системном промпте
    const systemPrompt = firstPayload.messages.find((m: any) => m.role === 'system')?.content;
    expect(systemPrompt).toContain('get_app_guide');
    expect(systemPrompt).toContain('ЗАПРЕЩЕНО выдумывать кнопки');

    // второй запрос: результат тула пришёл в модель как role: 'tool'
    const toolMessage = requests[1].messages.find((m: any) => m.role === 'tool');
    expect(toolMessage).toBeTruthy();
    expect(toolMessage.name).toBe('get_app_guide');
    expect(toolMessage.content).toContain('Канбан-доска задач');
    expect(toolMessage.content).toContain('Drag & Drop');

    // наружу отдан финальный ответ и зафиксирован вызов тула
    expect(chatResult.content).toContain('Канбан');
    expect(chatResult.toolCalls).toEqual([{ name: 'get_app_guide', args: { topics: ['kanban'] } }]);
  });
});
