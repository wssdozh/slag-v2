export type SlagItemType = 'note' | 'article' | 'task';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';

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
}

export interface SlagSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface SlagItem {
  id: string;
  type: SlagItemType;
  title: string;
  content: string; // Markdown body
  folder: string; // Folder path, e.g. "Входящие" or "Проекты/SLAG"
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
  subtasks?: SlagSubtask[];
  kanbanColumn?: string;

  // Article-specific fields
  readingTimeMinutes?: number;
  summary?: string;

  // Link & Reply fields
  replyToId?: string; // ID of the note/task this is replying to
  linkedItemIds?: string[]; // IDs of explicitly linked tasks/notes
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
  name: string;
  path?: string;
  mode: 'indexeddb' | 'fsa' | 'tauri';
  isCurrent?: boolean;
}

export type AiProvider = 'groq' | 'kie' | 'gemini';

export interface AiSettings {
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
export type MobileTabId = 'folders' | 'tasks' | 'assistant' | 'settings' | 'calendar';

export interface AiItemFilter {
  itemIds: string[];
  queryLabel: string;
}

export interface LightboxImage {
  id?: string;
  name: string;
  url: string;
}

export type SuggestedActionType =
  | 'create_note'
  | 'schedule_task'
  | 'reschedule_task'
  | 'update_task_status'
  | 'decompose_task'
  | 'move_note';

export type ActionState = 'suggested' | 'executing' | 'applied' | 'rejected';

export interface SuggestedAction {
  type: SuggestedActionType;
  title: string;
  folder: string;
  content: string;
  tags: string[];
  itemType: SlagItemType;
  targetItemId?: string;
  dueDate?: string;
  reminder?: string;
  priority?: 'none' | 'low' | 'medium' | 'high';
  status?: 'backlog' | 'todo' | 'in_progress' | 'done';
  subtasks?: { id: string; title: string; completed: boolean }[];
  actionState?: ActionState;
  appliedItemId?: string;
  error?: string;
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
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogScope = 'AI' | 'FS' | 'SEARCH' | 'UI' | 'APP' | 'SYNC' | 'MEDIA';

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
export type UiFontScale = 'small' | 'normal' | 'large';

export interface DeviceUiConfig {
  fontScale: UiFontScale;
  density: UiDensity;
}

export interface AppUiConfig {
  desktop: DeviceUiConfig;
  mobile: DeviceUiConfig;
}

