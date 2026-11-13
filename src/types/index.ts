// The domain, in one place: notes, folders, vaults, attachments, sync and AI settings.
export type SlagItemType = 'note' | 'article' | 'task';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type SlagItemStatus = TaskStatus;
export type SlagItemPriority = 'none' | 'low' | 'medium' | 'high';

export interface SlagAttachment {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video' | 'file';
  mimeType: string;
  size: number;
  relativePath: string;
  dataUrl?: string; // Base64 or Object URL for rendering
  duration?: number; // Duration in seconds (e.g. 5.8)
  waveform?: number[]; // Normalized waveform peak array [0..1]
  extractedText?: string; // Whisper transcription (audio/video), OCR text (image), or file sample
  summary?: string; // 1-2 sentence context-aware summary or insight
  enrichmentStatus?: 'idle' | 'processing' | 'ready' | 'error';
  enrichmentError?: string;
}

export interface SlagSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export type RecurrenceFrequency = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  freq: RecurrenceFrequency;
  interval?: number; // default 1
  weekdays?: number[]; // [1..7] for Monday..Sunday
  resetSubtasks?: boolean; // default true
}

export interface SlagItem {
  id: string;
  type: SlagItemType;
  title: string;
  content: string; // Markdown body
  folder: string; // Folder path, e.g. "Входящие" or "Проекты/SLAG"
  filename?: string; // Physical file name on disk, e.g. "Купить молоко.md"
  tags: string[];
  attachments: SlagAttachment[];
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  isArchived?: boolean;

  // Task-specific fields
  status?: 'backlog' | 'todo' | 'in_progress' | 'done';
  priority?: 'none' | 'low' | 'medium' | 'high';
  dueDate?: string; // YYYY-MM-DD
  reminder?: string; // ISO DateTime
  duration?: number; // Duration in minutes (e.g. 15, 30, 45, 60, 90)
  recurrence?: RecurrenceRule;
  streak?: number; // Current completion streak count (>= 0)
  history?: string[]; // ISO-dates of past completions, e.g. ["2026-03-27", "2026-03-28"]
  lastCompletedDate?: string; // YYYY-MM-DD of last completion
  subtasks?: SlagSubtask[];
  kanbanColumn?: string;

  // Article-specific fields
  readingTimeMinutes?: number;
  summary?: string;

  // Link & Reply fields
  replyToId?: string; // ID of the note/task this is replying to
  linkedItemIds?: string[]; // IDs of explicitly linked tasks/notes

  // Arbitrary frontmatter & dynamic properties
  customProps?: Record<string, any>;
}

export interface KanbanColumn {
  id: string;
  title: string;
  statusMapping?: 'backlog' | 'todo' | 'in_progress' | 'done';
}

export interface FolderMeta {
  path: string; // Relative path, e.g. "Входящие", "Проекты/SLAG"
  name: string; // Display name
  description: string; // Detailed description used by AI triage
  icon?: string;
  isSystem?: boolean; // E.g., true for "Входящие"
  kanbanColumns?: KanbanColumn[];
  showReferenceColumn?: boolean;
}

export interface VaultMeta {
  id: string;
  /** Global sync identity; legacy local IDs such as default_vault are not globally unique. */
  syncId?: string;
  name: string;
  path?: string;
  mode: 'indexeddb' | 'fsa' | 'tauri';
  isCurrent?: boolean;
}

export type AiSourceMode = 'subscription' | 'byok';
export type SubscriptionAiTier = 'fast' | 'smart' | 'deep';

/** Where a connection speaks on the wire: OpenAI chat, OpenAI responses or Anthropic messages. */
export type AiWireProtocol = 'chat' | 'responses' | 'anthropic';

/** What the app asks a connection to do. One connection can serve several roles. */
export type AiRole = 'chat' | 'vision' | 'stt';

/** The provider a connection was created from. */
export type AiConnectionKind = 'groq' | 'kie' | 'gemini' | 'custom';

export interface AiConnection {
  /** Stable across edits: roles point at this id, so renaming a label never breaks them. */
  id: string;
  kind: AiConnectionKind;
  label: string;
  apiKey: string;
  /** Always filled: the preset default is copied in when the connection is created. */
  baseUrl: string;
  protocol: AiWireProtocol;
  /** Per-role model names; a missing entry falls back to the preset default. */
  models: Partial<Record<AiRole, string>>;
}

export interface AiSettings {
  sourceMode?: AiSourceMode;
  subscriptionModel?: SubscriptionAiTier;
  connections: AiConnection[];
  /** Connection id per role; null means the role is deliberately off. */
  roles: Record<AiRole, string | null>;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  autoTagging: boolean;
  autoTriage: boolean;
  webSearchEnabled: boolean;
  maxTagsPerNote: number;
  allowNewTags: boolean;
  tagCaseStyle: 'lowercase' | 'kebab-case';
  customTagRules?: string;
}

export type InboxMode = 'unsorted' | 'all' | 'sorted';
export type FeedViewMode = 'feed' | 'kanban' | 'calendar';
export type MobileTabId = 'folders' | 'tasks' | 'assistant' | 'settings' | 'calendar' | 'audio';

