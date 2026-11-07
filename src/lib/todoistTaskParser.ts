import * as chronoRu from 'chrono-node/ru';
import * as chronoEn from 'chrono-node/en';
import type { RecurrenceRule } from '../types';

export interface ParsedTodoistTask {
  cleanTitle: string;
  dueDate?: string; // YYYY-MM-DD
  reminder?: string; // ISO 8601 string
  hasTime: boolean;
  priority?: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
  rawMatchedDateText?: string;
  duration?: number; // in minutes (e.g. 15, 30, 45, 60, 90)
  recurrence?: RecurrenceRule;
}

const WEEKDAY_MAP: Record<string, number> = {
  пн: 1,
  понедельник: 1,
  mon: 1,
  monday: 1,
  вт: 2,
  вторник: 2,
  tue: 2,
  tuesday: 2,
  ср: 3,
  среду: 3,
  среда: 3,
  wed: 3,
  wednesday: 3,
  чт: 4,
  четверг: 4,
  thu: 4,
  thursday: 4,
  пт: 5,
  пятницу: 5,
  пятница: 5,
  fri: 5,
  friday: 5,
  сб: 6,
  субботу: 6,
  суббота: 6,
  sat: 6,
  saturday: 6,
  вс: 7,
  воскресенье: 7,
  sun: 7,
  sunday: 7,
};

