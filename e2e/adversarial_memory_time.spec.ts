import { test, expect } from '@playwright/test';

/**
 * Adversarial memory & time.
 *
 * Что проверяем:
 * 1. `replaces` через реальный цикл ассистента: старая встреча получает `validTo`, живых — одна.
 * 2. Две встречи живут независимо; отмена одной не убивает вторую.
 * 3. TTL по типу: event 120 дней, note 180 дней, rule/pref не истекают.
 * 4. `isPinned` переживает любой TTL.
 * 5. Тип по умолчанию, когда модель не передала `kind`.
 * 6. Повтор той же фразы: merge, `mentions`, `updatedAt`/`createdAt`.
 * 7. «Встреча отменилась» без `replaces` — фиксируем фактическое поведение.
 * 8. Фильтры `selectMemory` по `kind` и `tag`.
 *
 * Время нигде не подменяется глобально: TTL-тесты передают явный `now` в чистые функции.
 */

const MEMORY_KEY = 'slag_memory_default_vault';
const DAY = 86_400_000;

const groqSettings = {
  sourceMode: 'byok',
  provider: 'groq',
  groqApiKey: 'gsk_test_key',
  model: 'openai/gpt-oss-120b',
  reasoningEffort: 'low',
  webSearchEnabled: false,
};

