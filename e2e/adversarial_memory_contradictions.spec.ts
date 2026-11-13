import { test, expect, type Page } from '@playwright/test';

/**
 * Адверсариальная проверка памяти ассистента: противоречия, негация и границы.
 *
 * Каждый тест начинается с пустой памяти: ключ `slag_memory_default_vault` стирается
 * до загрузки приложения. Записи идут через настоящий цикл ассистента и тул `memory`,
 * а не через прямой вызов memoryService: так проверяется и проводка tools.ts.
 *
 * Test 4 намеренно падает, если негация теряется при дедупе: «люблю рыбу» и
 * «не люблю рыбу» не должны схлопываться в одну живую запись.
 */

const MEMORY_KEY = 'slag_memory_default_vault';

const groqSettings = {
  sourceMode: 'byok',
  provider: 'groq',
  groqApiKey: 'gsk_test_key',
  model: 'openai/gpt-oss-120b',
  reasoningEffort: 'low',
  webSearchEnabled: false,
};

interface MemoryArgs {
  op: 'remember' | 'forget' | 'recall';
  text?: string;
  id?: string;
  kind?: string;
  tag?: string;
  importance?: number;
  replaces?: string;
}

interface StoredMemory {
  id: string;
  text: string;
  normalized: string;
  kind: string;
  tag: string | null;
  importance: number;
  mentions: number;
  usedCount: number;
  createdAt: number;
  updatedAt: number;
  usedAt: number;
  isPinned: boolean;
  validTo?: number;
  supersededBy?: string;
  deletedAt?: number;
}

interface MemoryToolDriver {
  queue: MemoryArgs[];
  requests: Array<Record<string, unknown>>;
  run: (args: MemoryArgs, userText: string) => Promise<void>;
}

function isLive(item: StoredMemory): boolean {
  return !item.deletedAt && !item.validTo;
}

/**
 * Подменяет Groq: каждый запрос без role:'tool' отдаёт следующий тул-вызов из очереди,
 * запрос с role:'tool' получает финальный ответ. Очередь пополняется перед runChat.
 */
async function installMemoryTool(page: Page): Promise<MemoryToolDriver> {
  const queue: MemoryArgs[] = [];
  const requests: Array<Record<string, unknown>> = [];

  await page.route('**/api.groq.com/**', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}') as {
      messages?: Array<{ role?: string }>;
    };
    requests.push(payload as unknown as Record<string, unknown>);

    const isToolResult = Boolean(payload.messages?.some((message) => message.role === 'tool'));
    const args = isToolResult ? undefined : queue.shift();

    if (!args) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ок' } }] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: `call_memory_${requests.length}`,
                  type: 'function',
                  function: {
                    name: 'memory',
                    arguments: JSON.stringify(args),
                  },
                },
              ],
            },
          },
        ],
      }),
    });
  });

  const run = async (args: MemoryArgs, userText: string): Promise<void> => {
    queue.push(args);
    await page.evaluate(
      async ({ settings, content }) => {
        const { assistantOrchestrator } = await import(
          /* @vite-ignore */ '/src/lib/ai/orchestrator.ts'
        );
        await assistantOrchestrator.runChat({
          messages: [{ role: 'user', content }],
          currentFolder: 'Входящие',
          folders: [],
          allItems: [],
          settings,
        } as any);
      },
      { settings: groqSettings, content: userText }
    );
  };

  return { queue, requests, run };
}

/** Чистая память до загрузки приложения + реальный маунт UI. */
async function openWithCleanMemory(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    localStorage.removeItem(key);
  }, MEMORY_KEY);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });
}

async function readStored(page: Page): Promise<StoredMemory[]> {
  return page.evaluate((key: string) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  }, MEMORY_KEY);
}

async function selectTexts(
  page: Page,
  query: string
): Promise<Array<{ id: string; text: string; normalized: string }>> {
  return page.evaluate(async (q: string) => {
    const { selectMemory } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
    const items: StoredMemory[] = JSON.parse(localStorage.getItem('slag_memory_default_vault') || '[]');
    return selectMemory(items, { query: q, limit: 10 }).map((item) => ({
      id: item.id,
      text: item.text,
      normalized: item.normalized,
    }));
  }, query);
}

async function forPromptTexts(
  page: Page,
  query: string
): Promise<Array<{ id: string; text: string; normalized: string }>> {
  return page.evaluate(async (q: string) => {
    const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');
    return memoryService.forPrompt(q).map((item) => ({
      id: item.id,
      text: item.text,
      normalized: item.normalized,
    }));
  }, query);
}

