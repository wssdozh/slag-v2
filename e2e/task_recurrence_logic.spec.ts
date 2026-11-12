import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

test('weekly intervals keep selected days in active ISO weeks; leap years clamp', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { computeNextStrictOccurrenceDate: next } = await import(/* @vite-ignore */ '/src/lib/time/recurrenceHelper.ts');
    const weekly = { freq: 'weekly', interval: 2, weekdays: [1, 3] };
    return {
      sameWeek: next('2026-11-02', weekly),
      nextActiveWeek: next('2026-11-04', weekly),
      sundayBoundary: next('2026-11-08', { ...weekly, weekdays: [1, 7] }),
      weeklyDefault: next('2026-11-04', { freq: 'weekly', interval: 2 }),
      leap: next('2024-02-29', { freq: 'yearly', interval: 1 }),
      leapToLeap: next('2024-02-29', { freq: 'yearly', interval: 4 }),
      monthEnd: next('2026-01-31', { freq: 'monthly', interval: 1 }),
      weekdays: next('2026-11-06', { freq: 'weekdays', interval: 1 }),
    };
  });
  expect(result).toEqual({
    sameWeek: '2026-11-04', nextActiveWeek: '2026-11-16', sundayBoundary: '2026-11-16',
    weeklyDefault: '2026-11-18', leap: '2025-02-28', leapToLeap: '2028-02-29',
    monthEnd: '2026-02-28', weekdays: '2026-11-09',
  });
});

test('range projection ignores wall clock and counts only results inside the range', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { getRecurringOccurrencesInRange: range } = await import(/* @vite-ignore */ '/src/lib/time/recurrenceHelper.ts');
    const task = { dueDate: '2020-01-01', recurrence: { freq: 'daily', interval: 1 } };
    return {
      historical: range(task, '2020-05-01', '2020-05-05', 3),
      baseExcluded: range(task, '2020-01-01', '2020-01-03'),
      monthly: range({ dueDate: '2026-01-31', recurrence: { freq: 'monthly', interval: 1 } }, '2026-02-01', '2026-04-30'),
      reversed: range(task, '2020-05-05', '2020-05-01'),
      invalidLimit: range(task, '2020-01-01', '2020-01-03', Infinity),
    };
  });
  expect(result).toEqual({
    historical: ['2020-05-01', '2020-05-02', '2020-05-03'],
    baseExcluded: ['2020-01-02', '2020-01-03'],
    monthly: ['2026-02-28', '2026-03-28', '2026-04-28'], reversed: [], invalidLimit: [],
  });
});

