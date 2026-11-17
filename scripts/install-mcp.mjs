#!/usr/bin/env node
// Registers the built SLAG MCP server in the clients we actually support, so nobody has to
// hand-copy a path into four config formats. Idempotent: re-running only rewrites our own entry.
//
//   npm run mcp:install                     # all clients, vault detected from the app data dir
//   npm run mcp:install -- --vault <path>   # explicit vault
//   npm run mcp:install -- --clients dsh,cursor --dry-run
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(repoRoot, 'dist', 'mcp', 'index.js');
const home = homedir();
export const CLIENT_NAMES = ['claude', 'cursor', 'dsh'];
/** The DSH profile is the user's own harness config: never touched unless asked for by name. */
export const DEFAULT_CLIENTS = ['claude', 'cursor'];

/** Where each client keeps its MCP config, relative to home. */
export function clientConfigPath(client) {
  if (client === 'claude') return path.join(home, '.claude.json');
  if (client === 'cursor') return path.join(home, '.cursor', 'mcp.json');
  if (client === 'dsh') return path.join(home, '.dsh', 'profiles', 'web', 'cordis.patch.yml');
  throw new Error(`unknown client '${client}', expected one of ${CLIENT_NAMES.join(', ')}`);
}

/** The app's own vault, per platform; `main` is what a fresh install uses. */
export function detectVault() {
  const candidates = platform() === 'win32'
    ? [path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'com.slag.notes', 'vaults', 'main', 'notes')]
    : [
      path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'com.slag.notes', 'vaults', 'main', 'notes'),
      path.join(home, 'Library', 'Application Support', 'com.slag.notes', 'vaults', 'main', 'notes'),
    ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** `{command, args}` every JSON-shaped client understands. */
export function serverEntry(vaultPath) {
  return { command: 'node', args: [bundlePath, '--vault', vaultPath] };
}

/** Merge our entry into `mcpServers` without touching anything else in the file. */
export function mergeJsonConfig(existing, vaultPath) {
  const parsed = existing && existing.trim() ? JSON.parse(existing) : {};
  const servers = { ...(parsed.mcpServers ?? {}) };
  servers.slag = serverEntry(vaultPath);
  return { ...parsed, mcpServers: servers };
}

const DSH_BLOCK = (vaultPath) => `    - id: mcp-slag
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: slag
        transport: stdio
        command: node
        args:
          - '${bundlePath}'
          - --vault
          - '${vaultPath}'
        toolCallTimeoutMs: 120000`;

/**
 * Text surgery instead of a YAML round-trip: the profile is the user's file with comments
 * and ordering, and re-emitting it would reformat everything around our entry.
 */
export function mergeDshProfile(existing, vaultPath) {
  const text = existing ?? '';
  const blockStart = text.indexOf('    - id: mcp-slag');
  if (blockStart !== -1) {
    const rest = text.slice(blockStart + '    - id: mcp-slag'.length);
    const nextEntry = rest.indexOf('\n    - id: ');
    const blockEnd = nextEntry === -1 ? text.length : blockStart + '    - id: mcp-slag'.length + nextEntry;
    return text.slice(0, blockStart) + DSH_BLOCK(vaultPath) + text.slice(blockEnd);
  }
  const insertList = text.indexOf('- insert:');
  if (insertList === -1) {
    return `${text.trimEnd()}\n- insert:\n${DSH_BLOCK(vaultPath)}\n`;
  }
  const listEnd = text.indexOf('\n- ', insertList + 1);
  const head = listEnd === -1 ? `${text.trimEnd()}\n` : `${text.slice(0, listEnd)}\n`;
  const tail = listEnd === -1 ? '' : text.slice(listEnd + 1);
  return `${head}${DSH_BLOCK(vaultPath)}\n${tail}`;
}

