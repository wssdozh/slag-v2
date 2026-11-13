// The commands the node answers to. Loaded only after the environment and the secret store are
// ready, because importing the sync engine builds it and reads its config at module load.
import os from 'node:os';
import path from 'node:path';
import { NodeVault } from './vaultPort';
import { setVaultPort } from '../lib/storage/port';
import { accountClient } from '../lib/sync/account';
import { getOrCreateDeviceIdentity, decryptVaultKeyForDevice } from '../lib/sync/accountCrypto';
import { validateMnemonic } from '../lib/sync/crypto';
import { logger } from '../lib/logger/logger';
import { SYNC_INTERVALS } from '../config';

const cliLog = logger.scope('NODE');

const DEFAULT_SERVER = process.env.SLAG_RELAY_URL || 'http://152.53.199.71:8320';
/** How the user calls us back; the wrapper exports its own path so messages stay copyable. */
const SELF = process.env.SLAG_SELF || 'slag-node';
/** How long `login` waits for the two taps in the app before giving up. */
const APPROVAL_WAIT_MS = 5 * 60 * 1000;

interface Flags {
  [key: string]: string | boolean | undefined;
}

export interface CliOptions {
  vaultDir: string;
}

type Engine = Awaited<ReturnType<typeof engine>>;

export function parseFlags(args: string[]): { command: string; positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inline] = arg.slice(2).split('=', 2);
    if (inline !== undefined) {
      flags[rawKey] = inline;
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      flags[rawKey] = next;
      index++;
    } else {
      flags[rawKey] = true;
    }
  }
  return { command: positional.shift() ?? 'help', positional, flags };
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

async function loadVault(options: CliOptions): Promise<NodeVault> {
  const vault = new NodeVault(options.vaultDir);
  vault.load();
  setVaultPort(vault);
  return vault;
}

// The engine is a singleton that reads its config on import, so it is imported lazily and only
// here: every command below runs after the environment shim is in place.
async function engine() {
  const { syncEngine } = await import('../lib/sync');
  return syncEngine;
}

async function readSeed(): Promise<string> {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question('seed-фраза: ')).trim();
  } finally {
    rl.close();
  }
}

/**
 * Installs the vault the account is willing to give this device: an invitation carries the key,
 * an already-accepted grant only carries the id. Returns the vault name, or null when there is
 * nothing to take yet.
 */
async function takeVault(sync: Engine, vault: NodeVault, wantedId?: string): Promise<string | null> {
  await accountClient.refresh();
  const state = accountClient.getState();
  const deviceId = sync.getConfig().deviceId;

  const invitation = state.invitations.find((entry) => !wantedId || entry.vaultId === wantedId);
  if (invitation) {
    const seedPhrase = await decryptVaultKeyForDevice(deviceId, invitation.encryptedKey);
    if (!validateMnemonic(seedPhrase)) throw new Error('Не удалось расшифровать ключ хранилища');
    await sync.setVaultSeedPhrase('default_vault', seedPhrase);
    vault.adoptSyncId(invitation.vaultId);
    await accountClient.acceptVault(invitation.vaultId);
    return invitation.vaultName || invitation.vaultId;
  }

  const granted = state.vaults.find(
    (entry) =>
      (!wantedId || entry.id === wantedId) &&
      entry.grants.some((grant) => grant.deviceId === deviceId && grant.status === 'accepted')
  );
  if (!granted) return null;
  if (!sync.getConfig().seedPhrase) {
    // A grant without an invitation means the key never travelled: it only ever rides an
    // invitation, so the owner has to revoke this device and share the vault again.
    throw new Error('Доступ выдан, но ключа нет. Отзови устройство в приложении и выдай хранилище заново');
  }
  vault.adoptSyncId(granted.id);
  return granted.name || granted.id;
}

