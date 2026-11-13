// Where the composer's parsed syntax sits in the first line, and how the mirror paints it.
import type { ParsedTodoistTask } from '../../../lib/time/todoistTaskParser';

export type ComposerHighlightKind = 'date' | 'tag' | 'priority';

export interface ComposerHighlight {
  start: number;
  end: number;
  kind: ComposerHighlightKind;
}

export interface ComposerHighlightSegment {
  text: string;
  kind?: ComposerHighlightKind;
}

const TAG_TOKEN = /(?:^|\s)#([a-zA-Zа-яА-ЯёЁ0-9_-]+)/g;
const PRIORITY_TOKEN = /(?:^|\s)(?!\/)(p[1-4]|!![1-4]|!(?:urgent|high|med|medium|low))(?=\b|\s|$)/gi;

/** The token regexes eat the leading space, so the highlight starts one char later. */
function tokenSpan(match: RegExpExecArray, kind: ComposerHighlightKind): ComposerHighlight {
  const offset = match[0].startsWith(' ') ? 1 : 0;
  const start = (match.index ?? 0) + offset;
  return { start, end: (match.index ?? 0) + match[0].length, kind };
}

/**
 * Ranges of the text the parser actually understood.
 *
 * Computed by finding the matched text in the first line rather than trusting chrono's
 * index: the parser strips priority, repeat and duration before it hands the line to
 * chrono, so those indices describe a different string than the one in the field.
 */
export function buildComposerHighlights(
  content: string,
  parsed: ParsedTodoistTask | null,
  dismissals: { isDateDismissed: boolean; isPriorityDismissed: boolean },
): ComposerHighlight[] {
  if (!parsed) return [];
  const firstLine = (content.split('\n')[0] ?? '').replace(/^#+\s+/, '');
  const highlights: ComposerHighlight[] = [];

  const dateText = parsed.rawMatchedDateText?.trim();
  if (!dismissals.isDateDismissed && dateText) {
    const start = firstLine.indexOf(dateText);
    if (start !== -1) highlights.push({ start, end: start + dateText.length, kind: 'date' });
  }

  for (const match of firstLine.matchAll(TAG_TOKEN)) {
    highlights.push(tokenSpan(match, 'tag'));
  }

  if (!dismissals.isPriorityDismissed) {
    for (const match of firstLine.matchAll(PRIORITY_TOKEN)) {
      highlights.push(tokenSpan(match, 'priority'));
    }
  }

  return highlights;
}

/**
 * Cuts the text into painted and plain runs. Overlapping ranges are dropped rather than
 * merged: with two highlights on one word the mirror would paint the text twice.
 */
export function segmentText(text: string, highlights: ComposerHighlight[]): ComposerHighlightSegment[] {
  if (highlights.length === 0) return [{ text }];

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: ComposerHighlightSegment[] = [];
  let cursor = 0;

  for (const range of sorted) {
    const start = Math.max(range.start, cursor);
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: text.slice(start, end), kind: range.kind });
    cursor = end;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
