// The scans themselves: what a vault looks like when it has quietly filled with dirt.
//
// Pure functions over a snapshot, one scanner per kind of dirt, so a report can be checked in
// `node --test` without a disk and the app can run the same eight over its own storage.
import type { DiskNote, Finding, ScanOptions, Scanner, ScannerId, VaultSnapshot } from './types.ts';
import { FIX_KIND_BY_SCANNER } from './types.ts';

const DEFAULT_TRASH_AGING_MS = 30 * 86_400_000;

/**
 * How loudly a finding speaks. Severity lives here rather than in the contract because it is a
 * scanning opinion, not a fact about the vault.
 */
const SEVERITY: Record<ScannerId, Finding['severity']> = {
  'duplicate-id': 'high',
  'path-mismatch': 'medium',
  'folder-missing': 'high',
  'ghost-folder': 'low',
  'empty-folder': 'low',
  'broken-frontmatter': 'high',
  'unreferenced-attachment': 'low',
  'trash-aging': 'low',
};

const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, medium: 1, low: 2 };

/** The directory a note sits in; a note at the notes root belongs to the inbox. */
function dirOf(path: string, inbox: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(0, slash) : inbox;
}

function fileOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

function iso(milliseconds: number): string {
  return milliseconds > 0 ? new Date(milliseconds).toISOString() : '—';
}

function finding(
  scanner: ScannerId,
  path: string,
  summary: string,
  why: string,
  extra: Partial<Pick<Finding, 'itemId' | 'action' | 'evidence' | 'paths'>> = {},
): Finding {
  const itemId = extra.itemId;
  return {
    id: `${scanner}:${itemId ?? path}`,
    scanner,
    severity: SEVERITY[scanner],
    fix: FIX_KIND_BY_SCANNER[scanner],
    path,
    summary,
    why,
    evidence: extra.evidence ?? [],
    ...(itemId ? { itemId } : {}),
    ...(extra.action ? { action: extra.action } : {}),
    ...(extra.paths ? { paths: extra.paths } : {}),
  };
}

/**
 * One id, several files. The newest copy is the one a person has been editing; the older ones are
 * the wreckage left by a restore, and the scan decides which is the keeper so the repair does not
 * have to guess the same rule twice.
 */
export function scanDuplicateIds(snapshot: VaultSnapshot): Finding[] {
  const groups = new Map<string, DiskNote[]>();
  for (const note of snapshot.notes) {
    if (!note.id) continue;
    const group = groups.get(note.id);
    if (group) group.push(note);
    else groups.set(note.id, [note]);
  }

  const findings: Finding[] = [];
  for (const [id, group] of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const keeper = ordered[0];
    findings.push(
      finding('duplicate-id', keeper.path, `заметка «${keeper.title || id}» лежит в ${group.length} файлах`, 'это одна и та же заметка в двух местах: правки разъедутся, а синхронизация будет тянуть её туда-сюда', {
        itemId: id,
        paths: ordered.map((note) => note.path),
        evidence: ordered.map((note) => `${note.path} · ${iso(note.updatedAt)}`),
        action: `оставить ${keeper.path}, остальные в корзину чистки`,
      }),
    );
  }
  return findings;
}

/** The file is in one directory while its frontmatter names another: the tree and the note disagree. */
export function scanPathMismatch(snapshot: VaultSnapshot): Finding[] {
  const findings: Finding[] = [];
  for (const note of snapshot.notes) {
    const folder = note.folder.trim();
    if (!folder) continue;
    const actual = dirOf(note.path, snapshot.inbox);
    if (actual === folder) continue;
    findings.push(
      finding('path-mismatch', note.path, `файл лежит в «${actual}», а папка заметки — «${folder}»`, 'папка на диске и папка в заметке — два разных ответа на вопрос «где это лежит»; правка одной из них рано или поздно переедет поверх другой', {
        itemId: note.id || undefined,
        evidence: [`файл: ${note.path}`, `frontmatter: ${folder}`],
        action: `перенести в ${folder}/${fileOf(note.path)}`,
      }),
    );
  }
  return findings;
}

/** The note names a folder that does not exist, so the tree has nowhere to draw it. */
export function scanFolderMissing(snapshot: VaultSnapshot): Finding[] {
  const existing = new Set(snapshot.diskFolders);
  const findings: Finding[] = [];
  for (const note of snapshot.notes) {
    const folder = note.folder.trim();
    if (!folder || folder === snapshot.inbox) continue;
    if (existing.has(folder)) continue;
    findings.push(
      finding('folder-missing', note.path, `папки «${folder}» не существует`, 'заметка не попадает в дерево папок: её видно только в поиске и во «Входящих»', {
        itemId: note.id || undefined,
        evidence: [`папка в заметке: ${folder}`, `известных папок: ${snapshot.diskFolders.length}`],
      }),
    );
  }
  return findings;
}

