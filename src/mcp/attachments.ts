// Where the bytes of an attachment actually live, and how much of them the MCP server will inline.
//
// A note keeps only metadata; the file sits in `<vault>/.attachments/`. The name on disk is the
// last segment of `relativePath` (`<id>_<photo>.webp` for the app, `<id>-<photo>.webp` for the
// headless node), so both shapes are tried before giving up on a single suffix scan.

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SlagAttachment } from '../types';
import type { McpVaultConfig } from './types';

/** Anything bigger is refused instead of being base64-ed into a tool answer. */
export const INLINE_ATTACHMENT_LIMIT_BYTES = 4 * 1024 * 1024;

/** Text above this is not worth pasting into a chat even when it fits the inline limit. */
export const TEXT_ATTACHMENT_LIMIT_BYTES = 512 * 1024;

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'heic', 'heif', 'tif', 'tiff', 'ico']);
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'yaml', 'yml', 'xml', 'html', 'htm', 'css',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'log', 'ini', 'toml', 'sql', 'py', 'sh', 'rs', 'go',
]);
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/sql',
  'image/svg+xml',
]);

function extensionOf(value: string): string {
  const name = (value.split(/[\\/]/).pop() || '').trim();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Whether the UI (and the client) should treat this file as a picture. */
export function isImageAttachment(attachment: SlagAttachment): boolean {
  if (attachment.type === 'image') return true;
  if ((attachment.mimeType || '').toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(attachment.name || attachment.relativePath));
}

/** Whether the bytes can be handed over as text instead of base64. */
export function isTextAttachment(attachment: SlagAttachment): boolean {
  const mime = (attachment.mimeType || '').toLowerCase();
  if (mime.startsWith('text/') || TEXT_MIME_TYPES.has(mime)) return true;
  return TEXT_EXTENSIONS.has(extensionOf(attachment.name || attachment.relativePath));
}

/** `.attachments/` sits next to `notes/`, but a vault without the split keeps it beside the notes. */
export function attachmentsDirs(config: McpVaultConfig): string[] {
  return [...new Set([path.join(config.vaultPath, '.attachments'), path.join(config.notesDir, '.attachments')])];
}

function safeNames(attachment: SlagAttachment): string[] {
  const relative = (attachment.relativePath || attachment.name || '').replace(/\\/g, '/');
  const basename = relative.split('/').pop() || attachment.name || '';
  const id = (attachment.id || '').replace(/[\\/]/g, '');
  const names = [
    basename,
    id ? `${id}_${basename}` : '',
    id ? `${id}-${basename}` : '',
    attachment.name,
  ].filter((name) => Boolean(name) && name !== '.' && name !== '..');
  return [...new Set(names)];
}

async function findBySuffix(dir: string, basename: string): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return undefined;
  }
  const exact = entries.find((name) => name === basename);
  if (exact) return path.join(dir, exact);
  // A name alone is not identity, so a suffix guess is only taken when it is the single candidate.
  const candidates = entries.filter((name) => name.endsWith(`_${basename}`) || name.endsWith(`-${basename}`));
  return candidates.length === 1 ? path.join(dir, candidates[0]) : undefined;
}

/** Absolute path of the attachment's bytes, or undefined when they are only on another device. */
export async function resolveAttachmentPath(
  config: McpVaultConfig,
  attachment: SlagAttachment,
): Promise<string | undefined> {
  const names = safeNames(attachment);
  const dirs = attachmentsDirs(config);

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }

  const basename = names[0];
  for (const dir of dirs) {
    const found = await findBySuffix(dir, basename);
    if (found) return found;
  }
  return undefined;
}

/** `file://` url of a disk path, which desktop clients can open as is. */
export function attachmentFileUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).href;
}

/** The resource a client can read instead of a path, when it has no filesystem of its own. */
export function attachmentResourceUri(noteId: string, name: string): string {
  return `slag://attachments/${encodeURIComponent(noteId)}/${encodeURIComponent(name)}`;
}
