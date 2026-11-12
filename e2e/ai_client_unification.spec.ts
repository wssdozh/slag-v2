import { test, expect } from '@playwright/test';

test.describe('Unified AI Client & Russian Tag Heuristics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. resolveAiTarget pairs model, adapter, and endpoint accurately across all providers', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { resolveAiTarget } = await import('/src/lib/ai/aiClient.ts');

      // Test KIE DeepSeek
      const kieDeepSeek = resolveAiTarget({
        sourceMode: 'byok',
        provider: 'kie',
        kieApiKey: 'kie_test_key_123',
        kieBaseUrl: 'https://api.kie.ai',
        model: 'deepseek-v4-1-flash',
      } as any);

      // Test KIE Claude
      const kieClaude = resolveAiTarget({
        sourceMode: 'byok',
        provider: 'kie',
        kieApiKey: 'kie_test_key_123',
        kieBaseUrl: 'https://api.kie.ai',
        model: 'claude-3-5-haiku-20241022',
      } as any);

      // Test Groq
      const groq = resolveAiTarget({
        sourceMode: 'byok',
        provider: 'groq',
        groqApiKey: 'gsk_test_key_123',
        model: 'openai/gpt-oss-120b',
      } as any);

      return {
        kieDeepSeek: {
          endpoint: kieDeepSeek?.endpointUrl,
          adapterName: kieDeepSeek?.adapter.constructor.name,
          model: kieDeepSeek?.model,
        },
        kieClaude: {
          endpoint: kieClaude?.endpointUrl,
          adapterName: kieClaude?.adapter.constructor.name,
          model: kieClaude?.model,
        },
        groq: {
          endpoint: groq?.endpointUrl,
          adapterName: groq?.adapter.constructor.name,
        },
      };
    });

    expect(result.kieDeepSeek.endpoint).toBe('https://api.kie.ai/openai/v1/responses');
    expect(result.kieDeepSeek.adapterName).toBe('OpenAiResponsesAdapter');
    expect(result.kieDeepSeek.model).toBe('deepseek-v4-1-flash');

    expect(result.kieClaude.endpoint).toBe('https://api.kie.ai/anthropic/v1/messages');
    expect(result.kieClaude.adapterName).toBe('AnthropicMessagesAdapter');

    expect(result.groq.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(result.groq.adapterName).toBe('OpenAiChatAdapter');
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
