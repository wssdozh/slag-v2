import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Media in subscription mode must go to the relay, not to Groq directly:
 * the Groq key lives on the server, the client only carries the account token.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

async function patchPaidSubscription(page: Page) {
  await page.evaluate(async () => {
    const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
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

async function routeRelay(page: Page, path: 'audio' | 'vision', reply: unknown) {
  const capture: { body: Record<string, any> | null; authorization: string } = {
    body: null,
    authorization: '',
  };
  await page.route(`**/api/ai/${path}`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    capture.body = route.request().postDataJSON() as Record<string, any>;
    capture.authorization = route.request().headers()['authorization'] || '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(reply),
    });
  });
  return capture;
}

test.describe('Media enrichment through the relay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 20000 });
    await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      if (!loaded.some((name) => name.includes('/src/lib/media/attachmentEnrichment.ts'))) {
        await import('/src/lib/media/attachmentEnrichment.ts');
      }
    });
  });

  test('audio is sent to /api/ai/audio with the account token', async ({ page }) => {
    await patchPaidSubscription(page);
    const capture = await routeRelay(page, 'audio', { extractedText: 'проверка', summary: 'проверка' });

    const result = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const url =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/media/attachmentEnrichment.ts')) ||
        '/src/lib/media/attachmentEnrichment.ts';
      const { enrichAttachment } = await import(url);
      return enrichAttachment(
        {
          id: 'att-audio',
          type: 'audio',
          name: 'voice.webm',
          mimeType: 'audio/webm',
          dataUrl: 'data:audio/webm;base64,AAAA',
          size: 3,
        } as any,
        'контекст',
        { sourceMode: 'subscription' } as any,
      );
    });

    expect(capture.body?.dataUrl).toContain('data:audio/webm;base64,');
    expect(capture.body?.fileName).toBe('voice.webm');
    expect(capture.authorization.toLowerCase().startsWith('bearer ')).toBe(true);
    expect(result.enrichmentStatus).toBe('ready');
    expect(result.extractedText).toBe('проверка');
  });

  test('image is sent to /api/ai/vision', async ({ page }) => {
    await patchPaidSubscription(page);
    const capture = await routeRelay(page, 'vision', { extractedText: 'чек на 300', summary: 'чек' });

    const result = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const url =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/media/attachmentEnrichment.ts')) ||
        '/src/lib/media/attachmentEnrichment.ts';
      const { enrichAttachment } = await import(url);
      return enrichAttachment(
        {
          id: 'att-image',
          type: 'image',
          name: 'receipt.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          size: 68,
        } as any,
        'контекст',
        { sourceMode: 'subscription' } as any,
      );
    });

    expect(capture.body?.dataUrl).toContain('data:image/');
    expect(capture.body?.prompt).toContain('OCR');
    expect(result.enrichmentStatus).toBe('ready');
    expect(result.extractedText).toBe('чек на 300');
  });

  test('without a lease and without a key the attachment stays idle', async ({ page }) => {
    await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const pick = (modulePath: string) =>
        loaded.find((name) => name.split('?')[0].endsWith(modulePath)) || modulePath;
      const { syncEngine } = await import(pick('/src/lib/sync/syncEngine.ts'));
      const engine = syncEngine as unknown as { getStatus: () => Record<string, unknown> };
      const original = engine.getStatus.bind(syncEngine);
      engine.getStatus = () => ({
        ...original(),
        subscription: { hasAiLease: false, plan: 'free' },
      });
    });

    const result = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const url =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/media/attachmentEnrichment.ts')) ||
        '/src/lib/media/attachmentEnrichment.ts';
      const { enrichAttachment } = await import(url);
      return enrichAttachment(
        {
          id: 'att-idle',
          type: 'audio',
          name: 'voice.webm',
          mimeType: 'audio/webm',
          dataUrl: 'data:audio/webm;base64,AAAA',
          size: 3,
        } as any,
        '',
        { sourceMode: 'subscription' } as any,
      );
    });

    expect(result.enrichmentStatus).toBe('idle');
  });
});
