import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

const refDate = new Date(2026, 10, 19, 10, 0, 0); // Thu Nov 19 2026

// Helper that runs the parser in-page via page.evaluate + dynamic import
async function parse(page: ReturnType<typeof test>, text: string) {
  return page.evaluate(
    async (params) => {
      const { parseTodoistInput } = await import(/* @vite-ignore */ '/src/lib/time/todoistTaskParser.ts');
      return parseTodoistInput(params.text, params.ref);
    },
    { text, ref: refDate.toISOString() }
  );
}

test('duration parsing: cyrillic, english, decimal hours, zero, and night range', async ({ page }) => {
  const cases: Array<{ input: string; expected: Partial<{ duration: number; cleanTitle: string; unparsed?: unknown }> }> = [
    { input: 'дело на 25 минут', expected: { duration: 25, cleanTitle: 'Дело', unparsed: undefined } },
    { input: 'звонить на 1,5 часа', expected: { duration: 90, cleanTitle: 'Звонить' } },
    { input: 'позвонить на 2 часа', expected: { duration: 120, cleanTitle: 'Позвонить' } },
    { input: 'сделать на 45 мин', expected: { duration: 45, cleanTitle: 'Сделать' } },
    { input: 'на 0 минут', expected: { duration: undefined, cleanTitle: 'Новая задача' } },
    { input: 'для 0 min', expected: { duration: undefined } },
    { input: 'прогулка на 1000 минут', expected: { duration: 1000, cleanTitle: 'Прогулка' } },
    { input: 'ночь на 2000 минут', expected: { duration: 1440, cleanTitle: 'Ночь' } }, // >1440 caps to 1440
    { input: 'план 23:00-01:00', expected: { duration: 120, cleanTitle: 'План' } },
    { input: 'ночь 22:00-04:00', expected: { duration: 360, cleanTitle: 'Ночь' } },
    { input: 'утро 08:00 - 09:30', expected: { duration: 90, cleanTitle: 'Утро' } },
    { input: 'прогулка на 180 минут', expected: { duration: 180, cleanTitle: 'Прогулка' } },
    { input: 'meeting for 2h tomorrow p1', expected: { duration: 120, cleanTitle: 'Meeting', priority: 'high' } },
  ];

  for (const { input, expected } of cases) {
    const result = await parse(page, input);
    if (expected.duration !== undefined) {
      expect(result.duration, `duration("${input}")`).toBe(expected.duration);
    } else if (expected.duration === undefined && input.toLowerCase().includes('0 мину') || input.includes('0 min')) {
      expect(result.duration, `duration("${input}")`).toBe(undefined);
    }
    if (expected.cleanTitle !== undefined) {
      expect(result.cleanTitle, `cleanTitle("${input}")`).toEqual(expected.cleanTitle);
    }
    if (expected.priority !== undefined) {
      expect(result.priority, `priority("${input}")`).toBe(expected.priority);
    }
  }
});

