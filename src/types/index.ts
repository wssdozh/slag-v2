export type SlagItemType = 'note' | 'article' | 'task';

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
  status?: 'todo' | 'in_progress' | 'done';
  priority?: 'none' | 'low' | 'medium' | 'high';
  dueDate?: string; // YYYY-MM-DD
  reminder?: string; // ISO DateTime
  subtasks?: SlagSubtask[];

  // Article-specific fields
  readingTimeMinutes?: number;
  summary?: string;
}

export interface FolderMeta {
  path: string; // Relative path, e.g. "Входящие", "Проекты/SLAG"
  name: string; // Display name
  description: string; // Detailed description used by AI triage
  icon?: string;
  isSystem?: boolean; // E.g., true for "Входящие"
}

export interface VaultMeta {
  id: string;
  name: string;
  path?: string;
  mode: 'indexeddb' | 'fsa' | 'tauri';
  isCurrent?: boolean;
}

export interface AiSettings {
  geminiApiKey: string;
  model: string; // e.g. 'gemini-2.0-flash' or 'gemini-1.5-flash'
  autoTagging: boolean;
  autoTriage: boolean;
}
