// Stubs for the tauri API, swapped in by the headless build. `isTauri()` must answer false:
// isPrimaryWindow() then trusts this process to own sync, which is exactly what the node is.
type UnlistenFn = () => void;

export function isTauri(): boolean {
  return false;
}

export function getCurrentWindow(): never {
  throw new Error('The headless node has no window');
}

export async function listen(): Promise<UnlistenFn> {
  return () => undefined;
}

export async function invoke<T>(): Promise<T> {
  throw new Error('The headless node has no tauri commands');
}
