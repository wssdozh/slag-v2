#!/usr/bin/env node
// Checks a vault folder for storage dirt: duplicate ids, notes filed in the wrong place, folders
// that only exist in `state.json`, and so on. Read-only unless `--apply` is passed, and even then
// every byte it moves lands in `.trash/.hygiene/<run>/` first.
//
// This runs without the app on purpose: it is what a nightly job checks a backup with.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildVaultSnapshot } from './vault-snapshot.mjs';
import { scanVault } from '../src/lib/vault/integrity/scanners.ts';
import { planRepair } from '../src/lib/vault/integrity/repair.ts';

const USAGE = `usage: node scripts/vault-doctor.mjs <vaultDir> [--json] [--apply]
  --only=a,b        run these scanners only
  --trash-days=N    trash older than N days is dirt (default 30)
  --max-actions=N   ceiling on fixes per run (default 50)
  --max-share=N     ceiling as a share of the vault's notes (default 0.1)`;

function parseArgs(argv) {
  const out = { vaultDir: '', json: false, apply: false, only: null, trashDays: 30, maxActions: 50, maxShare: 0.1 };
  for (const arg of argv) {
    if (arg === '--json') out.json = true;
    else if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--only=')) out.only = arg.slice(7).split(',').map((id) => id.trim()).filter(Boolean);
    else if (arg.startsWith('--trash-days=')) out.trashDays = Number(arg.slice(13)) || 30;
    else if (arg.startsWith('--max-actions=')) out.maxActions = Number(arg.slice(14)) || 50;
    else if (arg.startsWith('--max-share=')) out.maxShare = Number(arg.slice(12)) || 0.1;
    else if (arg.startsWith('--help') || arg === '-h') out.help = true;
    else if (!arg.startsWith('--') && !out.vaultDir) out.vaultDir = arg;
  }
  return out;
}

/**
 * Moves one file, creating the target directory. Refuses when the target already exists: a second
 * copy under a new name is the very duplicate the sweep is meant to remove.
 */
function moveFile(fromAbs, toAbs) {
  if (existsSync(toAbs)) return null;
  mkdirSync(dirname(toAbs), { recursive: true });
  try {
    renameSync(fromAbs, toAbs);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      copyFileSync(fromAbs, toAbs);
      rmSync(fromAbs);
    } else {
      throw err;
    }
  }
  return toAbs;
}

/** The live file sits beside `notes/`; the copy inside it is a leftover of an older layout. */
function statePathFor(vaultDir) {
  const beside = join(vaultDir, 'state.json');
  return existsSync(beside) ? beside : join(vaultDir, 'notes', 'state.json');
}

function backupStateFile(vaultDir, runRoot) {
  const statePath = statePathFor(vaultDir);
  if (!existsSync(statePath)) return null;
  const backupPath = join(runRoot, 'state.json.bak');
  mkdirSync(runRoot, { recursive: true });
  copyFileSync(statePath, backupPath);
  return statePath;
}

/**
 * Two namespaces meet here: a note path is relative to `notes/`, while the trash, the attachments
 * and the hygiene directory sit beside it. One rule keeps them apart — anything under `.trash/` or
 * `.attachments/` is vault-relative.
 */
function absoluteIn(vaultDir, path) {
  return path.startsWith('.trash/') || path.startsWith('.attachments/')
    ? join(vaultDir, path)
    : join(vaultDir, 'notes', path);
}

