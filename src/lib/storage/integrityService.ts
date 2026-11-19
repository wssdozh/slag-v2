// What the storage panel calls: run the scans over the live vault and, when asked, carry out the
// part of the plan this app is allowed to do on its own.
//
// The app moves files and rewrites folder metadata. It never deletes a note: every file it touches
// lands in `.trash/.hygiene/<run>/` first, and a finding that is not `safe` stays in the report.
import { BaseDirectory, copyFile, exists, mkdir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import type { Finding, IntegrityStatus, RepairOp, RepairPlan } from '../vault/integrity/types';
import { FIX_KIND_BY_SCANNER } from '../vault/integrity/types';
import { buildManifest } from '../vault/integrity/manifest';
import { planRepair } from '../vault/integrity/repair';
import { scanVault } from '../vault/integrity/scanners';
import { buildSnapshot } from '../vault/integrity/snapshot';
import { integrityDir, readIntegrity, writeIntegrity } from './integrityStore';
import { tauriVaultReader } from './integrityReader';
import { storage } from './index';

const OPTIONS = { baseDir: BaseDirectory.AppData };

export interface IntegrityRun {
  findings: Finding[];
  status: IntegrityStatus;
  plan: RepairPlan;
}

export interface RepairOutcome {
  moved: number;
  dropped: number;
  skipped: Array<{ note: string; reason: string }>;
  runDir: string;
}

function notesPathOf(): string {
  const vault = storage.getCurrentVault();
  const dirName = vault.id === 'default_vault' ? 'main' : vault.id;
  return `vaults/${dirName}/notes`;
}

/** Anything under `.trash/` is vault-relative; a note path is relative to `notes/`. */
function absoluteIn(notesPath: string, path: string): string {
  const root = notesPath.replace(/[/\\]notes$/, '');
  return path.startsWith('.trash/') ? `${root}/${path}` : `${notesPath}/${path}`;
}

export async function runIntegrityCheck(): Promise<IntegrityRun> {
  const notesPath = notesPathOf();
  const snapshot = await buildSnapshot(tauriVaultReader(notesPath), DEFAULT_INBOX_FOLDER);
  const findings = scanVault(snapshot);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const plan = planRepair(findings, snapshot, { runId });

  const manifest = await buildManifest(storage.getItems(), storage.getFolders());
  const previous = await readIntegrity(notesPath);
  await writeIntegrity(
    notesPath,
    { at: new Date().toISOString(), root: manifest.root, folders: manifest.folders },
    manifest.leaves,
  );

  const repairable = findings.some((finding) => FIX_KIND_BY_SCANNER[finding.scanner] === 'safe');
  return {
    findings,
    plan,
    status: {
      at: previous.index?.at ?? null,
      root: manifest.root,
      // In sync means nothing is left to fix safely, not "the root string is equal": a note edited a
      // minute ago still belongs to a healthy vault.
      inSync: !repairable,
      drift: previous.index && previous.index.root !== manifest.root
        ? { rootMatch: false, folders: [], missing: [], extra: [], conflict: [] }
        : null,
    },
  };
}

export async function applyIntegrityRepair(plan: RepairPlan): Promise<RepairOutcome> {
  const notesPath = notesPathOf();
  const runDir = `${integrityDir(notesPath)}/hygiene/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outcome: RepairOutcome = { moved: 0, dropped: 0, skipped: [], runDir };

  await mkdir(runDir, { ...OPTIONS, recursive: true });

  for (const op of plan.ops) {
    try {
      if (op.kind === 'move') {
        const from = absoluteIn(notesPath, op.from);
        const to = absoluteIn(notesPath, op.to);
        if (!(await exists(from, OPTIONS))) {
          outcome.skipped.push({ note: op.note, reason: 'файла уже нет' });
          continue;
        }
        if (await exists(to, OPTIONS)) {
          outcome.skipped.push({ note: op.note, reason: 'на месте назначения уже есть файл' });
          continue;
        }
        const parent = to.slice(0, to.lastIndexOf('/'));
        await mkdir(parent, { ...OPTIONS, recursive: true });
        try {
          await rename(from, to, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
        } catch {
          // A rename across mounts is a copy plus a delete; the trash keeps the bytes either way.
          await copyFile(from, to, { fromPathBaseDir: BaseDirectory.AppData, toPathBaseDir: BaseDirectory.AppData });
          await remove(from, OPTIONS);
        }
        outcome.moved += 1;
      } else if (op.kind === 'drop-folders') {
        const root = notesPath.replace(/[/\\]notes$/, '');
        const statePath = `${root}/state.json`;
        if (!(await exists(statePath, OPTIONS))) {
          outcome.skipped.push({ note: op.note, reason: 'state.json нет' });
          continue;
        }
        await copyFile(statePath, `${runDir}/state.json.bak`, {
          fromPathBaseDir: BaseDirectory.AppData,
          toPathBaseDir: BaseDirectory.AppData,
        });
        const raw = await readTextFile(statePath, OPTIONS);
        const state: Record<string, unknown> = JSON.parse(raw);
        const drop = new Set(op.paths);
        const folders = Array.isArray(state.folders) ? state.folders : [];
        state.folders = folders.filter((folder) => {
          const path = (folder as { path?: string } | null)?.path;
          return !path || !drop.has(path);
        });
        await writeTextFile(statePath, JSON.stringify(state, null, 2), OPTIONS);
        outcome.dropped += 1;
      } else {
        outcome.skipped.push({ note: op.note, reason: 'этот вид починки — только через vault-doctor' });
      }
    } catch (err) {
      outcome.skipped.push({ note: op.note, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return outcome;
}

/** What a dry run shows: the ops, without touching anything. */
export function describePlan(plan: RepairPlan): { safe: number; blocked: number; manual: number } {
  return {
    safe: plan.ops.length,
    blocked: plan.blocked.length,
    manual: 0,
  };
}

export type { RepairOp };
