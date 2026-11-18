// Secrets at rest for the headless node: one 0600 file. A server has no keychain, and the
// IndexedDB backend needs a browser key store, so this is the third backend secretStore allows.
import fs from 'node:fs';
import path from 'node:path';
import { slagHome } from './env';
import { initSecretStore, installSecretBackend, type SecretBackend } from '../lib/platform/secretStore';

const secretsFile = path.join(slagHome, 'secrets.json');

function read(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(secretsFile, 'utf-8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`slag-node: could not read ${secretsFile}: ${String(error)}\n`);
    }
    return {};
  }
}

function write(data: Record<string, string>): void {
  const tmp = `${secretsFile}.tmp`;
  fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
  // Write-then-rename: a crash mid-write must not leave a half seed behind.
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, secretsFile);
}

const fileBackend: SecretBackend = {
  get(key) {
    return Promise.resolve(read()[key] ?? null);
  },
  set(key, value) {
    const data = read();
    data[key] = value;
    write(data);
    return Promise.resolve();
  },
  delete(key) {
    const data = read();
    delete data[key];
    write(data);
    return Promise.resolve();
  },
};

export async function initNodeSecretStore(): Promise<void> {
  installSecretBackend(fileBackend);
  await initSecretStore();
}
