import { test, expect, type Page } from '@playwright/test';

/**
 * Adversarial edges of assistant memory — the input shapes the model never produces but a
 * user can: blank text, a stop-word-only sentence, a 600-character dump, importance 0/-3/NaN/'5',
 * an invented kind, topic spellings that must collapse into one, a hundred identical writes,
 * a 600-fact storm against the 500-row limit, an XSS payload rendered in the settings panel,
 * a reload, and forget by id and by inflected text.
 *
 * Only observable behaviour is asserted here. Nothing in src/ is changed by this file.
 */

const MEMORY_KEY = 'slag_memory_default_vault';

/**
 * A clean vault before the first paint. The init script runs before *every* navigation, so a
 * test that reloads must not use it — it would wipe the facts it is about to verify.
 */
async function cleanStart(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
}

/**
 * Runs an evaluate that imports `memory.ts`, retrying once if the execution context died.
 * The first import of a module branch makes Vite optimize its dependencies and reload every
 * open page; a sibling process touching src/ triggers the same reload. Neither is a memory
 * bug, so only "context destroyed by navigation" is retried.
 */
async function memoryEval<A, T>(page: Page, body: (arg: A) => Promise<T>, arg: A): Promise<T> {
  try {
    return await page.evaluate(body, arg);
  } catch (error) {
    if (!/Execution context was destroyed|navigated/i.test(String(error))) throw error;
    await page.waitForLoadState('domcontentloaded');
    return page.evaluate(body, arg);
  }
}