/** `state.json` remembers a folder that has no directory: metadata about something that is gone. */
export function scanGhostFolders(snapshot: VaultSnapshot): Finding[] {
  const existing = new Set(snapshot.diskFolders);
  const findings: Finding[] = [];
  for (const entry of snapshot.stateFolders) {
    const path = entry.path.trim();
    if (!path || path === snapshot.inbox || existing.has(path)) continue;
    findings.push(
      finding('ghost-folder', path, `в state.json есть папка «${path}», а каталога нет`, 'метаданные пережили свою папку: интерфейс её не рисует, но она уезжает в синк и возвращается на других устройствах', {
        action: 'убрать запись из state.json (копия state.json останется в корзине чистки)',
      }),
    );
  }
  return findings;
}

/**
 * A directory with nothing in it and nothing under it — unless somebody named it.
 *
 * An entry in `state.json` with a name is a decision, not an accident: a person built a place for
 * notes that have not been written yet. Reporting those would teach everyone to ignore the report.
 */
export function scanEmptyFolders(snapshot: VaultSnapshot): Finding[] {
  const intentional = new Set(
    snapshot.stateFolders.filter((entry) => entry.name && entry.name !== entry.path).map((entry) => entry.path),
  );
  const findings: Finding[] = [];
  for (const path of snapshot.diskFolders) {
    if (!path || path === snapshot.inbox || path.startsWith('.')) continue;
    if (intentional.has(path)) continue;
    const holdsNote = snapshot.notes.some((note) => dirOf(note.path, snapshot.inbox) === path);
    if (holdsNote) continue;
    const holdsChild = snapshot.diskFolders.some((other) => other.startsWith(`${path}/`));
    if (holdsChild) continue;
    findings.push(
      finding('empty-folder', path, `папка «${path}» пуста`, 'каталог, который никто не намеревался создавать: ни заметок, ни имени в state.json', {
        action: 'убрать пустой каталог',
      }),
    );
  }
  return findings;
}

/** No id means nothing can address the note: no sync, no links, no folder. */
export function scanBrokenFrontmatter(snapshot: VaultSnapshot): Finding[] {
  const findings: Finding[] = [];
  for (const note of snapshot.notes) {
    if (note.id) continue;
    findings.push(
      finding('broken-frontmatter', note.path, 'у заметки нет id', 'заметку нельзя адресовать: синхронизация её не увидит, ссылки на неё не разрешатся, а правка создаст вторую копию', {
        evidence: [`заголовок: ${note.title || '—'}`],
      }),
    );
  }
  return findings;
}

/** A file in `.attachments/` no note mentions: bytes nobody will ever open again. */
export function scanUnreferencedAttachments(snapshot: VaultSnapshot): Finding[] {
  const referenced = new Set<string>();
  for (const note of snapshot.notes) {
    for (const attachment of note.attachments) {
      const normalized = attachment.replace(/\\/g, '/').trim();
      if (!normalized) continue;
      referenced.add(normalized);
      referenced.add(fileOf(normalized));
    }
  }

  const findings: Finding[] = [];
  for (const name of snapshot.attachmentFiles) {
    if (referenced.has(name)) continue;
    findings.push(
      finding('unreferenced-attachment', name, `на вложение «${name}» никто не ссылается`, 'файл едет в синке и в бэкапах, но открыть его из заметки нельзя — это чистый вес', {
        action: 'проверить глазами: возможно, файл нужен снаружи',
      }),
    );
  }
  return findings;
}

/** A trashed note old enough that keeping it is a decision, not an accident. */
export function scanTrashAging(snapshot: VaultSnapshot, options: ScanOptions = {}): Finding[] {
  const threshold = options.trashAgingMs ?? DEFAULT_TRASH_AGING_MS;
  const findings: Finding[] = [];
  for (const entry of snapshot.trash) {
    if (entry.ageMs <= threshold) continue;
    const days = Math.floor(entry.ageMs / 86_400_000);
    findings.push(
      finding('trash-aging', `.trash/${entry.name}`, `«${entry.name}» в корзине ${days} дн.`, 'корзина — это буфер, а не архив: старое никто не восстановит, но оно всё ещё занимает место и едет в бэкапы', {
        evidence: [`возраст: ${days} дн.`, `порог: ${Math.floor(threshold / 86_400_000)} дн.`],
        action: 'убрать в архив чистки',
      }),
    );
  }
  return findings;
}

export const SCANNERS: Record<ScannerId, Scanner> = {
  'duplicate-id': scanDuplicateIds,
  'path-mismatch': scanPathMismatch,
  'folder-missing': scanFolderMissing,
  'ghost-folder': scanGhostFolders,
  'empty-folder': scanEmptyFolders,
  'broken-frontmatter': scanBrokenFrontmatter,
  'unreferenced-attachment': scanUnreferencedAttachments,
  'trash-aging': scanTrashAging,
};

/** Every scanner, in a stable order: the loudest first, then by scanner name and path. */
export function scanVault(snapshot: VaultSnapshot, options: ScanOptions = {}): Finding[] {
  const findings = Object.values(SCANNERS).flatMap((scanner) => scanner(snapshot, options));
  return findings.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rank !== 0) return rank;
    if (a.scanner !== b.scanner) return a.scanner < b.scanner ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