test.describe('assistant memory: противоречия и негация', () => {
  test('1. «не люблю холодец» и «люблю желе» — две отдельные записи, поиск не путает', async ({ page }) => {
    await openWithCleanMemory(page);
    const memory = await installMemoryTool(page);

    await memory.run(
      { op: 'remember', text: 'не люблю холодец', kind: 'pref' },
      'запомни: не люблю холодец'
    );

    const afterFirst = await readStored(page);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].text).toBe('не люблю холодец');
    expect(afterFirst[0].kind).toBe('pref');
    expect(afterFirst[0].mentions).toBe(1);

    await memory.run(
      { op: 'remember', text: 'люблю желе', kind: 'pref' },
      'запомни: люблю желе'
    );

    const afterSecond = await readStored(page);
    expect(afterSecond).toHaveLength(2);
    expect(afterSecond.map((item) => item.text).sort()).toEqual(['люблю желе', 'не люблю холодец']);
    expect(afterSecond.every((item) => item.mentions === 1)).toBe(true);
    expect(new Set(afterSecond.map((item) => item.id)).size).toBe(2);
    expect(afterSecond.every(isLive)).toBe(true);
    expect(afterSecond[0].normalized).not.toBe(afterSecond[1].normalized);

    const selected = await selectTexts(page, 'холодец');
    expect(selected).toHaveLength(1);
    expect(selected[0].text).toBe('не люблю холодец');
  });

  test('2. «не люблю рыбу с костями» и «люблю суши» не слипаются', async ({ page }) => {
    await openWithCleanMemory(page);
    const memory = await installMemoryTool(page);

    await memory.run(
      { op: 'remember', text: 'не люблю рыбу с костями', kind: 'pref' },
      'запомни: не люблю рыбу с костями'
    );
    await memory.run(
      { op: 'remember', text: 'люблю суши', kind: 'pref' },
      'запомни: люблю суши'
    );

    const stored = await readStored(page);
    expect(stored).toHaveLength(2);
    expect(stored.map((item) => item.text).sort()).toEqual([
      'люблю суши',
      'не люблю рыбу с костями',
    ]);
    expect(stored.every((item) => item.mentions === 1)).toBe(true);
    expect(new Set(stored.map((item) => item.normalized)).size).toBe(2);

    const fish = await selectTexts(page, 'рыба');
    expect(fish.map((item) => item.text)).toEqual(['не люблю рыбу с костями']);
    const sushi = await selectTexts(page, 'суши');
    expect(sushi.map((item) => item.text)).toEqual(['люблю суши']);
  });

  test('3. replaces вытесняет старую запись: validTo, supersededBy, 2 живых', async ({ page }) => {
    await openWithCleanMemory(page);
    const memory = await installMemoryTool(page);

    await memory.run(
      { op: 'remember', text: 'не люблю холодец', kind: 'pref' },
      'запомни: не люблю холодец'
    );
    await memory.run(
      { op: 'remember', text: 'люблю желе', kind: 'pref' },
      'запомни: люблю желе'
    );

    const beforeReplace = await readStored(page);
    expect(beforeReplace).toHaveLength(2);
    const oldItem = beforeReplace.find((item) => item.text === 'не люблю холодец');
    const otherItem = beforeReplace.find((item) => item.text === 'люблю желе');
    expect(oldItem).toBeTruthy();
    expect(otherItem).toBeTruthy();

    await memory.run(
      {
        op: 'remember',
        text: 'на самом деле люблю холодец',
        kind: 'pref',
        replaces: oldItem!.id,
      },
      'на самом деле люблю холодец'
    );

    const stored = await readStored(page);
    expect(stored).toHaveLength(3);

    const superseded = stored.find((item) => item.id === oldItem!.id);
    const replacement = stored.find((item) => item.text === 'на самом деле люблю холодец');
    expect(superseded).toBeTruthy();
    expect(replacement).toBeTruthy();
    expect(superseded!.validTo).toBeGreaterThan(0);
    expect(superseded!.supersededBy).toBe(replacement!.id);

    const live = stored.filter(isLive);
    expect(live).toHaveLength(2);
    expect(live.map((item) => item.id).sort()).toEqual([otherItem!.id, replacement!.id].sort());

    const selected = await selectTexts(page, 'холодец');
    expect(selected.map((item) => item.id)).toEqual([replacement!.id]);
    expect(selected.map((item) => item.text)).not.toContain('не люблю холодец');
  });

  test('4. ГЛАВНОЕ: «люблю рыбу» и «не люблю рыбу» — разные факты, негация не теряется', async ({ page }) => {
    await openWithCleanMemory(page);
    const memory = await installMemoryTool(page);

    await memory.run(
      { op: 'remember', text: 'люблю рыбу', kind: 'pref' },
      'запомни: люблю рыбу'
    );
    const afterPositive = await readStored(page);
    expect(afterPositive).toHaveLength(1);
    const positive = afterPositive[0];
    expect(positive.text).toBe('люблю рыбу');
    expect(positive.mentions).toBe(1);

    await memory.run(
      { op: 'remember', text: 'не люблю рыбу', kind: 'pref' },
      'запомни: не люблю рыбу'
    );

    const stored = await readStored(page);
    const positiveNow = stored.find((item) => item.id === positive.id);
    const negative = stored.find((item) => item.text === 'не люблю рыбу');
    const live = stored.filter(isLive);

    const facts = {
      storageLength: stored.length,
      liveCount: live.length,
      positiveMentions: positiveNow?.mentions ?? null,
      positiveNormalized: positiveNow?.normalized ?? null,
      positiveText: positiveNow?.text ?? null,
      negativeId: negative?.id ?? null,
      negativeNormalized: negative?.normalized ?? null,
      negativeMentions: negative?.mentions ?? null,
      liveTexts: live.map((item) => item.text),
      distinctNormalized: Boolean(negative && positiveNow && negative.normalized !== positiveNow.normalized),
      hasNegativeLive: live.some((item) => item.text === 'не люблю рыбу'),
    };
    console.log(`CHECK 4 FACTS: ${JSON.stringify(facts, null, 2)}`);

    // Ожидание: два независимых факта. Фактическое поведение при баге — одна запись,
    // mentions вырос до 2, текст остался положительным: негация потерялась.
    expect(facts, `Негация потерялась при дедупе: ${JSON.stringify(facts)}`).toMatchObject({
      storageLength: 2,
      liveCount: 2,
      positiveMentions: 1,
      distinctNormalized: true,
      hasNegativeLive: true,
    });
  });

  test('5. «что я люблю?» отдаёт положительные факты, а негативные не перепутаны', async ({ page }) => {
    await openWithCleanMemory(page);
    const memory = await installMemoryTool(page);

    await memory.run(
      { op: 'remember', text: 'люблю желе', kind: 'pref' },
      'запомни: люблю желе'
    );
    await memory.run(
      { op: 'remember', text: 'не люблю холодец', kind: 'pref' },
      'запомни: не люблю холодец'
    );
    await memory.run(
      { op: 'remember', text: 'люблю суши', kind: 'pref' },
      'запомни: люблю суши'
    );
    await memory.run(
      { op: 'remember', text: 'работаю в офисе', kind: 'fact' },
      'запомни: работаю в офисе'
    );

    const selected = await selectTexts(page, 'что я люблю?');
    const prompted = await forPromptTexts(page, 'что я люблю?');

    const selectedTexts = selected.map((item) => item.text);
    const promptedTexts = prompted.map((item) => item.text);

    // Положительные предпочтения на месте.
    expect(selectedTexts).toContain('люблю желе');
    expect(selectedTexts).toContain('люблю суши');
    // Негативный факт не превратился в положительный.
    expect(selectedTexts).toContain('не люблю холодец');
    const holodets = selected.filter((item) => item.normalized.includes('холодец'));
    expect(holodets).toHaveLength(1);
    expect(holodets[0].text).toBe('не люблю холодец');
    // Нецелевой факт не прилип к «что я люблю?».
    expect(selectedTexts).not.toContain('работаю в офисе');

    // forPrompt отдаёт тот же набор, что и selectMemory.
    expect(promptedTexts.sort()).toEqual(selectedTexts.sort());
    expect(promptedTexts).not.toContain('работаю в офисе');
  });

  test('6. память не создаёт заметки: storage.getItems() не меняется', async ({ page }) => {
    await openWithCleanMemory(page);
    const memory = await installMemoryTool(page);

    const baseline = await page.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
      return { itemCount: storage.getItems().length };
    });

    await memory.run(
      { op: 'remember', text: 'люблю чай', kind: 'pref' },
      'запомни: люблю чай'
    );
    await memory.run(
      { op: 'remember', text: 'не люблю кофе', kind: 'pref' },
      'запомни: не люблю кофе'
    );
    await memory.run(
      { op: 'remember', text: 'работаю из дома', kind: 'fact' },
      'запомни: работаю из дома'
    );

    const after = await page.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
      const memoryTexts = ['люблю чай', 'не люблю кофе', 'работаю из дома'];
      return {
        itemCount: storage.getItems().length,
        memoryCount: storage.getMemory().filter((item) => !item.deletedAt && !item.validTo).length,
        leakedAsNotes: storage
          .getItems()
          .filter((item) =>
            memoryTexts.some(
              (text) => (item.title || '').includes(text) || (item.content || '').includes(text)
            )
          ).length,
      };
    });

    expect(after.itemCount).toBe(baseline.itemCount);
    expect(after.memoryCount).toBe(3);
    expect(after.leakedAsNotes).toBe(0);
  });
});
