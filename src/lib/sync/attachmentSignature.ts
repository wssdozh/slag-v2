// Cheap identity for an attachment: name plus size, enough to spot a stale copy.
import type { SlagAttachment } from '../../types';

export function attachmentSignature(att: SlagAttachment): string {
  return `${att.size}:${att.name}`;
}
