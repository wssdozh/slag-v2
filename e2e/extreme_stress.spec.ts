import { test, expect } from '@playwright/test';

test.describe('Extreme Torture & Memory Bloat Probe', () => {
  test('Push memory to absolute extreme: 500+ actions, analyze bloat causes and retention', async ({ page }) => {
    test.setTimeout(240000); // 4 minutes

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    async function getMetrics() {
      const res = await cdp.send('Performance.getMetrics');
      const map: Record<string, number> = {};
      for (const m of res.metrics) map[m.name] = m.value;
      return {
        usedHeapMB: Number(((map['JSHeapUsedSize'] || 0) / (1024 * 1024)).toFixed(2)),
        totalHeapMB: Number(((map['JSHeapTotalSize'] || 0) / (1024 * 1024)).toFixed(2)),
        domNodes: map['Nodes'] || 0,
        listeners: map['JSEventListeners'] || 0,
        layouts: map['LayoutCount'] || 0,
      };
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Baseline
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(400);
    const m0 = await getMetrics();
    console.log('\n[STAGE 0: Zero Baseline]', m0);

    // STAGE 1: Fast Note Creation (50 notes with rich text and tags)
    console.log('\n[STAGE 1] Creating 50 notes in rapid succession...');
    const composer = page.locator('main textarea').first();
    for (let i = 0; i < 50; i++) {
      if (await composer.isVisible()) {
        await composer.focus();
        await composer.fill(`Заметка #${i} для стресс-теста памяти #тест #сессия${i % 5}\nПодробный текст с разметкой **жирный** и [[Заметка 1]]: ${'текст для кучи '.repeat(15)}`);
        await page.keyboard.press('Control+Enter');
        await page.waitForTimeout(25);
      }
    }
    const m1 = await getMetrics();
    console.log('[STAGE 1 Done: 50 Notes Created]', m1);

    // STAGE 2: Extreme Feed Scroll (Scroll to top and bottom 60 times to force feed windowing & render churn)
    console.log('\n[STAGE 2] Executing 60 rapid full scroll cycles in feed...');
    for (let i = 0; i < 60; i++) {
      await page.evaluate((iter) => {
        const el = document.querySelector('main .overflow-y-auto, main, [data-feed-scroll="true"]') as HTMLElement | null;
        if (el) {
          el.scrollTop = iter % 2 === 0 ? el.scrollHeight : 0;
        }
      }, i);
      if (i % 15 === 0) await page.waitForTimeout(15);
    }
    const m2 = await getMetrics();
    console.log('[STAGE 2 Done: 60 Scroll Cycles]', m2);

    // STAGE 3: 50 Keystroke-by-keystroke Search Queries in SearchModal
    console.log('\n[STAGE 3] Executing 50 real keystroke searches in SearchModal...');
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyK' : 'Control+KeyK');
      await page.waitForTimeout(25);
      const searchInput = page.locator('input[placeholder*="Поиск"]').first();
      if (await searchInput.isVisible()) {
        // Fast sequential keystrokes without debounce
        await searchInput.pressSequentially(`тест ${i}`, { delay: 15 });
        await page.waitForTimeout(20);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(20);
    }
    const m3 = await getMetrics();
    console.log('[STAGE 3 Done: 30 Real Keystroke Searches]', m3);

    // STAGE 4: Rapid Folder & View Switching (60 times)
    console.log('\n[STAGE 4] Executing 60 rapid Folder & View switches...');
    // Scope to the feed: during an exit animation the closing dialog still owns matching
    // buttons for a frame, and a global match shifts the index onto a navigating row.
    const switchButtons = page.locator('main').locator('button:has-text("Все"), button:has-text("Заметки"), button:has-text("Таски"), button:has-text("Статьи"), button:has-text("Входящие")');
    const switchCount = await switchButtons.count();
    for (let i = 0; i < 60; i++) {
      if (switchCount > 0) {
        await switchButtons.nth(i % switchCount).click({ force: true }).catch(() => {});
      }
      if (i % 20 === 0) await page.waitForTimeout(15);
    }
    const m4 = await getMetrics();
    console.log('[STAGE 4 Done: 60 Folder & View Switches]', m4);

    // STAGE 5: 30 Wiki-link jumps & Highlight anims
    console.log('\n[STAGE 5] Executing 30 Wiki-link jumps...');
    const wikiLinks = page.locator('button[data-tag], span[data-wikilink]');
    const wikiCount = await wikiLinks.count();
    for (let i = 0; i < 30; i++) {
      if (wikiCount > 0) {
        await wikiLinks.nth(i % wikiCount).click({ force: true }).catch(() => {});
        await page.waitForTimeout(25);
      }
    }
    const m5 = await getMetrics();
    console.log('[STAGE 5 Done: 30 Wiki-link Jumps]', m5);

    // STAGE 6: Heavy Concurrent Orama & Fuzzy search queries
    console.log('\n[STAGE 6] Executing 60 concurrent Orama & Fuzzy search queries...');
    await page.evaluate(async () => {
      const { querySearch } = await import('/src/lib/searchService.ts');
      const mockItems: any[] = [];
      for (let j = 0; j < 80; j++) {
        mockItems.push({
          id: `bm25_heavy_${j}`,
          title: `Заметка высокой сложности ${j}`,
          content: `Текст статьи ${j} для детального поиска с ранжированием BM25 ${'длинноеслово '.repeat(30)}`,
          tags: ['stress', `tag_${j % 5}`],
          folder: j % 2 === 0 ? 'Входящие' : 'База знаний',
          createdAt: Date.now() - j * 1000,
          updatedAt: Date.now() - j * 1000,
        });
      }
      const queries = ['высокой', 'сложности', 'детального', 'ранжированием', 'несуществующий', 'статьи'];
      for (let k = 0; k < 60; k++) {
        await querySearch(queries[k % queries.length], mockItems);
      }
    });

    const peak = await getMetrics();
    console.log('\n[MAXIMUM STRAIN PEAK (BEFORE GC)]', peak);

    // Inspect memory objects in V8 heap
    const heapDiagnostics = await page.evaluate(() => {
      const perf = (window.performance as any).memory;
      return {
        usedHeapMB: perf ? (perf.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A',
        totalHeapMB: perf ? (perf.totalJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A',
        domElementsCount: document.querySelectorAll('*').length,
        sessionStorageLength: window.sessionStorage.length,
        localStorageLength: window.localStorage.length,
        sessionStorageKeys: Object.keys(window.sessionStorage),
        localStorageKeys: Object.keys(window.localStorage),
      };
    });
    console.log('\n[HEAP & STORAGE OBJECT DIAGNOSTICS]:', JSON.stringify(heapDiagnostics, null, 2));

    // Force GC twice to measure permanent retention vs temporary allocations
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(600);
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(400);

    const postGC = await getMetrics();
    console.log('\n[POST-GC RETENTION METRICS]:', postGC);

    console.log('\n======================================================');
    console.log('            DETAILED BLOAT ANALYSIS SCOREBOARD        ');
    console.log('======================================================');
    console.log(`0. Initial Zero Baseline:    Heap: ${m0.usedHeapMB} MB, DOM: ${m0.domNodes}, Listeners: ${m0.listeners}`);
    console.log(`1. After 50 Notes Created:   Heap: ${m1.usedHeapMB} MB, DOM: ${m1.domNodes}, Listeners: ${m1.listeners}`);
    console.log(`2. After 60 Feed Scrolls:    Heap: ${m2.usedHeapMB} MB, DOM: ${m2.domNodes}, Listeners: ${m2.listeners}`);
    console.log(`3. After 30 Keystroke Search: Heap: ${m3.usedHeapMB} MB, DOM: ${m3.domNodes}, Listeners: ${m3.listeners}`);
    console.log(`4. After 60 Folder Switches: Heap: ${m4.usedHeapMB} MB, DOM: ${m4.domNodes}, Listeners: ${m4.listeners}`);
    console.log(`5. After 30 Wiki-link Jumps: Heap: ${m5.usedHeapMB} MB, DOM: ${m5.domNodes}, Listeners: ${m5.listeners}`);
    console.log(`PEAK STRAIN:                 Heap: ${peak.usedHeapMB} MB (Delta: +${(peak.usedHeapMB - m0.usedHeapMB).toFixed(2)} MB), DOM: ${peak.domNodes}`);
    console.log(`POST-GC RETAINED:            Heap: ${postGC.usedHeapMB} MB (True Delta: +${(postGC.usedHeapMB - m0.usedHeapMB).toFixed(2)} MB), DOM: ${postGC.domNodes}`);
    console.log('======================================================\n');
  });
});
