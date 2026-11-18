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
  kanbanColumns?: KanbanColumn[];
  showReferenceColumn?: boolean;
  /** Manual position in the tree; absent while the folder was never dragged. */
  order?: number;
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
export type LogScope = 'AI' | 'FS' | 'NODE' | 'SEARCH' | 'UI' | 'APP' | 'SYNC' | 'MEDIA' | 'WORKSPACE' | 'NOTIFY' | 'UPDATE';

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

/**
 * What a question from the bot is allowed to touch. A ladder, not a switch:
 * `minimal` sees tasks only, `read` may also search and read notes, `risky` is the full
 * assistant including note edits. Chosen by a human, never inferred.
 */
export type AssistantMode = 'minimal' | 'read' | 'risky';

/** The stored setting: a mode, or off entirely. Off keeps reminders and drops the question path. */
export type AssistantSetting = 'off' | AssistantMode;

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
  /**
   * The "не беспокоить" mode: a reminder that falls inside the window waits for its end.
   * Off means every reminder rings when it falls, and the window below is kept but idle.
   */
  quietEnabled: boolean;
  /** Inclusive start of the quiet window, `HH:MM` local. */
  quietFrom: string;
  /** Exclusive end of the quiet window, `HH:MM` local. */
  quietTo: string;
  /** Let this vault's telegram channel ask a question of the devices. */
  assistantMode: AssistantSetting;
  /** Hide the body behind a telegram spoiler: the chat shows a tap-to-reveal line. */
  spoiler: boolean;
  /**
   * The master switch over every outbound integration. Off means nothing leaves this device:
   * no reminders are armed on the relay and the bot answers nobody. Local system toasts take
   * over. Missing on older workspaces and treated as on.
   */
  integrationsEnabled: boolean;
  /** The telegram channel's own switch, one row in the integrations list. */
  telegramEnabled: boolean;
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
  /**
   * The assistant's own instructions, written by the owner and synced with the vault: the same
   * answer on every device instead of one voice per install. `aiPersona` is appended on top.
   */
  aiPrompt?: string;
  aiPersona?: string;
  aiPersonaEnabled?: boolean;
  /** When each of those was last written. Synced with the text; the newer copy wins per field. */
  aiPromptAt?: number;
  aiPersonaAt?: number;
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

/** A newer build the app can fetch itself. `manual` means "show the release page, do not apply". */
export interface AppUpdateOffer {
  version: string;
  notes: string | null;
  pubDate: string | null;
  currentVersion: string;
  /**
   * Which file this machine would take: `deb` on ubuntu, `archpkg` on arch, `appimage` when the
   * app owns the file and can swap it. `manual` is "there is nothing here to install".
   */
  kind: 'portable' | 'installer' | 'apk' | 'appimage' | 'deb' | 'archpkg' | 'manual';
  size: number | null;
}

/**
 * A package the app downloaded but will not install: apt and pacman need root, so the owner runs
 * the command. `path` is where the file landed, `command` is what to paste into a terminal.
 */
export interface AppUpdatePackage {
  version: string;
  kind: 'deb' | 'archpkg' | 'appimage';
  path: string;
  command: string;
}

/**
 * Which release stream this install follows. Each one has its own `latest.json`: `release` reads
 * GitHub's latest, `beta` and `dev` read their rolling prerelease tag.
 */
export type AppUpdateChannel = 'release' | 'beta' | 'dev';

/**
 * How this build is installed, which is what decides who may replace it: the app owns its portable
 * exe and its AppImage, while a package or a flatpak belongs to the system and is updated there.
 */
export type AppUpdateInstallForm = 'portable' | 'installer' | 'apk' | 'appimage' | 'flatpak' | 'package' | 'bundle';

/** What this build is and whether it can replace its own binary. */
export interface AppUpdatePlatform {
  os: string;
  arch: string;
  currentVersion: string;
  canApply: boolean;
  releasePage: string;
  /** The stream the native side was asked about. */
  channel: AppUpdateChannel;
  /** How this build is installed; the UI picks its wording from it. */
  installForm: AppUpdateInstallForm;
  /** The manifest URL actually in use; a dev override shows up here. */
  endpoint: string;
  /** Android only: `PackageManager.canRequestPackageInstalls()`, null elsewhere or unknown. */
  canInstallPackages: boolean | null;
  /** Linux only: `debian` | `arch` | `other` — which package this machine installs. */
  distro: string | null;
  /**
   * Linux only: a `.deb`/Arch package build with a polkit agent on the bus, so the app can ask for
   * the password itself instead of handing over a `sudo` line.
   */
  canInstallPackage: boolean;
}

/** The Android grants a reminder needs; each one is a switch in system settings, not a dialog. */
export interface DeviceAccessStatus {
  /** draw over other apps: the reminder panel appears while another app is in front. */
  overlay: boolean;
  /** the OS will post this app's notifications at all. */
  notifications: boolean;
  /** Android 14+: an alarm may take the whole screen; true on older releases by default. */
  fullScreenIntent: boolean;
}

export type DeviceAccessTarget = 'overlay' | 'notifications' | 'fullScreen';

/** A line the native updater emits so the pipeline is visible in Логи & Диагностика. */
export interface AppUpdateLogLine {
  level: string;
  message: string;
  data: string;
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'up-to-date'
  | 'error';

export interface AppUpdateProgress {
  downloaded: number;
  total: number | null;
}

export interface AppUpdateInstallOutcome {
  status: 'restarting' | 'installer_launched' | 'permission_required';
  version: string;
}

/**
 * What the system did with the package the app downloaded. `manual` means there is no password
 * dialog to show, so the command is the whole answer; `cancelled` is a dismissed dialog, which is
 * a decision and not a failure.
 */
export interface AppUpdatePackageInstall {
  status: 'installed' | 'cancelled' | 'manual' | 'failed';
  version: string;
  /** The command to paste into a terminal: the fallback, or the one that failed. */
  command: string;
  /** Tail of the package manager's own output, when it said anything. */
  detail: string | null;
}

/** The update state the settings tab and the sidebar notice read from AppContext. */
export interface AppUpdateState {
  platform: AppUpdatePlatform | null;
  offer: AppUpdateOffer | null;
  status: AppUpdateStatus;
  progress: AppUpdateProgress | null;
  error: string | null;
  isNoticeVisible: boolean;
  canInstall: boolean;
  /** A file exists for this machine, but the app will not install it: the owner runs the command. */
  canFetchPackage: boolean;
  /** Linux package build with a polkit agent: "обновить" raises the desktop's password dialog. */
  canInstallPackage: boolean;
  /** The package fetched for this distro, if the owner asked for it: path plus the command. */
  packageOffer: AppUpdatePackage | null;
  /** Which stream this install follows; switching re-reads that stream's manifest. */
  channel: AppUpdateChannel;
  setChannel: (channel: AppUpdateChannel) => void;
  check: () => Promise<void>;
  install: () => Promise<void>;
  /** Linux package install: fetch the deb/pkg.tar.zst and hand over the command. */
  downloadPackage: () => Promise<void>;
  /** Linux package install through polkit; falls back to the command when there is no agent. */
  installPackage: () => Promise<void>;
  /** Relaunch the app: the only way a freshly installed package becomes the running build. */
  restartApp: () => void;
  dismiss: () => void;
  openReleasePage: () => void;
  openInstallPermissionSettings: () => void;
}





