// Obsidian attachment embeds (`![[name]]`): parsing the token and resolving it to a file.
//
// Two surfaces read the same token: the feed's markdown renderer, which has to carry it
// through react-markdown, and the editor's inline widgets, which replace it in place.
import type { SlagAttachment } from '../../types';

/** Private link scheme the feed hands to react-markdown; never fetched, only resolved. */
export const ATTACHMENT_SCHEME = 'attachment:';

export interface AttachmentEmbed {
  /** Target inside the brackets, exactly as written in the note. */
  name: string;
  /** Visible label: the alias when `|label` is there, the target otherwise. */
  label: string;
  /** Offset of the leading `!` in the searched text. */
  from: number;
  /** Offset just past the closing `]]`. */
  to: number;
}

const EMBED_PATTERN = /!\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

/** Every `![[name]]` / `![[name|label]]` in `text`, in document order. */
export function findAttachmentEmbeds(text: string): AttachmentEmbed[] {
  if (!text.includes('![[')) return [];
  const embeds: AttachmentEmbed[] = [];
  for (const match of text.matchAll(EMBED_PATTERN)) {
    const name = match[1].trim();
    if (!name) continue;
    const index = match.index ?? 0;
    embeds.push({
      name,
      label: (match[2] ?? match[1]).trim(),
      from: index,
      to: index + match[0].length,
    });
  }
  return embeds;
}

/**
 * Replaces the embeds with links on the private scheme so react-markdown leaves the token
 * alone. Runs before the wiki-link transform: otherwise the inner `[[name]]` would become
 * `![name](wiki:name)`, which is a broken image, not an attachment.
 */
export function markdownWithAttachmentEmbeds(raw: string, attachments?: SlagAttachment[]): string {
  if (!raw.includes('![[')) return raw;
  const embeds = resolveAttachmentEmbeds(raw, attachments);
  if (embeds.length === 0) return raw;

  let out = '';
  let cursor = 0;
  for (const { embed, attachment } of embeds) {
    out += raw.slice(cursor, embed.from);
    out += `[${embed.label}](${attachmentEmbedHref(attachment?.id ?? embed.name)})`;
    cursor = embed.to;
  }
  return out + raw.slice(cursor);
}

/** Stable id/path first. Ambiguous legacy names follow attachment order; unique files may repeat. */
export function resolveAttachmentByName(
  attachments: SlagAttachment[] | undefined,
  name: string,
  occurrence = 0,
): SlagAttachment | undefined {
  const wanted = name.trim();
  if (!wanted || !attachments) return undefined;
  const stable = attachments.find(attachment => attachment.id === wanted || attachment.relativePath === wanted);
  if (stable) return stable;
  const exact = attachments.filter(attachment => attachment.name === wanted);
  const matches = exact.length ? exact : attachments.filter(attachment => attachment.name.toLowerCase() === wanted.toLowerCase());
  // Legacy names cannot distinguish intentional repeats from different same-named files.
  return matches.length ? matches[occurrence % matches.length] : undefined;
}

/** Resolve in document order, not render/viewport order, including hidden source tokens. */
export function resolveAttachmentEmbeds(text: string, attachments?: SlagAttachment[]) {
  const occurrences = new Map<string, number>();
  return findAttachmentEmbeds(text).map(embed => {
    const key = embed.name.toLowerCase();
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return { embed, attachment: resolveAttachmentByName(attachments, embed.name, occurrence) };
  });
}

/** Bytes live in IndexedDB or `.attachments/`; `dataUrl` is the frame attached a second ago. */
export function attachmentEmbedSrc(
  attachment: SlagAttachment | undefined,
  srcs: Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (!attachment) return undefined;
  return srcs?.[attachment.id] ?? attachment.dataUrl;
}

export function attachmentEmbedHref(name: string): string {
  return `${ATTACHMENT_SCHEME}${encodeURIComponent(name)}`;
}

export function attachmentNameFromHref(href: string): string | null {
  if (!href.startsWith(ATTACHMENT_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(ATTACHMENT_SCHEME.length));
  } catch {
    return null;
  }
}
