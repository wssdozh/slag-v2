// The reminder contract: one parser for every format we ever wrote, and one writer that always
// produces an ISO moment with an explicit local offset. The browser's zone is the device zone,
// so every expectation is computed in the page instead of being hard-coded to +03:00.
import { test, expect } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

test.describe('reminder time contract', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await setupSlag(page, testInfo);
  });

  test('every historical format reads as device-local hours, junk reads as nothing', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { reminderClock, reminderClockLabel, reminderDay } = await import(
        /* @vite-ignore */ '/src/lib/time/reminder.ts'
      );
      const pad = (value: number) => String(value).padStart(2, '0');
      const moment = new Date('2026-11-25T06:30:00Z');
      const localDay = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
      const localClock = { hours: moment.getHours(), minutes: moment.getMinutes() };
      return {
        localDay,
        localClock,
        bare: reminderClock('09:30'),
        singleDigit: reminderClock('9:05'),
        bareSeconds: reminderClock('09:30:45'),
        padded: reminderClock(' 09:30 '),
        moment: reminderClock('2026-11-25T06:30:00Z'),
        momentOffset: reminderClock(new Date(2026, 10, 25, 9, 30).toISOString()),
        labelBare: reminderClockLabel('09:30'),
        labelMoment: reminderClockLabel('2026-11-25T06:30:00Z'),
        labelEmpty: reminderClockLabel(''),
        labelUndefined: reminderClockLabel(undefined),
        labelJunk: reminderClockLabel('после обеда'),
        dayMoment: reminderDay('2026-11-25T06:30:00Z'),
        dayBare: reminderDay('09:30'),
        dayJunk: reminderDay('после обеда'),
        // A bare date is a day, not a moment: `new Date('2026-11-25')` would invent UTC midnight.
        dayDateOnly: reminderDay('2026-11-25'),
        clockDateOnly: reminderClock('2026-11-25'),
      };
    });

    expect(result.bare).toEqual({ hours: 9, minutes: 30 });
    expect(result.singleDigit).toEqual({ hours: 9, minutes: 5 });
    expect(result.bareSeconds).toEqual({ hours: 9, minutes: 30 });
    expect(result.padded).toEqual({ hours: 9, minutes: 30 });
    expect(result.moment).toEqual(result.localClock);
    expect(result.momentOffset).toEqual({ hours: 9, minutes: 30 });
    expect(result.labelBare).toBe('09:30');
    expect(result.labelMoment).toBe(`${String(result.localClock.hours).padStart(2, '0')}:${String(result.localClock.minutes).padStart(2, '0')}`);
    expect(result.labelEmpty).toBe('');
    expect(result.labelUndefined).toBe('');
    expect(result.labelJunk).toBe('');
    expect(result.dayMoment).toBe(result.localDay);
    expect(result.dayBare).toBeNull();
    expect(result.dayJunk).toBeNull();
    expect(result.dayDateOnly).toBeNull();
    expect(result.clockDateOnly).toBeNull();
  });

  test('reminderToIso writes the day as typed with this device offset', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { reminderToIso } = await import(/* @vite-ignore */ '/src/lib/time/reminder.ts');
      const pad = (value: number) => String(value).padStart(2, '0');
      const offsetOf = (at: Date) => {
        const offset = -at.getTimezoneOffset();
        const sign = offset < 0 ? '-' : '+';
        const abs = Math.abs(offset);
        return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
      };
      const built = reminderToIso('2026-11-25', { hours: 9, minutes: 30 }) as string;
      const summer = reminderToIso('2026-07-15', { hours: 9, minutes: 30 }) as string;
      const at = new Date(built);
      return {
        built,
        summer,
        fromString: reminderToIso('2026-11-25', '10:45'),
        earlyMorning: reminderToIso('2026-11-25', { hours: 0, minutes: 5 }),
        localClock: [at.getHours(), at.getMinutes()],
        localDay: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
        firstOffset: built.slice(-6),
        expectedFirstOffset: offsetOf(at),
        expectedSummerOffset: offsetOf(new Date(summer)),
        endsWithZ: /Z$/i.test(built),
        invalidDay: reminderToIso('2026-02-30', { hours: 9, minutes: 30 }),
        invalidHour: reminderToIso('2026-11-25', { hours: 24, minutes: 0 }),
        invalidMinute: reminderToIso('2026-11-25', { hours: 9, minutes: 60 }),
        invalidClockText: reminderToIso('2026-11-25', '25:00'),
        invalidDayText: reminderToIso('25.11.2026', { hours: 9, minutes: 0 }),
      };
    });

    expect(result.built).toMatch(/^2026-11-25T09:30:00[+-]\d{2}:\d{2}$/);
    expect(result.summer).toMatch(/^2026-07-15T09:30:00[+-]\d{2}:\d{2}$/);
    expect(result.endsWithZ).toBe(false);
    expect(result.localClock).toEqual([9, 30]);
    expect(result.localDay).toBe('2026-11-25');
    expect(result.firstOffset).toBe(result.expectedFirstOffset);
    expect(result.summer.slice(-6)).toBe(result.expectedSummerOffset);
    expect(result.fromString).toMatch(/^2026-11-25T10:45:00[+-]\d{2}:\d{2}$/);
    expect(result.earlyMorning).toMatch(/^2026-11-25T00:05:00[+-]\d{2}:\d{2}$/);
    expect(result.invalidDay).toBeUndefined();
    expect(result.invalidHour).toBeUndefined();
    expect(result.invalidMinute).toBeUndefined();
    expect(result.invalidClockText).toBeUndefined();
    expect(result.invalidDayText).toBeUndefined();
  });

  test('day shifts are calendar arithmetic: the local clock survives DST and leap days', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { reminderToIso, reminderDay, reminderClock, shiftReminderToDay } = await import(
        /* @vite-ignore */ '/src/lib/time/reminder.ts'
      );
      const pad = (value: number) => String(value).padStart(2, '0');
      const offsetOf = (at: Date) => {
        const offset = -at.getTimezoneOffset();
        const sign = offset < 0 ? '-' : '+';
        const abs = Math.abs(offset);
        return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
      };
      const describe = (iso?: string) => ({
        iso,
        day: reminderDay(iso),
        clock: reminderClock(iso),
        offsetMatches: iso ? iso.slice(-6) === offsetOf(new Date(iso)) : false,
      });
      const base = reminderToIso('2026-11-25', { hours: 9, minutes: 30 });
      return {
        forward: describe(shiftReminderToDay(base, '2026-11-25', '2026-11-28')),
        backward: describe(shiftReminderToDay(base, '2026-11-25', '2026-11-23')),
        sameDay: describe(shiftReminderToDay(base, '2026-11-25', '2026-11-25')),
        // Spring and autumn DST boundaries: the offset must follow the target day there, and the
        // local clock must not drift in a zone that has no DST at all.
        spring: describe(shiftReminderToDay(reminderToIso('2026-03-28', { hours: 9, minutes: 30 }), '2026-03-28', '2026-03-30')),
        autumn: describe(shiftReminderToDay(reminderToIso('2026-10-24', { hours: 9, minutes: 30 }), '2026-10-24', '2026-10-26')),
        leap: describe(shiftReminderToDay(reminderToIso('2028-02-28', { hours: 8, minutes: 0 }), '2028-02-28', '2028-02-29')),
        // A reminder may sit a day after its due date: the delta moves it, not the due date.
        afterDue: describe(shiftReminderToDay(reminderToIso('2026-11-27', { hours: 9, minutes: 30 }), '2026-11-26', '2026-11-28')),
        // A bare clock belongs to the due date by definition, so there is nothing to rewrite.
        bare: shiftReminderToDay('10:00', '2026-11-25', '2026-11-27'),
        noDay: shiftReminderToDay('10:00', '', '2026-12-01'),
        junk: shiftReminderToDay('после обеда', '2026-11-25', '2026-11-28'),
        empty: shiftReminderToDay(undefined, '2026-11-25', '2026-11-28'),
        badTarget: shiftReminderToDay(base, '2026-11-25', 'не дата'),
      };
    });

    expect(result.forward.day).toBe('2026-11-28');
    expect(result.forward.clock).toEqual({ hours: 9, minutes: 30 });
    expect(result.forward.offsetMatches).toBe(true);

    expect(result.backward.day).toBe('2026-11-23');
    expect(result.backward.clock).toEqual({ hours: 9, minutes: 30 });
    expect(result.backward.offsetMatches).toBe(true);

    expect(result.sameDay.day).toBe('2026-11-25');
    expect(result.sameDay.clock).toEqual({ hours: 9, minutes: 30 });

    expect(result.spring.day).toBe('2026-03-30');
    expect(result.spring.clock).toEqual({ hours: 9, minutes: 30 });
    expect(result.spring.offsetMatches).toBe(true);

    expect(result.autumn.day).toBe('2026-10-26');
    expect(result.autumn.clock).toEqual({ hours: 9, minutes: 30 });
    expect(result.autumn.offsetMatches).toBe(true);

    expect(result.leap.day).toBe('2028-02-29');
    expect(result.leap.clock).toEqual({ hours: 8, minutes: 0 });
    expect(result.leap.offsetMatches).toBe(true);

    expect(result.afterDue.day).toBe('2026-11-29');
    expect(result.afterDue.clock).toEqual({ hours: 9, minutes: 30 });

    expect(result.bare).toBe('10:00');
    expect(result.noDay).toBe('10:00');
    expect(result.junk).toBe('после обеда');
    expect(result.empty).toBeUndefined();
    // The target day is unreadable: keep the value instead of dropping the reminder.
    expect(result.badTarget).toMatch(/^2026-11-25T09:30:00/);
  });

  test('normalizeReminder writes a moment when it can and never discards what it cannot read', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { normalizeReminder, reminderClock, reminderDay } = await import(
        /* @vite-ignore */ '/src/lib/time/reminder.ts'
      );
      const pad = (value: number) => String(value).padStart(2, '0');
      const noZone = '2026-11-25T09:30:00';
      const asLocalMoment = new Date(noZone);
      return {
        bareWithDay: normalizeReminder('10:45', '2026-11-25'),
        bareWithoutDay: normalizeReminder('10:45'),
        noZone: normalizeReminder(noZone),
        noZoneDay: `${asLocalMoment.getFullYear()}-${pad(asLocalMoment.getMonth() + 1)}-${pad(asLocalMoment.getDate())}`,
        instant: normalizeReminder('2026-11-25T06:30:00Z'),
        offsetMoment: normalizeReminder('2026-11-25T09:30:00+03:00'),
        junk: normalizeReminder('после обеда', '2026-11-25'),
        dateOnly: normalizeReminder('2026-11-25', '2026-11-25'),
        notString: [normalizeReminder(null), normalizeReminder(42), normalizeReminder({})],
        empty: [normalizeReminder(''), normalizeReminder('   ')],
        // A bare clock on a day that does not exist keeps its text instead of becoming another day.
        badDay: normalizeReminder('10:45', '2026-02-30'),
        bareClock: reminderClock(normalizeReminder('10:45', '2026-11-25')),
        bareDay: reminderDay(normalizeReminder('10:45', '2026-11-25')),
      };
    });

    expect(result.bareWithDay).toMatch(/^2026-11-25T10:45:00[+-]\d{2}:\d{2}$/);
    expect(result.bareClock).toEqual({ hours: 10, minutes: 45 });
    expect(result.bareDay).toBe('2026-11-25');
    // Nothing to anchor a bare clock to: keep the wall time the AI or a person wrote.
    expect(result.bareWithoutDay).toBe('10:45');
    expect(result.noZone).toMatch(/^2026-11-25T09:30:00[+-]\d{2}:\d{2}$/);
    expect(result.noZone.slice(0, 10)).toBe(result.noZoneDay);
    // An explicit zone already fixes the instant: the string is not reformatted.
    expect(result.instant).toBe('2026-11-25T06:30:00Z');
    expect(result.offsetMoment).toBe('2026-11-25T09:30:00+03:00');
    expect(result.junk).toBe('после обеда');
    expect(result.dateOnly).toBe('2026-11-25');
    expect(result.notString).toEqual([undefined, undefined, undefined]);
    expect(result.empty).toEqual([undefined, undefined]);
    expect(result.badDay).toBe('10:45');
  });

  test('the recurrence label counts the interval in front of the weekday list', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { formatRecurrenceLabel } = await import(/* @vite-ignore */ '/src/lib/time/recurrenceHelper.ts');
      return {
        everyTwoWeeks: formatRecurrenceLabel({ freq: 'weekly', interval: 2, weekdays: [1, 3] }),
        everyWeek: formatRecurrenceLabel({ freq: 'weekly', interval: 1, weekdays: [1, 3] }),
        everyTwoWeeksNoDays: formatRecurrenceLabel({ freq: 'weekly', interval: 2 }),
        everyThreeDays: formatRecurrenceLabel({ freq: 'daily', interval: 3 }),
      };
    });

    expect(result.everyTwoWeeks).toBe('Каждые 2 нед. по Пн, Ср');
    expect(result.everyWeek).toBe('Каждый Пн, Ср');
    expect(result.everyTwoWeeksNoDays).toBe('Каждые 2 нед.');
    expect(result.everyThreeDays).toBe('Каждые 3 дн.');
  });

  test('the feed stamp shows a clock only on the day it belongs to', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { formatDueStamp } = await import(/* @vite-ignore */ '/src/lib/time/dateUtils.ts');
      const { reminderToIso } = await import(/* @vite-ignore */ '/src/lib/time/reminder.ts');
      return {
        bare: formatDueStamp('2026-11-25', '09:30'),
        ownDay: formatDueStamp('2026-11-25', reminderToIso('2026-11-25', { hours: 9, minutes: 30 })),
        foreignDay: formatDueStamp('2026-11-25', reminderToIso('2026-11-26', { hours: 9, minutes: 30 })),
        junk: formatDueStamp('2026-11-25', 'после обеда'),
        noReminder: formatDueStamp('2026-11-25'),
      };
    });

    expect(result.bare).toContain('09:30');
    expect(result.ownDay).toContain('09:30');
    expect(result.foreignDay).not.toContain('·');
    expect(result.junk).not.toContain('·');
    expect(result.noReminder).not.toContain('·');
  });
});
