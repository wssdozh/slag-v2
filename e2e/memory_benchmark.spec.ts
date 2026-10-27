import { test, expect } from '@playwright/test';

test.describe('SLAG v2 Memory & Performance Benchmark', () => {
  test('Capture Baseline Memory, Idle CPU Activity, and Input Latency', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // 1. Initial Heap & DOM nodes
    const baseline = await page.evaluate(() => {
      const perf = (window.performance as any).memory;
      return {
        usedJSHeapMB: perf ? Number((perf.usedJSHeapSize / 1024 / 1024).toFixed(2)) : null,
        totalJSHeapMB: perf ? Number((perf.totalJSHeapSize / 1024 / 1024).toFixed(2)) : null,
        domNodes: document.querySelectorAll('*').length,
      };
    });

    // 2. Idle Animation Frame Rate
    const rafCountInIdle = await page.evaluate(async () => {
      let count = 0;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const loop = () => {
          count++;
          if (performance.now() - start < 1000) {
            requestAnimationFrame(loop);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(loop);
      });
      return count;
    });

    // 3. Fast Typing Latency test (simulate 50 keystrokes in composer)
    const typingMetrics = await page.evaluate(async () => {
      const textarea = document.querySelector('main textarea') as HTMLTextAreaElement | null;
      if (!textarea) return { error: 'no textarea' };

      const latencies: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        textarea.value = `Срочная заметка для замера производительности #${i} test`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const t1 = performance.now();
        latencies.push(t1 - t0);
        await new Promise((r) => setTimeout(r, 10));
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      return {
        avgLatencyMs: Number(avgLatency.toFixed(2)),
        maxLatencyMs: Number(maxLatency.toFixed(2)),
      };
    });

    // 4. Search debouncing verification
    const searchSpikeMetrics = await page.evaluate(async () => {
      const { initSearchIndex } = await import('/src/lib/searchService.ts');
      const startMem = (window.performance as any).memory?.usedJSHeapSize || 0;

      // Burst 10 rapid concurrent re-indexes
      const mockItems: any[] = [];
      for (let i = 0; i < 40; i++) {
        mockItems.push({
          id: `burst_${i}`,
          title: `Заметка #${i}`,
          content: `Текст заметки #${i}`,
          folder: 'Входящие',
          tags: ['test'],
          createdAt: Date.now() - i * 1000,
          updatedAt: Date.now() - i * 1000,
        });
      }

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(initSearchIndex(mockItems));
      }
      await Promise.all(promises);

      const endMem = (window.performance as any).memory?.usedJSHeapSize || 0;
      return {
        heapDeltaMB: Number(((endMem - startMem) / 1024 / 1024).toFixed(2)),
      };
    });

    console.log('=== BENCHMARK AFTER OPTIMIZATION ===');
    console.log('Heap & DOM:', JSON.stringify(baseline, null, 2));
    console.log('Idle RAF count in 1 sec:', rafCountInIdle);
    console.log('Typing Latency:', JSON.stringify(typingMetrics, null, 2));
    console.log('Search Burst Delta MB:', searchSpikeMetrics.heapDeltaMB);

    expect(baseline.domNodes).toBeGreaterThan(0);
    expect(typingMetrics.avgLatencyMs).toBeLessThan(5);
  });
});
