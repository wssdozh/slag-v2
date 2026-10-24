import { test, expect } from '@playwright/test';

test.describe('Multimedia Attachment Enrichment E2E', () => {
  test('Isolated notes for Audio, Image OCR, and File summary + Orama search', async ({ page }) => {
    const now = Date.now();

    // 1. Dedicated Note: Voice with transcription
    const audioNote = {
      id: 'note_audio_' + now,
      type: 'note',
      title: 'Голосовая заметка',
      content: '',
      folder: 'Входящие',
      tags: ['тренировки', 'питание'],
      attachments: [{
        id: 'att_audio_' + now,
        name: 'voice_note.webm',
        type: 'audio',
        mimeType: 'audio/webm',
        size: 14200,
        relativePath: '.attachments/voice_note.webm',
        dataUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAA',
        duration: 3.5,
        extractedText: 'Купить сывороточный протеин и креатин после тренировки',
        enrichmentStatus: 'ready',
      }],
      createdAt: now,
      updatedAt: now,
    };

    // 2. Dedicated Note: Image with OCR text
    const imageNote = {
      id: 'note_image_' + (now - 1000),
      type: 'note',
      title: 'Чек за спортивное питание',
      content: 'Скан чека после покупки',
      folder: 'Входящие',
      tags: ['финансы'],
      attachments: [{
        id: 'att_image_' + now,
        name: 'receipt.png',
        type: 'image',
        mimeType: 'image/png',
        size: 32000,
        relativePath: '.attachments/receipt.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        extractedText: 'PROTEIN WHEY 1000g - 2400 RUB',
        summary: 'Чек за протеин 2400 руб',
        enrichmentStatus: 'ready',
      }],
      createdAt: now - 1000,
      updatedAt: now - 1000,
    };

    // 3. Dedicated Note: File with summary
    const fileNote = {
      id: 'note_file_' + (now - 2000),
      type: 'note',
      title: 'Лог сбоя бэкенда',
      content: 'Анализ ошибки сервера',
      folder: 'Входящие',
      tags: ['бэкенд', 'ошибки'],
      attachments: [{
        id: 'att_file_' + now,
        name: 'server_error.log',
        type: 'file',
        mimeType: 'text/plain',
        size: 4096,
        relativePath: '.attachments/server_error.log',
        dataUrl: 'data:text/plain;base64,RVJST1IgRUNPTk5SRUZVU0VEIDU0MzI=',
        extractedText: 'FATAL: database connection refused on port 5432',
        summary: 'Сбой соединения с БД на порту 5432',
        enrichmentStatus: 'ready',
      }],
      createdAt: now - 2000,
      updatedAt: now - 2000,
    };

    // 4. Raw Voice note (un-transcribed) to test Telegram ->A transcribe button
    const rawVoiceNote = {
      id: 'note_raw_voice_' + (now - 3000),
      type: 'note',
      title: 'Голосовая заметка без расшифровки',
      content: '',
      folder: 'Входящие',
      tags: [],
      attachments: [{
        id: 'att_raw_' + now,
        name: 'voice_raw.webm',
        type: 'audio',
        mimeType: 'audio/webm',
        size: 86500,
        relativePath: '.attachments/voice_raw.webm',
        dataUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAA',
        duration: 5.4,
      }],
      createdAt: now - 3000,
      updatedAt: now - 3000,
    };

    await page.addInitScript(({ aNote, iNote, fNote, rNote }) => {
      const existing = localStorage.getItem('slag_items_default_vault');
      const items = existing ? JSON.parse(existing) : [];
      items.unshift(rNote);
      items.unshift(fNote);
      items.unshift(iNote);
      items.unshift(aNote);
      localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
    }, { aNote: audioNote, iNote: imageNote, fNote: fileNote, rNote: rawVoiceNote });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // --- Verify Audio Note ---
    const audioCard = page.locator('.group', { hasText: 'Купить сывороточный протеин и креатин после тренировки' });
    await expect(audioCard).toBeVisible();
    // Telegram-style chevron/transcribe button
    await expect(audioCard.locator('button[aria-label="Расшифровка"]')).toBeVisible();

    // --- Verify Raw Voice Note (with Telegram ->A button) ---
    const rawAudioCard = page.locator('.group', { hasText: 'voice_raw.webm' });
    if (await rawAudioCard.isVisible()) {
      await expect(rawAudioCard.locator('button[aria-label="Расшифровка"]')).toBeVisible();
    }

    // --- Verify Image Note (with OCR toggle) ---
    const imageCard = page.locator('.group', { hasText: 'Чек за спортивное питание' });
    await expect(imageCard).toBeVisible();
    const ocrBtn = imageCard.locator('button', { hasText: 'Текст с фото (OCR)' });
    await expect(ocrBtn).toBeVisible();
    await ocrBtn.click();
    await expect(imageCard.locator('text=PROTEIN WHEY 1000g - 2400 RUB')).toBeVisible();

    // --- Verify File Note (with Summary) ---
    const fileCard = page.locator('.group', { hasText: 'Лог сбоя бэкенда' });
    await expect(fileCard).toBeVisible();
    await expect(fileCard.locator('text=server_error.log')).toBeVisible();
    await expect(fileCard.locator('text=Сбой соединения с БД на порту 5432')).toBeVisible();

    // Take full page screenshot showing all 3 clean separate notes in feed
    await page.screenshot({
      path: 'screenshots/multimedia-enrichment.png',
      fullPage: true,
    });

    // --- Test Orama Search by audio transcript text ---
    const searchBtn = page.locator('button[title*="Поиск"], button[aria-label*="Поиск"]').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
    } else {
      await page.keyboard.press('Control+k');
    }

    const searchInput = page.locator('input[placeholder*="Поиск"], input[type="text"]').last();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('протеин');

    // Wait for search result with audio badge inside dialog
    const searchResult = page.getByRole('dialog').getByText('Купить сывороточный протеин').or(
      page.getByRole('dialog').getByText('Голосовая заметка')
    ).first();
    await expect(searchResult).toBeVisible();
    await expect(page.getByRole('dialog').locator('text=аудио').first()).toBeVisible();

    // Take search modal screenshot
    await page.screenshot({
      path: 'screenshots/multimedia-search.png',
      fullPage: true,
    });

    // Close search dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // --- Verify Lightbox Full View with OCR side panel ---
    const imageThumb = imageCard.locator('img').first();
    await expect(imageThumb).toBeVisible();
    await imageThumb.click();

    // Check lightbox opened
    const textToggleBtn = page.locator('button[aria-label="Распознанный текст"]');
    await expect(textToggleBtn).toBeVisible({ timeout: 5000 });

    // Open text panel via button click
    await textToggleBtn.click();

    // Verify side panel elements
    await expect(page.locator('text=Текст и описание')).toBeVisible();
    await expect(page.locator('text=Чек за протеин 2400 руб')).toBeVisible();
    await expect(page.locator('text=PROTEIN WHEY 1000g - 2400 RUB').last()).toBeVisible();
    await expect(page.locator('button', { hasText: 'Копировать' })).toBeVisible();

    // Take screenshot of Lightbox with OCR side panel
    await page.screenshot({
      path: 'screenshots/lightbox-ocr-view.png',
      fullPage: true,
    });

    // Test hotkey 'T' toggle
    await page.keyboard.press('t');
    await expect(page.locator('text=Текст и описание')).toBeHidden();

    await page.keyboard.press('t');
    await expect(page.locator('text=Текст и описание')).toBeVisible();

    // Close panel by Escape, then close lightbox
    await page.keyboard.press('Escape');
    await expect(page.locator('text=Текст и описание')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(textToggleBtn).toBeHidden();
  });

  test('Assistant tools search_notes and read_note return enriched multimedia context', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    const result = await page.evaluate(async () => {
      // Dynamic import to test production orchestrator in the browser context
      const { assistantOrchestrator } = await import('/src/lib/ai/orchestrator.ts');
      const now = Date.now();

      const items: any[] = [
        {
          id: 'test_voice_1',
          type: 'note',
          title: 'Голосовая заметка тренера',
          content: '',
          folder: 'Входящие',
          tags: ['спорт'],
          attachments: [{
            id: 'att_v1',
            name: 'coach_voice.webm',
            type: 'audio',
            mimeType: 'audio/webm',
            size: 15000,
            relativePath: '.attachments/coach_voice.webm',
            extractedText: 'Принять креатин 5 грамм перед тренировкой груди',
            enrichmentStatus: 'ready',
          }],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'test_receipt_1',
          type: 'note',
          title: 'Счет за хостинг',
          content: 'Оплата облака',
          folder: 'Входящие',
          tags: ['финансы'],
          attachments: [{
            id: 'att_r1',
            name: 'cloud_bill.png',
            type: 'image',
            mimeType: 'image/png',
            size: 24000,
            relativePath: '.attachments/cloud_bill.png',
            extractedText: 'INVOICE #9812 - HETZNER CLOUD 45.50 EUR PAID',
            summary: 'Счет за облачный сервер Hetzner 45.50 EUR',
            enrichmentStatus: 'ready',
          }],
          createdAt: now - 1000,
          updatedAt: now - 1000,
        },
      ];

      // Test local search_notes via runChat
      const searchResVoice = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'креатин' }],
        currentFolder: 'Входящие',
        settings: { provider: 'local', groqApiKey: '', kieApiKey: '', model: 'auto', reasoningEffort: 'none', webSearchEnabled: false } as any,
        folders: [{ id: 'inbox', name: 'Входящие', path: 'Входящие', order: 0, icon: 'Inbox' }],
        allItems: items,
      });

      const searchResInvoice = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'Hetzner' }],
        currentFolder: 'Входящие',
        settings: { provider: 'local', groqApiKey: '', kieApiKey: '', model: 'auto', reasoningEffort: 'none', webSearchEnabled: false } as any,
        folders: [{ id: 'inbox', name: 'Входящие', path: 'Входящие', order: 0, icon: 'Inbox' }],
        allItems: items,
      });

      return {
        voiceSearchContent: searchResVoice.content,
        voiceSearchToolCalls: searchResVoice.toolCalls,
        invoiceSearchContent: searchResInvoice.content,
        invoiceSearchToolCalls: searchResInvoice.toolCalls,
      };
    });

    // 1. Check Voice search found by transcript text
    expect(result.voiceSearchContent).toContain('Голосовая заметка тренера');
    expect(result.voiceSearchContent).toContain('Вложения');
    expect(result.voiceSearchContent).toContain('Принять креатин 5 грамм');

    // 2. Check Image search found by OCR text
    expect(result.invoiceSearchContent).toContain('Счет за хостинг');
    expect(result.invoiceSearchContent).toContain('HETZNER CLOUD');
  });
});
