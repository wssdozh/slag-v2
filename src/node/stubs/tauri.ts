// Stubs for the tauri API, swapped in by the headless build. `isTauri()` must answer false:
// isPrimaryWindow() then trusts this process to own sync, which is exactly what the node is.
type UnlistenFn = () => void;

export function isTauri(): boolean {
  return false;
}

export function getCurrentWindow(): never {
  throw new Error('The headless node has no window');
}

export function getCurrentWebviewWindow(): never {
  throw new Error('The headless node has no webview');
}

export async function listen(): Promise<UnlistenFn> {
  return () => undefined;
}

/** Plugin events (notification permission, deep links) belong to a window this process has not. */
export async function addPluginListener(): Promise<{ unregister: () => void }> {
  return { unregister: () => undefined };
}

export async function invoke<T>(): Promise<T> {
  throw new Error('The headless node has no tauri commands');
}
