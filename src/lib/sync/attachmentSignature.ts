import type { SlagAttachment } from '../../types';

export function attachmentSignature(att: SlagAttachment): string {
  return `${att.size}:${att.name}`;
}
