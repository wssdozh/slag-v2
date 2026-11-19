// Turns a vault directory into the plain snapshot the integrity scanners read.
//
// Node only: the app builds the same shape from its own storage, so a scanner never knows whether
// it is looking at a Tauri vault or a folder someone copied to a server. Reads nothing else, keeps
// no cache, writes nothing.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import YAML from 'yaml';
import { DEFAULT_INBOX_FOLDER } from '../src/config/storage.ts';

/**
 * The frontmatter as a map, `null` when there is none, `'broken'` when YAML does not parse.
 *
 * Deliberately not `parseMarkdownToItem`: that module is the app's, and its runtime imports carry
 * no extensions, which a plain `node` process cannot resolve. The doctor only needs five fields.
 */
function readFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    const parsed = YAML.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : 'broken';
  } catch {
    return 'broken';
  }
}

/** Attachment references a note makes in its body: wiki embeds, wiki links and markdown links. */
function bodyReferences(content) {
  const out = [];
  for (const m of content.matchAll(/!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) out.push(m[1].trim());
  for (const m of content.matchAll(/\]\(([^)\s]+)\)/g)) out.push(decodeURIComponent(m[1]));
  return out;
}

function listNames(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function unique(names) {
  return [...new Set(names)].sort();
}

/** Trashed notes with how long they have been sitting there, newest mtime per name. */
function trashDir(dir, now) {
  return listNames(dir).map((name) => {
    let ageMs = 0;
    try {
      ageMs = now - statSync(join(dir, name)).mtimeMs;
    } catch {
      ageMs = 0;
    }
    return { name, ageMs: Math.max(0, ageMs) };
  });
}

/**
 * Walks `notes/`, skipping every dot directory: `.trash` and `.attachments` are collected on their
 * own, and anything else starting with a dot belongs to a tool, not to the vault.
 */
function walk(notesRoot, onFolder, onNote) {
  const visit = (dir, relativePath) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        onFolder(childPath);
        visit(join(dir, entry.name), childPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        onNote(join(dir, entry.name), childPath);
      }
    }
  };
  visit(notesRoot, '');
}

/**
 * @param {string} vaultDir directory that contains `notes/`
 * @returns {import('../src/lib/vault/integrity/types.ts').VaultSnapshot}
 */
export function buildVaultSnapshot(vaultDir, now = Date.now()) {
  const notesRoot = join(vaultDir, 'notes');
  if (!existsSync(notesRoot)) throw new Error(`not a vault: ${notesRoot} is missing`);

  const notes = [];
  const diskFolders = [];

  walk(
    notesRoot,
    (folder) => diskFolders.push(folder),
    (filePath, relativePath) => {
      const dirFolder = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : DEFAULT_INBOX_FOLDER;
      let content = '';
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        return;
      }
      const frontmatter = readFrontmatter(content);
      if (frontmatter === 'broken') {
        notes.push({ path: relativePath, id: '', folder: '', title: '', updatedAt: 0, attachments: [] });
        return;
      }
      const fields = frontmatter ?? {};
      const declaredFolder = typeof fields.folder === 'string' && fields.folder && fields.folder !== dirFolder
        ? fields.folder
        : '';
      const listed = Array.isArray(fields.attachments) ? fields.attachments : [];
      const attachments = [
        ...listed.map((att) => (att && typeof att === 'object' ? String(att.relativePath || att.name || '') : '')),
        ...bodyReferences(content),
      ].filter(Boolean);
      notes.push({
        path: relativePath,
        id: typeof fields.id === 'string' ? fields.id : '',
        folder: declaredFolder,
        title: typeof fields.title === 'string' ? fields.title : basename(relativePath, extname(relativePath)),
        updatedAt: Number(fields.updated) || 0,
        attachments,
      });
    },
  );

  // A note sitting at the notes root belongs to nobody's folder list, so the inbox has to be there.
  if (!diskFolders.includes(DEFAULT_INBOX_FOLDER) && notes.some((note) => !note.path.includes('/'))) {
    diskFolders.push(DEFAULT_INBOX_FOLDER);
  }

  // Attachments and trash live beside `notes/` in a current vault and inside it in an older one;
  // both are read, because a copy left by the previous layout is still dirt a sweep should see.
  const attachmentFiles = unique([
    ...listNames(join(vaultDir, '.attachments')),
    ...listNames(join(notesRoot, '.attachments')),
  ]);
  const trash = [...trashDir(join(vaultDir, '.trash'), now), ...trashDir(join(notesRoot, '.trash'), now)];

  let stateFolders = [];
  // The live file sits beside `notes/`; the one inside it is a leftover of an older layout.
  const statePath = existsSync(join(vaultDir, 'state.json'))
    ? join(vaultDir, 'state.json')
    : join(notesRoot, 'state.json');
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (Array.isArray(state?.folders)) {
        stateFolders = state.folders
          .filter((folder) => folder && typeof folder.path === 'string' && folder.path)
          .map((folder) => ({ path: folder.path, name: folder.name }));
      }
    } catch {
      stateFolders = [];
    }
  }

  return {
    notes,
    diskFolders: [...new Set(diskFolders)].sort(),
    stateFolders,
    attachmentFiles,
    trash,
    inbox: DEFAULT_INBOX_FOLDER,
  };
}