test('rollover preserves done until next cycle, resets missed streak and follows schedule', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { evaluateRecurringTasks: evaluate, getISODateString } = await import(/* @vite-ignore */ '/src/lib/time/recurrenceHelper.ts');
    const base = {
      id: 'routine', type: 'task', title: 'routine', folder: 'Входящие', tags: [], attachments: [],
      content: '- [x] step', subtasks: [{ id: 'st_0', title: 'step', completed: true }],
      status: 'done', dueDate: '2026-11-02', streak: 4, createdAt: 1, updatedAt: 1,
      recurrence: { freq: 'weekly', interval: 2, weekdays: [1, 3], resetSubtasks: true },
      reminder: new Date(2026, 10, 1, 8, 30).toISOString(),
    };
    const unchanged = evaluate([base], new Date(2026, 10, 3, 12));
    const due = evaluate([base], new Date(2026, 10, 4, 12));
    const missed = evaluate([base], new Date(2026, 10, 5, 12));
    const active = evaluate([{ ...base, status: 'in_progress' }], new Date(2026, 10, 5, 12));
    const daily = evaluate([{ ...base, dueDate: '2026-11-04', recurrence: { freq: 'daily', interval: 1 } }], new Date(2026, 10, 5, 12));
    const noReset = evaluate([{ ...base, recurrence: { ...base.recurrence, resetSubtasks: false } }], new Date(2026, 10, 4, 12));
    const summarize = (evaluation: typeof due) => {
      const item = evaluation.updatedItems[0];
      const reminder = new Date(item.reminder);
      return {
        date: item.dueDate, status: item.status, streak: item.streak,
        reminderDay: getISODateString(reminder), reminderHour: reminder.getHours(), reminderMinute: reminder.getMinutes(),
      };
    };
    return {
      untouched: unchanged.changedCount === 0 && unchanged.updatedItems[0] === base,
      due: summarize(due), missed: summarize(missed), active: summarize(active),
      resetChecklist: due.updatedItems[0].content === '- [ ] step' && !due.updatedItems[0].subtasks[0].completed,
      keptChecklist: noReset.updatedItems[0].content === '- [x] step' && noReset.updatedItems[0].subtasks[0].completed,
      daily: { date: daily.updatedItems[0].dueDate, streak: daily.updatedItems[0].streak },
      idempotent: evaluate(missed.updatedItems, new Date(2026, 10, 5, 12)).changedCount === 0,
    };
  });
  expect(result).toEqual({
    untouched: true,
    due: { date: '2026-11-04', status: 'todo', streak: 4, reminderDay: '2026-11-03', reminderHour: 8, reminderMinute: 30 },
    missed: { date: '2026-11-16', status: 'todo', streak: 0, reminderDay: '2026-11-15', reminderHour: 8, reminderMinute: 30 },
    active: { date: '2026-11-16', status: 'todo', streak: 0, reminderDay: '2026-11-15', reminderHour: 8, reminderMinute: 30 },
    resetChecklist: true, keptChecklist: true, daily: { date: '2026-11-05', streak: 4 }, idempotent: true,
  });
});

test('overdue next occurrence stays on schedule and reminder keeps local offset across DST', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  const result = await page.evaluate(async () => {
    const { computeNextOccurrence: next } = await import(/* @vite-ignore */ '/src/lib/time/recurrenceHelper.ts');
    const reminder = new Date(2026, 9, 24, 8, 30, 15).toISOString();
    const moved = next('2026-10-25', { freq: 'weekly', interval: 2 }, reminder, new Date(2026, 9, 30, 12));
    const date = new Date(moved.nextReminder);
    return {
      due: moved.nextDueDate, day: date.getDate(), month: date.getMonth(),
      hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
    };
  });
  expect(result).toEqual({ due: '2026-11-08', day: 7, month: 10, hour: 8, minute: 30, second: 15 });
});

test('invalid dates and intervals cannot overflow or create non-advancing loops', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { computeNextStrictOccurrenceDate: next, evaluateRecurringTasks: evaluate, getRecurringOccurrencesInRange: range } = await import(/* @vite-ignore */ '/src/lib/time/recurrenceHelper.ts');
    const invalid = { type: 'task', dueDate: '2026-02-30', status: 'done', recurrence: { freq: 'daily', interval: 1 } };
    return {
      dates: ['bad', '2026-02-30', '2026-13-01'].map(date => next(date, { freq: 'daily', interval: 1 })),
      intervals: [0, -1, NaN, Infinity, 1.5].map(interval => next('2026-11-02', { freq: 'daily', interval })),
      overflow: next('2026-11-02', { freq: 'daily', interval: Number.MAX_SAFE_INTEGER }),
      invalidDays: next('2026-11-02', { freq: 'weekly', interval: 2, weekdays: [0, 8, NaN] }),
      untouched: evaluate([invalid], new Date(2026, 10, 5)).changedCount === 0,
      invalidRange: range(invalid, '2026-11-01', '2026-11-30'),
    };
  });
  expect(result).toEqual({
    dates: ['bad', '2026-02-30', '2026-13-01'], intervals: Array(5).fill('2026-11-03'),
    overflow: '2026-11-02', invalidDays: '2026-11-16', untouched: true, invalidRange: [],
  });
});
