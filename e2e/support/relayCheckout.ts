import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The relay lives in its own repository. Account integration specs need a checkout of it,
 * next to this one or at SLAG_RELAY_DIR; without one they skip instead of spawning a
 * `server.py` that is not here any more.
 */
export function relayCheckout(): string | null {
  const configured = process.env.SLAG_RELAY_DIR?.trim();
  const directory = configured ? resolve(configured) : resolve('..', 'slag-relay');
  return existsSync(resolve(directory, 'server.py')) ? directory : null;
}

export const RELAY_SKIP_REASON =
  'relay is a separate repository: clone wssdozh/slag-relay next to this checkout or set SLAG_RELAY_DIR';
