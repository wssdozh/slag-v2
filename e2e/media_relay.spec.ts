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
      if (!loaded.some((name) => name.includes('/src/lib/media/enrichment/dispatch.ts'))) {
        await import('/src/lib/media/enrichment/dispatch.ts');
      }
    });
  });

  test('audio is sent to /api/ai/audio with the account token', async ({ page }) => {
    await patchPaidSubscription(page);
    const capture = await routeRelay(page, 'audio', { extractedText: 'проверка', summary: 'проверка' });

    const result = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType('resource').map((entry) => entry.name);
      const url =
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/media/enrichment/dispatch.ts')) ||
        '/src/lib/media/enrichment/dispatch.ts';
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
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/media/enrichment/dispatch.ts')) ||
        '/src/lib/media/enrichment/dispatch.ts';
      const { enrichAttachment } = await import(url);
      const { storage } = await import(loaded.find((name) => name.split('?')[0].endsWith('/src/lib/storage/index.ts')) || '/src/lib/storage/index.ts');
      const attachment = {
        id: 'att-image',
        type: 'image' as const,
        name: 'receipt.png',
        relativePath: '.attachments/att-image_receipt.png',
        mimeType: 'image/png',
        size: 68,
      };
      await storage.saveAttachment({ ...attachment, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
      storage.getAttachmentUrl = () => { throw new Error('OCR must not use the playback URL'); };
      return enrichAttachment(attachment, 'контекст', { sourceMode: 'subscription' } as any);
    });

    expect(capture.body?.dataUrl).toContain('data:image/');
    expect(capture.body?.prompt).toContain('OCR');
    expect(result.enrichmentStatus).toBe('ready');
    expect(result.extractedText).toBe('чек на 300');
  });

  test('the feed opens OCR text after recognition without writing a processing status', async ({ page }) => {
    await patchPaidSubscription(page);
    await routeRelay(page, 'vision', { extractedText: 'Чек на 300 рублей', summary: 'Чек' });
    await page.evaluate(async () => {
      const { storage } = await import('/src/lib/storage/index.ts');
      const now = Date.now();
      const attachment = { id: 'ocr-tile', name: 'ocr.png', type: 'image' as const, mimeType: 'image/png', size: 68, relativePath: '.attachments/ocr-tile_ocr.png' };
      await storage.saveAttachment({ ...attachment, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
      storage.saveItem({ id: 'ocr-note', type: 'note', title: 'Тест OCR', content: 'Тест OCR', folder: 'Входящие', tags: [], attachments: [attachment], createdAt: now, updatedAt: now });
      const save = storage.saveItem.bind(storage);
      storage.saveItem = (item, ...args) => {
        if (item.id === 'ocr-note' && item.attachments.some((att) => att.enrichmentStatus === 'processing')) throw new Error('Transient OCR status was saved');
        return save(item, ...args);
      };
      window.dispatchEvent(new Event('slag-sync-updated'));
    });
    const card = page.locator('#item-ocr-note');
    await card.getByRole('button', { name: 'Текст: ocr.png' }).click();
    await expect(card.getByText('Чек на 300 рублей', { exact: true })).toBeVisible();
    await card.screenshot({ path: 'test-results/screenshots/ocr-feed.png' });
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
        loaded.find((name) => name.split('?')[0].endsWith('/src/lib/media/enrichment/dispatch.ts')) ||
        '/src/lib/media/enrichment/dispatch.ts';
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
