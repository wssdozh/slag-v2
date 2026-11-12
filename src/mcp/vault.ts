import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { SlagItem, FolderMeta } from '../types';
import type { McpVaultConfig, VaultStateData, NoteMatch } from './types';
import { parseMarkdownToItem, serializeItemToMarkdown } from '../lib/vault/markdownSerializer';
import { toggleCheckboxInContent, parseSubtasksFromContent } from '../lib/tasks/taskUtils';

import { getSafeNoteFilename } from '../lib/vault/noteFilename';
import { DEFAULT_INBOX_FOLDER } from '../config';
export { getSafeNoteFilename } from '../lib/vault/noteFilename';

export function resolveVaultConfig(customPath?: string): McpVaultConfig {
  let targetPath = customPath || process.env.SLAG_VAULT_PATH;

  if (!targetPath) {
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      targetPath = path.join(appData, 'com.slag.notes', 'vaults', 'main');
    } else if (process.platform === 'darwin') {
      targetPath = path.join(os.homedir(), 'Library', 'Application Support', 'com.slag.notes', 'vaults', 'main');
    } else {
      const configBase = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      targetPath = path.join(configBase, 'com.slag.notes', 'vaults', 'main');
    }
  }

  const resolved = path.resolve(targetPath);
  const candidateNotesDir = path.join(resolved, 'notes');
  const notesDir = existsSync(candidateNotesDir) ? candidateNotesDir : resolved;
  const trashDir = path.join(resolved, '.trash');
  const statePath = path.join(resolved, 'state.json');

  return {
    vaultPath: resolved,
    notesDir,
    trashDir,
    statePath,
  };
}

export class McpVault {
  public config: McpVaultConfig;

  constructor(customPath?: string) {
    this.config = resolveVaultConfig(customPath);
  }

  public async init(): Promise<void> {
    await fs.mkdir(this.config.notesDir, { recursive: true });
    await fs.mkdir(this.config.trashDir, { recursive: true });
    await fs.mkdir(path.join(this.config.notesDir, DEFAULT_INBOX_FOLDER), { recursive: true });
  }

  public async readState(): Promise<VaultStateData> {
    if (existsSync(this.config.statePath)) {
      try {
        const raw = await fs.readFile(this.config.statePath, 'utf-8');
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return {};
  }

  public async writeState(data: VaultStateData): Promise<void> {
    const current = await this.readState();
    const updated = {
      ...current,
      ...data,
      updatedAt: Date.now(),
    };
    await fs.writeFile(this.config.statePath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  public async getFolders(): Promise<FolderMeta[]> {
    const state = await this.readState();
    const stateFolders = Array.isArray(state.folders) ? state.folders : [];
    const knownPaths = new Set(stateFolders.map(f => f.path.replace(/\\/g, '/')));

    // Discover any disk folders missing from state.json
    const diskFolders: string[] = [];
    const scanDir = async (dir: string, base: string = '') => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const rel = base ? `${base}/${entry.name}` : entry.name;
            diskFolders.push(rel);
            await scanDir(path.join(dir, entry.name), rel);
          }
        }
      } catch {
        // ignore
      }
    };
    await scanDir(this.config.notesDir);

    const merged: FolderMeta[] = [...stateFolders];
    for (const df of diskFolders) {
      const norm = df.replace(/\\/g, '/');
      if (!knownPaths.has(norm)) {
        merged.push({
          path: norm,
          name: path.basename(norm),
          description: `Папка ${norm}`,
          icon: 'Folder',
        });
        knownPaths.add(norm);
      }
    }

    if (!knownPaths.has(DEFAULT_INBOX_FOLDER)) {
      merged.unshift({
        path: DEFAULT_INBOX_FOLDER,
        name: DEFAULT_INBOX_FOLDER,
        description: 'Все новые неотсортированные заметки, идеи, быстрые мысли и задачи.',
        icon: 'Inbox',
        isSystem: true,
      });
    }

    return merged;
  }

  public async createFolder(folderPath: string, description?: string, icon?: string): Promise<FolderMeta> {
    const norm = folderPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const absPath = path.join(this.config.notesDir, norm);
    await fs.mkdir(absPath, { recursive: true });

    const folders = await this.getFolders();
    let existing = folders.find(f => f.path.toLowerCase() === norm.toLowerCase());
    if (existing) {
      if (description) existing.description = description;
      if (icon) existing.icon = icon;
    } else {
      existing = {
        path: norm,
        name: path.basename(norm),
        description: description || `Папка ${norm}`,
        icon: icon || 'Folder',
      };
      folders.push(existing);
    }

    await this.writeState({ folders });
    return existing;
  }

