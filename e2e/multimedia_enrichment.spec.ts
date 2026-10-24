import { test, expect } from '@playwright/test';

test.describe('Multimedia Attachment Enrichment E2E', () => {
  test('Audio transcript expansion, image OCR, file summary and Orama search', async ({ page }) => {
    // 1. Prepare items with enriched attachments in localStorage
    const testItemId = 'test_item_multimedia_' + Date.now();
    const testAudioAtt = {
      id: 'att_audio_test_1',
      name: 'voice_note.webm',
      type: 'audio',
      mimeType: 'audio/webm',
      size: 14200,
      relativePath: '.attachments/voice_note.webm',
      dataUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAA',
      duration: 3.5,
      extractedText: 'Купить сывороточный протеин и креатин после тренировки',
      summary: 'Список спортивного питания',
      enrichmentStatus: 'ready',
    };

    const testImageAtt = {
      id: 'att_image_test_1',
      name: 'receipt.png',
      type: 'image',
      mimeType: 'image/png',
      size: 32000,
      relativePath: '.attachments/receipt.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      extractedText: 'PROTEIN WHEY 1000g - 2400 RUB',
      summary: 'Чек за спортивное питание',
      enrichmentStatus: 'ready',
    };

    const testFileAtt = {
      id: 'att_file_test_1',
      name: 'server_error.log',
      type: 'file',
      mimeType: 'text/plain',
      size: 4096,
      relativePath: '.attachments/server_error.log',
      dataUrl: 'data:text/plain;base64,RVJST1IgRUNPTk5SRUZVU0VEIDU0MzI=',
      extractedText: 'FATAL: database connection refused on port 5432',
      summary: 'Сбой соединения с БД на порту 5432',
      enrichmentStatus: 'ready',
    };

    const testItem = {
      id: testItemId,
      type: 'note',
      title: 'Мультимедиа Заметка с Войсом и Файлами',
      content: 'Основной текст заметки',
      folder: 'Входящие',
      tags: ['питание', 'тренировки'],
      attachments: [testAudioAtt, testImageAtt, testFileAtt],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await page.addInitScript(({ item }) => {
      const existing = localStorage.getItem('slag_items_default_vault');
      const items = existing ? JSON.parse(existing) : [];
      items.unshift(item);
      localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
    }, { item: testItem });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 2. Verify the card is visible in the feed
    const card = page.locator('.group', { hasText: 'Мультимедиа Заметка с Войсом и Файлами' });
    await expect(card).toBeVisible();

    // 3. Verify AudioPlayer and "Раскрыть текст" button
    const expandAudioBtn = card.locator('button', { hasText: 'Раскрыть текст' });
    await expect(expandAudioBtn).toBeVisible();

    // Click to unfold transcript accordion
    await expandAudioBtn.click();

    // Verify transcript is displayed with Whisper header and copy button
    const transcriptHeader = card.locator('text=РАСШИФРОВКА WHISPER');
    await expect(transcriptHeader).toBeVisible();
    await expect(card.locator('text=Купить сывороточный протеин и креатин после тренировки')).toBeVisible();

    // 4. Verify Image OCR toggle
    const ocrBtn = card.locator('button', { hasText: 'Текст с фото (OCR)' });
    await expect(ocrBtn).toBeVisible();
    await ocrBtn.click();
    await expect(card.locator('text=PROTEIN WHEY 1000g - 2400 RUB')).toBeVisible();

    // 5. Verify File summary
    await expect(card.locator('text=Сбой соединения с БД на порту 5432')).toBeVisible();

    // Take screenshot for visual audit
    await page.screenshot({
      path: 'screenshots/multimedia-enrichment.png',
      fullPage: true,
    });

    // 6. Test Orama Search by phrase from audio transcript ("протеин")
    // Trigger search dialog
    const searchBtn = page.locator('button[title*="Поиск"], button[aria-label*="Поиск"]').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
    } else {
      await page.keyboard.press('Control+k');
    }

    const searchInput = page.locator('input[placeholder*="Поиск"], input[type="text"]').last();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('протеин');

    // Wait for search result with audio badge inside the dialog
    const searchResult = page.getByRole('dialog').getByText('Мультимедиа Заметка с Войсом и Файлами');
    await expect(searchResult).toBeVisible();
    await expect(page.getByRole('dialog').locator('text=аудио')).toBeVisible();

    // Take search modal screenshot
    await page.screenshot({
      path: 'screenshots/multimedia-search.png',
      fullPage: true,
    });
  });
});
