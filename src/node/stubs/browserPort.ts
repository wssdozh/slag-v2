// The headless build never has a browser store: it registers its own VaultPort before touching
// the engine, so this stub only exists to keep the import graph resolvable.
import type { VaultPort } from '../../lib/storage/port';

function unavailable(): never {
  throw new Error('The browser vault is unavailable in the headless node: register a VaultPort first');
}

export const browserVaultPort = new Proxy({}, { get: () => unavailable }) as VaultPort;
