// localStorage keys, the default inbox name and the workspace state a new vault starts in.
import type { WorkspaceState, FolderMeta, VaultMeta, BackupSettings } from '../types';

export const DEFAULT_INBOX_FOLDER = 'Входящие';

export const STORAGE_KEYS = {
  VAULTS: 'slag_vaults_v2',
  CURRENT_VAULT: 'slag_current_vault_v2',
  ITEMS_PREFIX: 'slag_items_',
  FOLDERS_PREFIX: 'slag_folders_',
  ATTACHMENTS_PREFIX: 'slag_attachments_',
  TRASH_PREFIX: 'slag_trash_',
  DRAFTS_PREFIX: 'slag_drafts_',
  ASSISTANT_PREFIX: 'slag_assistant_',
  MEMORY_PREFIX: 'slag_memory_',
  WORKSPACE_STATE_PREFIX: 'slag_workspace_state_',
  FULLSCREEN_DRAFTS_PREFIX: 'slag_fullscreen_draft_',
  FULLSCREEN_WIDTH: 'slag_fullscreen_is_full_width',
  AI_SETTINGS: 'slag_ai_settings_v2',
  SIDEBAR_WIDTH: 'slag_sidebar_width_v2',
  RIGHT_PANEL_WIDTH: 'slag_right_panel_width_v2',
  FEED_CONTENT_WIDTH: 'slag_feed_content_width_v1',
  MOBILE_DOCK_TABS: 'slag_mobile_dock_tabs_v2',
  UI_CONFIG: 'slag_ui_config_v2',
  BACKUP_SETTINGS: 'slag_backup_settings_v2',
  DETACHED_WINDOWS: 'slag_detached_windows_v2',
  SESSION_BREADCRUMBS: 'slag_session_breadcrumbs',
  UPDATE_DISMISSED: 'slag_update_dismissed_version',
  UPDATE_CHANNEL: 'slag_update_channel',
  MANIFEST_AUTOCHECK: 'slag_manifest_autocheck_v1',
} as const;

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  currentFolder: DEFAULT_INBOX_FOLDER,
  feedViewMode: 'feed',
  inboxMode: 'all',
  activeTypeFilter: 'all',
  activeTagFilter: null,
  activeMobileTab: 'folders',
  folderMediaTab: 'media',
  isKanbanMaterialsOpen: true,
  sortBy: 'createdAt',
  sortOrder: 'asc',
  folderSettings: {},
};

export const DEFAULT_FOLDERS: FolderMeta[] = [
  {
    path: DEFAULT_INBOX_FOLDER,
    name: DEFAULT_INBOX_FOLDER,
    description: 'Все новые неотсортированные заметки, идеи, быстрые мысли и задачи для дальнейшего распределения.',
    icon: 'Inbox',
  },
  {
    path: 'Карьера',
    name: 'Карьера',
    description: 'Профессиональный рост, рабочие цели, компетенции и проекты.',
    icon: 'Briefcase',
  },
  {
    path: 'Проекты',
    name: 'Проекты',
    description: 'Активные рабочие и технические проекты, задачи и код.',
    icon: 'Folder',
  },
  {
    path: 'Личное',
    name: 'Личное',
    description: 'Личные цели, планы, здоровье и повседневные дела.',
    icon: 'Bookmark',
  },
  {
    path: 'База знаний',
    name: 'База знаний',
    description: 'Вечнозеленые заметки, статьи, документация и полезные материалы.',
    icon: 'Book',
  },
  {
    path: 'Архив',
    name: 'Архив',
    description: 'Завершенные задачи, старые заметки и архивные материалы.',
    icon: 'Archive',
  },
];

export const DEFAULT_VAULT_META: VaultMeta = {
  id: 'default_vault',
  name: 'main',
  mode: 'indexeddb',
  isCurrent: true,
};

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackupEnabled: true,
  intervalHours: 24,
  retentionCount: 7,
};
