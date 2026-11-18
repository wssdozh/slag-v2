// The shape of what a vault's `state.json` keeps for `settingsStore`: drafts, the assistant chat,
// the assistant's memory and the workspace. One section each; this file knows the shapes and the
// merge rules, never where the file is.
//
// Pure on purpose: no Tauri, no `localStorage`, no config. `scripts/state-sections.test.mjs` reads
// it as is and holds it to these rules. The section names are the writer's business, so they are
// not here either — a stored section is just an unknown value until it is clean.
import type {
  ChatMessage,
  ChatToolCall,
  ComposerDraft,
  FolderViewSettings,
  FullscreenDraft,
  MemoryItem,
  MemoryKind,
  RecurrenceRule,
  ReplyTarget,
  SlagAttachment,
  SlagItemPriority,
  SlagItemStatus,
  SlagItemType,
  SuggestedAction,
  WorkspaceState,
} from '../../types';

const ITEM_TYPES: readonly SlagItemType[] = ['note', 'article', 'task'];
const PRIORITIES: readonly SlagItemPriority[] = ['none', 'low', 'medium', 'high'];
const STATUSES: readonly SlagItemStatus[] = ['backlog', 'todo', 'in_progress', 'done'];
const MEMORY_KINDS: readonly MemoryKind[] = ['rule', 'pref', 'fact', 'event', 'note'];

/** Composer drafts by folder path: one unsaved text per folder, keyed the way the UI keys it. */
export type ComposerDraftMap = Record<string, ComposerDraft>;
/** Fullscreen drafts by item id: the editor keeps one per open note. */
export type FullscreenDraftMap = Record<string, FullscreenDraft>;
/** The short thread the telegram bot answers in: two roles, no ids, no timestamps. */
export interface TelegramThreadEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface DraftsSection {
  composer: ComposerDraftMap;
  fullscreen: FullscreenDraftMap;
}

export interface ChatSection {
  messages: ChatMessage[];
  telegram: TelegramThreadEntry[];
}

/**
 * Where the one-way move off `localStorage` is recorded. A section that carries its stamp has
 * already been merged, and an old key is never read again — that is what keeps a draft the person
 * deleted *after* the move from coming back on the next start.
 */
export interface MigrationStamps {
  legacyAt: number;
  telegramAt: number;
}

export type MigrationName = 'legacy' | 'telegram';

// ---------------------------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------------------------

/**
 * The composer drafts a stored value holds. `undefined`, an array, a string and every entry that is
 * not a draft answer "nothing": a half-written key or a hand-edited file must not put junk into the
 * map the composer reads on its first render.
 */
export function composerDraftsFrom(value: unknown): ComposerDraftMap {
  const drafts: ComposerDraftMap = {};
  if (!isRecord(value)) return drafts;
  for (const [folderPath, entry] of Object.entries(value)) {
    if (folderPath === '') continue;
    const draft = composerDraft(entry);
    if (draft) drafts[folderPath] = draft;
  }
  return drafts;
}

export function fullscreenDraftsFrom(value: unknown): FullscreenDraftMap {
  const drafts: FullscreenDraftMap = {};
  if (!isRecord(value)) return drafts;
  for (const [itemId, entry] of Object.entries(value)) {
    if (itemId === '') continue;
    const draft = fullscreenDraft(entry);
    if (draft) drafts[itemId] = draft;
  }
  return drafts;
}

export function draftsFromSection(section: unknown): DraftsSection {
  const record = isRecord(section) ? section : {};
  return {
    composer: composerDraftsFrom(record.composer),
    fullscreen: fullscreenDraftsFrom(record.fullscreen),
  };
}

/** The section these drafts are written as: sanitized, and both halves always present. */
export function draftsToSection(drafts: DraftsSection): Record<string, unknown> {
  return {
    composer: composerDraftsFrom(drafts.composer),
    fullscreen: fullscreenDraftsFrom(drafts.fullscreen),
  };
}

/**
 * One copy of the map from each side into one: the newer draft keeps the folder, neither side loses
 * a folder. This is the migration rule too — the section on disk and the old `localStorage` blob are
 * merged, never swapped, so a move that dies halfway drops no text.
 */