test.describe('adversarial memory edges', () => {
  test('1. пустой текст и только стоп-слова не создают запись', async ({ page }) => {
    // первый в файле: платит холодную трансформацию всего графа Vite (~80s) плюс ретрай
    // после перезагрузки от оптимизатора, поэтому запас по таймауту больше обычного
    test.slow();
    await cleanStart(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async (key) => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const blank = memoryService.remember({ text: '   ' });
      // «не» больше не стоп-слово в памяти, но одна негация без объекта фактом не становится
      const stops = memoryService.remember({ text: 'не и в на' });
      const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
      return {
        blankIsNull: blank === null,
        stopsIsNull: stops === null,
        live: memoryService.all().length,
        raw: raw.length,
      };
    }, MEMORY_KEY);

    expect(result.blankIsNull).toBe(true);
    expect(result.stopsIsNull).toBe(true);
    expect(result.live).toBe(0);
    expect(result.raw).toBe(0);
  });

  test('2. текст обрезается до 200 символов', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async () => {
      const { applyRemember } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const source = 'слово '.repeat(100);
      const trimmed = applyRemember([], { text: source }, []);
      return {
        sourceLength: source.trim().length,
        created: trimmed !== null,
        storedLength: trimmed?.item.text.length ?? -1,
        lastCharIsSpace: (trimmed?.item.text ?? '').endsWith(' '),
      };
    }, undefined);

    expect(result.created).toBe(true);
    expect(result.sourceLength).toBe(599);
    expect(result.storedLength).toBe(200);
    // резка идёт по символам, а не по словам: хвост может быть частью слова
    expect(result.lastCharIsSpace).toBe(false);
  });

  test('3. importance зажат 1..5 и поднят до пола типа', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const values = await memoryEval(page, async () => {
      const { applyRemember } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const importanceOf = (kind: string, importance: unknown) => {
        const result = applyRemember([], { text: `проверка важности ${kind}`, kind, importance }, []);
        return result?.item.importance ?? null;
      };
      return {
        ruleZero: importanceOf('rule', 0),
        ruleNine: importanceOf('rule', 9),
        ruleNegative: importanceOf('rule', -3),
        ruleNaN: importanceOf('rule', Number.NaN),
        ruleString: importanceOf('rule', '5'),
        noteZero: importanceOf('note', 0),
        noteNine: importanceOf('note', 9),
        noteNegative: importanceOf('note', -3),
        noteNaN: importanceOf('note', Number.NaN),
        noteString: importanceOf('note', '5'),
      };
    }, undefined);

    // низ поднят до пола: правило — 4, заметка — 2
    expect(values.ruleZero).toBe(4);
    expect(values.ruleNegative).toBe(4);
    expect(values.noteZero).toBe(2);
    expect(values.noteNegative).toBe(2);
    // верх зажат пятёркой
    expect(values.ruleNine).toBe(5);
    expect(values.noteNine).toBe(5);
    expect(values.noteString).toBe(5);
    // NaN уходит в дефолт 3, а потом поднимается до пола типа
    expect(values.ruleNaN).toBe(4);
    expect(values.noteNaN).toBe(3);
    expect(values.ruleString).toBe(5);
  });

  test('4. неизвестный kind сохраняется как note', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async () => {
      const { applyRemember } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const created = applyRemember([], { text: 'любит акварель', kind: 'hobby' }, []);
      return {
        kind: created?.item.kind ?? null,
        text: created?.item.text ?? null,
        // importance не передан вовсе: дефолт 3, пол заметки ниже него
        importance: created?.item.importance ?? null,
      };
    }, undefined);

    expect(result.kind).toBe('note');
    expect(result.text).toBe('любит акварель');
    expect(result.importance).toBe(3);
  });

  test('5. три написания темы дают один тег, стоп-тег не проходит', async ({ page }) => {
    await cleanStart(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async (key) => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      memoryService.remember({ text: 'первый факт про работу', tag: 'Работа' });
      memoryService.remember({ text: 'второй факт про работу', tag: '#работа' });
      memoryService.remember({ text: 'третий факт про работу', tag: 'РАБОТА' });
      memoryService.remember({ text: 'четвёртый факт без темы', tag: 'заметка' });
      const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
      return { count: raw.length, tags: raw.map((item: { tag: string | null }) => item.tag) };
    }, MEMORY_KEY);

    expect(result.count).toBe(4);
    expect(result.tags.slice(0, 3)).toEqual(['работа', 'работа', 'работа']);
    expect(result.tags[3]).toBe(null);
  });

  test('6. сто одинаковых записей — одна строка и mentions 100', async ({ page }) => {
    await cleanStart(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async (key) => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      for (let index = 0; index < 100; index += 1) {
        memoryService.remember({ text: 'пиши коротко, без вступлений', kind: 'rule' });
      }
      const live = memoryService.all();
      return {
        live: live.length,
        mentions: live[0]?.mentions ?? null,
        raw: JSON.parse(localStorage.getItem(key) ?? '[]').length,
      };
    }, MEMORY_KEY);

    expect(result.live).toBe(1);
    expect(result.mentions).toBe(100);
    expect(result.raw).toBe(1);
  });

  test('7. 600 фактов упираются в лимит 500, закреплённый выживает', async ({ page }) => {
    await cleanStart(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async (key) => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const now = Date.now();
      const pinned = {
        id: 'm_pinned_seed',
        text: 'закреплённый факт',
        normalized: 'закреплённ факт',
        kind: 'fact',
        tag: null,
        importance: 5,
        mentions: 1,
        usedCount: 0,
        createdAt: now,
        updatedAt: now,
        usedAt: now,
        isPinned: true,
      };
      localStorage.setItem(key, JSON.stringify([pinned]));

      // «1q», «2q», … уникальны по нормализованному тексту: числа короче двух символов
      // нормализатор выбрасывает, и без суффикса индексы 1..9 слились бы в одну запись.
      for (let index = 1; index <= 600; index += 1) {
        memoryService.remember({ text: `факт ${index}q из проверки лимита`, kind: 'fact' });
      }

      const live = memoryService.all();
      return {
        live: live.length,
        raw: JSON.parse(localStorage.getItem(key) ?? '[]').length,
        pinnedAlive: live.some((item: { id: string; isPinned: boolean }) => item.id === 'm_pinned_seed' && item.isPinned),
        newestAlive: live.some((item: { text: string }) => item.text === 'факт 600q из проверки лимита'),
      };
    }, MEMORY_KEY);

    expect(result.raw).toBeLessThanOrEqual(500);
    expect(result.live).toBeLessThanOrEqual(500);
    expect(result.pinnedAlive).toBe(true);
    expect(result.newestAlive).toBe(true);
  });

  test('8. XSS-текст в панели памяти остаётся текстом', async ({ page }) => {
    await cleanStart(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const payload = '<img src=x onerror=alert(1)>';
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await memoryEval(page, async (text) => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      memoryService.remember({ text, kind: 'note' });
    }, payload);

    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.text ?? null, MEMORY_KEY);
    expect(stored).toBe(payload);

    await page.locator('button[title*="Настройки"]').first().click();
    const modal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(modal).toBeVisible();
    await modal.locator('button', { hasText: 'ИИ & Провайдеры' }).first().click();

    await expect(modal.locator('text=Память ассистента')).toBeVisible();
    const row = modal.locator('[data-testid^="memory-item-"]');
    await expect(row).toHaveCount(1);
    await row.scrollIntoViewIfNeeded();

    // текст отрисован как символы, а не как узел
    await expect(row).toContainText(payload);
    expect(await modal.locator('img[src="x"]').count()).toBe(0);
    expect(await row.locator('img').count()).toBe(0);
    // и alert не сработал
    expect(dialogs).toEqual([]);
  });

  test('9. три факта переживают перезагрузку', async ({ page }) => {
    // без cleanStart: init script выполнится и после reload, снеся только что записанное
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const written = await memoryEval(page, async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      memoryService.remember({ text: 'первый факт переживает перезагрузку' });
      memoryService.remember({ text: 'второй факт переживает перезагрузку' });
      memoryService.remember({ text: 'третий факт переживает перезагрузку' });
      return memoryService.all().length;
    }, undefined);
    expect(written).toBe(3);

    await page.reload({ waitUntil: 'domcontentloaded' });

    const afterReload = await memoryEval(page, async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      return { live: memoryService.all().length, texts: memoryService.all().map((item: { text: string }) => item.text) };
    }, undefined);

    expect(afterReload.live).toBe(3);
    expect(afterReload.texts).toContain('третий факт переживает перезагрузку');
  });

  test('10. forget: по id один раз, по тексту в другом падеже', async ({ page }) => {
    await cleanStart(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await memoryEval(page, async () => {
      const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');

      // один факт уходит по id, другой — по тексту в другом падеже
      const byIdFact = memoryService.remember({ text: 'работает по ночам', kind: 'fact' });
      const id = byIdFact?.item.id ?? '';
      const firstForget = memoryService.forget(id);
      const secondForget = memoryService.forget(id);

      memoryService.remember({ text: 'не любит созвон-митинги до полудня', kind: 'pref' });
      // другой падеж и другой регистр: «созвон митинга» вместо «созвон-митинги»
      const byTextForget = memoryService.forget('НЕ ЛЮБИТ СОЗВОН МИТИНГА ДО ПОЛУДНЯ');

      return {
        id,
        firstForget,
        secondForget,
        byTextForget,
        left: memoryService.all().map((item: { text: string }) => item.text),
      };
    }, undefined);

    expect(result.id).not.toBe('');
    expect(result.firstForget).toBe(true);
    expect(result.secondForget).toBe(false);
    expect(result.byTextForget).toBe(true);
    expect(result.left).toEqual([]);

    const raw = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), MEMORY_KEY);
    // забытое лежит надгробием, а не стирается: так удаление доезжает до других устройств
    expect(raw).toHaveLength(2);
    expect(raw.every((item: { deletedAt?: number }) => typeof item.deletedAt === 'number')).toBe(true);
  });
});
