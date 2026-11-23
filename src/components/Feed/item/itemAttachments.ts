// How a card's files split by kind, how many slots they get, and where their bytes are.
import type { AttachmentSrcs } from '../../../hooks/media/useAttachmentSrc';
import type { LightboxImage, SlagAttachment, SlagItem } from '../../../types';

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
