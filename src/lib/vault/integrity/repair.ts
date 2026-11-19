// What a sweep would do, decided before anything is touched.
//
// A finding says what is wrong; this module says which files that translates into and refuses the
// run when the answer looks like a mass event. It reads no disk: the caller executes the ops, and
// the guard exists because "hundreds of files moved" is a reason to look, not a reason to sweep.
import type { Finding, RepairOp, RepairOptions, RepairPlan, VaultSnapshot } from './types.ts';
import { FIX_KIND_BY_SCANNER } from './types.ts';

const DEFAULT_MAX_ACTIONS = 50;
const DEFAULT_MAX_SHARE = 0.1;
const DEFAULT_HYGIENE_ROOT = '.trash/.hygiene';

/** Vault-relative, slash-separated, no `./`, no leading `/`, no `..` segments. */
function normalizePath(path: string): string {
  const segments = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..');
  return segments.join('/');
}

function baseName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

function byId(a: Finding, b: Finding): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The repair, or nothing at all.
 *
 * Every `safe` finding becomes exactly one op, in a stable order, so two runs over the same
 * findings produce the same plan. The keeper of a duplicate group is the scan's decision — the
 * planner only skips the first path it is given.
 */
export function planRepair(findings: Finding[], snapshot: VaultSnapshot, options: RepairOptions = {}): RepairPlan {
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  const maxShare = options.maxShare ?? DEFAULT_MAX_SHARE;
  const hygieneDir = `${normalizePath(options.hygieneRoot ?? DEFAULT_HYGIENE_ROOT)}/${normalizePath(options.runId ?? 'run') || 'run'}`;

  const notesByPath = new Map(snapshot.notes.map((note) => [normalizePath(note.path), note]));
  const ops: RepairOp[] = [];
  const seen = new Set<string>();

  const push = (op: RepairOp): void => {
    const key = op.kind === 'move' ? `move:${op.from}` : op.kind === 'remove-dir' ? `dir:${op.path}` : `folders:${op.paths.join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    ops.push(op);
  };

  for (const finding of [...findings].sort(byId)) {
    if (FIX_KIND_BY_SCANNER[finding.scanner] !== 'safe') continue;

    if (finding.scanner === 'duplicate-id') {
      const paths = (finding.paths ?? []).map(normalizePath).filter(Boolean);
      for (const path of paths.slice(1)) {
        push({ kind: 'move', findingId: finding.id, from: path, to: `${hygieneDir}/${path}`, note: `дубль ${path} в корзину чистки` });
      }
      continue;
    }

    if (finding.scanner === 'path-mismatch') {
      const path = normalizePath(finding.path);
      const note = notesByPath.get(path);
      if (!path || !note || !note.folder) continue;
      const to = `${normalizePath(note.folder)}/${baseName(path)}`;
      if (to === path) continue;
      push({ kind: 'move', findingId: finding.id, from: path, to, note: `перенос ${path} → ${to}` });
      continue;
    }

    if (finding.scanner === 'ghost-folder') {
      const path = normalizePath(finding.path);
      if (path) push({ kind: 'drop-folders', findingId: finding.id, paths: [path], note: `убрать фантомную папку ${path} из state.json` });
      continue;
    }

    if (finding.scanner === 'empty-folder') {
      const path = normalizePath(finding.path);
      if (path) push({ kind: 'remove-dir', findingId: finding.id, path, note: `убрать пустой каталог ${path}` });
      continue;
    }

    if (finding.scanner === 'trash-aging') {
      const path = normalizePath(finding.path);
      if (path) push({ kind: 'move', findingId: finding.id, from: path, to: `${hygieneDir}/${path}`, note: `старая корзина ${path} в архив чистки` });
    }
  }

  const shareCeiling = Math.max(1, Math.floor(snapshot.notes.length * maxShare));
  const tooMuch = ops.length > maxActions || ops.length > shareCeiling;
  if (tooMuch) {
    return { ops: [], blocked: [...findings].sort(byId).filter((finding) => FIX_KIND_BY_SCANNER[finding.scanner] === 'safe') };
  }
  return { ops, blocked: [] };
}