test('recurrence rules: daily, weekly intervals, monthly, yearly, weekdays, multi-day', async ({ page }) => {
  const cases: Array<{
    input: string;
    expectedFreq?: string;
    expectedInterval?: number;
    expectedWeekdays?: number[];
    shouldHaveUnparsed?: boolean;
  }> = [
    { input: 'отчёт каждый день', expectedFreq: 'daily' },
    { input: 'check every day', expectedFreq: 'daily' },
    { input: 'отчёт ежедневно p2', expectedFreq: 'daily' },
    { input: 'report daily', expectedFreq: 'daily' },
    { input: 'уборка по будням', expectedFreq: 'weekdays' },
    { input: 'tidy every weekday', expectedFreq: 'weekdays' },
    { input: 'помыть пол каждую неделю', expectedFreq: 'weekly', expectedInterval: 1 },
    { input: 'laundry every week', expectedFreq: 'weekly' },
    { input: 'pay rent каждую неделю еженедельно', expectedFreq: 'weekly' },
    { input: 'еженедельно созвон', expectedFreq: 'weekly' },
    { input: 'обновления каждый месяц', expectedFreq: 'monthly' },
    { input: 'bonus every month', expectedFreq: 'monthly' },
    { input: 'квартал ежемесячно план', expectedFreq: 'monthly' },
    { input: 'каждый вторник', expectedFreq: 'weekly', expectedWeekdays: [2] },
    { input: 'every tuesday митинг', expectedFreq: 'weekly', expectedWeekdays: [2] },
    { input: 'спорт каждые 2 недели', expectedFreq: 'weekly', expectedInterval: 2 },
    { input: 'every 3 weeks ревью', expectedFreq: 'weekly', expectedInterval: 3 },
    { input: 'раз в 2 недели', expectedFreq: 'weekly', expectedInterval: 2 },
    { input: 'каждые 2 дня', expectedFreq: 'daily', expectedInterval: 2 },
    { input: 'every 4 days уборка', expectedFreq: 'daily', expectedInterval: 4 },
    { input: 'каждые 2 месяца отчёт', expectedFreq: 'monthly', expectedInterval: 2 },
    { input: 'every 3 months аудит', expectedFreq: 'monthly', expectedInterval: 3 },
    { input: 'раз в полгода финансы', expectedFreq: 'monthly', expectedInterval: 6 },
    { input: 'каждый год', expectedFreq: 'yearly' },
    { input: 'год anniversary yearly', expectedFreq: 'yearly' },
    { input: 'ежегодно отчетность', expectedFreq: 'yearly' },
    { input: 'once a year отпуск', expectedFreq: 'yearly' },
    { input: 'каждый понедельник и среду', expectedFreq: 'weekly', expectedWeekdays: [1, 3] },
    { input: 'every monday and wednesday', expectedFreq: 'weekly', expectedWeekdays: [1, 3] },
    { input: 'по пн и ср встречи', expectedFreq: 'weekly', expectedWeekdays: [1, 3] },
  ];

  for (const { input, expectedFreq, expectedInterval, expectedWeekdays, shouldHaveUnparsed } of cases) {
    const result = await parse(page, input);

    if (expectedFreq !== undefined) {
      expect(result.recurrence?.freq, `freq("${input}")`).toBe(expectedFreq);
    }
    if (expectedInterval !== undefined) {
      expect(result.recurrence?.interval, `interval("${input}")`).toBe(expectedInterval);
    }
    if (expectedWeekdays !== undefined) {
      expect(result.recurrence?.weekdays, `weekdays("${input}")`).toEqual(expectedWeekdays);
    }
    if (shouldHaveUnparsed) {
      expect(result.unparsed, `unparsed("${input}")`).toBeDefined();
    }
  }
});

test('night range crossing midnight gives correct duration, ceiling 1440', async ({ page }) => {
  const r1 = await parse(page, 'дежурство 23:00-01:00');
  expect(r1.duration).toBe(120);

  const r2 = await parse(page, 'сон 00:00-07:00');
  expect(r2.duration).toBe(420);

  const r4 = await parse(page, 'ночь 23:59-00:01');
  expect(r4.duration).toBe(2);

  // Same time → wraps: 12:00-12:00 = 1440 (ceiling caps at 1440)
  const r5 = await parse(page, 'цикл 12:00-12:00');
  expect(r5.duration).toBe(1440);
});

test('zero duration does not create reminder or due date', async ({ page }) => {
  const result = await parse(page, 'бесполезно на 0 минут');
  expect(result.duration).toBe(undefined);
  expect(result.reminder).toBe(undefined);
});

test('unrecognised recurrence marker stays as unparsed, no chrono override', async ({ page }) => {
  const result = await parse(page, 'повторить раз в семь дней скоро');
  expect(result.unparsed?.recurrence).toBeDefined();
  expect(result.dueDate).toBe(undefined);
});

test('multi-day title cleanup leaves no fragments', async ({ page }) => {
  const r1 = await parse(page, 'тренировка каждый понедельник и среду');
  // Exact title, not a substring check: «Тренировка» itself contains the letter «и».
  expect(r1.cleanTitle).toBe('Тренировка');
  expect(r1.cleanTitle).not.toContain('понедельник');
  expect(r1.cleanTitle).not.toContain('среду');

  const r2 = await parse(page, 'standup every monday and wednesday');
  expect(r2.cleanTitle).toBe('Standup');
});

