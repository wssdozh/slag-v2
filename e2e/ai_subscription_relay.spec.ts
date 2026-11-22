import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Subscription AI path against the relay gateway.
 *
 * The request must speak the OpenAI Responses protocol (KIE serves chat models only
 * there), carry the account token, and the reply must be parsed back into a triage
 * result instead of silently degrading to the local heuristic.
 */

const KIE_RESPONSE = {
  id: 'resp_test',
  object: 'response',
  status: 'completed',
  model: 'deepseek-v4.1-flash',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: JSON.stringify({
            suggestedTitle: 'Заметка про хуки',
            targetFolder: 'Разработка/React',
            tags: ['react', 'hooks'],
            reason: 'Модель разобрала заметку',
          }),
        },
      ],
    },
  ],
  usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
  credits_consumed: 0.01,
};

interface RelayCapture {
  body: Record<string, any>;
  authorization: string;
  calls: number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

async function installRelayRoute(
  page: Page,
  reply: { status: number; body: unknown },
): Promise<RelayCapture> {
  const capture: RelayCapture = { body: {}, authorization: '', calls: 0 };

  await page.route('**/api/ai/chat', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    capture.calls += 1;
    capture.body = request.postDataJSON() as Record<string, any>;
    capture.authorization = request.headers()['authorization'] || '';
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(reply.body),
    });
  });

  return capture;
}

/**
 * Vite serves the app's modules with an HMR cache-busting query (`…ts?t=…`).
 * Importing a bare path would create a second module graph with its own singletons,
 * so the spec reuses the exact URLs the app already loaded.
 */
async function patchSubscription(page: Page) {
  await page.evaluate(async () => {
    const loaded = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/src/lib/'));

    const pick = (modulePath: string) =>
      loaded.find((name) => name.split('?')[0].endsWith(modulePath)) || modulePath;

    const { syncEngine } = await import(pick('/src/lib/sync/syncEngine.ts'));
    const engine = syncEngine as unknown as { getStatus: () => Record<string, unknown> };
    const original = engine.getStatus.bind(syncEngine);
    engine.getStatus = () => ({
      ...original(),
      subscription: { hasAiLease: true, plan: 'smile', planLabel: 'Smile' },
    });
  });
}

test.describe('Subscription AI relay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 120_000 });
    // Touch aiService once so its module URL is in the resource timeline.
    await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      if (!loaded.some((name) => name.includes('/src/lib/ai/aiService.ts'))) {
        await import('/src/lib/ai/aiService.ts');
      }
    });
  });

  test('sends a Responses payload with the account token and parses the reply', async ({ page }) => {
    const capture = await installRelayRoute(page, { status: 200, body: KIE_RESPONSE });
    await patchSubscription(page);

    const result = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const aiServiceUrl =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/ai/aiService.ts')) || '/src/lib/ai/aiService.ts';
      const { categorizeDraft } = await import(aiServiceUrl);

      const folders = [
        { id: 'f_inbox', name: 'Входящие', path: 'Входящие' },
        { id: 'f_react', name: 'React', path: 'Разработка/React', description: 'Хуки, компоненты' },
      ];
      return categorizeDraft(
        'useEffect гоняет fetch на каждый рендер, надо в зависимости',
        'Входящие',
        folders as any,
        { sourceMode: 'subscription', subscriptionModel: 'deep', maxTagsPerNote: 3, tagCaseStyle: 'lowercase' } as any,
      );
    });

    expect(capture.calls).toBe(1);

    // Client → gateway: Responses protocol, pinned model, no BYOK key leaking.
    expect(capture.body.model).toBe('deepseek-v4-1-flash');
    expect(capture.body.stream).toBe(false);
    expect(Array.isArray(capture.body.input)).toBe(true);
    expect(capture.body.input[0].content[0].type).toBe('input_text');
    expect(capture.body.instructions.length).toBeGreaterThan(50);
    expect(capture.body.reasoning.effort).toBe('high');
    expect(capture.authorization.toLowerCase().startsWith('bearer ')).toBe(true);
    expect(capture.authorization).not.toContain('gsk_');

    // Gateway → client: parsed into the triage result, not the heuristic fallback.
    expect(result.targetFolder).toBe('Разработка/React');
    expect(result.tags).toEqual(['react', 'hooks']);
    expect(result.reason).toBe('Модель разобрала заметку');
    expect(result.suggestedTitle).toBe('Заметка про хуки');
  });

  test('fast tier turns thinking off', async ({ page }) => {
    const capture = await installRelayRoute(page, { status: 200, body: KIE_RESPONSE });
    await patchSubscription(page);

    await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const aiServiceUrl =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/ai/aiService.ts')) || '/src/lib/ai/aiService.ts';
      const { categorizeDraft } = await import(aiServiceUrl);
      await categorizeDraft('заметка про react', 'Входящие', [], {
        sourceMode: 'subscription',
        subscriptionModel: 'fast',
      } as any);
    });

    expect(capture.calls).toBe(1);
    expect(capture.body.model).toBe('deepseek-v4-1-flash');
    expect(capture.body.reasoning.effort).toBe('none');
  });

  test('tagging and inbox triage never send hidden text', async ({ page }) => {
    const capture = await installRelayRoute(page, { status: 200, body: KIE_RESPONSE });
    await patchSubscription(page);
    const classify = (batch: boolean) => page.evaluate(async (batch) => {
      const url = performance.getEntriesByType('resource').find((entry) =>
        entry.name.split('?')[0].endsWith('/src/lib/ai/aiService.ts'))?.name || '/src/lib/ai/aiService.ts';
      const { categorizeDraft, triageInboxItems } = await import(url);
      const folders = [{ path: 'Разработка', name: 'Разработка', description: '' }];
      const settings = { sourceMode: 'subscription', subscriptionModel: 'fast' };
      const content = 'Открытый текст ||hidden_body_marker||\nЕщё строка ||hidden_unclosed_marker';
      if (!batch) return categorizeDraft(content, 'Входящие', folders, settings);
      return triageInboxItems([
        { id: 'public', type: 'note', title: 'Тест ||hidden_title_marker||', tags: [], content },
        { id: 'hidden', type: 'note', title: '', tags: [], content: '||hidden_only_marker||' },
      ], folders, settings);
    }, batch);

    await classify(false);
    expect(JSON.stringify(capture.body)).toContain('Открытый текст');
    expect(JSON.stringify(capture.body)).not.toContain('hidden_');
    const result = await classify(true);
    expect(capture.calls).toBe(2);
    expect(JSON.stringify(capture.body)).toContain('Открытый текст');
    expect(JSON.stringify(capture.body)).not.toContain('hidden_');
    expect(result).toHaveLength(1);
  });

  test('gateway errors fall back to heuristics instead of throwing', async ({ page }) => {
    const capture = await installRelayRoute(page, {
      status: 503,
      body: { error: 'upstream_not_configured' },
    });
    await patchSubscription(page);

    const result = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const aiServiceUrl =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/ai/aiService.ts')) || '/src/lib/ai/aiService.ts';
      const { categorizeDraft } = await import(aiServiceUrl);
      return categorizeDraft('новое кино в кинотеатре', 'Входящие', [], {
        sourceMode: 'subscription',
        subscriptionModel: 'fast',
      } as any);
    });

    expect(capture.calls).toBe(1);
    expect(result.tags).toContain('фильмы');
    expect(result.reason).not.toBe('Модель разобрала заметку');
  });
});
