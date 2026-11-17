// The vault as the MCP server sees it: files on disk, frontmatter, attachments - no browser here.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { SlagAttachment, SlagItem, FolderMeta } from '../types';
import type { McpVaultConfig, VaultStateData, NoteMatch } from './types';
import { parseMarkdownToItem, serializeItemToMarkdown } from '../lib/vault/markdownSerializer';
import { toggleCheckboxInContent, parseSubtasksFromContent } from '../lib/tasks/taskUtils';
import { resolveAttachmentByName } from '../lib/text/attachmentEmbed';
import { applyNotePatch } from './notePatch';
import { buildNoteCard, formatBytes } from './noteCard';
import type { AttachmentCard, NoteCard, NoteRelation } from './noteCard';
import {
  INLINE_ATTACHMENT_LIMIT_BYTES,
  TEXT_ATTACHMENT_LIMIT_BYTES,
  attachmentFileUrl,
  attachmentResourceUri,
  isImageAttachment,
  isTextAttachment,
  resolveAttachmentPath,
} from './attachments';

import { getSafeNoteFilename } from '../lib/vault/noteFilename';
import { isSafeVaultRelativePath, safeVaultRelativePath } from '../lib/vault/safePath';
import { DEFAULT_INBOX_FOLDER } from '../config';

/** What came out of one attachment: text, raw bytes, or a reason there is nothing to give. */
export type AttachmentPayload =
  | { kind: 'text'; text: string; origin: 'file' | 'transcript' }
  | { kind: 'image'; mimeType: string; base64: string }
  | { kind: 'binary'; mimeType: string; base64: string }
  | { kind: 'no-bytes' }
  | { kind: 'no-transcript' }
  | { kind: 'too-large'; size: number; limit: number };