async function login(options: CliOptions, flags: Flags): Promise<void> {
  const vault = await loadVault(options);
  const sync = await engine();
  const serverUrl = stringFlag(flags, 'server') ?? DEFAULT_SERVER;
  const name = stringFlag(flags, 'name') ?? os.hostname();

  const flagSeed = stringFlag(flags, 'seed');
  const seed = flagSeed === '-' || flagSeed === undefined ? await readSeed() : flagSeed.trim();
  if (!validateMnemonic(seed)) throw new Error('Это не seed-фраза');

  sync.saveConfig({ enabled: true, serverUrl, deviceName: name });
  sync.saveConfig({ seedPhrase: seed });

  const device = await getOrCreateDeviceIdentity(sync.getConfig().deviceId, name, 'desktop');
  let pendingApproval = false;
  try {
    pendingApproval = (await accountClient.login(seed, serverUrl, device)) === 'pending_device';
  } catch (error) {
    // Same trap as the poll below: a failed state refresh after a saved session is not a failure.
    if (!accountClient.isAuthenticated()) throw error;
    cliLog.warn('вход прошёл, обновление состояния сорвалось', error);
  }
  if (pendingApproval) {
    process.stdout.write(`\nустройство «${name}» ждёт подтверждения.\nприложение → настройки → устройства → «${name}» → разрешить.\n\n`);
    const deadline = Date.now() + APPROVAL_WAIT_MS;
    for (;;) {
      if (accountClient.isAuthenticated()) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      let status: Awaited<ReturnType<typeof accountClient.completePendingLogin>>;
      try {
        status = await accountClient.completePendingLogin();
      } catch (error) {
        // A tunnel hiccup or a 15s abort is not a verdict: keep waiting until the deadline.
        cliLog.warn('опрос подтверждения сорвался, повторяю', error);
        status = 'pending';
      }
      // The session is written before the account state refresh, so a failed refresh after a
      // successful approval must not be read as "not approved yet" — the token is already ours.
      if (accountClient.isAuthenticated()) break;
      if (status === 'expired' || status === 'rejected') throw new Error('Подтверждение не пришло');
      if (Date.now() > deadline) throw new Error(`Подтверждение не пришло за 5 минут. Запусти ${SELF} login ещё раз`);
    }
  }

  const pendingVault = stringFlag(flags, 'vault');
  if (pendingVault) vault.adoptSyncId(pendingVault);

  const deadline = Date.now() + APPROVAL_WAIT_MS;
  let lastError: unknown = null;
  const tryTake = async (): Promise<string | null> => {
    try {
      return await takeVault(sync, vault, pendingVault);
    } catch (error) {
      // The tunnel drops requests now and then; a refused vault stays refused, so remember it.
      lastError = error;
      cliLog.warn('не удалось забрать хранилище, повторяю', error);
      return null;
    }
  };

  let taken = await tryTake();
  if (!taken) {
    process.stdout.write('теперь выдай этому устройству хранилище (права — «только чтение»).\n\n');
    while (!taken) {
      if (Date.now() > deadline) {
        throw lastError ?? new Error(`Хранилище так и не выдали. Запусти ${SELF} login ещё раз`);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
      taken = await tryTake();
    }
  }

  process.stdout.write(`\nготово: хранилище «${taken}», устройство ${sync.getConfig().deviceId}\nзапускай: systemctl --user start slag-node\n`);
}

async function accept(options: CliOptions, positional: string[]): Promise<void> {
  const vaultId = positional[0];
  if (!vaultId) throw new Error(`Укажи vaultId: ${SELF} accept <vaultId>`);
  const vault = await loadVault(options);
  const sync = await engine();
  if (!accountClient.isAuthenticated()) throw new Error(`Сначала ${SELF} login`);
  const taken = await takeVault(sync, vault, vaultId);
  if (!taken) throw new Error(`Аккаунт не знает хранилище ${vaultId} или не выдал к нему доступ`);
  process.stdout.write(`хранилище «${taken}» принято\n`);
}

async function listVaults(options: CliOptions): Promise<void> {
  await loadVault(options);
  const sync = await engine();
  if (!accountClient.isAuthenticated()) throw new Error(`Сначала ${SELF} login`);
  await accountClient.refresh();
  const state = accountClient.getState();
  const deviceId = sync.getConfig().deviceId;
  const rows = [
    ...state.vaults.map((entry) => {
      const grant = entry.grants.find((item) => item.deviceId === deviceId);
      return `${entry.id}\t${entry.name}\t${grant ? `${grant.mode} ${grant.status}` : 'без доступа'}`;
    }),
    ...state.invitations.map((entry) => `${entry.vaultId}\t${entry.vaultName}\tприглашение ${entry.mode}`),
  ];
  process.stdout.write(`vaultId\tname\tgrant\n${rows.join('\n')}\n`);
}

async function run(options: CliOptions): Promise<void> {
  const vault = await loadVault(options);
  const sync = await engine();
  const config = sync.getConfig();

  if (!accountClient.isAuthenticated()) throw new Error(`Не подключено: запусти ${SELF} login`);
  if (!config.seedPhrase) throw new Error(`Нет ключа хранилища: запусти ${SELF} login`);

  let last = '';
  sync.subscribe((status) => {
    const line = `${status.state}${status.error ? ` (${status.error})` : ''} pending=${status.pendingCount} devices=${status.connectedDevicesCount}`;
    if (line === last) return;
    last = line;
    cliLog.info(`sync: ${line}`);
  });

  cliLog.info(`старт: ${options.vaultDir}, заметок ${vault.noteCount}, режим ${config.localSyncMode ?? 'read-write'}`);
  await sync.init();
  accountClient.startPolling(config.serverUrl);

  // Keep the process alive; systemd restarts it if it ever returns.
  await new Promise<void>(() => {
    setInterval(() => undefined, SYNC_INTERVALS.POLL_INTERVAL_MS);
  });
}

export async function runCli(argv: string[], defaults: CliOptions): Promise<void> {
  const { command, positional, flags } = parseFlags(argv);
  const options: CliOptions = { vaultDir: stringFlag(flags, 'vault-dir') ?? defaults.vaultDir };

  switch (command) {
    case 'login':
      await login(options, flags);
      return;
    case 'run':
      await run(options);
      return;
    case 'vaults':
      await listVaults(options);
      return;
    case 'accept':
      await accept(options, positional);
      return;
    default:
      process.stdout.write(
        [
          'slag — хранилище и синхронизация без интерфейса',
          '',
          '  login   ввести seed-фразу, дождаться подтверждения и забрать хранилище',
          '  run     работать до остановки (этим занимается systemd)',
          '  vaults  что доступно и с какими правами',
          '  accept <vaultId>   принять конкретное хранилище',
          '',
          `каталог: ${path.resolve(options.vaultDir)}`,
        ].join('\n') + '\n'
      );
  }
}
