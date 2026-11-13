/** The relay address without trailing slashes: every request path starts with one. */
export function apiBase(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}