export function mergeComposerDrafts(stored: ComposerDraftMap, incoming: ComposerDraftMap): ComposerDraftMap {
  const merged = composerDraftsFrom(stored);
  for (const [folderPath, draft] of Object.entries(composerDraftsFrom(incoming))) {
    if (draft.updatedAt >= (merged[folderPath]?.updatedAt ?? -1)) merged[folderPath] = draft;
  }
  return merged;
}

export function mergeFullscreenDrafts(
  stored: FullscreenDraftMap,
  incoming: FullscreenDraftMap
): FullscreenDraftMap {
  const merged = fullscreenDraftsFrom(stored);
  for (const [itemId, draft] of Object.entries(fullscreenDraftsFrom(incoming))) {
    if (draft.updatedAt >= (merged[itemId]?.updatedAt ?? -1)) merged[itemId] = draft;
  }
  return merged;
}

/** A draft someone can still restore: the text is what makes it one, everything else has a default. */
function composerDraft(value: unknown): ComposerDraft | null {
  if (!isRecord(value) || typeof value.content !== 'string') return null;
  const draft: ComposerDraft = {
    content: value.content,
    itemType: pick(value.itemType, ITEM_TYPES, 'note'),
    priority: pick(value.priority, PRIORITIES, 'none'),
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : '',
    tags: strings(value.tags),
    attachments: attachments(value.attachments),
    replyTarget: replyTarget(value.replyTarget),
    updatedAt: milliseconds(value.updatedAt),
  };
  if (typeof value.targetFolder === 'string' || value.targetFolder === null) {
    draft.targetFolder = value.targetFolder;
  }
  const duration = optionalNumber(value.duration);
  if (duration !== undefined) draft.duration = duration;
  const recurrence = recurrenceRule(value.recurrence);
  if (recurrence) draft.recurrence = recurrence;
  return draft;
}

function fullscreenDraft(value: unknown): FullscreenDraft | null {
  if (!isRecord(value) || typeof value.itemId !== 'string' || typeof value.content !== 'string') return null;
  const draft: FullscreenDraft = {
    itemId: value.itemId,
    title: typeof value.title === 'string' ? value.title : '',
    content: value.content,
    tags: strings(value.tags),
    folder: typeof value.folder === 'string' ? value.folder : '',
    type: pick(value.type, ITEM_TYPES, 'note'),
    updatedAt: milliseconds(value.updatedAt),
  };
  if (isDefined(value.priority)) draft.priority = pick(value.priority, PRIORITIES, 'none');
  if (isDefined(value.status)) draft.status = pick(value.status, STATUSES, 'todo');
  if (typeof value.dueDate === 'string') draft.dueDate = value.dueDate;
  const duration = optionalNumber(value.duration);
  if (duration !== undefined) draft.duration = duration;
  const recurrence = recurrenceRule(value.recurrence);
  if (recurrence) draft.recurrence = recurrence;
  return draft;
}

// ---------------------------------------------------------------------------------------------
// Chat: the assistant transcript and the telegram thread share one section
// ---------------------------------------------------------------------------------------------

export function chatMessagesFrom(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
  for (const entry of value) {
    const message = chatMessage(entry);
    if (message) messages.push(message);
  }
  return messages;
}

export function telegramThreadFrom(value: unknown): TelegramThreadEntry[] {
  if (!Array.isArray(value)) return [];
  const thread: TelegramThreadEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;
    if (typeof entry.content !== 'string') continue;
    thread.push({ role: entry.role, content: entry.content });
  }
  return thread;
}

export function chatFromSection(section: unknown): ChatSection {
  const record = isRecord(section) ? section : {};
  return {
    messages: chatMessagesFrom(record.messages),
    telegram: telegramThreadFrom(record.telegram),
  };
}

export function chatToSection(chat: ChatSection): Record<string, unknown> {
  return {
    messages: chatMessagesFrom(chat.messages),
    telegram: telegramThreadFrom(chat.telegram),
  };
}
/**
 * Two transcripts into one, by id and then by time: the same message on both sides is one message,
 * and the order the model reads is the order the person saw. Running this twice adds nothing.
 */
export function mergeChatMessages(stored: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of chatMessagesFrom(stored)) byId.set(message.id, message);
  for (const message of chatMessagesFrom(incoming)) {
    const known = byId.get(message.id);
    if (!known || message.createdAt >= known.createdAt) byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => left.createdAt - right.createdAt);
}

