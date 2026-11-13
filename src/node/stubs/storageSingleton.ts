// `syncEngine` re-exports the browser store for the e2e specs. The headless build maps that
// re-export here so the tauri and IndexedDB modules never enter the node bundle.
function unavailable(): never {
  throw new Error('The browser store is unavailable in the headless node: use the VaultPort');
}

export const storage = new Proxy({}, { get: () => unavailable }) as Record<string, (...args: unknown[]) => never>;