export type SortField = 'createdAt' | 'updatedAt' | 'title' | 'dueDate';
export type SortOrder = 'asc' | 'desc';

export interface FolderViewSettings {
  viewMode: FeedViewMode;
  typeFilter: SlagItemType | 'all';
  inboxMode?: InboxMode;
  sortBy: SortField;
  sortOrder: SortOrder;
  hideCompletedTasks?: boolean;
}

export const DEFAULT_FOLDER_VIEW_SETTINGS: FolderViewSettings = {
  viewMode: 'feed',
  typeFilter: 'all',
  inboxMode: 'all',
  sortBy: 'createdAt',
  sortOrder: 'asc',
  hideCompletedTasks: false,
};

export interface AiItemFilter {
  itemIds: string[];
  queryLabel: string;
}

export interface LightboxImage {
  id?: string;
  name: string;
  url: string;
  /** Photos and clips share one deck; the slide decides what to render. Default is a photo. */
  kind?: 'image' | 'video';
  extractedText?: string;
  summary?: string;
  enrichmentStatus?: 'idle' | 'processing' | 'ready' | 'error';
  enrichmentError?: string;
  itemId?: string;
  /** The note the file came from: the viewer's menu acts on it, not on the bytes. */
  sourceItem?: SlagItem;
}

export interface ItemUpdates {
  title?: string;
  content?: string;
  appendContent?: string;
  folder?: string;
  type?: SlagItemType;
  status?: TaskStatus;
  priority?: 'none' | 'low' | 'medium' | 'high';
  dueDate?: string | null;
  reminder?: string | null;
  duration?: number;
  kanbanColumn?: string;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  subtasks?: Array<{ id?: string; title: string; completed?: boolean }> | string[];
  isPinned?: boolean;
  isArchived?: boolean;
  customProps?: Record<string, any>;
}

export interface BatchUpdateItem {
  targetItemId: string;
  title: string;
  updates: ItemUpdates;
  reason?: string;
}

export type SuggestedActionType =
  | 'create_note'
  | 'schedule_task'
  | 'update_item'
  | 'batch_update';

export type ActionState = 'suggested' | 'executing' | 'applied' | 'rejected';

export interface BatchRescheduleItem {
  targetItemId: string;
  title: string;
  dueDate?: string;
  reminder?: string;
  priority?: 'none' | 'low' | 'medium' | 'high';
  reason?: string;
}

export interface SuggestedAction {
  type: SuggestedActionType;
  title: string;
  actionLabel?: string;
  folder: string;
  content: string;
  tags: string[];
  itemType: SlagItemType;
  targetItemId?: string;
  updates?: ItemUpdates;
  batchUpdateItems?: BatchUpdateItem[];
  actionState?: ActionState;
  appliedItemId?: string;
  error?: string;
  appendContent?: string;
  dueDate?: string;
  reminder?: string;
  priority?: 'none' | 'low' | 'medium' | 'high';
  status?: 'backlog' | 'todo' | 'in_progress' | 'done';
  subtasks?: { id: string; title: string; completed: boolean }[];
  batchItems?: BatchRescheduleItem[];
}

export interface ChatToolCall {
  name: string;
  args: Record<string, any>;
  result?: any;
}

/**
 * The assistant's own memory: one short fact per row.
 * The model writes `text`; normalized form, counters, dates and validity are the system's.
 */
export type MemoryKind = 'rule' | 'pref' | 'fact' | 'event' | 'note';

export interface MemoryItem {
  id: string;
  text: string;
  /** Stems of `text`, lowercased: what duplicate detection and matching compare. */
  normalized: string;
  kind: MemoryKind;
  tag: string | null;
  /** 1..5. The model proposes, the system clamps and floors by kind. */
  importance: number;
  mentions: number;
  /** Retrievals so far: the reinforcement half of the score. */
  usedCount: number;
  createdAt: number;
  updatedAt: number;
  usedAt: number;
  isPinned: boolean;
  /** Set when a newer fact replaced this one; the old row stays for the history. */
  validTo?: number;
  supersededBy?: string;
  /** Tombstone: keeps a stale upsert from resurrecting the fact. Pruned after 30 days. */
  deletedAt?: number;
}

export type MemoryOp = 'remember' | 'forget' | 'recall';

/** One tool, three operations: writing, forgetting and digging. */
export interface MemoryCommand {
  op: MemoryOp;
  text?: string;
  id?: string;
  kind?: MemoryKind;
  tag?: string;
  importance?: number;
  /** Id of the fact this one supersedes, if the model spotted a contradiction. */
  replaces?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  reasoning?: string;
  reasoningTimeMs?: number;
  toolCalls?: ChatToolCall[];
  suggestedAction?: SuggestedAction;
  suggestedActions?: SuggestedAction[];
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogScope = 'AI' | 'FS' | 'NODE' | 'SEARCH' | 'UI' | 'APP' | 'SYNC' | 'MEDIA' | 'WORKSPACE' | 'NOTIFY';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  scope: LogScope;
  message: string;
  data?: unknown;
  durationMs?: number;
}

