// Build a VaultSnapshot from a VaultReader abstraction.
//
// Pure types + one async function. No Node/fs, no Tauri, no React. The app, the CLI and
// `node --test` build the same shape because they provide the adapter, not because they
// happen to match.
//
// Semantic rules mirror scripts/vault-snapshot.mjs exactly.

import YAML from 'yaml';

// ── helpers ────────────────────────────────────────────────────────────────

/** Parse YAML frontmatter from raw text. */
function readFrontmatter(content: string): Record<string, unknown> | 'broken' {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return 'broken';
  } catch {
    return 'broken';
  }
}

/** `decodeURIComponent` throws on a lone `%`; a note is not allowed to break a scan over it. */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Extract attachment references from note body text. */
function bodyReferences(content: string): string[] {
  const out: string[] = [];
  // ![[path]], [[path]], [[path|alias]], [[path#heading]]
  for (const m of content.matchAll(/!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const ref = m[1].trim();
    if (ref) out.push(ref);
  }
  // [text](url), ![alt](url). The destination may contain spaces — `![Pasted image 1.png](.attachments/Pasted image 1.png)`
  // is exactly what the editor writes — so it runs to the closing paren, not to the first blank.
  // A title (`(path "подпись")`) is the one thing that is not part of the path.
  for (const m of content.matchAll(/\]\(([^)]+)\)/g)) {
    let target = m[1].trim();
    if (target.startsWith('<') && target.includes('>')) {
      target = target.slice(1, target.indexOf('>')).trim();
    } else {
      target = target.replace(/\s+(["']).*\1\s*$/, '').trim();
    }
    if (!target || /^(https?:|data:|mailto:)/i.test(target)) continue;
    out.push(safeDecode(target));
  }
  return out;
}

/** Normalise attachments list: flatten object entries to relativePath/name strings. */
function normaliseAttachments(
  listed: unknown[],
  bodyRefs: string[],
): string[] {
  const out: string[] = [];
  for (const item of listed) {
    if (item == null) continue;
    if (typeof item === 'string') {
      const s = item.trim();
      if (s) out.push(s);
      continue;
    }
    if (typeof item === 'object') {
      const rp = (item as Record<string, unknown>).relativePath ?? (item as Record<string, unknown>).name;
      const s = typeof rp === 'string' ? rp.trim() : '';
      if (s) out.push(s);
    }
  }
  return [...out, ...bodyRefs];
}

// ── public API ─────────────────────────────────────────────────────────────

export interface FolderEntry {
  path: string;
  name?: string;
}

export interface VaultReader {
  /** Vault-relative folder paths (slash-separated, no leading /). */
  listFolders(): Promise<string[]>;
  /** .md file basenames inside `folder`. */
  listNotes(folder: string): Promise<string[]>;
  /** Full text at `relativePath` (e.g. `"Проекты/баги.md"`); null if missing. */
  readNote(relativePath: string): Promise<string | null>;
  /** Filenames inside `.attachments/`. */
  listAttachments(): Promise<string[]>;
  /** Trashed notes with age. */
  listTrash(): Promise<Array<{ name: string; ageMs: number }>>;
  /** Folder entries from state.json (may include ghost folders). */
  readStateFolders(): Promise<FolderEntry[]>;
}

export interface DiskNote {
  /** Vault-relative, slash-separated path (without `notes/` prefix). */
  path: string;
  /** Frontmatter `id`; empty string when none or broken. */
  id: string;
  /** Frontmatter `folder`; differs from `path`'s implicit folder AND is not the declared catalog folder. */
  folder: string;
  title: string;
  updatedAt: number;
  /** Attachment paths referenced in frontmatter + body, normalised. */
  attachments: string[];
}

/** A snapshot of the vault ready for scanner consumption. */
export interface VaultSnapshot {
  notes: DiskNote[];
  diskFolders: string[];
  stateFolders: FolderEntry[];
  attachmentFiles: string[];
  trash: Array<{ name: string; ageMs: number }>;
  inbox: string;
}

/**
 * Walk every note discovered via `reader`, extract metadata, deduplicate by id.
 *
 * Idemdup logic: last-seen wins (mirror the scanner script).
 */
export async function buildSnapshot(reader: VaultReader, inbox: string): Promise<VaultSnapshot> {
  const diskFoldersSet = new Set<string>();
  const notes: DiskNote[] = [];

  const folders = await reader.listFolders();
  // Ensure the implicit "root" folder (`''`) is included; some adapters list it,
  // others don't — but root-level notes must still be discovered.
  if (!folders.includes('')) folders.push('');
  for (const f of folders) {
    if (f !== '') diskFoldersSet.add(f);
  }

  let stateFolders: FolderEntry[] = [];
  try {
    stateFolders = await reader.readStateFolders();
  } catch {
    /* some adapters cannot read state.json */
  }

  let attachmentFiles: string[] = [];
  try {
    attachmentFiles = (await reader.listAttachments()).sort();
  } catch {
    /* optional */
  }

  let trash: Array<{ name: string; ageMs: number }> = [];
  try {
    trash = await reader.listTrash();
  } catch {
    /* optional */
  }

  // ── walk ─────────────────────────────────────────────────────────────
  for (const folder of folders) {
    const names = await reader.listNotes(folder);
    for (const name of names) {
      if (!name.endsWith('.md')) continue;
      const relPath = folder ? `${folder}/${name}` : name;

      // Note at the notes root (no "/" in path) → inbox bucket.
      const effectiveFolder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : inbox;

      let content: string | null;
      try {
        content = await reader.readNote(relPath);
      } catch {
        content = null;
      }
      if (content == null) continue;

      const fm = readFrontmatter(content);
      if (fm === 'broken') {
        // Broken frontmatter → note with empty id, empty folder (broken-frontmatter scanning sees this).
        notes.push({
          path: relPath,
          id: '',
          folder: '',
          title: name.replace(/\.md$/, ''),
          updatedAt: 0,
          attachments: [],
        });
        continue;
      }

      const declaredFolder = typeof fm.folder === 'string' && fm.folder && fm.folder !== effectiveFolder
        ? fm.folder
        : '';

      const listed = Array.isArray(fm.attachments) ? fm.attachments : [];
      const attachments = normaliseAttachments(listed, bodyReferences(content));

      const id = typeof fm.id === 'string' ? fm.id : '';
      const title = typeof fm.title === 'string' && fm.title ? fm.title : name.replace(/\.md$/, '');
      const updatedAt = Number(fm.updated) || 0;

      const note: DiskNote = {
        path: relPath,
        id,
        folder: declaredFolder,
        title,
        updatedAt,
        attachments,
      };

      notes.push(note);
    }
  }

  // Root-level notes (no "/") belong to inbox folder on disk too.
  const hasRootNote = notes.some((note) => !note.path.includes('/'));
  if (hasRootNote && !diskFoldersSet.has(inbox)) {
    diskFoldersSet.add(inbox);
  }

  return {
    notes,
    diskFolders: [...diskFoldersSet].sort(),
    stateFolders,
    attachmentFiles,
    trash,
    inbox,
  };
}
