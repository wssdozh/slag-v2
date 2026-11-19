/**
 * reminder.ts — что означает строка `reminder` и как её записать.
 *
 * Канон — ISO-момент с явным локальным offset: `2026-11-25T09:30:00+03:00`. Читаем при этом
 * всё, что успели записать раньше: голое `09:30`, `09:30:00` и ISO без зоны. Разбор часа живёт
 * только здесь — календарь, уведомления, сериализатор и ИИ зовут эти функции, а не свои regexp.
 *
 * День считается по календарю (UTC-полуночи), часы — по локальным: перенос даты не должен
 * превращать 09:30 в 10:30 из-за перехода на летнее время.
 */
import { logger } from '../logger/logger';

const BARE_CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const LOCAL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Своя зона в строке: `Z` или `+03:00`. Такой момент уже задан однозначно. */
const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const DAY_MS = 86_400_000;

const timeLog = logger.scope('APP');

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Момент из строки, либо null. Дата без часа моментом не считается: `new Date('2026-11-25')`
 * — это полночь UTC и чужие часы в поясе устройства.
 */
function parseMoment(text: string): Date | null {
  if (LOCAL_DAY.test(text)) return null;
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Часы и минуты в поясе устройства: `09:30`, `09:30:00` и ISO читаются одинаково. */
export function reminderClock(raw?: string): { hours: number; minutes: number } | null {
  const text = raw?.trim();
  if (!text) return null;
  const bare = BARE_CLOCK.exec(text);
  if (bare) return { hours: Number(bare[1]), minutes: Number(bare[2]) };
  const at = parseMoment(text);
  return at ? { hours: at.getHours(), minutes: at.getMinutes() } : null;
}

/** Время для поля ввода: `09:30`, либо пустая строка — «времени нет или оно не распознано». */
export function reminderClockLabel(raw?: string): string {
  const clock = reminderClock(raw);
  return clock ? `${pad(clock.hours)}:${pad(clock.minutes)}` : '';
}

/**
 * День момента в поясе устройства. Голое время дня не имеет — оно принадлежит `dueDate`.
 * День собирается здесь, а не через `dateUtils`: тот берёт часы отсюда, импорт был бы циклом.
 */
export function reminderDay(raw?: string): string | null {
  const text = raw?.trim();
  if (!text || BARE_CLOCK.test(text)) return null;
  const at = parseMoment(text);
  if (!at) return null;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * Сборка ISO — без `toISOString`, иначе часы уедут в UTC. Offset берётся у самого момента,
 * поэтому летнее время пишется правильно. Секунды — только у старых записей, которые их несли:
 * перенос дня не имеет права терять часть момента. Новые значения приходят с нулём.
 */
function assembleIso(
  parts: RegExpExecArray,
  hours: number,
  minutes: number,
  seconds: number,
): string | undefined {
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const date = Number(parts[3]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return undefined;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return undefined;
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) return undefined;

  const at = new Date(year, month - 1, date, hours, minutes, seconds, 0);
  // 30 февраля Date молча превратит в март, а строка осталась бы «февральской».
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== date) return undefined;

  // Минуты на восток от UTC: знак обратный тому, что отдаёт getTimezoneOffset.
  const offset = -at.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${parts[1]}-${parts[2]}-${parts[3]}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** ISO-момент из дня и часов: `2026-11-25T09:30:00+03:00`. */
export function reminderToIso(
  day: string,
  clock: { hours: number; minutes: number } | string,
): string | undefined {
  const parts = LOCAL_DAY.exec(day.trim());
  if (!parts) return undefined;
  const time = typeof clock === 'string' ? reminderClock(clock) : clock;
  if (!time) return undefined;
  return assembleIso(parts, time.hours, time.minutes, 0);
}

/** Номер календарного дня. Считается в UTC-полуночах, поэтому переход часов его не двигает. */
function dayIndex(day: string): number | null {
  const parts = LOCAL_DAY.exec(day.trim());
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const date = Number(parts[3]);
  const at = new Date(Date.UTC(year, month - 1, date));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== date) return null;
  return Math.round(at.getTime() / DAY_MS);
}

function dayFromIndex(index: number): string {
  const at = new Date(index * DAY_MS);
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/**
 * Переносит reminder вместе с задачей: дельта дней между `fromDay` и `toDay`, часы те же.
 * Реминдер может стоять и на день после срока — поэтому двигаем его собственный день, а не
 * приклеиваем к `toDay`.
 */
export function shiftReminderToDay(
  raw: string | undefined,
  fromDay: string,
  toDay: string,
): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  const clock = reminderClock(text);
  if (!clock) {
    // Не распознали — не выбрасываем: значение вернётся на диск как было, с записью в лог.
    timeLog.warn('Reminder time is unreadable, left as is', { reminder: text });
    return text;
  }
  const own = reminderDay(text);
  const origin = own === null ? null : dayIndex(own);
  // Срок неизвестен (новая задача без даты) — ставим момент на целевой день, а не теряем его.
  const from = dayIndex(fromDay) ?? origin;
  const to = dayIndex(toDay);
  if (origin === null || from === null || to === null) return text;
  const parts = LOCAL_DAY.exec(dayFromIndex(origin + (to - from)));
  if (!parts) return text;
  const seconds = parseMoment(text)?.getSeconds() ?? 0;
  return assembleIso(parts, clock.hours, clock.minutes, seconds) ?? text;
}

/**
 * Значение для записи: ISO с явным offset. Уже заданный момент (`Z`, `+03:00`) не переписываем —
 * иначе каждая загрузка хранилища давала бы дифф. Невалидное возвращается как есть с warn:
 * стирать чужие данные нельзя, а показать «время не распознано» — можно.
 */
export function normalizeReminder(raw: unknown, dueDate?: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (!text) return undefined;

  const clock = reminderClock(text);
  const day = reminderDay(text);
  if (clock && day !== null) {
    return EXPLICIT_ZONE.test(text) ? text : (reminderToIso(day, clock) ?? text);
  }
  if (clock && dueDate) {
    // Голое время живёт на дне задачи: без дня его некуда поставить.
    return reminderToIso(dueDate, clock) ?? text;
  }
  timeLog.warn('Reminder left as written: no zone and no day to anchor it', {
    reminder: text,
    dueDate,
  });
  return text;
}
