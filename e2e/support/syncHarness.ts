import { SyncEngine, storage, accountClient } from '../../src/lib/sync/syncEngine';

// Browser-only: import this module inside page.evaluate so every stub stays in the page.
export async function withSyncHarness<T>(run: (harness: {
  engine: any;
  storage: typeof storage;
  push: () => Promise<void>;
  init: (seedPhrase: string) => Promise<void>;
}) => Promise<T>): Promise<T> {
  const originals = {
    getToken: accountClient.getToken, getSession: accountClient.getSession,
    refresh: accountClient.refresh, getState: accountClient.getState, subscribe: accountClient.subscribe,
  };
  const realFetch = window.fetch;
  const importSyncedVaultData = storage.importSyncedVaultData;
  let engine: any;
  try {
    Object.assign(accountClient, {
      getToken: () => null,
      getSession: () => ({ deviceId: 'synthetic-device' }),
      refresh: async () => {},
      getState: () => ({ devices: [], vaults: [] }),
      subscribe: () => () => {},
    });
    engine = new SyncEngine();
    engine.refreshServerAuth = async () => true;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    const push = engine.pushLocalChanges.bind(engine);
    engine.pushLocalChanges = async () => {};
    return await run({
      engine, storage, push,
      init: async (seedPhrase) => {
        engine.saveConfig({ enabled: true, seedPhrase, deviceId: 'synthetic-device' });
        await engine.init();
      },
    });
  } finally {
    window.fetch = realFetch;
    storage.importSyncedVaultData = importSyncedVaultData;
    try {
      if (engine) engine.disconnect();
    } finally {
      Object.assign(accountClient, originals);
    }
  }
}
