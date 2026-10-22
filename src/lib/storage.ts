import type { SlagItem, FolderMeta, VaultMeta, SlagAttachment } from '../types';
import { serializeItemToMarkdown } from './markdownSerializer';

const VAULTS_KEY = 'slag_vaults_v2';
const CURRENT_VAULT_KEY = 'slag_current_vault_v2';
const ITEMS_STORAGE_PREFIX = 'slag_items_';
const FOLDERS_STORAGE_PREFIX = 'slag_folders_';
const ATTACHMENTS_STORAGE_PREFIX = 'slag_attachments_';
const TRASH_STORAGE_PREFIX = 'slag_trash_';

// Initial default folders
export const DEFAULT_FOLDERS: FolderMeta[] = [
  {
    path: 'Входящие',
    name: 'Входящие',
    description: 'Все новые неотсортированные заметки, идеи, быстрые мысли и задачи для дальнейшего распределения.',
    icon: 'Inbox',
    isSystem: true,
  },
  {
    path: 'Проекты',
    name: 'Проекты',
    description: 'Активные проекты, продуктовая разработка, технические спецификации и код.',
    icon: 'Folder',
  },
  {
    path: 'Проекты/SLAG v2',
    name: 'SLAG v2',
    description: 'Разработка приложения заметок в стиле Linear.',
    icon: 'Code2',
  },
  {
    path: 'Проекты/Дизайн',
    name: 'Дизайн',
    description: 'Интерфейсы, типографика Inter, референсы Linear и Vercel.',
    icon: 'Layers',
  },
  {
    path: 'Личное',
    name: 'Личное',
    description: 'Мысли, книги, бытовые вопросы.',
    icon: 'Bookmark',
  },
  {
    path: 'Личное/Финансы',
    name: 'Финансы',
    description: 'Счета, подписки, расходы.',
    icon: 'Briefcase',
  },
];

// Initial demo items demonstrating note, article, and task
export const DEFAULT_ITEMS: SlagItem[] = [
  {
    id: 'demo_task_1',
    type: 'task',
    title: 'Реализовать ИИ-тегирование заметок',
    content: 'Нужно подключить Gemini Flash API для автоматического определения релевантных тегов.\n\nПеред генерацией новых тегов передаем список уже существующих, чтобы не плодить синонимы.',
    folder: 'Проекты/SLAG v2',
    tags: ['ai', 'gemini', 'architecture'],
    createdAt: Date.now() - 3600000 * 5,
    updatedAt: Date.now() - 3600000 * 2,
    status: 'in_progress',
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    subtasks: [
      { id: 'st1', title: 'Собрать словарь всех существующих тегов', completed: true },
      { id: 'st2', title: 'Написать промпт с Few-Shot примерами для Gemini', completed: true },
      { id: 'st3', title: 'Сделать кнопку +Ai в Telegram-композере', completed: false },
    ],
    attachments: [],
  },
  {
    id: 'demo_article_1',
    type: 'article',
    title: 'Манифест ультра-минимализма: почему интерфейс не должен орать',
    content: `# Манифест ультра-минимализма

Большинство современных приложений для заметок перегружены визуальным шумом: яркие градиенты, громоздкие тулбары, постоянные всплывающие подсказки и рамки фокуса на каждом инпуте.

### Три ключевых принципа SLAG

1. **Монохромная тишина**: черный цвет и едва заметные разделители (1px \`rgba(255,255,255,0.06)\`). Никаких цветных радужных градиентов. Глаза отдыхают даже при 10 часах работы.
2. **Формат Obsidian (.md)**: все данные хранятся в открытом виде как Markdown-файлы с YAML frontmatter. Если приложение исчезнет, ваши заметки останутся в вашей файловой системе.
3. **Монолог в Telegram**: ввод заметки должен ощущаться как отправка сообщения самому себе в избранное. Минимум кликов — нажал Enter, и мысль зафиксирована.`,
    folder: 'Проекты/Дизайн',
    tags: ['дизайн', 'минимализм', 'манифест'],
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 1,
    readingTimeMinutes: 2,
    summary: 'Философия интерфейса в стиле Linear и Vercel: отсутствие визуального мусора и честное хранение в Markdown.',
    attachments: [],
  },
  {
    id: 'demo_note_1',
    type: 'note',
    title: 'Идея для интеграции с сервером синхронизации',
    content: 'Сделать сквозное E2E-шифрование на основе мастер-пароля перед отправкой файла на сервер. Полезно для переноса между десктопом и телефоном.',
    folder: 'Входящие',
    tags: ['идея', 'безопасность'],
    createdAt: Date.now() - 1800000,
    updatedAt: Date.now() - 1800000,
    attachments: [],
  },
  {
    id: 'demo_reply_1',
    type: 'note',
    title: 'Ответ по архитектуре ИИ',
    content: 'Сверил требования со статьёй [[Манифест ультра-минимализма: почему интерфейс не должен орать]].\n\nТеги должны подбираться тихо и без навязчивых баннеров.',
    folder: 'Проекты/SLAG v2',
    tags: ['ai', 'дизайн'],
    replyToId: 'demo_task_1',
    createdAt: Date.now() - 1200000,
    updatedAt: Date.now() - 1200000,
    attachments: [],
  },
  {
    id: 'demo_task_2',
    type: 'task',
    title: 'Купить хороший зеленый чай',
    content: 'Сенча или Габа для работы по вечерам. Не забыть взять на развес.',
    folder: 'Входящие',
    tags: ['покупки', 'личное'],
    createdAt: Date.now() - 900000,
    updatedAt: Date.now() - 900000,
    status: 'todo',
    priority: 'low',
    subtasks: [
      { id: 'st_tea1', title: 'Проверить чайную лавку у дома', completed: false }
    ],
    attachments: [],
  }
];