test.describe('adversarial memory & time', () => {
  test('1. replaces через тул: старая event получает validTo, живых одна', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));

    const requests: any[] = [];
    let toolArgs: Record<string, unknown> = {
      op: 'remember',
      text: 'завтра у меня встреча',
      kind: 'event',
    };

    await page.route('**/api.groq.com/**', async (route) => {
      const payload = JSON.parse(route.request().postData() || '{}');
      requests.push(payload);

      const isSecondRound = payload.messages.some((m: any) => m.role === 'tool');
      const body = isSecondRound
        ? {
            choices: [{ message: { role: 'assistant', content: 'Записал.' } }],
          }
        : {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_memory_1',
                      type: 'function',
                      function: { name: 'memory', arguments: JSON.stringify(toolArgs) },
                    },
                  ],
                },
              },
            ],
          };

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const first = await page.evaluate(async (settings) => {
      const { assistantOrchestrator } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
      const res = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'завтра у меня встреча' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings,
      } as any);
      return (res.toolCalls || []).map((tc) => ({ name: tc.name, args: tc.args, result: tc.result }));
    }, groqSettings as any);

    // тул реально сходил в модель и исполнился
    expect(first).toHaveLength(1);
    expect(first[0].name).toBe('memory');
    expect(first[0].result.status).toBe('created');
    expect(requests).toHaveLength(2);
    expect(requests[0].tools.some((t: any) => t.function?.name === 'memory')).toBe(true);

    const seeded = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || '[]'),
      MEMORY_KEY
    );
    expect(seeded).toHaveLength(1);
    expect(seeded[0].kind).toBe('event');
    expect(seeded[0].text).toBe('завтра у меня встреча');
    expect(first[0].result.id).toBe(seeded[0].id);

    const oldId = seeded[0].id as string;

    // Второй ход: отмена той же встречи через replaces, как это сделала бы модель.
    toolArgs = {
      op: 'remember',
      text: 'встреча отменилась',
      kind: 'event',
      replaces: oldId,
    };

    const second = await page.evaluate(async (settings) => {
      const { assistantOrchestrator } = await import(/* @vite-ignore */ '/src/lib/ai/orchestrator.ts');
      const res = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: 'встреча отменилась' }],
        currentFolder: 'Входящие',
        folders: [],
        allItems: [],
        settings,
      } as any);
      return (res.toolCalls || []).map((tc) => ({ name: tc.name, args: tc.args, result: tc.result }));
    }, groqSettings as any);

    expect(second).toHaveLength(1);
    expect(second[0].result.status).toBe('replaced');
    expect(second[0].result.replacedId).toBe(oldId);

    const state = await page.evaluate(
      async ({ key, now, oldId }) => {
        const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
        const all = memory.memoryService.all();
        const oldItem = all.find((item: { id: string }) => item.id === oldId);
        const live = all.filter((item: any) => memory.isLiveMemory(item, now));
        const selected = memory.selectMemory(all, { query: 'встреча' }, now);
        const recalled = memory.memoryService.recall({ query: 'встреча' });
        return {
          storageCount: JSON.parse(localStorage.getItem(key) || '[]').length,
          allCount: all.length,
          liveCount: live.length,
          liveTexts: live.map((item: { text: string }) => item.text),
          oldValidTo: oldItem?.validTo ?? null,
          oldSupersededBy: oldItem?.supersededBy ?? null,
          newId: all.find((item: any) => item.text === 'встреча отменилась')?.id ?? null,
          selectedTexts: selected.map((item: { text: string }) => item.text),
          recalledTexts: recalled.map((item: { text: string }) => item.text),
        };
      },
      { key: MEMORY_KEY, now: Date.now(), oldId }
    );

    // старая строка осталась в истории, но мертва
    expect(state.storageCount).toBe(2);
    expect(state.allCount).toBe(2);
    expect(state.liveCount).toBe(1);
    expect(state.liveTexts).toEqual(['встреча отменилась']);
    expect(state.oldValidTo).toBeGreaterThan(0);
    expect(state.oldSupersededBy).toBe(state.newId);

    // по «встреча» отдаётся только новая запись
    expect(state.selectedTexts).toEqual(['встреча отменилась']);
    expect(state.selectedTexts).not.toContain('завтра у меня встреча');
    expect(state.recalledTexts).toEqual(['встреча отменилась']);
  });

  test('2. две встречи независимы: отмена одной не убивает вторую', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const now = Date.now();

      const first = memory.applyRemember(
        [],
        { text: 'утром созвон с командой', kind: 'event' },
        [],
        now
      );
      if (!first) throw new Error('первая встреча не создалась');

      const both = memory.applyRemember(
        first.items,
        { text: 'вечером встреча с врачом', kind: 'event' },
        [],
        now + 1000
      );
      if (!both) throw new Error('вторая встреча не создалась');

      const beforeCancel = memory.selectMemory(both.items, {}, now + 1500);

      const cancelled = memory.applyRemember(
        both.items,
        { text: 'встреча с врачом отменилась', kind: 'event', replaces: both.item.id },
        [],
        now + 2000
      );
      if (!cancelled) throw new Error('отмена не применилась');

      const live = cancelled.items.filter((item: any) => memory.isLiveMemory(item, now + 2000));
      const cancelledItem = cancelled.items.find((item: any) => item.id === both.item.id);
      const firstItem = cancelled.items.find((item: any) => item.id === first.item.id);

      return {
        status: cancelled.status,
        count: cancelled.items.length,
        beforeCancelCount: beforeCancel.length,
        beforeCancelTexts: beforeCancel.map((item: { text: string }) => item.text),
        liveCount: live.length,
        liveTexts: live.map((item: { text: string }) => item.text),
        cancelledValidTo: cancelledItem?.validTo ?? null,
        cancelledSupersededBy: cancelledItem?.supersededBy ?? null,
        newId: cancelled.item.id,
        firstValidTo: firstItem?.validTo ?? null,
        firstLive: memory.isLiveMemory(firstItem, now + 2000),
        doctorQuery: memory
          .selectMemory(cancelled.items, { query: 'врач' }, now + 2000)
          .map((item: { text: string }) => item.text),
        callQuery: memory
          .selectMemory(cancelled.items, { query: 'созвон' }, now + 2000)
          .map((item: { text: string }) => item.text),
      };
    });

    // до отмены живы обе
    expect(result.beforeCancelCount).toBe(2);
    expect(result.beforeCancelTexts).toContain('утром созвон с командой');
    expect(result.beforeCancelTexts).toContain('вечером встреча с врачом');

    // отмена через replaces задела только вторую.
    // Строк в истории три: первая встреча, убитая вторая и новая запись об отмене.
    expect(result.status).toBe('replaced');
    expect(result.count).toBe(3);
    // Живых две: первая встреча и сама запись об отмене.
    expect(result.liveCount).toBe(2);
    expect(result.liveTexts).toContain('утром созвон с командой');
    expect(result.liveTexts).toContain('встреча с врачом отменилась');
    expect(result.liveTexts).not.toContain('вечером встреча с врачом');
    expect(result.cancelledValidTo).toBeGreaterThan(0);
    expect(result.cancelledSupersededBy).toBe(result.newId);

    // первая запись осталась живой и без validTo
    expect(result.firstValidTo).toBeNull();
    expect(result.firstLive).toBe(true);

    // мёртвая вторая не находится по своему слову, вместо неё — запись об отмене
    expect(result.doctorQuery).toEqual(['встреча с врачом отменилась']);
    expect(result.doctorQuery).not.toContain('вечером встреча с врачом');
    expect(result.callQuery).toEqual(['утром созвон с командой']);
  });

  test('3. TTL: event 200 дней и note 200 дней мертвы, rule/pref 400 дней живы, в all() все', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(
      async ({ key, day }) => {
        const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
        const now = Date.now();

        await memory.memoryService.remember({ text: 'завтра у меня встреча', kind: 'event' });
        await memory.memoryService.remember({ text: 'купить молоко', kind: 'note' });
        await memory.memoryService.remember({ text: 'пиши коротко', kind: 'rule' });
        await memory.memoryService.remember({ text: 'любит тёмную тему', kind: 'pref' });

        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        const shifted = raw.map((item: any) => ({
          ...item,
          updatedAt:
            item.kind === 'event' || item.kind === 'note'
              ? now - 200 * day
              : now - 400 * day,
        }));
        localStorage.setItem(key, JSON.stringify(shifted));

        const all = memory.memoryService.all();
        const pick = (kind: string) => all.find((item: any) => item.kind === kind);
        const event = pick('event');
        const note = pick('note');
        const rule = pick('rule');
        const pref = pick('pref');

        return {
          allCount: all.length,
          allKinds: all.map((item: { kind: string }) => item.kind).sort(),
          eventLive: memory.isLiveMemory(event, now),
          eventSelected: memory
            .selectMemory(all, { query: 'встреча' }, now)
            .map((item: { text: string }) => item.text),
          noteLive: memory.isLiveMemory(note, now),
          noteSelected: memory
            .selectMemory(all, { query: 'молоко' }, now)
            .map((item: { text: string }) => item.text),
          ruleLive: memory.isLiveMemory(rule, now),
          ruleSelected: memory
            .selectMemory(all, { query: 'коротко' }, now)
            .map((item: { text: string }) => item.text),
          prefLive: memory.isLiveMemory(pref, now),
          prefSelected: memory
            .selectMemory(all, { query: 'тёмную' }, now)
            .map((item: { text: string }) => item.text),
        };
      },
      { key: MEMORY_KEY, day: DAY }
    );

    // в хранилище остались все четыре: all() не прячет протухшие
    expect(result.allCount).toBe(4);
    expect(result.allKinds).toEqual(['event', 'note', 'pref', 'rule']);

    // event 120 дней < 200 → мёртв
    expect(result.eventLive).toBe(false);
    expect(result.eventSelected).toEqual([]);

    // note 180 дней < 200 → мёртв
    expect(result.noteLive).toBe(false);
    expect(result.noteSelected).toEqual([]);

    // rule/pref не истекают и на 400 днях
    expect(result.ruleLive).toBe(true);
    expect(result.ruleSelected).toEqual(['пиши коротко']);
    expect(result.prefLive).toBe(true);
    expect(result.prefSelected).toEqual(['любит тёмную тему']);
  });

  test('4. isPinned переживает 400 дней, непинованная event — нет', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(
      async ({ key, day }) => {
        const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
        const now = Date.now();

        await memory.memoryService.remember({ text: 'встреча с врачом', kind: 'event' });
        await memory.memoryService.remember({ text: 'созвон с командой', kind: 'event' });

        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        const shifted = raw.map((item: any) => ({
          ...item,
          isPinned: item.text === 'встреча с врачом',
          updatedAt: now - 400 * day,
        }));
        localStorage.setItem(key, JSON.stringify(shifted));

        const all = memory.memoryService.all();
        const pinned = all.find((item: any) => item.text === 'встреча с врачом');
        const control = all.find((item: any) => item.text === 'созвон с командой');

        return {
          allCount: all.length,
          pinnedFlag: pinned?.isPinned ?? null,
          pinnedLive: memory.isLiveMemory(pinned, now),
          pinnedSelected: memory
            .selectMemory(all, { query: 'врач' }, now)
            .map((item: { text: string }) => item.text),
          controlLive: memory.isLiveMemory(control, now),
          controlSelected: memory
            .selectMemory(all, { query: 'созвон' }, now)
            .map((item: { text: string }) => item.text),
          allLive: memory.selectMemory(all, {}, now).map((item: { text: string }) => item.text),
        };
      },
      { key: MEMORY_KEY, day: DAY }
    );

    expect(result.allCount).toBe(2);
    expect(result.pinnedFlag).toBe(true);
    expect(result.pinnedLive).toBe(true);
    expect(result.pinnedSelected).toEqual(['встреча с врачом']);

    // контроль: та же 400-дневная event без пина мертва.
    // Внимание: пин всегда попадает в выдачу, даже без совпадения по словам,
    // поэтому в controlSelected законно висит закреплённая «встреча с врачом».
    expect(result.controlLive).toBe(false);
    expect(result.controlSelected).toContain('встреча с врачом');
    expect(result.controlSelected).not.toContain('созвон с командой');
    expect(result.allLive).toEqual(['встреча с врачом']);
  });

  test('5. remember без kind: тип по умолчанию', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const created = memory.applyRemember([], { text: 'завтра встреча' }, [], Date.now());
      if (!created) throw new Error('факт не создался');
      return {
        kind: created.item.kind,
        status: created.status,
        importance: created.item.importance,
        normalized: created.item.normalized,
      };
    });

    // ожидание задачи: без kind получается note
    expect(result.status).toBe('created');
    expect(result.kind).toBe('note');
    // importance не передан → clampImportance даёт 3; пол для note — 2, значит остаётся 3
    expect(result.importance).toBe(3);
    expect(result.normalized).toContain('встреч');
  });

  test('6. повтор той же фразы через день: merge, mentions 2, updatedAt сдвинут, createdAt нет', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(
      async (day) => {
        const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
        const now = Date.now();

        const first = memory.applyRemember(
          [],
          { text: 'завтра у меня встреча', kind: 'event' },
          [],
          now
        );
        const second = memory.applyRemember(
          first.items,
          { text: 'завтра у меня встреча', kind: 'event' },
          [],
          now + day
        );

        const merged = second.items.find((item: any) => item.id === first.item.id);
        return {
          status: second.status,
          count: second.items.length,
          mentions: merged?.mentions ?? null,
          createdAt: merged?.createdAt ?? null,
          updatedAt: merged?.updatedAt ?? null,
          firstCreatedAt: first.item.createdAt,
          id: merged?.id ?? null,
          firstId: first.item.id,
          now,
          nowPlusDay: now + day,
        };
      },
      DAY
    );

    expect(result.status).toBe('merged');
    expect(result.count).toBe(1);
    expect(result.mentions).toBe(2);
    expect(result.id).toBe(result.firstId);
    expect(result.createdAt).toBe(result.firstCreatedAt);
    expect(result.createdAt).toBe(result.now);
    expect(result.updatedAt).toBe(result.nowPlusDay);
  });

  test('7. отмена без replaces: фиксируем фактическое поведение', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const now = Date.now();

      const first = memory.applyRemember(
        [],
        { text: 'завтра у меня встреча', kind: 'event' },
        [],
        now
      );
      const second = memory.applyRemember(
        first.items,
        { text: 'встреча отменилась', kind: 'event' },
        [],
        now + 1000
      );

      const live = second.items.filter((item: any) => memory.isLiveMemory(item, now + 1000));
      return {
        status: second.status,
        count: second.items.length,
        liveCount: live.length,
        liveTexts: live.map((item: { text: string }) => item.text),
        texts: second.items.map((item: { text: string }) => item.text),
        selected: memory
          .selectMemory(second.items, { query: 'встреча' }, now + 1000)
          .map((item: { text: string }) => item.text),
      };
    });

    // Факт: без подсказки модели это две независимые живые записи, старую никто не гасит.
    expect(result.status).toBe('created');
    expect(result.count).toBe(2);
    expect(result.liveCount).toBe(2);
    expect(result.liveTexts).toContain('завтра у меня встреча');
    expect(result.liveTexts).toContain('встреча отменилась');
    expect(result.selected).toEqual(
      expect.arrayContaining(['завтра у меня встреча', 'встреча отменилась'])
    );
  });

  test('8. selectMemory: kind=event только события, tag-фильтр работает', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('slag_memory_default_vault'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const memory = await import(/* @vite-ignore */ '/src/lib/memory.ts');
      const now = Date.now();
      const vocabulary = ['работа', 'здоровье', 'быт'];

      const first = memory.applyRemember(
        [],
        { text: 'утром созвон с командой', kind: 'event', tag: 'Работа' },
        vocabulary,
        now
      );
      const second = memory.applyRemember(
        first.items,
        { text: 'вечером встреча с врачом', kind: 'event', tag: 'Здоровье' },
        vocabulary,
        now + 1
      );
      const third = memory.applyRemember(
        second.items,
        { text: 'купить молоко', kind: 'note', tag: 'Быт' },
        vocabulary,
        now + 2
      );
      const fourth = memory.applyRemember(
        third.items,
        { text: 'пиши коротко', kind: 'rule' },
        vocabulary,
        now + 3
      );

      const events = memory.selectMemory(fourth.items, { kind: 'event' }, now + 10);
      return {
        count: fourth.items.length,
        tags: fourth.items.map((item: { tag: string | null }) => item.tag),
        eventsCount: events.length,
        eventKinds: events.map((item: { kind: string }) => item.kind),
        eventTexts: events.map((item: { text: string }) => item.text),
        work: memory
          .selectMemory(fourth.items, { kind: 'event', tag: 'работа' }, now + 10)
          .map((item: { text: string }) => item.text),
        health: memory
          .selectMemory(fourth.items, { tag: 'здоровье' }, now + 10)
          .map((item: { text: string }) => item.text),
        home: memory
          .selectMemory(fourth.items, { tag: 'быт' }, now + 10)
          .map((item: { text: string }) => item.text),
        noSuch: memory.selectMemory(fourth.items, { tag: 'нет-такого' }, now + 10).length,
      };
    });

    expect(result.count).toBe(4);
    expect(result.tags).toEqual(['работа', 'здоровье', 'быт', null]);

    // kind=event отдаёт ровно две event-записи
    expect(result.eventsCount).toBe(2);
    expect(result.eventKinds).toEqual(['event', 'event']);
    expect(result.eventTexts).toContain('утром созвон с командой');
    expect(result.eventTexts).toContain('вечером встреча с врачом');

    // tag сужает и комбинируется с kind
    expect(result.work).toEqual(['утром созвон с командой']);
    expect(result.health).toEqual(['вечером встреча с врачом']);
    expect(result.home).toEqual(['купить молоко']);
    expect(result.noSuch).toBe(0);
  });
});
