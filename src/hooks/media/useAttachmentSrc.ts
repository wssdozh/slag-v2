// Resolves attachment ids to object URLs on demand, keeping media bytes out of notes.
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

export interface AttachmentSources {
  srcs: AttachmentSrcs;
  /** Ids the resolver has already given up on: no bytes in IndexedDB, none on disk. */
  missing: ReadonlySet<string>;
}

export function useAttachmentSrcs(attachments: SlagAttachment[] | undefined): AttachmentSources {
  const list = attachments ?? [];
  // Keyed by ids, not by array identity: the parent rebuilds the array on every render.
  // Whether the bytes arrived inline is part of the key: a draft read back from storage
  // hands over the same ids without `dataUrl`, and that is exactly when a `src` is due.
  const key = list.map((att) => (att.dataUrl ? `${att.id}+` : att.id)).join('|');
  const [srcs, setSrcs] = useState<AttachmentSrcs>({});
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());

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
      return [att.id, url] as const;
    })).then((entries) => {
      if (!alive) return;
      // `undefined` is the resolver's "nothing on this device": a ready url is never empty.
      const ready = entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
      const gone = entries.filter((entry) => !entry[1]).map((entry) => entry[0]);
      if (ready.length > 0) setSrcs((current) => ({ ...current, ...Object.fromEntries(ready) }));
      setMissing(new Set(gone));
    });
    return () => { alive = false; };
  }, [key]);

  return { srcs, missing };
}

export function useAttachmentSrc(attachment: SlagAttachment | undefined): string | undefined {
  const { srcs } = useAttachmentSrcs(attachment ? [attachment] : []);
  if (!attachment) return undefined;
  return attachment.dataUrl ?? srcs[attachment.id];
}
