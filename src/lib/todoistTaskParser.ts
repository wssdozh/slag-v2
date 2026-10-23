import * as chronoRu from 'chrono-node/ru';
import * as chronoEn from 'chrono-node/en';

export interface ParsedTodoistTask {
  cleanTitle: string;
  dueDate?: string; // YYYY-MM-DD
  reminder?: string; // ISO 8601 string
  hasTime: boolean;
  priority?: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
  rawMatchedDateText?: string;
}

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

  // c) Dates / Times (chrono-node)
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

  // d) Clean Title
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

export function getTaskTimeSlot(task: { reminder?: string; title?: string; content?: string }): TaskTimeSlot {
  // 1. Check reminder ISO string first
  if (task.reminder) {
    try {
      const d = new Date(task.reminder);
      if (!isNaN(d.getTime())) {
        const h = d.getHours();
        const m = d.getMinutes();
        const endH = (h + 1) % 24;
        const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        return {
          hasTime: true,
          isAllDay: false,
          startHour: h,
          startMinute: m,
          durationMinutes: 60,
          timeLabel,
        };
      }
    } catch {
      // fallback
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
    const duration = endTotal > startTotal ? endTotal - startTotal : 60;
    const timeLabel = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    return {
      hasTime: true,
      isAllDay: false,
      startHour: startH,
      startMinute: startM,
      durationMinutes: Math.max(30, Math.min(duration, 360)),
      timeLabel,
    };
  }

  // 3. Search for single time in title or content: e.g. "в 14:00" or "14:00"
  const singleMatch = text.match(/(?:^|\s|[вВ@])\s*([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (singleMatch) {
    const startH = parseInt(singleMatch[1], 10);
    const startM = parseInt(singleMatch[2], 10);
    const endH = (startH + 1) % 24;
    const timeLabel = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;

    return {
      hasTime: true,
      isAllDay: false,
      startHour: startH,
      startMinute: startM,
      durationMinutes: 60,
      timeLabel,
    };
  }

  // 4. Default: All-day task
  return {
    hasTime: false,
    isAllDay: true,
    startHour: 9,
    startMinute: 0,
    durationMinutes: 60,
    timeLabel: 'Весь день',
  };
}
