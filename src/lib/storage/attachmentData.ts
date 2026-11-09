import type { SlagAttachment, SlagItem } from '../../types';

/**
 * Attachments as they belong in the localStorage index: metadata only.
 *
 * `localStorage` is the synchronous index the UI and the sync engine read — it is not a place
 * for image bytes. The bytes live in IndexedDB and `.attachments/`, the note keeps their ids,
 * and one photo is enough to burn the whole five-megabyte quota.
 */
export function stripAttachmentList(attachments: SlagAttachment[]): SlagAttachment[] {
  return attachments.map((att) => ({ ...att, dataUrl: undefined }));
}

export function stripAttachmentData(items: SlagItem[]): SlagItem[] {
  return items.map((item) => (
    item.attachments?.length
      ? { ...item, attachments: stripAttachmentList(item.attachments) }
      : item
  ));
}
