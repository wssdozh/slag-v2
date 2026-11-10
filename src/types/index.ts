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

export type AiProvider = 'groq' | 'kie' | 'gemini';
export type AiSourceMode = 'subscription' | 'byok';
export type SubscriptionAiTier = 'fast' | 'smart' | 'deep';

export interface AiSettings {
  sourceMode?: AiSourceMode;
  subscriptionModel?: SubscriptionAiTier;
  provider: AiProvider;
  groqApiKey: string;
  kieApiKey: string;
  kieBaseUrl?: string;
  geminiApiKey: string;
  model: string; // e.g. 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'gpt-5-2', 'claude-sonnet-4-5'
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
export type LogScope = 'AI' | 'FS' | 'SEARCH' | 'UI' | 'APP' | 'SYNC' | 'MEDIA' | 'WORKSPACE';

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