  public async scanAllNotes(): Promise<NoteMatch[]> {
    const matches: NoteMatch[] = [];

    const walk = async (currentDir: string, relBase: string = '') => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const abs = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const subRel = relBase ? `${relBase}/${entry.name}` : entry.name;
            await walk(abs, subRel);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            try {
              const content = await fs.readFile(abs, 'utf-8');
              const fallbackId = entry.name.replace(/\.md$/, '');
              const folder = relBase.replace(/\\/g, '/') || DEFAULT_INBOX_FOLDER;
              const item = parseMarkdownToItem(content, fallbackId, folder);
              item.filename = entry.name;
              matches.push({
                item,
                relativePath: relBase ? `${relBase}/${entry.name}` : entry.name,
                absolutePath: abs,
              });
            } catch (err) {
              console.error(`[McpVault] Failed to parse note ${abs}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`[McpVault] Scan directory error ${currentDir}:`, err);
      }
    };

    await walk(this.config.notesDir);
    return matches;
  }

  public async findNote(idOrTitle: string): Promise<NoteMatch | null> {
    const all = await this.scanAllNotes();
    const query = idOrTitle.trim();
    const queryNorm = query.toLowerCase();
    const queryNoExt = queryNorm.replace(/\.md$/, '');

    // 1. Exact ID match
    const byId = all.find(m => m.item.id === query);
    if (byId) return byId;

    // 2. Exact filename match
    const byFilename = all.find(m => m.item.filename?.toLowerCase() === `${queryNoExt}.md`);
    if (byFilename) return byFilename;

    // 3. Exact title match
    const byTitle = all.find(m => m.item.title.trim().toLowerCase() === queryNoExt);
    if (byTitle) return byTitle;

    // 4. Relative path match
    const byRel = all.find(m => m.relativePath.toLowerCase().replace(/\\/g, '/') === queryNorm.replace(/\\/g, '/'));
    if (byRel) return byRel;

    // 5. Title substring match
    const byIncludes = all.find(m =>
      m.item.title.toLowerCase().includes(queryNoExt) ||
      queryNoExt.includes(m.item.title.toLowerCase())
    );
    if (byIncludes) return byIncludes;

    return null;
  }

  public async getNote(idOrTitle: string): Promise<{ item: SlagItem; rawMarkdown: string; path: string }> {
    const match = await this.findNote(idOrTitle);
    if (!match) {
      throw new Error(`Заметка «${idOrTitle}» не найдена в хранилище.`);
    }
    const rawMarkdown = await fs.readFile(match.absolutePath, 'utf-8');
    return {
      item: match.item,
      rawMarkdown,
      path: match.relativePath,
    };
  }

  public async saveNote(params: {
    id?: string;
    title?: string;
    content?: string;
    appendContent?: string;
    type?: 'note' | 'task' | 'article';
    folder?: string;
    tags?: string[];
    status?: 'backlog' | 'todo' | 'in_progress' | 'done';
    priority?: 'none' | 'low' | 'medium' | 'high';
    dueDate?: string;
    reminder?: string;
    subtasks?: string[];
  }): Promise<{ item: SlagItem; created: boolean; path: string }> {
    const targetFolder = (params.folder || DEFAULT_INBOX_FOLDER).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    let existingMatch: NoteMatch | null = null;

    if (params.id) {
      existingMatch = await this.findNote(params.id);
    }

    if (existingMatch) {
      // UPDATE EXISTING NOTE
      const existing = existingMatch.item;
      let finalContent = existing.content;

      if (params.content !== undefined) {
        finalContent = params.content;
      }
      if (params.appendContent) {
        finalContent = finalContent ? `${finalContent}\n\n${params.appendContent}` : params.appendContent;
      }
      if (params.subtasks && params.subtasks.length > 0) {
        const subtasksMd = params.subtasks.map(s => `- [ ] ${s}`).join('\n');
        finalContent = finalContent ? `${finalContent}\n\n${subtasksMd}` : subtasksMd;
      }

      const parsedSubtasks = parseSubtasksFromContent(finalContent);

      const updatedTitle = params.title?.trim() || existing.title;
      const updatedItem: SlagItem = {
        ...existing,
        title: updatedTitle,
        content: finalContent,
        type: params.type || existing.type,
        folder: targetFolder,
        tags: params.tags !== undefined ? params.tags : existing.tags,
        status: params.status !== undefined ? params.status : existing.status,
        priority: params.priority !== undefined ? params.priority : existing.priority,
        dueDate: params.dueDate !== undefined ? params.dueDate : existing.dueDate,
        reminder: params.reminder !== undefined ? params.reminder : existing.reminder,
        subtasks: parsedSubtasks.length > 0 ? parsedSubtasks : existing.subtasks,
        updatedAt: Date.now(),
      };

      const targetDir = path.join(this.config.notesDir, targetFolder);
      await fs.mkdir(targetDir, { recursive: true });

      const newFilename = getSafeNoteFilename(updatedTitle, updatedItem.id);
      const newAbsPath = path.join(targetDir, newFilename);

      // If location or filename changed, remove old file
      if (existingMatch.absolutePath !== newAbsPath && existsSync(existingMatch.absolutePath)) {
        await fs.unlink(existingMatch.absolutePath);
      }

      updatedItem.filename = newFilename;
      const markdown = serializeItemToMarkdown(updatedItem);
      await fs.writeFile(newAbsPath, markdown, 'utf-8');

      return {
        item: updatedItem,
        created: false,
        path: path.relative(this.config.notesDir, newAbsPath).replace(/\\/g, '/'),
      };
    }

    // CREATE NEW NOTE
    const newTitle = (params.title || 'Новая запись').trim();
    const newId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let initialContent = params.content || '';
    if (params.appendContent) {
      initialContent = initialContent ? `${initialContent}\n\n${params.appendContent}` : params.appendContent;
    }
    if (params.subtasks && params.subtasks.length > 0) {
      const subtasksMd = params.subtasks.map(s => `- [ ] ${s}`).join('\n');
      initialContent = initialContent ? `${initialContent}\n\n${subtasksMd}` : subtasksMd;
    }

    const parsedSubtasks = parseSubtasksFromContent(initialContent);

    const targetDir = path.join(this.config.notesDir, targetFolder);
    await fs.mkdir(targetDir, { recursive: true });

    let safeFilename = getSafeNoteFilename(newTitle, newId);
    let candidatePath = path.join(targetDir, safeFilename);
    let counter = 1;
    const baseName = safeFilename.replace(/\.md$/, '');
    while (existsSync(candidatePath)) {
      safeFilename = `${baseName} ${counter++}.md`;
      candidatePath = path.join(targetDir, safeFilename);
    }

    const newItem: SlagItem = {
      id: newId,
      title: newTitle,
      content: initialContent,
      type: params.type || (params.dueDate ? 'task' : 'note'),
      folder: targetFolder,
      filename: safeFilename,
      tags: params.tags || [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: params.status || (params.type === 'task' || params.dueDate ? 'todo' : undefined),
      priority: params.priority || (params.type === 'task' || params.dueDate ? 'none' : undefined),
      dueDate: params.dueDate,
      reminder: params.reminder,
      subtasks: parsedSubtasks.length > 0 ? parsedSubtasks : undefined,
    };

    const markdown = serializeItemToMarkdown(newItem);
    await fs.writeFile(candidatePath, markdown, 'utf-8');

    return {
      item: newItem,
      created: true,
      path: path.relative(this.config.notesDir, candidatePath).replace(/\\/g, '/'),
    };
  }

  public async deleteNote(idOrTitle: string): Promise<{ item: SlagItem; trashPath: string }> {
    const match = await this.findNote(idOrTitle);
    if (!match) {
      throw new Error(`Заметка «${idOrTitle}» не найдена.`);
    }

    await fs.mkdir(this.config.trashDir, { recursive: true });
    const trashFilename = match.item.filename || `${match.item.id}.md`;
    const destPath = path.join(this.config.trashDir, trashFilename);

    await fs.rename(match.absolutePath, destPath);

    return {
      item: match.item,
      trashPath: destPath,
    };
  }

  public async toggleTask(idOrTitle: string, subtaskId?: string, explicitStatus?: 'todo' | 'done'): Promise<SlagItem> {
    const match = await this.findNote(idOrTitle);
    if (!match) {
      throw new Error(`Задача «${idOrTitle}» не найдена.`);
    }

    const item = match.item;
    let newContent = item.content;

    if (subtaskId) {
      newContent = toggleCheckboxInContent(newContent, subtaskId, item.subtasks);
      const parsedSubtasks = parseSubtasksFromContent(newContent);
      item.content = newContent;
      item.subtasks = parsedSubtasks;
      item.updatedAt = Date.now();
    } else {
      const nextStatus = explicitStatus || (item.status === 'done' ? 'todo' : 'done');
      item.status = nextStatus;
      item.updatedAt = Date.now();
      if (nextStatus === 'done') {
        item.lastCompletedDate = new Date().toISOString().slice(0, 10);
      }
    }

    const markdown = serializeItemToMarkdown(item);
    await fs.writeFile(match.absolutePath, markdown, 'utf-8');
    return item;
  }

  public async searchNotes(params: {
    query: string;
    folder?: string;
    type?: string;
    status?: string;
    tag?: string;
    limit?: number;
  }): Promise<{ item: SlagItem; snippet: string; score: number }[]> {
    const all = await this.scanAllNotes();
    const q = params.query.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    const limit = params.limit || 10;

    const filtered = all.filter(({ item }) => {
      if (params.folder && item.folder.toLowerCase() !== params.folder.toLowerCase() && !item.folder.toLowerCase().startsWith(`${params.folder.toLowerCase()}/`)) {
        return false;
      }
      if (params.type && params.type !== 'all' && item.type !== params.type) {
        return false;
      }
      if (params.status && params.status !== 'all' && item.status !== params.status) {
        return false;
      }
      if (params.tag) {
        const cleanTag = params.tag.replace(/^#/, '').toLowerCase();
        if (!item.tags.some(t => t.toLowerCase() === cleanTag)) return false;
      }
      return true;
    });

    const scored = filtered.map(({ item }) => {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const contentLower = item.content.toLowerCase();
      const tagsJoined = item.tags.join(' ').toLowerCase();

      for (const term of terms) {
        if (titleLower === term) score += 50;
        else if (titleLower.includes(term)) score += 20;

        if (tagsJoined.includes(term)) score += 15;
        if (contentLower.includes(term)) score += 5;
      }

      // Generate snippet
      let snippet = '';
      if (item.content) {
        const firstTerm = terms[0];
        const idx = firstTerm ? item.content.toLowerCase().indexOf(firstTerm) : -1;
        if (idx !== -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(item.content.length, idx + 120);
          snippet = (start > 0 ? '...' : '') + item.content.slice(start, end).replace(/\r?\n/g, ' ') + (end < item.content.length ? '...' : '');
        } else {
          snippet = item.content.slice(0, 140).replace(/\r?\n/g, ' ');
        }
      }

      return { item, snippet, score };
    });

    return scored
      .filter(s => terms.length === 0 || s.score > 0)
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.item.updatedAt - a.item.updatedAt))
      .slice(0, limit);
  }

  public async listTasks(view: string = 'today', folder?: string): Promise<SlagItem[]> {
    const all = await this.scanAllNotes();
    const todayStr = new Date().toISOString().slice(0, 10);

    return all
      .map(m => m.item)
      .filter(item => {
        if (item.type !== 'task') return false;
        if (folder && item.folder.toLowerCase() !== folder.toLowerCase()) return false;

        const isDone = item.status === 'done';
        const due = item.dueDate;

        switch (view) {
          case 'today':
            return due === todayStr && !isDone;
          case 'overdue':
            return Boolean(due && due < todayStr && !isDone);
          case 'upcoming':
            return Boolean(due && due > todayStr && !isDone);
          case 'backlog':
            return item.status === 'backlog' || (!due && !isDone);
          case 'completed':
            return isDone;
          case 'all':
          default:
            return true;
        }
      })
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }

  public async listTags(): Promise<{ tag: string; count: number }[]> {
    const all = await this.scanAllNotes();
    const counts: Record<string, number> = {};

    for (const { item } of all) {
      for (const t of item.tags) {
        const clean = t.replace(/^#/, '').trim();
        if (clean) counts[clean] = (counts[clean] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  public async getStats(): Promise<Record<string, unknown>> {
    const all = await this.scanAllNotes();
    const todayStr = new Date().toISOString().slice(0, 10);

    let notes = 0;
    let tasks = 0;
    let articles = 0;
    let openTasks = 0;
    let overdueTasks = 0;
    let completedTasks = 0;

    const folderCounts: Record<string, number> = {};

    for (const { item } of all) {
      folderCounts[item.folder] = (folderCounts[item.folder] || 0) + 1;

      if (item.type === 'article') articles++;
      else if (item.type === 'task') {
        tasks++;
        if (item.status === 'done') completedTasks++;
        else {
          openTasks++;
          if (item.dueDate && item.dueDate < todayStr) overdueTasks++;
        }
      } else {
        notes++;
      }
    }

    return {
      totalItems: all.length,
      notes,
      tasks,
      articles,
      tasksBreakdown: {
        open: openTasks,
        overdue: overdueTasks,
        completed: completedTasks,
      },
      folderCounts,
      foldersCount: Object.keys(folderCounts).length,
    };
  }
}
