import { test, expect } from '@playwright/test';

test.describe('Unified AI Client & Russian Tag Heuristics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
  });

  test('1. resolveAiTarget pairs model, adapter, and endpoint across connections and roles', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { resolveAiTarget } = await import('/src/lib/ai/aiClient.ts');

      const settings = (connections: unknown[], chatId: string | null) => ({
        sourceMode: 'byok',
        connections,
        roles: { chat: chatId, vision: null, stt: null },
      });

      const kie = (model: string) => ({
        id: 'kie',
        kind: 'kie',
        label: 'KIE.AI',
        apiKey: 'kie_test_key_123',
        baseUrl: 'https://api.kie.ai',
        protocol: 'chat',
        models: { chat: model },
      });

      const kieDeepSeek = resolveAiTarget(settings([kie('deepseek-v4-1-flash')], 'kie') as never);
      const kieClaude = resolveAiTarget(settings([kie('claude-3-5-haiku-20241022')], 'kie') as never);
      const groq = resolveAiTarget(settings([{
        id: 'groq', kind: 'groq', label: 'Groq', apiKey: 'gsk_test_key_123',
        baseUrl: 'https://api.groq.com/openai/v1', protocol: 'chat', models: { chat: 'openai/gpt-oss-120b' },
      }], 'groq') as never);
      const cpa = resolveAiTarget(settings([{
        id: 'cpa', kind: 'custom', label: 'CPA', apiKey: 'cpa-key',
        baseUrl: 'http://127.0.0.1:8317/v1', protocol: 'chat', models: { chat: 'gpt-5.2' },
      }], 'cpa') as never);
      const cpaResponses = resolveAiTarget(settings([{
        id: 'cpa-r', kind: 'custom', label: 'CPA', apiKey: 'cpa-key',
        baseUrl: 'http://127.0.0.1:8317/v1', protocol: 'responses', models: { chat: 'gpt-5.2' },
      }], 'cpa-r') as never);

      const read = (target: any) => ({
        endpoint: target?.endpointUrl,
        adapterName: target?.adapter.constructor.name,
        model: target?.model,
      });

      return {
        kieDeepSeek: read(kieDeepSeek),
        kieClaude: read(kieClaude),
        groq: read(groq),
        cpa: read(cpa),
        cpaResponses: read(cpaResponses),
      };
    });

    expect(result.kieDeepSeek.endpoint).toBe('https://api.kie.ai/openai/v1/responses');
    expect(result.kieDeepSeek.adapterName).toBe('OpenAiResponsesAdapter');
    expect(result.kieDeepSeek.model).toBe('deepseek-v4-1-flash');

    expect(result.kieClaude.endpoint).toBe('https://api.kie.ai/anthropic/v1/messages');
    expect(result.kieClaude.adapterName).toBe('AnthropicMessagesAdapter');

    expect(result.groq.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(result.groq.adapterName).toBe('OpenAiChatAdapter');

    expect(result.cpa.endpoint).toBe('http://127.0.0.1:8317/v1/chat/completions');
    expect(result.cpa.adapterName).toBe('OpenAiChatAdapter');
    expect(result.cpaResponses.endpoint).toBe('http://127.0.0.1:8317/v1/responses');
    expect(result.cpaResponses.adapterName).toBe('OpenAiResponsesAdapter');
  });

  test('2. Russian Cyrillic existing tags match properly even in offline heuristic mode', async ({ page }) => {
    // Seed vault with a note having #фильм and a folder "Отдых"
    await page.evaluate(() => {
      const now = Date.now();
      const existingItems = [
        {
          id: 'note_movie_existing',
          type: 'note',
          title: 'апельсин фильм',
          content: 'заметка про фильм',
          folder: 'Отдых',
          tags: ['фильм', 'сериал'],
          attachments: [],
          createdAt: now - 1000,
          updatedAt: now - 1000,
        },
      ];
      localStorage.setItem('slag_items_default_vault', JSON.stringify(existingItems));
    });

    const result = await page.evaluate(async () => {
      const { categorizeDraft } = await import('/src/lib/ai/aiService.ts');
      const folders = [
        { id: 'f_inbox', name: 'Входящие', path: 'Входящие' },
        { id: 'f_leisure', name: 'Отдых', path: 'Отдых', description: 'Фильмы, сериалы, досуг' },
      ];
      const settings = {
        sourceMode: 'byok',
        provider: 'kie',
        kieApiKey: '', // forces offline heuristic fallback
        maxTagsPerNote: 4,
        tagCaseStyle: 'lowercase',
      } as any;

      // Classify "false memory фильм"
      const res = await categorizeDraft('false memory фильм', 'Входящие', folders, settings);
      return res;
    });

    // Target folder should match "Отдых" via folder keywords and description
    expect(result.targetFolder).toBe('Отдых');
    // Tag "фильм" must be recognized via existing tags taxonomy (Cyrillic word boundary fix)
    expect(result.tags).toContain('фильм');
  });

  test('3. Tagging new categories without existing tags detects common media keywords', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { categorizeDraft } = await import('/src/lib/ai/aiService.ts');
      const folders = [
        { id: 'f_inbox', name: 'Входящие', path: 'Входящие' },
      ];
      const settings = {
        sourceMode: 'byok',
        provider: 'kie',
        kieApiKey: '', // forces offline heuristic fallback
        maxTagsPerNote: 4,
        tagCaseStyle: 'lowercase',
      } as any;

      const res = await categorizeDraft('новое кино в кинотеатре', 'Входящие', folders, settings);
      return res;
    });

    expect(result.tags).toContain('фильмы');
  });
});