test('date-only input still works — tomorrow at 15:00 with priority', async ({ page }) => {
  const result = await parse(page, 'завтра в 15:00 p1 задача');
  expect(result.dueDate).toBeDefined();
  expect(result.hasTime).toBe(true);
  expect(result.priority).toBe('high');
});

test('mixed ru/en tokens: tags, priority, folder-like syntax survive', async ({ page }) => {
  const result = await parse(page, 'собрать данные на 30 мин #анализ #data !high next week');
  expect(result.duration).toBe(30);
  expect(result.tags).toContain('анализ');
  expect(result.tags).toContain('data');
  expect(result.priority).toBe('high');
  expect(result.cleanTitle).not.toContain('#анализ');
  expect(result.cleanTitle).not.toContain('#data');
});

test('hours with decimal: 1,5 часа and 0,5 hour', async ({ page }) => {
  const r1 = await parse(page, 'подготовиться на 1,5 часа');
  expect(r1.duration).toBe(90);

  const r2 = await parse(page, 'for 0,5 hour break');
  expect(r2.duration).toBe(30);
  expect(r2.cleanTitle).toBe('Break');
});

test('header-marked titles are stripped of leading #', async ({ page }) => {
  const result = await parse(page, '## Сложная задача на 10 минут');
  expect(result.cleanTitle).toBe('Сложная задача');
  expect(result.duration).toBe(10);
});

test('all 12 required inputs pass', async ({ page }) => {
  const tests: Array<{ input: string; check: (r: any) => boolean; label: string }> = [
    {
      input: 'дело на 25 минут',
      check: (r) => r.duration === 25 && r.cleanTitle === 'Дело' && !r.recurrence,
      label: 'duration 25min cyrillic',
    },
    {
      input: 'call for 25m',
      check: (r) => r.duration === 25 && r.cleanTitle === 'Call',
      label: 'duration 25m en',
    },
    {
      input: 'подготовка на 180 минут',
      check: (r) => r.duration === 180 && r.cleanTitle === 'Подготовка',
      label: 'duration 180 min',
    },
    {
      input: 'на 0 минут',
      check: (r) => r.duration === undefined,
      label: 'zero duration dropped',
    },
    {
      input: 'дежурство 23:00-01:00',
      check: (r) => r.duration === 120 && r.cleanTitle === 'Дежурство',
      label: 'night range 120 min',
    },
    {
      input: 'спорт каждые 2 недели',
      check: (r) => r.recurrence?.freq === 'weekly' && r.recurrence?.interval === 2,
      label: 'weekly interval 2',
    },
    {
      input: 'отдых каждый год',
      check: (r) => r.recurrence?.freq === 'yearly',
      label: 'yearly',
    },
    {
      input: 'зарядка каждый понедельник и среду',
      check: (r) =>
        r.recurrence?.freq === 'weekly' &&
        JSON.stringify(r.recurrence?.weekdays) === '[1,3]' &&
        !r.dueDate,
      label: 'mon+wed multi-day',
    },
    {
      input: 'run every monday and wednesday',
      check: (r) =>
        r.recurrence?.freq === 'weekly' &&
        JSON.stringify(r.recurrence?.weekdays) === '[1,3]',
      label: 'en multi-day',
    },
    {
      input: 'pranie каждую неделю',
      check: (r) => r.recurrence?.freq === 'weekly' && !r.unparsed,
      label: 'weekly general',
    },
    {
      input: 'чистка по будням',
      check: (r) => r.recurrence?.freq === 'weekdays',
      label: 'weekdays mon-fri',
    },
    {
      input: 'завтра в 15:00 p1 задача',
      check: (r) => r.dueDate !== undefined && r.hasTime && r.priority === 'high',
      label: 'tomorrow 15:00 p1',
    },
  ];

  for (const t of tests) {
    const result = await parse(page, t.input);
    expect(t.check(result), `${t.label}: "${t.input}"`).toBe(true);
  }
});
