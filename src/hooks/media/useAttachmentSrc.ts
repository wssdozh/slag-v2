import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { storage } from '../../lib/storage';
import type { SlagAttachment } from '../../types';

/**
 * Attachments keep their bytes in IndexedDB and `.attachments/`, while the note carries only
 * metadata — that is what stops the note index from eating the localStorage quota. So a `src` is
 * resolved on demand, the way the audio panel already does it. `dataUrl` wins when it is there:
 * that is a file attached a second ago, still in memory.
 */

export interface AttachmentSrcs {
  [attachmentId: string]: string;
}

export function useAttachmentSrcs(attachments: SlagAttachment[] | undefined): AttachmentSrcs {
  const list = attachments ?? [];
  // Keyed by ids, not by array identity: the parent rebuilds the array on every render.
  const key = list.map((att) => att.id).join('|');
  const [srcs, setSrcs] = useState<AttachmentSrcs>({});

  const listRef = useRef(list);
  useLayoutEffect(() => {
    listRef.current = list;
  });

  useEffect(() => {
    const pending = listRef.current.filter((att) => !att.dataUrl);
    if (pending.length === 0) return;
    let alive = true;
    void Promise.all(pending.map(async (att) => {
      const url = await storage.getAttachmentUrl(att.id, att.relativePath, att.mimeType);
      return url ? ([att.id, url] as const) : null;
    })).then((entries) => {
      if (!alive) return;
      const ready = entries.filter((entry): entry is readonly [string, string] => entry !== null);
      if (ready.length > 0) setSrcs((current) => ({ ...current, ...Object.fromEntries(ready) }));
    });
    return () => { alive = false; };
  }, [key]);

  return srcs;
}

export function useAttachmentSrc(attachment: SlagAttachment | undefined): string | undefined {
  const srcs = useAttachmentSrcs(attachment ? [attachment] : []);
  if (!attachment) return undefined;
  return attachment.dataUrl ?? srcs[attachment.id];
}