/** JSON-shaped config, or null when the file on disk is not JSON we dare to rewrite. */
function renderJsonConfig(current, target, vaultPath) {
  try {
    return `${JSON.stringify(mergeJsonConfig(current, vaultPath), null, 2)}\n`;
  } catch (error) {
    console.error(`не смогла разобрать ${target} (${error.message}); файл не тронут.`);
    return null;
  }
}

/**
 * Read our entry back out of the written text and compare it with what we meant to write. Catches
 * the class of bug that broke a real profile: quotes and escapes that survive the merge but change
 * the value the client sees.
 */
export function verifyWritten(client, text, vaultPath) {
  const expected = [bundlePath, '--vault', vaultPath];
  let actual;
  try {
    if (client === 'dsh') {
      const parsed = parseYaml(text);
      const entry = parsed?.[0]?.insert?.find((item) => item?.id === 'mcp-slag');
      actual = entry?.config?.args;
    } else {
      actual = JSON.parse(text)?.mcpServers?.slag?.args;
    }
  } catch (error) {
    return `результат не разбирается (${error.message})`;
  }
  if (!Array.isArray(actual)) return 'запись mcp-slag не читается обратно';
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    return `пути в записи разъехались: ${JSON.stringify(actual)}`;
  }
  return null;
}

function writeAtomic(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(filePath, `${filePath}.slag-backup-${stamp}`);
  }
  const temp = `${filePath}.slag-tmp`;
  writeFileSync(temp, contents, 'utf8');
  renameSync(temp, filePath);
}

// --- CLI ---------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const valueOf = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};
const dryRun = argv.includes('--dry-run');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const clients = (valueOf('clients') ?? DEFAULT_CLIENTS.join(',')).split(',').map((name) => name.trim()).filter(Boolean);
  const unknown = clients.filter((client) => !CLIENT_NAMES.includes(client));
  if (unknown.length > 0) {
    console.error(`неизвестный клиент: ${unknown.join(', ')}. доступны: ${CLIENT_NAMES.join(', ')}`);
    process.exit(1);
  }

  const vaultPath = path.resolve(valueOf('vault') ?? detectVault() ?? '');
  if (!valueOf('vault') && !detectVault()) {
    console.error('не нашла хранилище SLAG. укажи явно: npm run mcp:install -- --vault <путь к папке заметок>');
    process.exit(1);
  }
  if (!existsSync(vaultPath)) {
    console.error(`папки нет: ${vaultPath}`);
    process.exit(1);
  }
  if (!existsSync(path.join(vaultPath, 'Проекты')) && !existsSync(path.join(vaultPath, 'Входящие'))) {
    console.warn(`внимание: ${vaultPath} не похожа на хранилище SLAG — нужен каталог с заметками, не его родитель.`);
  }

  if (!existsSync(bundlePath)) {
    console.log('сборки нет, собираю: npm run build:mcp');
    const build = spawnSync('npm', ['run', 'build:mcp'], { cwd: repoRoot, shell: true, stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }

  console.log(`сервер: ${bundlePath}\nхранилище: ${vaultPath}\n`);

  for (const client of clients) {
    const target = clientConfigPath(client);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const next = client === 'dsh' ? mergeDshProfile(current, vaultPath) : renderJsonConfig(current, target, vaultPath);
    if (!next) continue;

    // A config the client cannot parse leaves it with no servers at all: refuse to write one.
    const problem = verifyWritten(client, next, vaultPath);
    if (problem) {
      console.error(`${client}: ${problem}; ${target} не тронут.`);
      continue;
    }
    if (dryRun) {
      console.log(`--- ${client} (${target}) — ${current.includes('mcp-slag') ? 'обновление' : 'добавление'}:\n${next}\n`);
      continue;
    }
    writeAtomic(target, next);
    console.log(`${client}: ${current.includes('mcp-slag') ? 'обновлён' : 'добавлен'} → ${target}`);
  }

  console.log(`\nперезапусти клиент(ы): конфиг читается на старте.`);
}