export class StorageService {
  private currentVault: VaultMeta;

  constructor() {
    this.currentVault = this.initCurrentVault();
    this.initDefaultsIfNeeded();
  }

  private initCurrentVault(): VaultMeta {
    const saved = localStorage.getItem(CURRENT_VAULT_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    const defaultVault: VaultMeta = {
      id: 'default_vault',
      name: 'Основное хранилище (Vault)',
      mode: 'indexeddb',
      isCurrent: true,
    };
    this.currentVault = defaultVault;
    localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(defaultVault));
    this.saveVaultMeta(defaultVault);
    return defaultVault;
  }

  public getCurrentVault(): VaultMeta {
    return this.currentVault;
  }

  public getVaults(): VaultMeta[] {
    const raw = localStorage.getItem(VAULTS_KEY);
    if (!raw) return this.currentVault ? [this.currentVault] : [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(v => v && typeof v === 'object' && v.id);
      }
      return this.currentVault ? [this.currentVault] : [];
    } catch {
      return this.currentVault ? [this.currentVault] : [];
    }
  }

  public saveVaultMeta(vault: VaultMeta): void {
    if (!vault || !vault.id) return;
    const list = this.getVaults().filter(v => v && v.id !== vault.id);
    list.push(vault);
    localStorage.setItem(VAULTS_KEY, JSON.stringify(list));
  }

  public switchVault(vaultId: string): VaultMeta {
    const vaults = this.getVaults();
    const target = vaults.find(v => v.id === vaultId);
    if (target) {
      this.currentVault = { ...target, isCurrent: true };
      localStorage.setItem(CURRENT_VAULT_KEY, JSON.stringify(this.currentVault));
      this.initDefaultsIfNeeded();
      return this.currentVault;
    }
    return this.currentVault;
  }

  public createVault(name: string, mode: 'indexeddb' | 'fsa' | 'tauri' = 'indexeddb'): VaultMeta {
    const newVault: VaultMeta = {
      id: 'vault_' + Date.now(),
      name,
      mode,
      isCurrent: true,
    };
    this.saveVaultMeta(newVault);
    return this.switchVault(newVault.id);
  }

  private getItemsKey(): string {
    return `${ITEMS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  private getFoldersKey(): string {
    return `${FOLDERS_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  private initDefaultsIfNeeded(): void {
    const foldersKey = this.getFoldersKey();
    if (!localStorage.getItem(foldersKey)) {
      localStorage.setItem(foldersKey, JSON.stringify(DEFAULT_FOLDERS));
    }

    const itemsKey = this.getItemsKey();
    if (!localStorage.getItem(itemsKey)) {
      localStorage.setItem(itemsKey, JSON.stringify(DEFAULT_ITEMS));
    }
  }

  // Folders API
  public getFolders(): FolderMeta[] {
    const raw = localStorage.getItem(this.getFoldersKey());
    if (!raw) return DEFAULT_FOLDERS;
    try {
      const parsed: FolderMeta[] = JSON.parse(raw);
      // Ensure "Входящие" always exists
      if (!parsed.some(f => f.path === 'Входящие')) {
        parsed.unshift(DEFAULT_FOLDERS[0]);
      }
      return parsed;
    } catch {
      return DEFAULT_FOLDERS;
    }
  }

  public saveFolder(folder: FolderMeta): void {
    const folders = this.getFolders().filter(f => f.path !== folder.path);
    folders.push(folder);
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));
  }

  public updateFolderDescription(path: string, description: string): void {
    const folders = this.getFolders().map(f => {
      if (f.path === path) {
        return { ...f, description };
      }
      return f;
    });
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));
  }

  public deleteFolder(path: string): void {
    if (path === 'Входящие') return; // Cannot delete system inbox
    const folders = this.getFolders().filter(f => f.path !== path && !f.path.startsWith(path + '/'));
    localStorage.setItem(this.getFoldersKey(), JSON.stringify(folders));

    // Move orphan items to "Входящие"
    const items = this.getItems();
    const updatedItems = items.map(it => {
      if (it.folder === path || it.folder.startsWith(path + '/')) {
        return { ...it, folder: 'Входящие', updatedAt: Date.now() };
      }
      return it;
    });
    localStorage.setItem(this.getItemsKey(), JSON.stringify(updatedItems));
  }

  // Items API
  public getItems(folder?: string): SlagItem[] {
    const raw = localStorage.getItem(this.getItemsKey());
    let list: SlagItem[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    if (folder) {
      return list.filter(i => i.folder === folder);
    }
    return list;
  }

  public getItemById(id: string): SlagItem | undefined {
    return this.getItems().find(i => i.id === id);
  }

  public saveItem(item: SlagItem): SlagItem {
    const items = this.getItems();
    const existingIndex = items.findIndex(i => i.id === item.id);
    const updatedItem = {
      ...item,
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      items[existingIndex] = updatedItem;
    } else {
      items.unshift(updatedItem);
    }

    localStorage.setItem(this.getItemsKey(), JSON.stringify(items));
    return updatedItem;
  }

  private getTrashKey(): string {
    return `${TRASH_STORAGE_PREFIX}${this.currentVault.id}`;
  }

  public getTrashItems(): SlagItem[] {
    const raw = localStorage.getItem(this.getTrashKey());
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public moveToTrash(id: string): void {
    const items = this.getItems();
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Remove from active items
    const remaining = items.filter(i => i.id !== id);
    localStorage.setItem(this.getItemsKey(), JSON.stringify(remaining));

    // Save to .trash
    const trash = this.getTrashItems();
    trash.unshift({ ...item, updatedAt: Date.now() });
    localStorage.setItem(this.getTrashKey(), JSON.stringify(trash));
  }

  public restoreFromTrash(id: string): SlagItem | null {
    const trash = this.getTrashItems();
    const item = trash.find(i => i.id === id);
    if (!item) return null;

    // Remove from trash
    const remainingTrash = trash.filter(i => i.id !== id);
    localStorage.setItem(this.getTrashKey(), JSON.stringify(remainingTrash));

    // Restore to active items
    this.saveItem(item);
    return item;
  }

  public emptyTrash(): void {
    localStorage.removeItem(this.getTrashKey());
  }

  public deleteItem(id: string): void {
    this.moveToTrash(id);
  }

  public moveItem(id: string, targetFolder: string): SlagItem | null {
    const item = this.getItemById(id);
    if (!item) return null;
    item.folder = targetFolder;
    item.updatedAt = Date.now();
    return this.saveItem(item);
  }

  // Attachments
  public saveAttachment(attachment: SlagAttachment): void {
    try {
      const key = `${ATTACHMENTS_STORAGE_PREFIX}${attachment.id}`;
      localStorage.setItem(key, JSON.stringify(attachment));
    } catch {
      // ignore
    }
  }

  public getAttachment(id: string): SlagAttachment | null {
    try {
      const raw = localStorage.getItem(`${ATTACHMENTS_STORAGE_PREFIX}${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // Tag taxonomy index
  public getAllExistingTags(): string[] {
    const items = this.getItems();
    const tagSet = new Set<string>();
    items.forEach(it => {
      (it.tags || []).forEach(t => tagSet.add(t.toLowerCase().trim()));
    });
    return Array.from(tagSet).sort();
  }

  // Vault & Folder Statistics for AI RAG & Inspector
  public getVaultStats(folderScope?: string): {
    totalItems: number;
    notesCount: number;
    tasksCount: number;
    articlesCount: number;
    tags: Record<string, number>;
    folders: Record<string, number>;
    scope: string;
  } {
    const allItems = this.getItems();
    const scopedItems = folderScope && folderScope !== 'Входящие'
      ? allItems.filter(i => i.folder === folderScope)
      : allItems;

    const tags: Record<string, number> = {};
    const folders: Record<string, number> = {};
    let notesCount = 0;
    let tasksCount = 0;
    let articlesCount = 0;

    scopedItems.forEach(it => {
      if (it.type === 'note') notesCount++;
      else if (it.type === 'task') tasksCount++;
      else if (it.type === 'article') articlesCount++;

      const folderName = it.folder || 'Входящие';
      folders[folderName] = (folders[folderName] || 0) + 1;

      (it.tags || []).forEach(t => {
        const clean = t.toLowerCase().trim();
        if (clean) tags[clean] = (tags[clean] || 0) + 1;
      });
    });

    return {
      totalItems: scopedItems.length,
      notesCount,
      tasksCount,
      articlesCount,
      tags,
      folders,
      scope: folderScope || 'Все хранилище',
    };
  }

  // Export current vault as Markdown files (ZIP or downloadable Blob)
  public exportVaultAsJson(): string {
    return JSON.stringify({
      vault: this.currentVault,
      folders: this.getFolders(),
      items: this.getItems(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  public importVaultFromJson(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.folders)) {
        localStorage.setItem(this.getFoldersKey(), JSON.stringify(data.folders));
      }
      if (Array.isArray(data.items)) {
        localStorage.setItem(this.getItemsKey(), JSON.stringify(data.items));
      }
      return true;
    } catch {
      return false;
    }
  }

  // Obsidian Markdown bundle: returns array of { path: string, content: string }
  public exportObsidianBundle(): Array<{ path: string; content: string }> {
    const items = this.getItems();
    return items.map(item => {
      const safeTitle = (item.title || 'untitled').replace(/[\\/:*?"<>|]/g, '-').slice(0, 50);
      const filename = `${safeTitle}.md`;
      const filePath = item.folder ? `${item.folder}/${filename}` : filename;
      const content = serializeItemToMarkdown(item);
      return { path: filePath, content };
    });
  }
}

export const storage = new StorageService();