/**
 * The same exchange said twice is one exchange: the thread has no ids, so the role and the text are
 * what identify it. Order is kept — the bot's answer only means something after its question.
 */
export function mergeTelegramThread(
  stored: TelegramThreadEntry[],
  incoming: TelegramThreadEntry[]
): TelegramThreadEntry[] {
  const merged: TelegramThreadEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...telegramThreadFrom(stored), ...telegramThreadFrom(incoming)]) {
    const key = `${entry.role}\u0000${entry.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

function chatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const role = value.role;
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;
  if (typeof value.id !== 'string' || value.id === '' || typeof value.content !== 'string') return null;
  const message: ChatMessage = {
    id: value.id,
    role,
    content: value.content,
    createdAt: milliseconds(value.createdAt),
  };
  if (typeof value.reasoning === 'string') message.reasoning = value.reasoning;
  const reasoningTimeMs = optionalNumber(value.reasoningTimeMs);
  if (reasoningTimeMs !== undefined) message.reasoningTimeMs = reasoningTimeMs;
  if (Array.isArray(value.toolCalls)) {
    message.toolCalls = value.toolCalls.filter(isRecord) as unknown as ChatToolCall[];
  }
  if (isRecord(value.suggestedAction)) {
    message.suggestedAction = value.suggestedAction as unknown as SuggestedAction;
  }
  if (Array.isArray(value.suggestedActions)) {
    message.suggestedActions = value.suggestedActions.filter(isRecord) as unknown as SuggestedAction[];
  }
  return message;
}

// ---------------------------------------------------------------------------------------------
// Memory: the facts the assistant wrote about this person
// ---------------------------------------------------------------------------------------------

export function memoryFrom(value: unknown): MemoryItem[] {
  if (!Array.isArray(value)) return [];
  const items: MemoryItem[] = [];
  for (const entry of value) {
    const item = memoryItem(entry);
    if (item) items.push(item);
  }
  return items;
}

export function memoryFromSection(section: unknown): MemoryItem[] {
  const record = isRecord(section) ? section : {};
  return memoryFrom(record.items);
}

export function memoryToSection(items: MemoryItem[]): Record<string, unknown> {
  return { items: memoryFrom(items) };
}

/**
 * Two ledgers into one, by id: the later `updatedAt` wins, and on equal stamps a tombstone wins —
 * a fact deleted after the move must not be resurrected by an older copy of the old blob.
 */
export function mergeMemory(stored: MemoryItem[], incoming: MemoryItem[]): MemoryItem[] {
  const byId = new Map<string, MemoryItem>();
  for (const item of memoryFrom(stored)) byId.set(item.id, item);
  for (const item of memoryFrom(incoming)) {
    const known = byId.get(item.id);
    if (!known || isNewerMemory(item, known)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function isNewerMemory(candidate: MemoryItem, known: MemoryItem): boolean {
  if (candidate.updatedAt !== known.updatedAt) return candidate.updatedAt > known.updatedAt;
  return candidate.deletedAt !== undefined && known.deletedAt === undefined;
}

function memoryItem(value: unknown): MemoryItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.text !== 'string') return null;
  const item: MemoryItem = {
    id: value.id,
    text: value.text,
    normalized: typeof value.normalized === 'string' ? value.normalized : '',
    kind: pick(value.kind, MEMORY_KINDS, 'fact'),
    tag: typeof value.tag === 'string' ? value.tag : null,
    importance: optionalNumber(value.importance) ?? 3,
    mentions: optionalNumber(value.mentions) ?? 1,
    usedCount: optionalNumber(value.usedCount) ?? 0,
    createdAt: milliseconds(value.createdAt),
    updatedAt: milliseconds(value.updatedAt),
    usedAt: milliseconds(value.usedAt),
    isPinned: value.isPinned === true,
  };
  if (typeof value.validTo === 'number' && Number.isFinite(value.validTo)) item.validTo = value.validTo;
  if (typeof value.supersededBy === 'string') item.supersededBy = value.supersededBy;
  if (typeof value.deletedAt === 'number' && Number.isFinite(value.deletedAt)) {
    item.deletedAt = value.deletedAt;
  }
  return item;
}

// ---------------------------------------------------------------------------------------------
// Workspace: the section is the state object itself, because `flushStateToDisk` already writes it
// ---------------------------------------------------------------------------------------------

/**
 * The workspace a stored section holds. A missing key, an array or a string reads as "nothing was
 * saved here" — the defaults are the caller's, not this file's. `folderSettings` is the one nested
 * map a merge has to reason about, so junk entries are dropped here rather than in a merge.
 */
export function workspaceFromState(value: unknown): Partial<WorkspaceState> {
  if (!isRecord(value)) return {};
  const state = { ...value } as Partial<WorkspaceState>;
  const settings = folderSettings(value.folderSettings);
  if (Object.keys(settings).length > 0) state.folderSettings = settings;
  else delete state.folderSettings;
  return state;
}

/**
 * The file and the old key into one, per folder for `folderSettings`: the old key was the live
 * writer until the move, so its values win where both sides have one, and neither folder is lost.
 */
export function mergeWorkspaceState(stored: unknown, legacy: unknown): Partial<WorkspaceState> {
  const fromDisk = workspaceFromState(stored);
  const fromLegacy = workspaceFromState(legacy);
  const merged: Partial<WorkspaceState> = { ...fromDisk, ...fromLegacy };
  const settings = { ...folderSettings(fromDisk.folderSettings), ...folderSettings(fromLegacy.folderSettings) };
  if (Object.keys(settings).length > 0) merged.folderSettings = settings;
  else delete merged.folderSettings;
  return merged;
}

function folderSettings(value: unknown): Record<string, FolderViewSettings> {
  if (!isRecord(value)) return {};
  const settings: Record<string, FolderViewSettings> = {};
  for (const [path, entry] of Object.entries(value)) {
    if (path === '' || !isRecord(entry)) continue;
    settings[path] = entry as unknown as FolderViewSettings;
  }
  return settings;
}

// ---------------------------------------------------------------------------------------------
// Migration stamps
// ---------------------------------------------------------------------------------------------

export function migrationStampsFrom(section: unknown): MigrationStamps {
  const record = isRecord(section) ? section : {};
  return {
    legacyAt: milliseconds(record.legacyAt),
    telegramAt: milliseconds(record.telegramAt),
  };
}

/** A stamp is written once: a second pass over an already migrated section keeps the first one. */
export function stampMigration(stamps: MigrationStamps, name: MigrationName, at: number): MigrationStamps {
  if (name === 'legacy') return { ...stamps, legacyAt: stamps.legacyAt || at };
  return { ...stamps, telegramAt: stamps.telegramAt || at };
}

/** Only what was really stamped: a missing name stays missing, so a later pass still takes it. */
export function migrationStampsToSection(stamps: MigrationStamps): Record<string, number> {
  const section: Record<string, number> = {};
  if (stamps.legacyAt > 0) section.legacyAt = stamps.legacyAt;
  if (stamps.telegramAt > 0) section.telegramAt = stamps.telegramAt;
  return section;
}

// ---------------------------------------------------------------------------------------------
// Small guards
// ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A field an older build never wrote keeps its own default instead of turning into `undefined`. */
function isDefined(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function attachments(value: unknown): SlagAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as unknown as SlagAttachment[];
}

/** A reply target is only worth keeping when a reply can be restored from it. */
function replyTarget(value: unknown): ReplyTarget | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.content !== 'string') {
    return null;
  }
  if (value.type !== 'note' && value.type !== 'article' && value.type !== 'task') return null;
  return { id: value.id, type: value.type, title: value.title, content: value.content };
}

function recurrenceRule(value: unknown): RecurrenceRule | undefined {
  if (!isRecord(value)) return undefined;
  const freq = value.freq;
  if (freq !== 'daily' && freq !== 'weekdays' && freq !== 'weekly' && freq !== 'monthly' && freq !== 'yearly') {
    return undefined;
  }
  const rule: RecurrenceRule = { freq };
  const interval = optionalNumber(value.interval);
  if (interval !== undefined) rule.interval = interval;
  if (Array.isArray(value.weekdays)) {
    const weekdays = value.weekdays.filter(
      (day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 7
    );
    if (weekdays.length > 0) rule.weekdays = weekdays;
  }
  if (typeof value.resetSubtasks === 'boolean') rule.resetSubtasks = value.resetSubtasks;
  return rule;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A moment in time, or the epoch: a string or a `NaN` would compare against `undefined` forever. */
function milliseconds(value: unknown): number {
  return optionalNumber(value) ?? 0;
}
