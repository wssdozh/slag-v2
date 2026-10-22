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

export type AiProvider = 'groq' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  groqApiKey: string;
  geminiApiKey: string;
  model: string; // e.g. 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'gemini-2.0-flash'
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
export type FeedViewMode = 'feed' | 'kanban' | 'calendar' | 'assistant';
export type RightPanelMode = 'info' | 'assistant';
export type ChatDisplayMode = 'bubbles' | 'document' | 'terminal';

export interface AiItemFilter {
  itemIds: string[];
  queryLabel: string;
}

export interface LightboxImage {
  id?: string;
  name: string;
  url: string;
}

export interface SuggestedAction {
  type: 'create_note';
  title: string;
  folder: string;
  content: string;
  tags: string[];
  itemType: SlagItemType;
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

