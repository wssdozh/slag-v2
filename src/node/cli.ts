// The commands the node answers to. Loaded only after the environment and the secret store are
// ready, because importing the sync engine builds it and reads its config at module load.
import path from 'node:path';
import { NodeVault } from './vaultPort';
import { setVaultPort } from '../lib/storage/port';
import { accountClient } from '../lib/sync/account';
import { getOrCreateDeviceIdentity, decryptVaultKeyForDevice } from '../lib/sync/accountCrypto';
import { validateMnemonic } from '../lib/sync/crypto';
import { logger } from '../lib/logger/logger';
import { SYNC_INTERVALS } from '../config';

const cliLog = logger.scope('NODE');

interface Flags {
  [key: string]: string | boolean | undefined;
}

export interface CliOptions {
  vaultDir: string;
}

const DEFAULT_SERVER = process.env.SLAG_RELAY_URL || 'http://152.53.199.71:8320';

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

async function login(options: CliOptions, flags: Flags): Promise<void> {
  const seed = stringFlag(flags, 'seed')?.trim();
  if (!seed || !validateMnemonic(seed)) {
    throw new Error('Нужна валидная seed-фраза: slag-node login --seed "<12 слов>"');
  }
  const serverUrl = stringFlag(flags, 'server') ?? DEFAULT_SERVER;
  const name = stringFlag(flags, 'name') ?? 'pet';
  const vault = await loadVault(options);

  const sync = await engine();
  sync.saveConfig({ enabled: true, serverUrl, deviceName: name });
  sync.saveConfig({ seedPhrase: seed });

  const device = await getOrCreateDeviceIdentity(sync.getConfig().deviceId, name, 'desktop');
  const result = await accountClient.login(seed, serverUrl, device);

  if (result === 'authenticated') {
    cliLog.info('Вход выполнен сразу: этот аккаунт ещё не знал других устройств');
  } else {
    process.stdout.write(
      '\nУстройство просит доступ.\n' +
        'Откройте приложение SLAG на телефоне или компьютере:\n' +
        '  настройки → аккаунт → устройства → «' + name + '» → разрешить вход\n\n' +
        'Ждём подтверждения, ничего не закрывайте...\n'
    );
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await accountClient.completePendingLogin();
      if (status === 'authenticated') {
        process.stdout.write('Подтверждено, сессия сохранена.\n');
        break;
      }
      if (status === 'expired' || status === 'rejected') {
        throw new Error(status === 'rejected' ? 'Вход отклонён на основном устройстве' : 'Время ожидания истекло');
      }
    }
  }

  const pendingVault = stringFlag(flags, 'vault');
  if (pendingVault) vault.adoptSyncId(pendingVault);

  await accountClient.refresh();
  const state = accountClient.getState();
  const deviceId = sync.getConfig().deviceId;
  const vaults = state.vaults.map((entry) => {
    const grant = entry.grants.find((item) => item.deviceId === deviceId);
    return `${entry.id}  ${entry.name}  ${grant ? `${grant.mode}/${grant.status}` : 'без доступа'}`;
  });
  const invitations = state.invitations.map((entry) => `${entry.vaultId}  ${entry.vaultName}  приглашение`);
  process.stdout.write(
    `\nУстройство ${deviceId} подключено к аккаунту.\n` +
      [...vaults, ...invitations].map((line) => `  ${line}`).join('\n') +
      '\n\nДальше: slag-node accept <vaultId>, потом slag-node run\n'
  );
}

async function listVaults(options: CliOptions): Promise<void> {
  await loadVault(options);
  const sync = await engine();
  await accountClient.refresh();
  const state = accountClient.getState();
  const deviceId = sync.getConfig().deviceId;
  if (!accountClient.isAuthenticated()) throw new Error('Сначала slag-node login');

  const rows = [
    ...state.vaults.map((entry) => {
      const grant = entry.grants.find((item) => item.deviceId === deviceId);
      return `${entry.id}\t${entry.name}\t${grant ? `${grant.mode} ${grant.status}` : 'без доступа'}`;
    }),
    ...state.invitations.map((entry) => `${entry.vaultId}\t${entry.vaultName}\tприглашение ${entry.mode}`),
  ];
  process.stdout.write(`vaultId\tname\tgrant\n${rows.join('\n')}\n`);
}