export interface AttachmentRead {
  note: { id: string; title: string; path: string };
  attachment: AttachmentCard;
  payload: AttachmentPayload;
}

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
    const stateFolders = (Array.isArray(state.folders) ? state.folders : [])
      .filter((folder): folder is FolderMeta =>
        Boolean(folder) && typeof folder.path === 'string' && isSafeVaultRelativePath(folder.path));
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
    const norm = safeVaultRelativePath(folderPath);
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

  public async getNote(idOrTitle: string): Promise<{
    item: SlagItem;
    rawMarkdown: string;
    path: string;
    absolutePath: string;
    folderAbsolutePath: string;
  }> {
    const match = await this.findNote(idOrTitle);
    if (!match) {
      throw new Error(`Заметка «${idOrTitle}» не найдена в хранилище.`);
    }
    const rawMarkdown = await fs.readFile(match.absolutePath, 'utf-8');
    return {
      item: match.item,
      rawMarkdown,
      path: match.relativePath.replace(/\\/g, '/'),
      absolutePath: match.absolutePath,
      folderAbsolutePath: path.dirname(match.absolutePath),
    };
  }

  /**
   * Everything about one note in a single answer. The tool and the `slag://notes/{id}` resource
   * share it, so a client never has to chain a metadata call with a markdown call.
   */
  public async getNoteCard(idOrTitle: string): Promise<NoteCard> {
    const note = await this.getNote(idOrTitle);
    const all = await this.scanAllNotes();
    const attachments = await Promise.all(
      note.item.attachments.map((attachment) => this.describeAttachment(note.item.id, attachment)),
    );

    const byId = new Map(all.map((match) => [match.item.id, match]));
    const relationOf = (id: string): NoteRelation => {
      const match = byId.get(id);
      return match
        ? { id, title: match.item.title, type: match.item.type, path: match.relativePath.replace(/\\/g, '/') }
        : { id };
    };

    const linked = (note.item.linkedItemIds ?? []).map(relationOf);
    const backlinks = all
      .filter((match) => match.item.id !== note.item.id && (
        match.item.replyToId === note.item.id ||
        (match.item.linkedItemIds ?? []).includes(note.item.id)
      ))
      .map((match) => ({
        id: match.item.id,
        title: match.item.title,
        type: match.item.type,
        path: match.relativePath.replace(/\\/g, '/'),
      }));

    return buildNoteCard({
      item: note.item,
      rawMarkdown: note.rawMarkdown,
      relativePath: note.path,
      absolutePath: note.absolutePath,
      folderAbsolutePath: note.folderAbsolutePath,
      attachments,
      replyTo: note.item.replyToId ? relationOf(note.item.replyToId) : undefined,
      linked,
      backlinks,
    });
  }

  /** One entry of the card's attachment list: where the bytes are and how a client can reach them. */
  private async describeAttachment(noteId: string, attachment: SlagAttachment): Promise<AttachmentCard> {
    const absolutePath = await resolveAttachmentPath(this.config, attachment);
    return {
      name: attachment.name,
      type: attachment.type,
      mimeType: attachment.mimeType || 'application/octet-stream',
      size: attachment.size,
      sizeHuman: formatBytes(attachment.size),
      isImage: isImageAttachment(attachment),
      relativePath: attachment.relativePath,
      absolutePath,
      url: absolutePath ? attachmentFileUrl(absolutePath) : attachmentResourceUri(noteId, attachment.name),
      resourceUri: attachmentResourceUri(noteId, attachment.name),
      hasBytes: Boolean(absolutePath),
      hasTranscript: Boolean(attachment.extractedText?.trim()),
      duration: attachment.duration,
    };
  }

  /**
   * The bytes of one attachment, or a typed reason there are none. Size is checked before the
   * read, so a huge video never turns into a base64 string just to be refused afterwards.
   */
  public async readAttachment(noteIdOrTitle: string, filename: string): Promise<AttachmentRead> {
    const note = await this.getNote(noteIdOrTitle);
    const attachment = this.findAttachment(note.item, filename);
    if (!attachment) {
      const known = note.item.attachments.map((item) => `«${item.name}»`).join(', ');
      throw new Error(
        known
          ? `У заметки «${note.item.title}» нет вложения «${filename}». Есть: ${known}.`
          : `У заметки «${note.item.title}» нет вложений.`,
      );
    }

    const card = await this.describeAttachment(note.item.id, attachment);
    const noteRef = { id: note.item.id, title: note.item.title, path: note.path };

    if (!card.absolutePath) {
      return { note: noteRef, attachment: card, payload: { kind: 'no-bytes' } };
    }

    const stat = await fs.stat(card.absolutePath).catch(() => null);
    if (!stat) {
      return { note: noteRef, attachment: card, payload: { kind: 'no-bytes' } };
    }
    if (isImageAttachment(attachment)) {
      if (stat.size > INLINE_ATTACHMENT_LIMIT_BYTES) {
        return {
          note: noteRef,
          attachment: card,
          payload: { kind: 'too-large', size: stat.size, limit: INLINE_ATTACHMENT_LIMIT_BYTES },
        };
      }
      const bytes = await fs.readFile(card.absolutePath);
      return {
        note: noteRef,
        attachment: card,
        payload: { kind: 'image', mimeType: card.mimeType, base64: bytes.toString('base64') },
      };
    }
    if (isTextAttachment(attachment)) {
      if (stat.size > TEXT_ATTACHMENT_LIMIT_BYTES) {
        return {
          note: noteRef,
          attachment: card,
          payload: { kind: 'too-large', size: stat.size, limit: TEXT_ATTACHMENT_LIMIT_BYTES },
        };
      }
      const text = await fs.readFile(card.absolutePath, 'utf-8');
      return { note: noteRef, attachment: card, payload: { kind: 'text', text, origin: 'file' } };
    }
    if (attachment.extractedText?.trim()) {
      // An audio note or a scanned pdf: the useful part is the text somebody already extracted.
      return {
        note: noteRef,
        attachment: card,
        payload: { kind: 'text', text: attachment.extractedText, origin: 'transcript' },
      };
    }
    if (attachment.type === 'audio') {
      return { note: noteRef, attachment: card, payload: { kind: 'no-transcript' } };
    }
    if (stat.size > INLINE_ATTACHMENT_LIMIT_BYTES) {
      return {
        note: noteRef,
        attachment: card,
        payload: { kind: 'too-large', size: stat.size, limit: INLINE_ATTACHMENT_LIMIT_BYTES },
      };
    }
    const bytes = await fs.readFile(card.absolutePath);
    return {
      note: noteRef,
      attachment: card,
      payload: { kind: 'binary', mimeType: card.mimeType, base64: bytes.toString('base64') },
    };
  }

  /** By file name, then by relative path's last segment: the note and the disk spell it differently. */
  private findAttachment(item: SlagItem, filename: string): SlagAttachment | undefined {
    const wanted = filename.trim().replace(/\\/g, '/');
    if (!wanted) return undefined;
    const folded = wanted.toLowerCase();
    const basename = (wanted.split('/').pop() || wanted).toLowerCase();

    const byExact = item.attachments.find(
      (attachment) => attachment.name === wanted || attachment.relativePath.replace(/\\/g, '/') === wanted,
    );
    if (byExact) return byExact;

    const byFolded = item.attachments.find((attachment) => (
      attachment.name.toLowerCase() === folded ||
      (attachment.relativePath.replace(/\\/g, '/').split('/').pop() || '').toLowerCase() === folded
    ));
    if (byFolded) return byFolded;

    return resolveAttachmentByName(item.attachments, basename);
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
    dueDate?: SlagItem['dueDate'] | null;
    reminder?: SlagItem['reminder'] | null;
    duration?: SlagItem['duration'] | null;
    recurrence?: SlagItem['recurrence'] | null;
    subtasks?: string[];
  }): Promise<{ item: SlagItem; created: boolean; path: string }> {
    let existingMatch: NoteMatch | null = null;

    if (params.id) {
      existingMatch = await this.findNote(params.id);
      if (!existingMatch) throw new Error(`Заметка «${params.id}» не найдена.`);
    }

    if (existingMatch) {
      // UPDATE EXISTING NOTE: a patch, not a rebuild. Only the fields the caller sent change,
      // everything else (type, folder, status, priority, due date, tags) stays as it was.
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
      // Moving a note is an explicit act: without `folder` the note stays where it is.
      const folder = params.folder ? safeVaultRelativePath(params.folder) : safeVaultRelativePath(existing.folder);

      const updatedItem = applyNotePatch(
        existing,
        params,
        { content: finalContent, subtasks: parsedSubtasks, folder },
        Date.now(),
      );

      const targetDir = path.join(this.config.notesDir, folder);
      await fs.mkdir(targetDir, { recursive: true });

      const newFilename = getSafeNoteFilename(updatedItem.title, updatedItem.id);
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

    // CREATE NEW NOTE: here the defaults are honest, because there is nothing to keep.
    const targetFolder = safeVaultRelativePath(params.folder || DEFAULT_INBOX_FOLDER);
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
      dueDate: params.dueDate ?? undefined,
      reminder: params.reminder ?? undefined,
      duration: params.duration ?? undefined,
      recurrence: params.recurrence ?? undefined,
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