export type UiDensity = 'compact' | 'normal' | 'spacious';
export type UiFontScale = 'small' | 'normal' | 'comfortable' | 'large';
export type UiFontFamily = 'inter' | 'system' | 'mono';
export type UiAccent = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';

export interface DeviceUiConfig {
  fontScale: UiFontScale;
  density: UiDensity;
  fontFamily?: UiFontFamily;
  accent: UiAccent;
}

export interface AppUiConfig {
  desktop: DeviceUiConfig;
  mobile: DeviceUiConfig;
}

export type FolderMediaTabId = 'media' | 'audio' | 'files' | 'links' | 'tags';

/** What the composer needs to show and send a reply. A full item satisfies it. */
export type ReplyTarget = Pick<SlagItem, 'id' | 'type' | 'title' | 'content'>;

export interface ComposerDraft {
  content: string;
  itemType: SlagItemType;
  priority: 'none' | 'low' | 'medium' | 'high';
  dueDate: string;
  tags: string[];
  attachments: SlagAttachment[];
  replyTarget: ReplyTarget | null;
  targetFolder?: string | null;
  duration?: number;
  recurrence?: RecurrenceRule;
  updatedAt: number;
}

export interface FullscreenDraft {
  itemId: string;
  title: string;
  content: string;
  tags: string[];
  folder: string;
  type: SlagItemType;
  priority?: 'none' | 'low' | 'medium' | 'high';
  status?: SlagItemStatus;
  dueDate?: string;
  duration?: number;
  recurrence?: RecurrenceRule;
  updatedAt: number;
}

export interface FullscreenEditorWorkspaceState {
  isOpen: boolean;
  itemId: string | null;
  isFullWidth?: boolean;
}

/** A telegram channel the relay may deliver reminders to; it never learns who is behind it. */
export interface NotifyRoute {
  token: string;
  label: string;
  state: 'pending' | 'active' | 'blocked';
}

/** What this vault wants to hear about, and when it is willing to hear it. */
export interface NotifyPrefs {
  /** Reminders that carry an exact time. */
  tasks: boolean;
  /** A morning ping for tasks whose due date has passed. */
  overdue: boolean;
  /** Inclusive start of the quiet window, `HH:MM` local. */
  quietFrom: string;
  /** Exclusive end of the quiet window, `HH:MM` local. */
  quietTo: string;
  /** Let this vault's telegram channel ask a question of the devices. */
  assistant: boolean;
}

/** Who this vault belongs to. Synced inside the encrypted bundle, so the relay never sees it. */
export interface ProfileInfo {
  name: string;
  /** Downscaled data URL, small on purpose: it rides every bundle with the workspace state. */
  avatar?: string;
}

export interface WorkspaceState {
  currentFolder: string;
  feedViewMode: FeedViewMode;
  inboxMode: InboxMode;
  activeTypeFilter: SlagItemType | 'all';
  activeTagFilter: string | null;
  activeMobileTab: MobileTabId;
  folderMediaTab?: FolderMediaTabId;
  isKanbanMaterialsOpen?: boolean;
  fullscreenEditorState?: FullscreenEditorWorkspaceState;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  hideCompletedTasks?: boolean;
  folderSettings?: Record<string, FolderViewSettings>;
  profile?: ProfileInfo;
  notifyRoutes?: NotifyRoute[];
  notifyPrefs?: NotifyPrefs;
}

export interface BackupSnapshotMeta {
  id: string;
  vaultId: string;
  vaultName: string;
  createdAt: number;
  notesCount: number;
  attachmentsCount: number;
  sizeBytes: number;
  trigger: 'auto' | 'manual';
  filename?: string;
}

export interface BackupSettings {
  autoBackupEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  lastBackupAt?: number;
}

/** One irreversible question asked in the app's own dialog, never by the system one. */
export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

/** A row of the device gallery, as MediaStore reports it. */
export type DeviceMediaKind = 'image' | 'video' | 'audio';

export interface DeviceMediaItem {
  id: string;
  /** `content://` handle: the plugin turns it into a thumbnail and, later, into bytes. */
  uri: DeviceUri;
  kind: DeviceMediaKind;
  name: string;
  mimeType: string;
  size: number;
  dateAdded: number;
}

export interface DeviceMediaPage {
  items: DeviceMediaItem[];
  hasMore: boolean;
}

export type GalleryPermission = 'granted' | 'denied' | 'prompt';

export interface GalleryAccess {
  images: GalleryPermission;
  video: GalleryPermission;
  audio: GalleryPermission;
}

/** The shape `tauri-plugin-android-fs` addresses content URIs with. */
export interface DeviceUri {
  uri: string;
  documentTopTreeUri: string | null;
}

/** A folder the person handed over once; the grant survives restarts. */
export interface DeviceFolder {
  uri: DeviceUri;
  name: string;
}

export interface FolderEntry {
  uri: DeviceUri;
  name: string;
  isDir: boolean;
  size: number;
  mimeType: string;
  modified: number;
}

/** What any tab of the picker hands to the attachment pipeline: just enough to read and name it. */
export interface DevicePick {
  uri: DeviceUri;
  name: string;
  mimeType: string;
  size: number;
}




