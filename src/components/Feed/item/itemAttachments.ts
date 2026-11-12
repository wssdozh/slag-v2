// How a card's files split by kind, how many slots they get, and where their bytes are.
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { LightboxImage, SlagAttachment, SlagItem } from '../../../types';

/** One picture never eats the column: 320 tall, and never wider than 416 even as a panorama. */
export const THUMB_MAX_HEIGHT = 320;
export const THUMB_MAX_WIDTH = 416;

/** Six slots is the ceiling of the pile: the sixth counts what did not fit. */
const ALBUM_SLOTS = 6;

/** What the card is, when there is nothing on it but its own attachment. */
export type CardShape = 'voice' | 'file' | 'video' | 'image' | 'mixed';

export interface AttachmentGroups {
  audio: SlagAttachment[];
  video: SlagAttachment[];
  image: SlagAttachment[];
  file: SlagAttachment[];
}

export interface AttachmentCounts {
  audio: number;
  video: number;
  image: number;
  file: number;
}

/** Each kind is drawn in its own slot, and the counts decide the shape of the whole card. */
export function groupItemAttachments(attachments: SlagAttachment[] | undefined): AttachmentGroups {
  const groups: AttachmentGroups = { audio: [], video: [], image: [], file: [] };
  for (const attachment of attachments ?? []) groups[attachment.type].push(attachment);
  return groups;
}

export function attachmentCounts(groups: AttachmentGroups): AttachmentCounts {
  return {
    audio: groups.audio.length,
    video: groups.video.length,
    image: groups.image.length,
    file: groups.file.length,
  };
}

/**
 * A card that is nothing but its attachment becomes a bubble; one kind of picture does it even
 * as a pile. Text, chips, tasks and mixed attachments keep the full row: they need the width.
 */
export function itemCardShape(item: SlagItem, counts: AttachmentCounts): CardShape {
  const bare =
    item.type === 'note' &&
    !item.content.trim() &&
    (!item.subtasks || item.subtasks.length === 0) &&
    (!item.tags || item.tags.length === 0) &&
    !item.replyToId &&
    !item.isPinned &&
    (!item.priority || item.priority === 'none');
  if (!bare) return 'mixed';
  if (counts.image > 0) return counts.audio + counts.video + counts.file > 0 ? 'mixed' : 'image';
  if (counts.audio > 0) return counts.audio + counts.video + counts.file > 1 ? 'mixed' : 'voice';
  if (counts.video > 0) return counts.video + counts.file > 1 ? 'mixed' : 'video';
  return counts.file === 1 ? 'file' : 'mixed';
}

/** A pile of pictures fills one canvas: the first frame gets a row of its own. */
export function albumRowSizes(count: number): number[] {
  if (count === 2) return [2];
  if (count === 3) return [1, 2];
  if (count === 4) return [2, 2];
  if (count === 5) return [2, 3];
  return [3, 3];
}

export interface AlbumTile {
  image: SlagAttachment;
  /** Non-zero marks the slot that counts the frames left out; it opens the deck on the next one. */
  hidden: number;
}

export interface AlbumLayout {
  /** Frames per row, top to bottom. */
  rows: number[];
  /** Index of the first tile of each row inside `tiles`. */
  rowStarts: number[];
  tiles: AlbumTile[];
}

export function buildAlbumLayout(images: SlagAttachment[]): AlbumLayout {
  const shown = images.length > ALBUM_SLOTS ? ALBUM_SLOTS - 1 : images.length;
  const hidden = images.length - shown;
  const rows = albumRowSizes(images.length);
  const tiles: AlbumTile[] = images.slice(0, shown).map((image) => ({ image, hidden: 0 }));
  const counted = images[shown];
  if (hidden > 0 && counted) tiles.push({ image: counted, hidden });
  const rowStarts = rows.map((_, rowIndex) =>
    rows.slice(0, rowIndex).reduce((sum, perRow) => sum + perRow, 0),
  );
  return { rows, rowStarts, tiles };
}

export interface ImageDeck {
  /** A lone frame keeps its own proportions and sizes itself. */
  hero: SlagAttachment | null;
  /** Two frames and up fill one canvas instead. */
  album: AlbumLayout | null;
}

/** Picks the hero or the grid, never both: the card draws one picture differently from a pile. */
export function buildImageDeck(images: SlagAttachment[]): ImageDeck {
  if (images.length === 1) return { hero: images[0], album: null };
  if (images.length > 1) return { hero: null, album: buildAlbumLayout(images) };
  return { hero: null, album: null };
}

/** Bytes live in IndexedDB or `.attachments/`; `dataUrl` is the frame attached a second ago. */
export function attachmentSrc(
  srcs: AttachmentSrcs,
  attachment: SlagAttachment | null | undefined,
): string | undefined {
  return attachment ? srcs[attachment.id] ?? attachment.dataUrl : undefined;
}

/**
 * One deck for the whole note: a photo and a clip page next to each other, as they do in every
 * messenger. `kind` is what the viewer reads to pick a slide.
 */
export function buildItemLightboxImages(item: SlagItem, srcs: AttachmentSrcs): LightboxImage[] {
  return (item.attachments || [])
    .filter((att) => att.type === 'image' || att.type === 'video')
    .map((att) => ({
      id: att.id,
      name: att.name,
      url: srcs[att.id] ?? att.dataUrl ?? '',
      kind: att.type === 'video' ? 'video' : 'image',
      extractedText: att.extractedText,
      summary: att.summary,
      enrichmentStatus: att.enrichmentStatus,
      enrichmentError: att.enrichmentError,
      sourceItem: item,
    }));
}
