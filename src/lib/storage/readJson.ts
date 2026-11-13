/**
 * Reading the JSON blobs `localStorage` keeps: parse once, fall back instead of throwing.
 *
 * The shape of a stored value is not something `JSON.parse` promises — a half-written draft,
 * a value from an older build or `"null"` all arrive here. A caller that knows better passes
 * `revive`: `undefined` from it means "not my shape", and the fallback comes back unchanged.
 * The module itself never writes, so it stays usable from anywhere a key is read.
 */
export function readStoredJson<T>(
  key: string,
  fallback: T,
  revive?: (value: unknown) => T | undefined
): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (parsed === null) return fallback;
  if (!revive) return parsed as T;
  const revived = revive(parsed);
  return revived === undefined ? fallback : revived;
}
