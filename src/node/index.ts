// Entry for the headless node. Everything below it is imported dynamically on purpose: the sync
// engine reads its config and ledgers the moment it is loaded, so the browser globals have to be
// in place first.
import os from 'node:os';
import path from 'node:path';

async function main(): Promise<void> {
  const { installNodeEnvironment } = await import('./env');
  installNodeEnvironment();

  const { initNodeSecretStore } = await import('./secrets');
  await initNodeSecretStore();

  const { runCli } = await import('./cli');
  await runCli(process.argv.slice(2), {
    vaultDir: process.env.SLAG_VAULT_DIR || path.join(os.homedir(), 'vaults', 'slag'),
  });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`slag-node: ${message}\n`);
  process.exit(1);
});