async function accept(options: CliOptions, positional: string[]): Promise<void> {
  const vaultId = positional[0];
  if (!vaultId) throw new Error('Укажите vaultId из slag-node vaults');
  const vault = await loadVault(options);
  const sync = await engine();
  if (!accountClient.isAuthenticated()) throw new Error('Сначала slag-node login');

  await accountClient.refresh();
  const state = accountClient.getState();
  const invitation = state.invitations.find((entry) => entry.vaultId === vaultId);
  const serverVault = state.vaults.find((entry) => entry.id === vaultId);
  if (!invitation && !serverVault) throw new Error(`Аккаунт не знает хранилище ${vaultId}`);

  if (invitation) {
    const deviceId = sync.getConfig().deviceId;
    const seedPhrase = await decryptVaultKeyForDevice(deviceId, invitation.encryptedKey);
    if (!validateMnemonic(seedPhrase)) throw new Error('Не удалось расшифровать ключ хранилища');
    await sync.setVaultSeedPhrase('default_vault', seedPhrase);
    vault.adoptSyncId(vaultId);
    await accountClient.acceptVault(vaultId);
    process.stdout.write(`Хранилище ${invitation.vaultName} принято, ключ сохранён.\n`);
    return;
  }

  const grant = serverVault?.grants.find((entry) => entry.deviceId === sync.getConfig().deviceId);
  if (!grant || grant.status !== 'accepted') {
    throw new Error('Доступа к этому хранилищу нет: попросите владельца выдать его устройству');
  }
  vault.adoptSyncId(vaultId);
  process.stdout.write(`Хранилище ${serverVault?.name ?? vaultId} уже доступно (${grant.mode}).\n`);
}

async function run(options: CliOptions): Promise<void> {
  const vault = await loadVault(options);
  const sync = await engine();
  const config = sync.getConfig();

  if (!accountClient.isAuthenticated()) {
    throw new Error('Нет входа в аккаунт: выполните slag-node login на этом устройстве');
  }
  if (!config.seedPhrase) {
    throw new Error('Нет ключа хранилища: выполните slag-node accept <vaultId>');
  }

  let last = '';
  sync.subscribe((status) => {
    const line = `${status.state}${status.error ? ` (${status.error})` : ''} pending=${status.pendingCount} devices=${status.connectedDevicesCount}`;
    if (line === last) return;
    last = line;
    cliLog.info(`sync: ${line}`);
  });

  cliLog.info(`Старт: хранилище ${options.vaultDir}, заметок ${vault.noteCount}, режим ${config.localSyncMode ?? 'read-write'}`);
  await sync.init();
  accountClient.startPolling(config.serverUrl);

  // Keep the process alive; systemd restarts it if it ever returns.
  await new Promise<void>(() => {
    setInterval(() => undefined, SYNC_INTERVALS.POLL_INTERVAL_MS);
  });
}

export async function runCli(argv: string[], defaults: CliOptions): Promise<void> {
  const { command, positional, flags } = parseFlags(argv);
  const options: CliOptions = {
    vaultDir: stringFlag(flags, 'vault-dir') ?? defaults.vaultDir,
  };

  switch (command) {
    case 'login':
      await login(options, flags);
      return;
    case 'vaults':
      await listVaults(options);
      return;
    case 'accept':
      await accept(options, positional);
      return;
    case 'run':
      await run(options);
      return;
    default:
      process.stdout.write(
        [
          'slag-node — headless хранилище и синхронизация',
          '',
          '  login --seed "<12 слов>" [--server URL] [--name pet] [--vault <syncId>]',
          '  vaults                      что доступно аккаунту и с какими правами',
          '  accept <vaultId>            принять хранилище, ключ приедет зашифрованным',
          '  run                         работать до остановки (systemd)',
          '',
          `каталог хранилища: ${path.resolve(options.vaultDir)}`,
        ].join('\n') + '\n'
      );
  }
}