export function parseTodoistInput(text: string, referenceDate: Date = new Date()): ParsedTodoistTask {
  const lines = text.split('\n');
  let workingText = (lines[0] ?? '').replace(/^#+\s+/, '');
  let priority: 'none' | 'low' | 'medium' | 'high' | undefined = undefined;

  // a) Priority: p1-p4, !!1-!!4, !urgent/!high/!med/!medium/!low (exclude slash commands like /p1, /urgent)
  const prioRegex = /(?:^|\s)(?!\/)(p[1-4]|!![1-4]|!(?:urgent|high|med|medium|low))(?:\b|\s|$)/i;
  const prioMatch = text.match(prioRegex);
  if (prioMatch) {
    const token = prioMatch[1].toLowerCase();
    if (token === 'p1' || token === '!!1' || token === '!urgent' || token === '!high') {
      priority = 'high';
    } else if (token === 'p2' || token === '!!2' || token === '!med' || token === '!medium') {
      priority = 'medium';
    } else if (token === 'p3' || token === '!!3' || token === '!low') {
      priority = 'low';
    } else if (token === 'p4' || token === '!!4') {
      priority = 'none';
    }
    workingText = workingText.replace(/(?:^|\s)(?!\/)(?:p[1-4]|!![1-4]|!(?:urgent|high|med|medium|low))(?:\b|\s|$)/gi, ' ');
  }

  // b) Tags: #tag (scanned from all lines, stripped from title line)
  const tagRegex = /(?:^|\s)#([a-zA-Zа-яА-Я0-9_-]+)/g;
  const tags: string[] = [];
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    tags.push(tagMatch[1]);
  }
  workingText = workingText.replace(/(?:^|\s)#([a-zA-Zа-яА-Я0-9_-]+)/g, ' ');

  // c) Recurrence parsing
  let recurrence: RecurrenceRule | undefined = undefined;

  // Daily
  if (/(?:^|\s)(?:каждый\s*день|ежедневно|every\s*day|daily)(?:\b|\s|$)/i.test(workingText)) {
    recurrence = { freq: 'daily', interval: 1, resetSubtasks: true };
    workingText = workingText.replace(/(?:^|\s)(?:каждый\s*день|ежедневно|every\s*day|daily)(?:\b|\s|$)/gi, ' ');
  }
  // Weekdays (Пн-Пт)
  else if (/(?:^|\s)(?:по\s*будням|каждый\s*будний\s*день|every\s*weekday|weekdays)(?:\b|\s|$)/i.test(workingText)) {
    recurrence = { freq: 'weekdays', interval: 1, resetSubtasks: true };
    workingText = workingText.replace(/(?:^|\s)(?:по\s*будням|каждый\s*будний\s*день|every\s*weekday|weekdays)(?:\b|\s|$)/gi, ' ');
  }
  // Specific day of week (e.g. каждый вторник / every tuesday)
  else {
    const specificDayMatch = workingText.match(/(?:^|\s)(?:кажд(?:ый|ую|ое|ые)|every)\s*([а-яa-z]+)(?:\b|\s|$)/i);
    if (specificDayMatch) {
      const rawDay = specificDayMatch[1].toLowerCase();
      const mappedWeekday = WEEKDAY_MAP[rawDay];
      if (mappedWeekday) {
        recurrence = { freq: 'weekly', interval: 1, weekdays: [mappedWeekday], resetSubtasks: true };
        workingText = workingText.replace(/(?:^|\s)(?:кажд(?:ый|ую|ое|ые)|every)\s*[а-яa-z]+(?:\b|\s|$)/gi, ' ');
      }
    }
  }

  // Weekly general
  if (!recurrence && /(?:^|\s)(?:каждую\s*неделю|еженедельно|every\s*week|weekly)(?:\b|\s|$)/i.test(workingText)) {
    recurrence = { freq: 'weekly', interval: 1, resetSubtasks: true };
    workingText = workingText.replace(/(?:^|\s)(?:каждую\s*неделю|еженедельно|every\s*week|weekly)(?:\b|\s|$)/gi, ' ');
  }

  // Monthly
  if (!recurrence && /(?:^|\s)(?:каждый\s*месяц|ежемесячно|every\s*month|monthly)(?:\b|\s|$)/i.test(workingText)) {
    recurrence = { freq: 'monthly', interval: 1, resetSubtasks: true };
    workingText = workingText.replace(/(?:^|\s)(?:каждый\s*месяц|ежемесячно|every\s*month|monthly)(?:\b|\s|$)/gi, ' ');
  }

  // d) Duration parsing (e.g. "на 45 мин", "for 1h", "10:00-11:30")
  let duration: number | undefined = undefined;
  let rangeStartHour: number | undefined = undefined;
  let rangeStartMinute: number | undefined = undefined;

  // 1. Time range in text: 10:00-11:30 or 10:00 - 11:30
  const rangeMatch = workingText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[-—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (rangeMatch) {
    const startH = parseInt(rangeMatch[1], 10);
    const startM = parseInt(rangeMatch[2], 10);
    const endH = parseInt(rangeMatch[3], 10);
    const endM = parseInt(rangeMatch[4], 10);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    duration = endTotal > startTotal ? endTotal - startTotal : 60;
    rangeStartHour = startH;
    rangeStartMinute = startM;
    workingText = workingText.replace(rangeMatch[0], ' ');
  }

  // 2. Explicit duration phrases: "на 45 мин", "for 30m", "на 1.5 часа", "for 2h"
  if (duration === undefined) {
    const minsMatch = workingText.match(/(?:^|\s)(?:на|for)\s*(\d+(?:[.,]\d+)?)\s*(м|мин|минут[а-я]*|m|min|mins|minutes)\b/i);
    if (minsMatch) {
      duration = Math.round(parseFloat(minsMatch[1].replace(',', '.')));
      workingText = workingText.replace(minsMatch[0], ' ');
    } else {
      const hoursMatch = workingText.match(/(?:^|\s)(?:на|for)\s*(\d+(?:[.,]\d+)?)\s*(ч|час[а-я]*|h|hr|hrs|hour|hours)\b/i);
      if (hoursMatch) {
        duration = Math.round(parseFloat(hoursMatch[1].replace(',', '.')) * 60);
        workingText = workingText.replace(hoursMatch[0], ' ');
      }
    }
  }

  // e) Dates / Times (chrono-node)
  let dueDate: string | undefined = undefined;
  let reminder: string | undefined = undefined;
  let hasTime = false;
  let rawMatchedDateText: string | undefined = undefined;

  const trimmedText = workingText.trim();
  if (trimmedText) {
    const isCyrillic = /[а-яё]/i.test(trimmedText);
    const chrono = isCyrillic ? chronoRu.casual : chronoEn.casual;
    const matches = chrono.parse(trimmedText, referenceDate, { forwardDate: true });

    // Edge anchoring: match must be at the start (index === 0) or at the end, and NOT preceded by '/' (slash commands)
    const validMatches = matches.filter(m => m.index === 0 || trimmedText[m.index - 1] !== '/');
    const edgeMatch = validMatches.find(m => m.index + m.text.length >= trimmedText.length - 2)
      ?? validMatches.find(m => m.index === 0);

    if (edgeMatch) {
      const date = edgeMatch.start.date();
      dueDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      hasTime = edgeMatch.start.isCertain('hour');
      if (hasTime) {
        reminder = date.toISOString();
      }
      rawMatchedDateText = edgeMatch.text;
      workingText = trimmedText.slice(0, edgeMatch.index) + trimmedText.slice(edgeMatch.index + edgeMatch.text.length);
    } else {
      workingText = trimmedText;
    }
  } else {
    workingText = '';
  }

  // If time range was given without explicit chrono time (e.g. "План 10:00-11:30" or "Синхронизация завтра 10:00-11:30")
  if (rangeStartHour !== undefined && rangeStartMinute !== undefined) {
    hasTime = true;
    const baseDate = dueDate ? new Date(dueDate) : new Date(referenceDate);
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), rangeStartHour, rangeStartMinute, 0, 0);
    reminder = d.toISOString();
    if (!dueDate) {
      dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }

  // f) Clean Title
  let cleanTitle = workingText.replace(/\s+/g, ' ').trim();
  if (cleanTitle) {
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  } else {
    cleanTitle = 'Новая задача';
  }

  return {
    cleanTitle,
    dueDate,
    reminder,
    hasTime,
    priority,
    tags: Array.from(new Set(tags)),
    rawMatchedDateText,
    duration,
    recurrence,
  };
}

export interface TaskTimeSlot {
  hasTime: boolean;
  isAllDay: boolean;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  timeLabel: string;
}

export function getTaskTimeSlot(task: {
  reminder?: string;
  title?: string;
  content?: string;
  duration?: number;
}): TaskTimeSlot {
  const customDuration = task.duration && task.duration > 0 ? task.duration : undefined;

  // 1. Check reminder ISO string or bare HH:MM string first
  if (task.reminder) {
    const rawRem = task.reminder.trim();
    const bareMatch = rawRem.match(/^([01]?\d|2[0-3]):([0-5]\d)/);
    let h: number | undefined;
    let m: number | undefined;

    if (bareMatch) {
      h = parseInt(bareMatch[1], 10);
      m = parseInt(bareMatch[2], 10);
    } else {
      try {
        const d = new Date(rawRem);
        if (!isNaN(d.getTime())) {
          h = d.getHours();
          m = d.getMinutes();
        }
      } catch {
        // fallback
      }
    }

    if (h !== undefined && m !== undefined) {
      const durationMinutes = customDuration || 60;
      const endTotal = h * 60 + m + durationMinutes;
      const endH = Math.floor(endTotal / 60) % 24;
      const endM = endTotal % 60;
      const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      return {
        hasTime: true,
        isAllDay: false,
        startHour: h,
        startMinute: m,
        durationMinutes,
        timeLabel,
      };
    }
  }

  // 2. Search for time range in title or content: e.g. "10:00-11:30" or "10:00 - 11:30"
  const text = `${task.title || ''} ${task.content || ''}`;
  const rangeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[-—]\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (rangeMatch) {
    const startH = parseInt(rangeMatch[1], 10);
    const startM = parseInt(rangeMatch[2], 10);
    const endH = parseInt(rangeMatch[3], 10);
    const endM = parseInt(rangeMatch[4], 10);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    const computedDuration = endTotal > startTotal ? endTotal - startTotal : 60;
    const durationMinutes = customDuration || Math.max(15, Math.min(computedDuration, 1440));
    const timeLabel = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    return {
      hasTime: true,
      isAllDay: false,
      startHour: startH,
      startMinute: startM,
      durationMinutes,
      timeLabel,
    };
  }

  // 3. Search for single time in title or content: e.g. "в 14:00" or "14:00"
  const singleMatch = text.match(/(?:^|\s|[вВ@])\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (singleMatch) {
    const startH = parseInt(singleMatch[1], 10);
    const startM = parseInt(singleMatch[2], 10);
    const durationMinutes = customDuration || 60;
    const endTotal = startH * 60 + startM + durationMinutes;
    const endH = Math.floor(endTotal / 60) % 24;
    const endM = endTotal % 60;
    const timeLabel = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    return {
      hasTime: true,
      isAllDay: false,
      startHour: startH,
      startMinute: startM,
      durationMinutes,
      timeLabel,
    };
  }

  // 4. Default: All-day task
  return {
    hasTime: false,
    isAllDay: true,
    startHour: 9,
    startMinute: 0,
    durationMinutes: customDuration || 60,
    timeLabel: 'Весь день',
  };
}

/**
 * Extracts all hashtags from text and strips standalone / trailing hashtags
 * so they don't redundantly clutter the note body while living in metadata.
 */
export function extractAndStripTags(text: string): { cleanContent: string; tags: string[] } {
  if (!text) return { cleanContent: '', tags: [] };

  const tagRegex = /(?:^|\s)#([a-zA-Zа-яА-ЯёЁ0-9_-]+)/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const tag = match[1].trim();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  // 1. Remove lines that consist only of tags and whitespace
  const lines = text.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !/^(?:#[a-zA-Zа-яА-ЯёЁ0-9_-]+\s*)+$/.test(trimmed);
  });

  let cleanContent = filteredLines.join('\n');

  // 2. Strip trailing tags at the very end of the content
  cleanContent = cleanContent.replace(/(?:\s*#[a-zA-Zа-яА-ЯёЁ0-9_-]+)+\s*$/, '').trim();

  return {
    cleanContent,
    tags,
  };
}

/**
 * `@Папка` is composer syntax for the destination folder, the same way `#tag`
 * is for tags: it is resolved on send and never written into the note body.
 * Names may contain spaces, so the token is matched against the known folders
 * instead of a character class.
 */
export function extractFolderToken<T extends { name: string; path: string }>(
  text: string,
  folders: T[]
): { cleanContent: string; folder: T | null } {
  if (!text) return { cleanContent: '', folder: null };
  const byLongestName = [...folders].sort((a, b) => b.name.length - a.name.length);
  for (const folder of byLongestName) {
    const name = folder.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const token = new RegExp(`(^|\\s)@${name}(?=\\s|$)`, 'i');
    if (!token.test(text)) continue;
    return { cleanContent: text.replace(token, '$1').trim(), folder };
  }
  return { cleanContent: text, folder: null };
}