function applyPlan(plan, vaultDir, runRoot) {
  const applied = [];
  const skipped = [];
  for (const op of plan.ops) {
    try {
      if (op.kind === 'move') {
        const fromAbs = absoluteIn(vaultDir, op.from);
        if (!existsSync(fromAbs)) {
          skipped.push({ op, reason: 'исходного файла уже нет' });
          continue;
        }
        const toAbs = absoluteIn(vaultDir, op.to);
        const landed = moveFile(fromAbs, toAbs);
        if (!landed) {
          skipped.push({ op, reason: 'на месте назначения уже есть файл' });
          continue;
        }
        applied.push({ op, landed: landed.slice(vaultDir.length + 1) });
      } else if (op.kind === 'remove-dir') {
        const dirAbs = absoluteIn(vaultDir, op.path);
        // Non-recursive on purpose: a directory that still holds something is not empty dirt.
        rmdirSync(dirAbs);
        applied.push({ op });
      } else if (op.kind === 'drop-folders') {
        const statePath = backupStateFile(vaultDir, runRoot);
        if (!statePath) {
          skipped.push({ op, reason: 'state.json нет' });
          continue;
        }
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        const drop = new Set(op.paths);
        state.folders = (Array.isArray(state.folders) ? state.folders : []).filter(
          (folder) => !drop.has(folder?.path),
        );
        writeFileSync(statePath, JSON.stringify(state, null, 2));
        applied.push({ op });
      }
    } catch (err) {
      skipped.push({ op, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { applied, skipped };
}

function renderText(vaultDir, snapshot, findings, plan) {
  const lines = [];
  lines.push(`хранилище: ${vaultDir}`);
  lines.push(
    `снимок: ${snapshot.notes.length} заметок, ${snapshot.diskFolders.length} папок, ` +
      `${snapshot.stateFolders.length} записей в state.json, ${snapshot.attachmentFiles.length} вложений, ` +
      `${snapshot.trash.length} в корзине`,
  );
  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) bySeverity[finding.severity] += 1;
  lines.push(
    `находок: ${findings.length} (high ${bySeverity.high}, medium ${bySeverity.medium}, low ${bySeverity.low})`,
  );
  if (plan) lines.push(`безопасных к починке: ${plan.ops.length}${plan.blocked.length ? `, заблокировано гардом: ${plan.blocked.length}` : ''}`);

  const grouped = new Map();
  for (const finding of findings) {
    if (!grouped.has(finding.scanner)) grouped.set(finding.scanner, []);
    grouped.get(finding.scanner).push(finding);
  }
  for (const [scanner, list] of grouped) {
    lines.push('');
    lines.push(`${scanner} (${list.length})`);
    for (const finding of list) {
      lines.push(`  [${finding.severity}] ${finding.summary}`);
      if (finding.path) lines.push(`    путь: ${finding.path}`);
      lines.push(`    почему: ${finding.why}`);
      if (finding.action) lines.push(`    → ${finding.action}`);
      for (const evidence of finding.evidence.slice(0, 6)) lines.push(`    · ${evidence}`);
      if (finding.evidence.length > 6) lines.push(`    · … ещё ${finding.evidence.length - 6}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.vaultDir) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 2);
  }
  const vaultDir = resolve(args.vaultDir);
  let snapshot;
  try {
    snapshot = buildVaultSnapshot(vaultDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let findings = scanVault(snapshot, { trashAgingMs: args.trashDays * 86_400_000 });
  if (args.only) {
    const allowed = new Set(args.only);
    findings = findings.filter((finding) => allowed.has(finding.scanner));
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const plan = planRepair(findings, snapshot, { maxActions: args.maxActions, maxShare: args.maxShare, runId });

  if (args.json) {
    console.log(JSON.stringify({ vault: vaultDir, snapshot: { notes: snapshot.notes.length }, findings, plan }, null, 2));
    return;
  }

  console.log(renderText(vaultDir, snapshot, findings, plan));

  if (!args.apply) {
    if (plan.ops.length > 0) console.log(`\nэто черновик. запусти с --apply, чтобы убрать их в .trash/.hygiene/${runId}`);
    return;
  }
  if (plan.blocked.length > 0) {
    console.log(`\nгард остановил проезд: ${plan.blocked.length} находок не тронуты (слишком массово). сначала посмотри отчёт.`);
    return;
  }
  if (snapshot.notes.length === 0) {
    console.log('\nв хранилище нет заметок — отказываюсь что-либо двигать.');
    return;
  }

  const runRoot = join(vaultDir, '.trash', '.hygiene', runId);
  const { applied, skipped } = applyPlan(plan, vaultDir, runRoot);
  console.log(`\nприменено: ${applied.length}, пропущено: ${skipped.length}, корзина проезда: ${runRoot}`);
  for (const item of applied) console.log(`  ok  ${item.op.note}`);
  for (const item of skipped) console.log(`  --  ${item.op.note}: ${item.reason}`);
}

main();
