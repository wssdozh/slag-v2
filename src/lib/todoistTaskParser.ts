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

  // a) Priority: p1-p4, !!1-!!4, !urgent/!high/!med/!medium/!low
  const prioRegex = /(?:^|\s|\b)(p[1-4]|!![1-4]|!(?:urgent|high|med|medium|low))(?:\b|\s|$)/i;
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
    workingText = workingText.replace(/(?:^|\s|\b)(?:p[1-4]|!![1-4]|!(?:urgent|high|med|medium|low))(?:\b|\s|$)/gi, ' ');
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

    // Edge anchoring: match must be at the start (index === 0) or at the end
    const edgeMatch = matches.find(m => m.index + m.text.length >= trimmedText.length - 2)
      ?? matches.find(m => m.index === 0);

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
