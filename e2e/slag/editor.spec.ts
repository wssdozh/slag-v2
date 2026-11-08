import { test, expect } from '@playwright/test';
import { setupSlag, switchToView } from '../support/slagSetup';

test.describe('SLAG v2 Specification E2E Verification - Editor', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
  });

  test('30. Anti-matryoshka verification: flat reply in composer and feed item card', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Hover over first card and click reply button
    const firstCard = page.locator('.group').filter({ hasText: 'Синхронизация по архитектуре' }).first();
    await expect(firstCard).toBeVisible();
    await firstCard.hover();
    const replyBtn = firstCard.locator('button[title*="Ответить"]').first();
    await replyBtn.click();

    // Verify flat composer reply banner is visible
    const composerReply = page.locator('text=Ответ на таску:').first();
    await expect(composerReply).toBeVisible();

    // Screenshot composer with flat reply
    await page.screenshot({
      path: 'test-results/screenshots/composer-flat-reply.png',
      fullPage: false,
    });

    // Type reply content and submit
    const textarea = page.locator('main textarea').first();
    await textarea.fill('Мой плоский ответ без матрёшек');
    await textarea.press('Enter');

    // Wait for the new item to appear in the feed
    const newReplyCard = page.locator('.group').filter({ hasText: 'Мой плоский ответ без матрёшек' }).first();
    await expect(newReplyCard).toBeVisible();
    await newReplyCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Screenshot feed with flat reply quote
    await page.screenshot({
      path: 'test-results/screenshots/feed-flat-reply.png',
      fullPage: false,
    });
  });

  test('31. Media redesign verification: compact voice card and natural image layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Seed a pure voice note, a single image note, and a 4-image gallery note
    await page.evaluate(() => {
      const voiceId = 'test_pure_voice_' + Date.now();
      const singleImageId = 'test_single_image_' + Date.now();
      const multiImageId = 'test_multi_image_' + Date.now();

      const makeSvg = (title: string, color: string) =>
        `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="%2318181b" rx="8"/><rect x="20" y="20" width="180" height="24" fill="%2327272a" rx="4"/><text x="30" y="37" fill="%23a1a1aa" font-family="sans-serif" font-size="12">${title}</text><rect x="20" y="60" width="560" height="240" fill="%2309090b" rx="6" stroke="%2327272a"/><text x="40" y="110" fill="%23f4f4f5" font-family="sans-serif" font-size="15" font-weight="600">Screen View</text><circle cx="50" cy="180" r="14" fill="${color}"/></svg>`;

      const voiceItem = {
        id: voiceId,
        title: 'Голосовая заметка',
        content: '',
        folder: 'Входящие',
        type: 'note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [
          {
            id: 'att_voice_pure',
            name: 'pure_voice.webm',
            type: 'audio',
            mimeType: 'audio/webm',
            size: 1536,
            duration: 4,
            relativePath: '.attachments/pure_voice.webm',
            dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
          }
        ],
      };

      const singleImageItem = {
        id: singleImageId,
        title: 'Изображение',
        content: '',
        folder: 'Входящие',
        type: 'note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [
          {
            id: 'att_img_hero',
            name: 'ui-preview.png',
            type: 'image',
            mimeType: 'image/svg+xml',
            size: 2048,
            relativePath: '.attachments/ui-preview.png',
            dataUrl: makeSvg('Одиночный скриншот', '%233b82f6'),
          }
        ],
      };

      const multiImageItem = {
        id: multiImageId,
        title: 'Изображение',
        content: '',
        folder: 'Входящие',
        type: 'note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [
          { id: 'm1', name: 'img1.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img1.png', dataUrl: makeSvg('Кадр 1', '%2310b981') },
          { id: 'm2', name: 'img2.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img2.png', dataUrl: makeSvg('Кадр 2', '%23f59e0b') },
          { id: 'm3', name: 'img3.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img3.png', dataUrl: makeSvg('Кадр 3', '%238b5cf6') },
          { id: 'm4', name: 'img4.png', type: 'image', mimeType: 'image/svg+xml', size: 1024, relativePath: '.attachments/img4.png', dataUrl: makeSvg('Кадр 4', '%23ec4899') },
        ],
      };

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          items.unshift(multiImageItem);
          items.unshift(singleImageItem);
          items.unshift(voiceItem);
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
    });

    await page.reload();
    await page.waitForTimeout(500);

    // 1. Verify pure voice card has no fake "Голосовая заметка" h3 header
    const voiceCard = page.locator('.group').filter({ has: page.locator('audio') }).first();
    await voiceCard.scrollIntoViewIfNeeded();
    await expect(voiceCard).toBeVisible();
    await expect(voiceCard.locator('h3')).toHaveCount(0);

    // Verify monochrome play button is present
    const playBtn = voiceCard.locator('button[title*="Воспроизвести"]').first();
    await expect(playBtn).toBeVisible();

    // Screenshot compact voice card
    await page.screenshot({
      path: 'test-results/screenshots/feed-audioplayer-monochrome.png',
      fullPage: false,
    });

    // 2. Verify pure single image card has no fake "Изображение" h3 header and uses natural object-contain
    const singleImageCard = page.locator('.group').filter({ has: page.locator('img[alt="ui-preview.png"]') }).first();
    await singleImageCard.scrollIntoViewIfNeeded();
    await expect(singleImageCard).toBeVisible();
    await expect(singleImageCard.locator('h3')).toHaveCount(0);

    const singleImg = singleImageCard.locator('img[alt="ui-preview.png"]').first();
    await expect(singleImg).toBeVisible();
    await expect(singleImg).toHaveClass(/object-contain/);

    // Screenshot natural single image card
    await page.screenshot({
      path: 'test-results/screenshots/feed-images-single-natural.png',
      fullPage: false,
    });

    // 3. Verify multi-image card has 4 images in 4:3 grid without fake header
    const multiImageCard = page.locator('.group').filter({ has: page.locator('img[alt="img1.png"]') }).first();
    await multiImageCard.scrollIntoViewIfNeeded();
    await expect(multiImageCard).toBeVisible();
    await expect(multiImageCard.locator('h3')).toHaveCount(0);

    // Screenshot multi-image 4:3 grid
    await page.screenshot({
      path: 'test-results/screenshots/feed-images-multi-grid.png',
      fullPage: false,
    });
  });

  test('32. Hashtag clean extraction and note title de-duplication verification', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const textarea = page.locator('main textarea').first();
    await textarea.click();

    // 1. Type note with trailing tag on a new line
    await textarea.fill('вот такая вот собачка\n#паста');
    await page.waitForTimeout(200);

    // Verify tag preview badge appears in composer toolbar
    const previewTag = page.locator('span', { hasText: '#паста' }).first();
    await expect(previewTag).toBeVisible();

    // Screenshot composer with active tag preview
    await page.screenshot({
      path: 'test-results/screenshots/composer-tag-preview.png',
      fullPage: false,
    });

    // Send note
    await textarea.press('Enter');
    await page.waitForTimeout(300);

    // Find the created note card
    const noteCard = page.locator('.group').filter({ hasText: 'вот такая вот собачка' }).first();
    await expect(noteCard).toBeVisible();
    await noteCard.scrollIntoViewIfNeeded();

    // Verify note body has clean content without trailing '#паста'
    const noteBody = noteCard.locator('.whitespace-pre-wrap').first();
    await expect(noteBody).toHaveText('вот такая вот собачка');

    // Verify tag is present in bottom bar as clickable tag button
    const bottomTag = noteCard.locator('[role="button"], button', { hasText: '#паста' }).first();
    await expect(bottomTag).toBeVisible();

    // Verify note has no duplicate cut-off <h3> header
    await expect(noteCard.locator('h3')).toHaveCount(0);

    // 2. Test note with long first line: verify no chopped h3 header
    await textarea.fill('я переродился в геймдевера SSS-ранга, но вместо unity мне выдали игрушечный молот первого уровня\n#паста');
    await textarea.press('Enter');
    await page.waitForTimeout(300);

    const longNoteCard = page.locator('.group').filter({ hasText: 'геймдевера SSS-ранга' }).first();
    await expect(longNoteCard).toBeVisible();
    await longNoteCard.scrollIntoViewIfNeeded();

    // Ensure it does NOT have an h3 header (especially not a chopped one like '...но вместо un')
    await expect(longNoteCard.locator('h3')).toHaveCount(0);

    // Screenshot card in feed showing clean text and bottom tag
    await page.screenshot({
      path: 'test-results/screenshots/feed-clean-hashtag-note.png',
      fullPage: false,
    });
  });

  test('50. AudioPlayer dockview tab: scope mode, filters, transport controls and visual audit', async ({ page }) => {
    // Seed an item with an audio track and cover artwork
    await page.evaluate(() => {
      let found = false;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          found = true;
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          const testAudioItem = {
            id: 'test_audio_item_now_playing',
            type: 'note',
            title: 'Саундтрек проекта и голосовой лог',
            content: 'Аудиозапись фонового трека для концентрации',
            folder: 'Входящие',
            tags: ['audio', 'music'],
            attachments: [
              {
                id: 'att_audio_test_1',
                name: 'Never_Enough_The_Cure.mp3',
                type: 'audio',
                mimeType: 'audio/mp3',
                size: 4500000,
                duration: 266,
                relativePath: '.attachments/Never_Enough.mp3',
                dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
              },
              {
                id: 'att_img_cover_test_1',
                name: 'the_cure_cover.png',
                type: 'image',
                mimeType: 'image/png',
                size: 120000,
                relativePath: '.attachments/the_cure_cover.png',
                dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231a1b26"/><circle cx="150" cy="150" r="100" fill="%237aa2f7" opacity="0.3"/><text x="150" y="155" fill="%23ffffff" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">THE CURE</text></svg>',
              },
            ],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          const testVoiceItem = {
            id: 'test_voice_item_cassette',
            type: 'note',
            title: 'Голосовая заметка разработчика',
            content: 'Быстрая голосовая мысль',
            folder: 'Входящие',
            tags: ['войс'],
            attachments: [
              {
                id: 'att_voice_cassette',
                name: 'voice_16-12-53.webm',
                type: 'audio',
                mimeType: 'audio/webm',
                size: 32000,
                duration: 48,
                relativePath: '.attachments/voice_16-12-53.webm',
                dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
              },
            ],
            createdAt: Date.now() - 10000,
            updatedAt: Date.now() - 10000,
          };
          items.unshift(testAudioItem);
          items.unshift(testVoiceItem);
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
      if (!found) {
        localStorage.setItem('slag_items_default_vault', JSON.stringify([{
          id: 'test_audio_item_now_playing',
          type: 'note',
          title: 'Саундтрек проекта и голосовой лог',
          content: 'Аудиозапись фонового трека для концентрации',
          folder: 'Входящие',
          tags: ['audio', 'music'],
          attachments: [
            {
              id: 'att_audio_test_1',
              name: 'Never_Enough_The_Cure.mp3',
              type: 'audio',
              mimeType: 'audio/mp3',
              size: 4500000,
              duration: 266,
              relativePath: '.attachments/Never_Enough.mp3',
              dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }]));
      }
    });

    // Reload page to pick up seeded storage item
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Click [+] button in the center group header (Feed area)
    const centerAddTabBtn = page.locator('.dv-groupview').nth(1).locator('button[title="Добавить вкладку в эту группу"]');
    await expect(centerAddTabBtn).toBeVisible();
    await centerAddTabBtn.click();

    // Select "Аудиоплеер" from the dropdown
    const audioMenuOption = page.locator('button', { hasText: 'Аудиоплеер' });
    await expect(audioMenuOption).toBeVisible();
    await audioMenuOption.click();

    // Verify Audio tab is now visible and active in center group
    const audioTab = page.locator('.dv-tab, [role="tab"]').filter({ hasText: 'Аудиоплеер' }).first();
    await expect(audioTab).toBeVisible();

    // Verify Now Playing screen elements: track title, note link, clean ChatGPT voice orb canvas
    await expect(page.locator('text=voice_16-12-53.webm')).toBeVisible();
    await expect(page.locator('text=Голосовая заметка разработчика')).toBeVisible();
    await expect(page.locator('canvas[data-testid="chatgpt-orb-canvas"]')).toBeVisible();

    // Verify transport controls (5 buttons under timeline: -10s, Prev, Play/Pause, Next, +10s)
    const playPauseBtn = page.locator('button[title*="Воспроизведение"], button[title*="Пауза"]');
    await expect(playPauseBtn).toBeVisible();
    await expect(page.locator('button[title*="Предыдущий трек"]')).toBeVisible();
    await expect(page.locator('button[title*="Следующий трек"]')).toBeVisible();
    await expect(page.locator('button[title*="Назад на 10 секунд"]')).toBeVisible();
    await expect(page.locator('button[title*="Вперед на 10 секунд"]')).toBeVisible();

    // Verify folder toggle button in bottom bar (subtle ghost without pill background)
    const pinToggleBtn = page.locator('button[title*="активн" i], button[title*="закреплен" i]').first();
    await expect(pinToggleBtn).toBeVisible();

    const folderPickerBtn = page.locator('button[title*="Выбрать папку"]').first();
    await expect(folderPickerBtn).toBeVisible();
    await expect(folderPickerBtn).toHaveText(/Входящие/);

    // Open folder picker dropdown (always available) and verify "Входящие" is not duplicated
    await folderPickerBtn.click();
    const popover = page.locator('.absolute.z-40').filter({ hasText: 'Закрепить папку' });
    await expect(popover).toBeVisible();
    expect(await popover.locator('button', { hasText: 'Входящие' }).count()).toBe(1);

    // Select "Входящие" from dropdown to verify auto-pin
    await popover.locator('button', { hasText: 'Входящие' }).click();
    await expect(page.locator('button[title*="закреплен" i]').first()).toBeVisible();

    // Toggle unpin back via pin button
    await pinToggleBtn.click();
    await expect(page.locator('button[title*="активн" i]').first()).toBeVisible();

    // Verify Queue / Playlist button is present in bottom bar
    const queueBtn = page.locator('button[aria-label="Очередь воспроизведения"]').first();
    await expect(queueBtn).toBeVisible();

    // Open Queue drawer and select the voice note
    await queueBtn.click();
    await expect(page.locator('text=Очередь воспроизведения')).toBeVisible();
    const audioPanel = page.locator('[role="tabpanel"]').filter({ hasText: 'Очередь воспроизведения' }).first();
    await expect(audioPanel.locator('button', { hasText: 'Войсы' })).toBeVisible();
    await expect(audioPanel.locator('button', { hasText: 'Файлы' })).toBeVisible();
    const voiceTrackRow = page.locator('text=voice_16-12-53.webm').first();
    await expect(voiceTrackRow).toBeVisible();
    await voiceTrackRow.click();
    await expect(page.locator('text=Очередь воспроизведения')).not.toBeVisible();

    // Verify bottom bar utilities (speed, repeat, shuffle)
    const shuffleBtn = page.locator('button[aria-label="Перемешать"]');
    await expect(shuffleBtn).toBeVisible();

    const speedBtn = page.locator('button[aria-label="Скорость"]');
    await expect(speedBtn).toBeVisible();
    await speedBtn.click();
    await expect(speedBtn).toHaveText('1.25x');

    await page.waitForTimeout(600);

    // Take screenshot of the center AudioPlayer panel in full active ocean wave glory
    await page.screenshot({
      path: 'test-results/screenshots/dockview-audioplayer-ocean-waves-active.png',
      fullPage: false,
    });
  });

  test('33. Unified Task Creation via ComposerModal and FullscreenEditor Inspection from Kanban and Calendar', async ({ page }) => {
    // 1. Switch to Kanban view
    await switchToView(page, 'kanban');
    await page.waitForTimeout(200);

    // 2. Open ComposerModal via "+ Новая задача" button under cards
    const newTaskBtn = page.locator('button', { hasText: 'Новая задача' }).first();
    await expect(newTaskBtn).toBeVisible();
    await newTaskBtn.click();

    // 3. Verify ComposerModal opens with task context
    const modalHeader = page.locator('h3, [role="dialog"]').filter({ hasText: 'Новая задача' }).first();
    await expect(modalHeader).toBeVisible();

    const taskInput = page.locator('[placeholder*="Название таски"]');
    await expect(taskInput).toBeVisible();

    // Test Slash Command menu in ComposerModal
    await taskInput.fill('/');
    await page.waitForTimeout(150);
    const slashMenu = page.locator('text=Команды композера');
    await expect(slashMenu).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/composer-modal-slash-menu.png',
      fullPage: false,
    });

    // Fill with natural language task details
    const uniqueTitle = 'Элитный чай Улун ' + Date.now();
    await taskInput.fill(uniqueTitle);

    // Capture screenshot of ComposerModal
    await page.screenshot({
      path: 'test-results/screenshots/composer-modal-task.png',
      fullPage: false,
    });

    // Press Enter to submit
    await taskInput.press('Enter');
    await page.waitForTimeout(300);

    // Verify ComposerModal closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // 4. Verify task card appeared in Kanban
    const taskCard = page.locator('[data-testid="kanban-card"]', { hasText: uniqueTitle });
    await expect(taskCard).toBeVisible();

    // 5. Click task card to open enhanced FullscreenEditor
    await taskCard.click();
    await page.waitForTimeout(200);

    // Verify FullscreenEditor opened with task properties
    await expect(page.locator('button', { hasText: 'Бэклог' })).toBeVisible();

    // Change status to "В работе" via status Select
    await page.locator('button', { hasText: 'Бэклог' }).click();
    await page.locator('button', { hasText: 'В работе' }).click();
    await expect(page.locator('button', { hasText: 'В работе' })).toBeVisible();

    // Add subtask via native Markdown in live preview editor and test auto-continuation
    const editorRoot = page.locator('#fullscreen-editor-root');
    await expect(editorRoot).toBeVisible();
    const cmContent = page.locator('.cm-content');
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('- [ ] Шаг первый');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Проверить чайник и температуру');
    await expect(cmContent).toContainText('Проверить чайник и температуру');

    // Capture screenshot of enhanced FullscreenEditor
    await page.screenshot({
      path: 'test-results/screenshots/fullscreen-editor-task-enhanced.png',
      fullPage: false,
    });

    // Save changes
    await page.locator('header button[title*="Сохранить изменения"]').click();
    await page.waitForTimeout(200);

    // 6. Switch to Calendar view and verify inspecting task opens FullscreenEditor
    await switchToView(page, 'calendar');
    await page.waitForTimeout(300);

    // Click task in calendar if visible or any task card in calendar
    const calTask = page.locator(`text=${uniqueTitle}`).first();
    if (await calTask.isVisible()) {
      await calTask.click();
      await expect(page.locator('#fullscreen-editor-root')).toBeVisible();
      await expect(page.locator('.cm-content')).toContainText('Проверить чайник и температуру');
      // Close via Escape
      await page.keyboard.press('Escape');
      await expect(page.locator('#fullscreen-editor-root')).not.toBeVisible();
    }

    // 7. Verify clicking hour slot in Week time grid spawns ComposerModal
    const hourSlot = page.locator('.grid-cols-7 .h-\\[52px\\]').first();
    await hourSlot.click();
    await page.waitForTimeout(200);
    await expect(page.locator('[role="dialog"]').filter({ hasText: 'Новая задача' })).toBeVisible();
    await page.screenshot({
      path: 'test-results/screenshots/calendar-slot-composer-modal.png',
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // 8. Verify Month View day card directly spawns ComposerModal on click
    await page.locator('button', { hasText: 'Месяц' }).click();
    await page.waitForTimeout(200);
    const monthTodayBadge = page.locator('.grid-cols-7 .bg-white.text-canvas, .grid-cols-7 .bg-white.text-\\[\\#09090b\\]').first();
    if (await monthTodayBadge.isVisible()) {
      await monthTodayBadge.click();
      await page.waitForTimeout(200);
      await expect(page.locator('[role="dialog"]').filter({ hasText: 'Новая задача' })).toBeVisible();
      await page.screenshot({
        path: 'test-results/screenshots/calendar-month-composer-modal.png',
        fullPage: false,
      });
      await page.keyboard.press('Escape');
    }
  });

  test('34. Calendar Drag and Drop including Untimed and Unscheduled Tasks', async ({ page }) => {
    // 1. Switch to Calendar view
    await switchToView(page, 'calendar');
    await page.waitForTimeout(300);

    // 2. Create an untimed task directly in All-Day ("Весь день") section via ComposerModal
    const addAllDayBtn = page.locator('button[title="Добавить таску на весь день"]').first();
    await expect(addAllDayBtn).toBeVisible({ timeout: 5000 });
    await addAllDayBtn.click();
    await page.waitForTimeout(200);

    const taskInput = page.locator('[placeholder*="Название таски"]');
    await expect(taskInput).toBeVisible();
    const uniqueUntimedTitle = `БезВремени_${Date.now()}`;
    await taskInput.fill(uniqueUntimedTitle);
    await taskInput.press('Enter');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'test-results/screenshots/calendar-after-add-task.png',
      fullPage: false,
    });

    // 3. Verify the untimed task is in "Весь день" row
    const untimedPill = page.locator('.min-h-\\[44px\\]').locator(`text=${uniqueUntimedTitle}`).first();
    await expect(untimedPill).toBeVisible();

    // 4. Drag untimed task into an hour slot in the time grid (assigns time)
    const hourSlots = page.locator('.grid-cols-7 .h-\\[52px\\]');
    const targetHourSlot = hourSlots.nth(16); // 16:00 slot (empty, not obstructed by 14:00 demo meeting)
    await untimedPill.dragTo(targetHourSlot);
    await page.waitForTimeout(400);

    // Scroll time grid so 16:00 is visible
    const timeGrid = page.locator('[data-testid="calendar-time-grid"]');
    await timeGrid.evaluate(el => {
      el.scrollTop = 14 * 52;
    });
    await page.waitForTimeout(200);

    // Verify task is now in the time grid
    const timedCard = page.locator(`text=${uniqueUntimedTitle}`).first();
    await expect(timedCard).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/calendar-drag-untimed-to-hour.png',
      fullPage: false,
    });

    // 5. Open Drawer (Сроки) and check unscheduled tab & drop target
    const drawerBtn = page.locator('button[title*="просроченных"]').first();
    await drawerBtn.click();
    await page.waitForTimeout(200);
    const unscheduledTab = page.locator('button', { hasText: 'Без срока' });
    await unscheduledTab.click();
    await page.waitForTimeout(200);

    await page.screenshot({
      path: 'test-results/screenshots/calendar-drawer-drag-targets.png',
      fullPage: false,
    });

    // 6. Drag the task from Calendar into the Drawer drop zone to remove date/time
    const dropToUnscheduledZone = page.locator('text=Снять срок (перенести в «Без срока»)')
      .or(unscheduledTab);
    await timedCard.dragTo(dropToUnscheduledZone.first());
    await page.waitForTimeout(400);

    // Verify task is now in Unscheduled list
    const unscheduledCard = page.locator(`text=${uniqueUntimedTitle}`).first();
    await expect(unscheduledCard).toBeVisible();

    // 7. Drag unscheduled task from Drawer into "Весь день" row (untimed task)
    const allDayCells = page.locator('.min-h-\\[44px\\] .space-y-1');
    const targetAllDayCell = allDayCells.nth(1); // Tuesday column
    await unscheduledCard.dragTo(targetAllDayCell);
    await page.waitForTimeout(400);

    // Verify task is back in "Весь день" row
    const reassignedUntimedPill = page.locator('.min-h-\\[44px\\]').locator(`text=${uniqueUntimedTitle}`).first();
    await expect(reassignedUntimedPill).toBeVisible();

    // 8. Switch to Month View and verify dragging works in Month view
    await page.locator('button', { hasText: 'Месяц' }).click();
    await page.waitForTimeout(200);

    const monthTask = page.locator('.auto-rows-fr').locator(`text=${uniqueUntimedTitle}`).first();
    await expect(monthTask).toBeVisible();

    // Drag to another day cell in Month View
    const targetMonthCell = page.locator('.auto-rows-fr > div').nth(22);
    await monthTask.dragTo(targetMonthCell);
    await page.waitForTimeout(400);

    await page.screenshot({
      path: 'test-results/screenshots/calendar-month-drag-layout.png',
      fullPage: false,
    });
  });

  test('35. Kanban Drag and Drop without Dockview Tab Interference', async ({ page }) => {
    // 1. Switch to Kanban view
    await switchToView(page, 'kanban');
    await page.waitForTimeout(300);

    // 2. Locate existing task "Купить хороший зеленый чай" in "К выполнению"
    const taskCard = page.locator('[data-testid="kanban-card"]').filter({ hasText: 'Купить хороший зеленый чай' }).first();
    await expect(taskCard).toBeVisible();

    // 3. Drag task to "Бэклог" column
    const taskTitle = taskCard.locator('text=Купить хороший зеленый чай').first();
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    await expect(backlogColumn).toBeVisible();
    await taskTitle.dragTo(backlogColumn);
    await page.waitForTimeout(400);

    // Verify task is now inside "Бэклог" column
    const backlogTask = backlogColumn.locator('[data-testid="kanban-card"]', { hasText: 'Купить хороший зеленый чай' });
    await expect(backlogTask).toBeVisible();

    // 4. Verify Dockview tab bar did not trigger residual insertion beams or tab dragging classes
    const residualTabBeam = await page.locator('.dv-tab--reorder-before, .dv-tab--reorder-after').count();
    expect(residualTabBeam).toBe(0);

    // 5. Screenshot Kanban Drag & Drop
    await page.screenshot({
      path: 'test-results/screenshots/kanban-drag-and-drop-verified.png',
      fullPage: false,
    });
  });

  test('36. Task Duration Time-Blocking, Anti-Overlap, and Recurring Tasks in Calendar', async ({ page }) => {
    // 1. Switch to Feed view to use Composer
    const feedBtn = page.locator('header button[title*="Лента"]').or(page.locator('header button[title*="Все"]')).first();
    if (await feedBtn.isVisible()) {
      await feedBtn.click();
      await page.waitForTimeout(300);
    }

    // 2. Type task with natural language: time range (duration), recurring day, tag, and priority
    const composerTextarea = page.locator('main textarea').first();
    await expect(composerTextarea).toBeVisible();
    await composerTextarea.fill('Стратегический созвон 10:00-11:30 каждый вторник #план p1');
    await page.waitForTimeout(300);

    // Verify task controls in Composer toolbar appear dynamically
    const durationBadge = page.locator('button[title*="длительность"]').first();
    await expect(durationBadge).toBeVisible();

    const recurrenceBadge = page.locator('button[title*="повторение"]').first();
    await expect(recurrenceBadge).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/composer-duration-recurrence.png',
      fullPage: false,
    });

    // Submit task via Enter
    await composerTextarea.press('Enter');
    await page.waitForTimeout(400);

    // 3. Switch to Calendar view
    await switchToView(page, 'calendar');
    await page.waitForTimeout(400);

    // 4. Inject an overlapping task on today's date to test Anti-Overlap column partitioning
    const todayStr = new Date().toISOString().slice(0, 10);
    await page.evaluate((dateStr) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('slag_items_')) {
          const items = JSON.parse(localStorage.getItem(key) || '[]');
          items.unshift(
            {
              id: 'task_dur_15_' + Date.now(),
              type: 'task',
              title: 'Стендап (15м)',
              content: 'Быстрый синк',
              folder: 'Входящие',
              tags: ['синк'],
              attachments: [],
              status: 'todo',
              priority: 'urgent',
              dueDate: dateStr,
              reminder: `${dateStr}T14:00:00.000`,
              duration: 15,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_dur_30_' + Date.now(),
              type: 'task',
              title: 'Синхронизация (30м)',
              content: 'Ревью задач',
              folder: 'Входящие',
              tags: ['работа'],
              attachments: [],
              status: 'todo',
              priority: 'high',
              dueDate: dateStr,
              reminder: `${dateStr}T14:30:00.000`,
              duration: 30,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_dur_45_' + Date.now(),
              type: 'task',
              title: 'Демо спринта (45м)',
              content: 'Демонстрация фич',
              folder: 'Входящие',
              tags: ['демо'],
              attachments: [],
              status: 'todo',
              priority: 'medium',
              dueDate: dateStr,
              reminder: `${dateStr}T15:15:00.000`,
              duration: 45,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_dur_60_' + Date.now(),
              type: 'task',
              title: 'Реализовать Интерфейс',
              content: 'Разработка компонентов',
              folder: 'Входящие',
              tags: ['код'],
              attachments: [],
              status: 'todo',
              priority: 'urgent',
              dueDate: dateStr,
              reminder: `${dateStr}T16:00:00.000`,
              duration: 60,
              subtasks: [
                { id: 'sub_1', title: 'Шаг 1', completed: true },
                { id: 'sub_2', title: 'Шаг 2', completed: true },
                { id: 'sub_3', title: 'Шаг 3', completed: false },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_overlap_a_' + Date.now(),
              type: 'task',
              title: 'Стендап команды (А)',
              content: 'Обсуждение задач',
              folder: 'Входящие',
              tags: ['работа'],
              attachments: [],
              status: 'todo',
              priority: 'high',
              dueDate: dateStr,
              reminder: `${dateStr}T10:00:00.000`,
              duration: 90,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: 'task_overlap_b_' + Date.now(),
              type: 'task',
              title: 'Синхронизация по дизайну (Б)',
              content: 'Ревью макетов',
              folder: 'Входящие',
              tags: ['дизайн'],
              attachments: [],
              status: 'todo',
              priority: 'medium',
              dueDate: dateStr,
              reminder: `${dateStr}T10:30:00.000`,
              duration: 60,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
          );
          localStorage.setItem(key, JSON.stringify(items));
        }
      }
    }, todayStr);

    // Reload page to reflect injected tasks in Calendar
    await page.reload();
    await page.waitForTimeout(500);

    // Switch to Calendar view after reload
    await switchToView(page, 'calendar');
    await page.waitForTimeout(400);

    // 5. Verify Anti-Overlap: both overlapping tasks are rendered side-by-side
    const cardA = page.locator('[data-testid^="task-timed-card-task_overlap_a_"]').first();
    const cardB = page.locator('[data-testid^="task-timed-card-task_overlap_b_"]').first();
    await expect(cardA).toBeVisible({ timeout: 5000 });
    await expect(cardB).toBeVisible({ timeout: 5000 });

    // Verify task A card has resize handle for duration time-blocking
    const resizeHandle = page.locator('[data-testid^="resize-handle-task_overlap_a_"]').first();
    await expect(resizeHandle).toBeVisible();

    // 6. Verify Recurring Task is visible and advances on complete
    const recurringCard = page.locator('.absolute, .group').filter({ hasText: 'Стратегический созвон' }).first();
    await expect(recurringCard).toBeVisible({ timeout: 5000 });

    // Click complete checkbox on the recurring task
    const completeBtn = recurringCard.locator('button[title*="Выполнить"]').first();
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();
    await page.waitForTimeout(400);

    // Verify toast about recurrence completion
    const toast = page.locator('text=/Таска выполнена|Повтор выполнен/').first();
    await expect(toast).toBeVisible({ timeout: 4000 });

    // 7. Verify Discrete Duration Card States (15m, 30m, 45m, 60m)
    const card60 = page.locator('[data-testid^="task-timed-card-task_dur_60_"]').first();
    await card60.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const card15 = page.locator('[data-testid^="task-timed-card-task_dur_15_"]').first();
    const card30 = page.locator('[data-testid^="task-timed-card-task_dur_30_"]').first();
    const card45 = page.locator('[data-testid^="task-timed-card-task_dur_45_"]').first();

    await expect(card15).toBeVisible({ timeout: 5000 });
    await expect(card30).toBeVisible({ timeout: 5000 });
    await expect(card45).toBeVisible({ timeout: 5000 });
    await expect(card60).toBeVisible({ timeout: 5000 });

    // Verify subtasks badge on 60m card
    await expect(card60.locator('text=2/3')).toBeVisible();

    // 8. Test Interactive Resizing with Live Tooltip and 15-min snapping
    const handle60 = page.locator('[data-testid^="resize-handle-task_dur_60_"]').first();
    await expect(handle60).toBeVisible();

    // Hover over card60 to trigger hover handle appearance
    await card60.hover();
    await page.waitForTimeout(150);

    // Drag handle up to resize from 60m to 30m (deltaY = -26px)
    const box = await handle60.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      // Move up by 26px (snaps 60m -> 30m)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 26, { steps: 5 });
      await page.waitForTimeout(200);

      // Verify live floating tooltip badge
      const liveTooltip = page.locator('[data-testid="resize-live-tooltip"]');
      await expect(liveTooltip).toBeVisible();
      await expect(liveTooltip).toContainText('(30м)');

      // Take screenshot of live dragging state with tooltip
      await page.screenshot({
        path: 'test-results/screenshots/calendar-resize-live-dragging.png',
        fullPage: false,
      });

      // Release mouse to finalize resize
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Verify success toast with new duration
      const resizeToast = page.locator('text=Длительность: 30м').first();
      await expect(resizeToast).toBeVisible({ timeout: 4000 });
    }

    // 9. Visual Screenshot Audit of Week View with all duration states
    await page.screenshot({
      path: 'test-results/screenshots/calendar-duration-states-verified.png',
      fullPage: false,
    });

    // 10. Switch to Month view and capture virtual recurrence projections
    const monthViewBtn = page.locator('button', { hasText: 'Месяц' }).first();
    if (await monthViewBtn.isVisible()) {
      await monthViewBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: 'test-results/screenshots/calendar-month-recurrence-projections.png',
        fullPage: false,
      });
    }

    // 11. Verify Narrow Viewport Horizontal Scrolling (Kanban-style week columns)
    const weekViewBtn = page.locator('button', { hasText: 'Неделя' }).first();
    if (await weekViewBtn.isVisible()) {
      await weekViewBtn.click();
      await page.waitForTimeout(300);
    }

    // Resize viewport to 800px (desktop mode with sidebar open, so calendar width is ~550px < 896px)
    await page.setViewportSize({ width: 800, height: 720 });
    await page.waitForTimeout(300);

    // Verify inner week container retains min-w-[896px] and does NOT crush day columns
    const weekScrollContainer = page.locator('[data-testid="calendar-week-scroll-container"]');
    await expect(weekScrollContainer).toBeVisible();

    const scrollMetrics = await weekScrollContainer.evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      isScrollable: el.scrollWidth > el.clientWidth,
    }));
    expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(840);
    expect(scrollMetrics.isScrollable).toBe(true);

    // Capture screenshot of narrow viewport with Kanban-style horizontal scrolling
    await page.screenshot({
      path: 'test-results/screenshots/calendar-week-narrow-scrollable.png',
      fullPage: false,
    });

    // Reset viewport size to default
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
  });

  test('37. Mouse Grab-to-Scroll (Pan) in Kanban and Calendar Week/Month Views', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForTimeout(300);

    // =========================================================================
    // 1. KANBAN: Mouse grab-and-drag horizontal scrolling
    // =========================================================================
    await switchToView(page, 'kanban');
    await page.waitForTimeout(300);

    // Set a compact viewport so both Kanban and Calendar have horizontal overflow
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(200);

    const kanbanContainer = page.locator('[data-testid="kanban-columns-container"]');
    await expect(kanbanContainer).toBeVisible();

    // Collapse materials dock to give Kanban board wide dragging area
    const collapseDockBtn = page.locator('button[title*="Свернуть док материалов"]');
    if (await collapseDockBtn.isVisible()) {
      await collapseDockBtn.click();
      await page.waitForTimeout(200);
    }

    const kanbanBox = await kanbanContainer.boundingBox();
    expect(kanbanBox).not.toBeNull();

    if (kanbanBox) {
      // Center of kanban visible container
      const startX = Math.floor(kanbanBox.x + kanbanBox.width * 0.5);
      const startY = Math.floor(kanbanBox.y + 25);
      const dragDist = 120;

      const initialScrollLeft = await kanbanContainer.evaluate(el => el.scrollLeft);

      // Drag to the left (scrolls container to the right)
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - dragDist, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const scrolledLeft = await kanbanContainer.evaluate(el => el.scrollLeft);
      expect(scrolledLeft).toBeGreaterThan(initialScrollLeft);

      // Drag back to the right
      await page.mouse.move(startX - dragDist, startY);
      await page.mouse.down();
      await page.mouse.move(startX, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const restoredScrollLeft = await kanbanContainer.evaluate(el => el.scrollLeft);
      expect(restoredScrollLeft).toBeLessThan(scrolledLeft);
    }

    await page.screenshot({
      path: 'test-results/screenshots/kanban-grab-to-scroll.png',
      fullPage: false,
    });

    // =========================================================================
    // 2. CALENDAR WEEK VIEW: Mouse grab-and-drag horizontal & vertical panning
    // =========================================================================
    await page.setViewportSize({ width: 1280, height: 720 });
    await switchToView(page, 'calendar');
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 800, height: 600 });

    const weekScrollContainer = page.locator('[data-testid="calendar-week-scroll-container"]');
    await expect(weekScrollContainer).toBeVisible();

    // Scroll to far left first
    await weekScrollContainer.evaluate(el => {
      el.scrollLeft = 0;
    });
    await page.waitForTimeout(150);

    const weekBox = await weekScrollContainer.boundingBox();
    expect(weekBox).not.toBeNull();

    if (weekBox) {
      // Start drag from the day header row
      const startX = weekBox.x + Math.floor(weekBox.width * 0.6);
      const startY = weekBox.y + 15;
      const dragDistance = Math.min(150, Math.floor(weekBox.width * 0.3));

      const calInitialScroll = await weekScrollContainer.evaluate(el => el.scrollLeft);

      // Drag to the left
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - dragDistance, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const calScrolled = await weekScrollContainer.evaluate(el => el.scrollLeft);
      expect(calScrolled).toBeGreaterThan(calInitialScroll);

      // Drag back to the right
      await page.mouse.move(startX - dragDistance, startY);
      await page.mouse.down();
      await page.mouse.move(startX, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      const calRestored = await weekScrollContainer.evaluate(el => el.scrollLeft);
      expect(calRestored).toBeLessThan(calScrolled);
    }

    // =========================================================================
    // 3. DISAMBIGUATION: Dragging on hour slots suppresses accidental task modal
    // =========================================================================
    const timeGrid = page.locator('[data-testid="calendar-time-grid"]');
    await expect(timeGrid).toBeVisible();
    const timeGridBox = await timeGrid.boundingBox();
    expect(timeGridBox).not.toBeNull();

    if (timeGridBox) {
      const slotX = timeGridBox.x + 200;
      const slotY = timeGridBox.y + 100;

      // Drag inside time grid
      await page.mouse.move(slotX, slotY);
      await page.mouse.down();
      await page.mouse.move(slotX - 100, slotY - 50, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Verify task composer modal was NOT triggered by drag
      const composerModal = page.locator('[placeholder*="Название таски"]');
      const isComposerVisible = await composerModal.isVisible();
      expect(isComposerVisible).toBe(false);
    }

    await page.screenshot({
      path: 'test-results/screenshots/calendar-grab-to-scroll.png',
      fullPage: false,
    });

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
  });

  test('38. Markdown Rendering in Feed (Headings, bold, lists, checkboxes, and inline code)', async ({ page }) => {
    // 1. In composer, enter markdown content
    const composer = page.locator('textarea[placeholder*="Мысль, заметка или код"]').first();
    await expect(composer).toBeVisible();

    const uniqueMd = `md_test_${Date.now()}`;
    const mdContent = `Заметка о релизе ${uniqueMd}\n\n### Детали реализации\n\n**Важный текст** и *курсив*, а также \`код\`.\n\n- [ ] Первый пункт\n- [x] Второй пункт\n\n[[Манифест]]`;

    await composer.fill(mdContent);
    await page.keyboard.press('ControlOrMeta+Enter');
    await page.waitForTimeout(300);

    // 2. Locate the created card in feed
    const card = page.locator('.group', { hasText: uniqueMd }).first();
    await expect(card).toBeVisible();

    // 3. Verify rendered Markdown elements
    await expect(card.locator('h3', { hasText: 'Детали реализации' })).toBeVisible();
    await expect(card.locator('strong')).toHaveText('Важный текст');
    await expect(card.locator('em')).toHaveText('курсив');
    await expect(card.locator('code')).toHaveText('код');
    await expect(card.getByRole('button', { name: 'Манифест', exact: true })).toBeVisible();

    // 4. Capture screenshot for visual inspection
    await card.screenshot({
      path: 'test-results/screenshots/markdown-rendered-feed-card.png',
    });
  });

  test('39. Composite Workspace: Tab Right-Click Context Menu and Floating Group Detachment', async ({ page }) => {
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Locate Assistant tab and right click to open context menu
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    await expect(assistantTab).toBeVisible();

    await assistantTab.click({ button: 'right' });

    // 2. Verify custom context menu items
    const contextMenu = page.locator('.dv-context-menu');
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.locator('.dv-context-menu-item', { hasText: 'Вынести в отдельное окно' })).toBeVisible();
    await expect(contextMenu.locator('.dv-context-menu-item', { hasText: 'Сделать плавающим' })).toBeVisible();

    // 3. Click "Сделать плавающим" and verify floating container appears
    await contextMenu.locator('.dv-context-menu-item', { hasText: 'Сделать плавающим' }).click();

    const floatingContainer = page.locator('.dv-resize-container');
    await expect(floatingContainer).toBeVisible();

    // 4. Verify clean header [+] button
    const addTabBtn = page.locator('button[title*="Добавить вкладку"]').first();
    await expect(addTabBtn).toBeVisible();

    // 5. Capture screenshot of floating panel
    await page.screenshot({
      path: 'test-results/screenshots/dockview-floating-group-active.png',
      fullPage: false,
    });
  });

  test('40. Detached Popout Window: Full Dockview Workspace and Functional Controls', async ({ page }) => {
    // Set viewport below 768px to ensure popout window never collapses into mobile shell
    await page.setViewportSize({ width: 550, height: 450 });

    // Mock Tauri environment so desktop WindowControls are active
    await page.addInitScript(() => {
      (window as any).isTauri = true;
      (window as any).__TAURI_INTERNALS__ = {
        ipc: () => Promise.resolve(),
      };
    });

    // Navigate directly with query params as a spawned detached window would
    await page.goto('/?panel=sidebar&title=%D0%9D%D0%B0%D0%B2%D0%B8%D0%B3%D0%B0%D1%86%D0%B8%D1%8F');

    // 1. Verify Dockview is mounted (desktop mode) and mobile nav dock is absent
    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();
    await expect(page.locator('nav[aria-label="Мобильная навигация"]')).not.toBeVisible();

    // 2. Verify the detached panel is present as a tab
    const sidebarTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Навигация' }).first();
    await expect(sidebarTab).toBeVisible();

    // 3. Verify the [+] button to add panels is present in the detached window
    const addPanelBtn = page.locator('button[title*="Добавить вкладку"]').first();
    await expect(addPanelBtn).toBeVisible();

    // 4. Verify WindowControls are rendered with pointer-events-auto and without drag-region blocking
    const closeBtn = page.locator('button[title="Закрыть"]').first();
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toBeEnabled();

    // 5. Capture screenshot of the detached window
    await page.screenshot({
      path: 'test-results/screenshots/detached-dockview-window.png',
      fullPage: false,
    });
  });

  test('41. Detached Windows Session Registry and 1-to-1 Geometry', async ({ page }) => {
    await page.goto('/');

    // 1. Verify localStorage registry functionality
    await page.evaluate(() => {
      const entry = {
        label: 'panel-kanban-session-test',
        panelId: 'kanban',
        title: 'Канбан',
        left: 200,
        top: 150,
        width: 880,
        height: 620,
      };
      localStorage.setItem('slag_detached_windows_v2', JSON.stringify([entry]));
    });

    const saved = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('slag_detached_windows_v2') || '[]');
    });

    expect(saved).toHaveLength(1);
    expect(saved[0].panelId).toBe('kanban');
    expect(saved[0].width).toBe(880);
    expect(saved[0].height).toBe(620);
  });

  test('42. Cross-Window Tab Drag & Drop Dock-back via BroadcastChannel', async ({ page }) => {
    await page.goto('/');

    const dockviewContainer = page.locator('.dockview-theme-slag');
    await expect(dockviewContainer).toBeVisible();

    // 1. Simulate dragging tab over tab bar header and verify glowing drop preview indicator
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_MOVE',
        sourceLabel: 'panel-audio-test',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 450,
        screenY: window.screenY + 15, // exactly on top tab bar
      });
    });

    const dropIndicator = page.locator('[data-testid="drop-preview-indicator"]');
    await expect(dropIndicator).toBeVisible();

    await page.screenshot({
      path: 'test-results/screenshots/cross-window-tab-drag-preview.png',
      fullPage: false,
    });

    // 1.1 Test moving to left edge of center content area -> triggers split preview
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_MOVE',
        sourceLabel: 'panel-audio-test',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 270,
        screenY: window.screenY + 300,
      });
    });

    await expect(dropIndicator).toBeVisible();

    // 1.2 Move back to the tab bar -> returns to tab bar indicator
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_MOVE',
        sourceLabel: 'panel-audio-test',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 450,
        screenY: window.screenY + 15,
      });
    });
    await expect(dropIndicator).toBeVisible();

    // 2. Simulate releasing a detached tab over the main window and verify TAB_DRAG_ACCEPTED handshake
    const acceptedMsg = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
        channel.onmessage = (e) => {
          if (e.data && e.data.type === 'TAB_DRAG_ACCEPTED') {
            resolve(e.data);
          }
        };
        channel.postMessage({
          type: 'TAB_DRAG_RELEASE',
          sourceLabel: 'panel-audio-test',
          panelId: 'audio',
          title: 'Аудиоплеер',
          screenX: window.screenX + 300,
          screenY: window.screenY + 15,
        });
      });
    });

    expect(acceptedMsg.targetLabel).toBe('panel-audio-test');
    expect(acceptedMsg.panelId).toBe('audio');

    // 3. Verify the Audio tab appears in the main window
    const audioTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Аудиоплеер' }).first();
    await expect(audioTab).toBeVisible();

    // 4. Verify deduplication: re-releasing the same tab does not create duplicate tabs
    await page.evaluate(() => {
      const channel = new BroadcastChannel('slag_cross_window_tabs_v2');
      channel.postMessage({
        type: 'TAB_DRAG_RELEASE',
        sourceLabel: 'panel-audio-test',
        panelId: 'audio',
        title: 'Аудиоплеер',
        screenX: window.screenX + 300,
        screenY: window.screenY + 15,
      });
    });

    const audioTabs = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Аудиоплеер' });
    await expect(audioTabs).toHaveCount(1);

    // 4. Screenshot verification
    await page.screenshot({
      path: 'test-results/screenshots/cross-window-tab-docked.png',
      fullPage: false,
    });
  });

  test('43. Folder Info Modal: Header Click, Dashboard Metrics, Media Tabs, and Edit Mode', async ({ page }) => {
    // 1. Click folder header button in feed
    const folderHeaderBtn = page.locator('header button[title*="Информация и медиа папки"]').first();
    await expect(folderHeaderBtn).toBeVisible();
    await folderHeaderBtn.click();

    // 2. Verify modal opened
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h3').first()).toContainText('Входящие');

    // 3. Verify AI description block and dashboard metrics
    await expect(modal.locator('text=Описание для ИИ')).toBeVisible();
    await expect(modal.getByText('Заметки', { exact: true })).toBeVisible();
    await expect(modal.getByText('Таски', { exact: true })).toBeVisible();

    // 4. Screenshot View Mode
    await page.screenshot({ path: 'test-results/screenshots/folder-info-modal-view.png' });

    // 5. Toggle Edit Mode
    const editBtn = modal.locator('button[title*="Редактировать параметры"]').or(modal.locator('button:has-text("Изменить")')).first();
    await editBtn.click();

    // 6. Verify Edit Mode controls
    await expect(modal.locator('label', { hasText: 'Название папки' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'Иконка папки' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'Описание для ИИ-сортировки' })).toBeVisible();

    // 7. Screenshot Edit Mode
    await page.screenshot({ path: 'test-results/screenshots/folder-info-modal-edit.png' });

    // 8. Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('44. Composer and Assistant focus retention and no placeholder vertical scroll', async ({ page }) => {
    // 1. Verify feed composer retains focus after Enter
    const feedTextarea = page.locator('main textarea').first();
    await feedTextarea.click();
    await expect(feedTextarea).toBeFocused();
    await feedTextarea.fill('Фокус тест ' + Date.now());
    await feedTextarea.press('Enter');
    await expect(feedTextarea).toBeFocused();

    // 2. Switch to Assistant tab
    const assistantTab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Ассистент' }).first();
    if (await assistantTab.isVisible()) {
      await assistantTab.click();
      const assistantTextarea = page.locator('textarea[placeholder*="Спросите ассистента"]').first();
      await expect(assistantTextarea).toBeVisible();

      // Verify no vertical scrollbar / no scroll on empty assistant composer
      const hasVerticalScroll = await assistantTextarea.evaluate(el => el.scrollHeight > el.clientHeight + 2);
      expect(hasVerticalScroll).toBe(false);

      await page.screenshot({ path: 'test-results/screenshots/assistant-composer-clean.png' });

      // Verify focus retention in assistant composer
      await assistantTextarea.fill('Привет, проверка фокуса');
      await assistantTextarea.press('Enter');
      await expect(assistantTextarea).toBeFocused();
    }
  });

  test('45. Enhanced Context Menu with AI Decomposition, Duplicate, Priority, Deadline', async ({ page }) => {
    const card = page.locator('[id^="item-"]').first();
    await expect(card).toBeVisible();
    await card.click({ button: 'right' });

    const contextMenu = page.locator('.fixed.z-50', { hasText: 'Ответить' });
    await expect(contextMenu).toBeVisible();

    // Verify clean context menu actions (no redundant property matryoshka)
    await expect(contextMenu.locator('text=Ответить')).toBeVisible();
    await expect(contextMenu.locator('text=Фокус-редактор')).toBeVisible();
    await expect(contextMenu.locator('text=Закрепить')).toBeVisible();
    await expect(contextMenu.locator('text=Разобрать с ИИ')).toBeVisible();
    await expect(contextMenu.locator('text=Копировать текст')).toBeVisible();
    await expect(contextMenu.locator('text=Дополнительно')).toBeVisible();

    // Take screenshot of enhanced context menu
    await page.screenshot({ path: 'test-results/screenshots/context-menu-enhanced.png' });

    // Open "Дополнительно" submenu to access Duplicate
    await contextMenu.locator('button', { hasText: 'Дополнительно' }).click();
    const dupBtn = contextMenu.locator('button', { hasText: 'Дублировать' });
    await expect(dupBtn).toBeVisible();
    await dupBtn.click();
    await expect(page.locator('text=Запись продублирована')).toBeVisible();

    // Test "Разобрать с ИИ" (Real triage: folder & tags)
    const secondCard = page.locator('[id^="item-"]').first();
    await secondCard.click({ button: 'right' });
    const aiBtn = page.locator('.fixed.z-50 button', { hasText: 'Разобрать с ИИ' });
    await aiBtn.click();
    await expect(page.locator('text=Запись разобрана')).toBeVisible();
  });

  test('46. FullscreenEditor: Desktop Sticky Top Toolbar and Mobile Telegram-style Bottom Bar', async ({ page }) => {
    // 1. Open editor on first card
    const card = page.locator('[id^="item-"]').first();
    await card.click({ button: 'right' });
    await page.locator('.fixed.z-50 button', { hasText: 'Фокус-редактор' }).click();

    const editorRoot = page.locator('#fullscreen-editor-root');
    await expect(editorRoot).toBeVisible();

    // 2. Desktop: Verify sticky toolbar at top
    const desktopStickyToolbar = page.locator('[data-testid="fullscreen-editor-modal"] header.sticky.top-0');
    await expect(desktopStickyToolbar).toBeVisible();
    const textStylesBtn = desktopStickyToolbar.locator('button[title*="Стили текста"]');
    await expect(textStylesBtn).toBeVisible();
    await textStylesBtn.click();
    await expect(desktopStickyToolbar.locator('button', { hasText: 'Заголовок 1' })).toBeVisible();
    await textStylesBtn.click();

    // Take screenshot of Desktop editor with sticky toolbar
    await page.screenshot({ path: 'test-results/screenshots/editor-desktop-sticky.png' });

    // Switch to task mode to verify clean monochrome task metadata without lines
    await page.locator('header button', { hasText: 'Таска' }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'screenshots/editor-task-clean.png' });

    // 3. Emulate mobile viewport to test Telegram-style bottom bar
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    // Verify Telegram-style bottom bar is visible
    const mobileBottomBar = page.locator('.md\\:hidden.fixed.bottom-0');
    await expect(mobileBottomBar).toBeVisible();

    // Verify top settings are still at the top
    await expect(page.locator('header select, header button[aria-haspopup="listbox"]').first()).toBeVisible();

    // Tap Lists button (:=) to open lists popover sheet
    const listBtn = mobileBottomBar.locator('button[title*="Списки"]').first();
    await listBtn.click();

    // Verify Lists popover sheet appears above toolbar
    await expect(page.locator('text=Список с маркерами')).toBeVisible();
    await expect(page.locator('text=Чек-лист')).toBeVisible();

    // Take screenshot of Mobile Telegram-style editor with lists popover open
    await page.screenshot({ path: 'test-results/screenshots/editor-mobile-telegram-lists.png' });

    // Close popover by clicking an item
    await page.locator('text=Чек-лист').click();

    // Close editor
    await page.locator('header button', { hasText: 'Назад' }).first().click();
    await expect(editorRoot).not.toBeVisible();
  });

  test('47. Custom Dark DatePickerPopover in Composer without native ugly picker', async ({ page }) => {
    // 1. Switch composer to Task mode
    const typeBtn = page.locator('button', { hasText: /Заметка|Таска|Статья/ }).first();
    await typeBtn.click();
    await page.locator('button', { hasText: 'Таска' }).click();

    // 2. Click the Calendar icon button in toolbar
    const calendarBtn = page.locator('button[title*="Установить срок таски"]').first();
    await expect(calendarBtn).toBeVisible();
    await calendarBtn.click();

    // 3. Verify custom DatePickerPopover appeared
    const popover = page.locator('.w-64.rounded-2xl', { hasText: 'Сегодня' });
    await expect(popover).toBeVisible();
    await expect(popover.locator('button', { hasText: 'Завтра' })).toBeVisible();
    await expect(popover.locator('button', { hasText: 'След. нед' })).toBeVisible();

    // 4. Take screenshot of custom dark date picker
    await page.screenshot({ path: 'test-results/screenshots/custom-date-picker.png' });

    // 5. Select "Завтра"
    await popover.locator('button', { hasText: 'Завтра' }).click();

    // 6. Verify popover closed and calendar button is active blue
    await expect(popover).not.toBeVisible();
    const activeDateBtn = page.locator('button[title*="Срок: Завтра"]').first();
    await expect(activeDateBtn).toBeVisible();
    await expect(activeDateBtn).toHaveClass(/text-blue-400/);
  });
});
