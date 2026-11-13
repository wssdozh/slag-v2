// The action offered under a telegram answer: how it is packed for the relay and read back.
import type { AssistantActionPayload } from '../sync/accountTypes';
import type {
  BatchUpdateItem,
  ItemUpdates,
  SlagItem,
  SlagItemType,
  SuggestedAction,
  SuggestedActionType,
} from '../../types';
import { formatDueStamp } from '../time/dateUtils';

const ACTION_TYPES: readonly SuggestedActionType[] = ['create_note', 'schedule_task', 'update_item', 'batch_update'];
const ITEM_TYPES: readonly SlagItemType[] = ['note', 'article', 'task'];
const PRIORITIES: readonly NonNullable<SuggestedAction['priority']>[] = ['none', 'low', 'medium', 'high'];
const STATUSES: readonly NonNullable<SuggestedAction['status']>[] = ['backlog', 'todo', 'in_progress', 'done'];

/** What both an action and a saved item say about themselves: title, deadline, folder. */
type ActionTarget = Pick<SlagItem, 'title' | 'dueDate' | 'reminder' | 'folder'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function names<T extends string>(value: unknown, known: readonly T[]): T | undefined {
  return typeof value === 'string' ? known.find((candidate) => candidate === value) : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** One line a human reads on the button and under it: `«Купить кота», 14 ноя, Личное`. */
export function describeActionTarget(target: ActionTarget): string {
  const parts = [`«${target.title.trim()}»`];
  const stamp = formatDueStamp(target.dueDate, target.reminder);
  if (stamp) parts.push(stamp);
  if (target.folder) parts.push(target.folder);
  return parts.join(', ');
}

/**
 * The action an answer offers, shaped for the relay.
 *
 * The whole object goes inside `payload`: the relay never reads it, it only echoes it back on a
 * tap, and the device that gets the echo runs the same executor the card in the app runs.
 * `actionState` is reset because a tap must apply, not report "already applied".
 */
export function toAssistantAction(requestId: string, action?: SuggestedAction): AssistantActionPayload | null {
  if (!action) return null;
  return {
    // Tied to the request: a repeated answer must not grow a second button with another id.
    id: `act_${requestId}`,
    label: (action.actionLabel?.trim() || 'Применить').slice(0, 40),
    summary: describeActionTarget(action),
    payload: { ...action, actionState: 'suggested' },
  };
}

/**
 * Reads the action a tapped button carried back.
 *
 * The relay only echoes what this vault sent, but a frame is still bytes from the network: a
 * `type` the executor does not know, or a missing title, would reach the card as a lie. Scalars
 * are rebuilt one by one, so a corrupted field loses its own value instead of the whole action.
 */
export function parseAssistantAction(raw: unknown): SuggestedAction | null {
  if (!isRecord(raw) || !isRecord(raw.payload)) return null;
  const value = raw.payload;
  const type = names(value.type, ACTION_TYPES);
  const title = text(value.title)?.trim();
  if (!type || !title) return null;

  const action: SuggestedAction = {
    type,
    title,
    folder: text(value.folder) ?? '',
    content: text(value.content) ?? '',
    tags: stringList(value.tags),
    itemType: names(value.itemType, ITEM_TYPES) ?? 'note',
  };
  const actionLabel = text(value.actionLabel);
  if (actionLabel) action.actionLabel = actionLabel;
  const targetItemId = text(value.targetItemId);
  if (targetItemId) action.targetItemId = targetItemId;
  const appendContent = text(value.appendContent);
  if (appendContent) action.appendContent = appendContent;
  const dueDate = text(value.dueDate);
  if (dueDate) action.dueDate = dueDate;
  const reminder = text(value.reminder);
  if (reminder) action.reminder = reminder;
  const appliedItemId = text(value.appliedItemId);
  if (appliedItemId) action.appliedItemId = appliedItemId;
  const priority = names(value.priority, PRIORITIES);
  if (priority) action.priority = priority;
  const status = names(value.status, STATUSES);
  if (status) action.status = status;

  const updates = readItemUpdates(value.updates);
  if (updates) action.updates = updates;
  const batchUpdateItems = readBatchUpdates(value.batchUpdateItems);
  if (batchUpdateItems) action.batchUpdateItems = batchUpdateItems;
  const subtasks = readSubtasks(value.subtasks);
  if (subtasks) action.subtasks = subtasks;
  // `batchItems` is not read here: the executor applies reschedules through `batchUpdateItems`.

  return action;
}

/**
 * `updates` is a partial patch that `applyItemUpdates` walks field by field, ignoring what it
 * does not know: checking that it is a record is as far as validation needs to go.
 */
function readItemUpdates(value: unknown): ItemUpdates | undefined {
  return isRecord(value) ? (value as unknown as ItemUpdates) : undefined;
}

function readBatchUpdates(value: unknown): BatchUpdateItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const batch: BatchUpdateItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.title !== 'string') continue;
    const item: BatchUpdateItem = {
      targetItemId: text(entry.targetItemId) ?? '',
      title: entry.title,
      updates: readItemUpdates(entry.updates) ?? {},
    };
    const reason = text(entry.reason);
    if (reason) item.reason = reason;
    batch.push(item);
  }
  return batch.length > 0 ? batch : undefined;
}

function readSubtasks(value: unknown): SuggestedAction['subtasks'] {
  if (!Array.isArray(value)) return undefined;
  const subtasks: NonNullable<SuggestedAction['subtasks']> = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.title !== 'string') continue;
    subtasks.push({
      id: text(entry.id) ?? `sub_${subtasks.length}`,
      title: entry.title,
      completed: entry.completed === true,
    });
  }
  return subtasks.length > 0 ? subtasks : undefined;
}
