// Three-way merge of note properties, after domain normalization and before sealing.
import type { SlagItem } from '../../../types/index.ts';
import { noteProperties, stripNoteTransportFields } from '../../vault/noteSemantics.ts';
import { mergeMarkdown } from '../../text/mergeMarkdown.ts';
import { noteMergeViolations } from './mergeValidation.ts';

export const relayNote = stripNoteTransportFields;

export function equal(a: unknown, b: unknown, ignoreUndefined = false): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, i) => equal(value, b[i], ignoreUndefined));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = (value: Record<string, unknown>) => Object.keys(value).filter((key) => !ignoreUndefined || value[key] !== undefined);
  const names = keys(left);
  return names.length === keys(right).length && names.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key], ignoreUndefined));
}

const sameProperty = (a: unknown, b: unknown) => equal(a, b, true);
const own = (object: Record<string, unknown>, key: string) => Object.hasOwn(object, key) ? object[key] : undefined;
const keys = (...objects: Record<string, unknown>[]) => new Set(objects.flatMap(Object.keys));

function explicitReminderInstant(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN;
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toJSON()?.slice(0, 10) === day ? Date.parse(value) : NaN;
}

const sameReminder = (a: unknown, b: unknown) => sameProperty(a, b) || explicitReminderInstant(a) === explicitReminderInstant(b);
const oneOffTasks = (...notes: SlagItem[]) => notes.every(({ type, recurrence }) => type === 'task' && !recurrence);

export function noteDifferences(a: SlagItem, b: SlagItem): string[] {
  const left = noteProperties(a), right = noteProperties(b);
  return [...keys(left, right)].filter((key) => {
    const same = key === 'reminder' && oneOffTasks(a, b) ? sameReminder : sameProperty;
    return !same(own(left, key), own(right, key));
  });
}

export function sameNote(a: SlagItem | null, b: SlagItem | null): boolean {
  return !a || !b ? a === b : a === b || noteDifferences(a, b).length === 0;
}

function mergeTags(base: string[], local: string[], head: string[]): string[] | undefined {
  const original = new Set(base), mine = new Set(local), theirs = new Set(head);
  if (original.size !== base.length || mine.size !== local.length || theirs.size !== head.length) return;
  const keepsOrder = (list: string[], members: Set<string>) =>
    sameProperty(base.filter((tag) => members.has(tag)), list.filter((tag) => original.has(tag)));
  if (!keepsOrder(local, mine) || !keepsOrder(head, theirs)) return;
  const additions = [...new Set([...local, ...head])].filter((tag) => !original.has(tag));
  if (base.some((tag) => !mine.has(tag) && !theirs.has(tag))
      && additions.some((tag) => !mine.has(tag)) && additions.some((tag) => !theirs.has(tag))) return;
  const spelling = new Map<string, string>();
  for (const tag of [...base, ...additions]) {
    const key = tag.toLowerCase();
    const previous = spelling.get(key);
    if (!original.has(tag) && previous !== undefined && previous !== tag) return;
    spelling.set(key, tag);
  }
  return [...base.filter((tag) => mine.has(tag) && theirs.has(tag)), ...additions.sort()];
}

export function mergeNote(base: SlagItem, local: SlagItem, head: SlagItem): { item: SlagItem; conflicts: string[] } {
  const a = noteProperties(base), b = noteProperties(local), c = noteProperties(head);
  const localChanges = new Set<string>(), remoteChanges = new Set<string>();
  const conflicts = new Set<string>();
  const oneOff = oneOffTasks(base, local, head);
  const sameTaskType = [a, b, c].every(({ type }) => type === 'task');
  const compare = (key: string) => key === 'reminder' && oneOff ? sameReminder : sameProperty;
  const choose = (key: string, original: unknown, mine: unknown, theirs: unknown, same = sameProperty): unknown => {
    if (same(mine, original) || (same === sameReminder && same(mine, theirs))) return theirs;
    if (same(theirs, original) || same(mine, theirs)) return mine;
    if (key === 'content' && typeof original === 'string' && typeof mine === 'string' && typeof theirs === 'string') {
      const text = mergeMarkdown(original, mine, theirs);
      if (text !== undefined) return text;
    }
    conflicts.add(key);
    return theirs;
  };
  const entries: [string, unknown][] = [];
  for (const key of keys(a, b, c)) {
    const original = own(a, key), mine = own(b, key), theirs = own(c, key);
    const same = compare(key);
    // Shared task changes cannot conflict with themselves. Leave type transitions
    // and dependencies between text and attachment bindings under the original checks.
    if (!sameTaskType || key === 'content' || key === 'attachments' || !same(mine, theirs)) {
      if (!same(mine, original)) localChanges.add(key);
      if (!same(theirs, original)) remoteChanges.add(key);
    }
    // Subtasks derived from body are not a second simultaneous edit to the same list.
    if (key === 'subtasks' && a.type === 'task' && b.type === 'task' && c.type === 'task') {
      const legacy = (note: SlagItem, fields: ReturnType<typeof noteProperties>) =>
        fields.subtasks === note.subtasks ? note.subtasks : [];
      entries.push([key, choose(key, legacy(base, a), legacy(local, b), legacy(head, c))]);
    } else if (key === 'tags' && !sameProperty(local.tags, base.tags) && !sameProperty(head.tags, base.tags) && !sameProperty(local.tags, head.tags)) {
      const tags = mergeTags(base.tags, local.tags, head.tags);
      if (!tags) conflicts.add(key);
      entries.push([key, tags ?? head.tags]);
    } else if (key === 'customProps' && [original, mine, theirs].every((v) => v === undefined || (v !== null && typeof v === 'object' && !Array.isArray(v)))) {
      const [x, y, z] = [original, mine, theirs].map((v) => (v ?? {}) as Record<string, unknown>);
      const props = [...keys(x, y, z)].map((name) => [name, choose(key, own(x, name), own(y, name), own(z, name))] as const);
      const kept = props.filter(([, value]) => value !== undefined);
      if (kept.length) entries.push([key, Object.fromEntries(kept)]);
    } else entries.push([key, choose(key, original, mine, theirs, same)]);
  }
  const combined = { ...Object.fromEntries(entries.filter(([, value]) => value !== undefined)),
    createdAt: head.createdAt, updatedAt: Math.max(head.updatedAt, local.updatedAt) } as SlagItem;
  const item = { ...combined, subtasks: noteProperties(combined).subtasks };
  if (a.type === 'task' && b.type === 'task' && c.type === 'task' && item.subtasks.length && item.subtasks !== combined.subtasks) {
    // Markdown owns the serialized checklist. An independent frontmatter edit must not vanish,
    // including an explicit removal; the same title/completion in Markdown already satisfies it.
    const steps = (list: SlagItem['subtasks']) => Array.isArray(list)
      ? list.map((step) => step && typeof step.title === 'string' && typeof step.completed === 'boolean' ? [step.title, step.completed] : step)
      : list;
    const baseSteps = steps(a.subtasks), resultSteps = steps(item.subtasks);
    const losesLegacyEdit = (note: SlagItem, fields: ReturnType<typeof noteProperties>) => {
      if (fields.subtasks.length && fields.subtasks !== note.subtasks) return false;
      const side = steps(fields.subtasks);
      return !sameProperty(side, baseSteps) && !sameProperty(side, resultSteps);
    };
    if (losesLegacyEdit(local, b) || losesLegacyEdit(head, c)) conflicts.add('subtasks');
  }
  for (const field of noteMergeViolations(item, local, head, localChanges, remoteChanges, base)) conflicts.add(field);
  return { item, conflicts: [...conflicts] };
}
