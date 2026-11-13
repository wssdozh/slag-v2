// One answer to "is this path allowed inside the vault": normalizes separators and
// rejects traversal, absolute paths, Windows device names and control characters.
// Used by the MCP tools, sync import and backup restore before anything touches disk.

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const INVALID_SEGMENT = /[<>:"|?*]/;

function hasControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export interface SafeVaultPathOptions {
  /** Allow an empty path and return ''. Off by default: an empty folder is not a folder. */
  allowEmpty?: boolean;
  /** Whole-path limit. 240 leaves room for the vault prefix on Windows. */
  maxLength?: number;
}

function invalid(reason: string): never {
  throw new Error(`Unsafe vault path: ${reason}`);
}

/**
 * A vault-relative path with `/` separators, or a thrown error. Does not touch the disk.
 *
 * Rejects: absolute paths, drive letters, `~`, `.`/`..` segments, empty segments,
 * backslashes (normalized first), NUL/control characters, Windows-reserved device
 * names, trailing dots/spaces and overlong segments.
 */
export function safeVaultRelativePath(input: unknown, options: SafeVaultPathOptions = {}): string {
  if (typeof input !== 'string') invalid('not a string');

  const raw = input.replace(/\\/g, '/');
  const value = raw.trim();
  if (!value) {
    if (options.allowEmpty) return '';
    invalid('empty');
  }
  if (/[ .]$/.test(raw)) invalid('trailing dot or space');
  if (value.startsWith('/') || value.startsWith('~') || /^[a-zA-Z]:/.test(value)) {
    invalid('absolute');
  }
  if (value.length > (options.maxLength ?? 240)) invalid('too long');

  const parts = value.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..') invalid('empty or traversal segment');
    if (part.length > 120) invalid('segment too long');
    if (INVALID_SEGMENT.test(part) || hasControl(part)) invalid('illegal character');
    if (/[ .]$/.test(part)) invalid('trailing dot or space');
    if (WINDOWS_RESERVED.test(part)) invalid('reserved device name');
  }

  return parts.join('/');
}

export function isSafeVaultRelativePath(input: unknown, options: SafeVaultPathOptions = {}): boolean {
  try {
    safeVaultRelativePath(input, options);
    return true;
  } catch {
    return false;
  }
}
