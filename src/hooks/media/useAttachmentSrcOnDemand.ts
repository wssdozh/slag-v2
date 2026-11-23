// One narrow resolver for attachment bytes, shared by the viewer's slides and the panel's tiles.
import { useCallback, useEffect, useRef, useState } from 'react';
import { storage } from '../../lib/storage';
import { logger } from '../../lib/logger/logger';

const mediaLog = logger.scope('MEDIA');

/** Where one attachment's bytes are. Both callers already hold this much. */
export interface AttachmentSource {
  id: string;
  relativePath?: string;
  mimeType?: string;
  dataUrl?: string;
}

/**
 * Bytes of one attachment, asked for only when the caller says the place that shows it is due.
 * The answer is kept with the file it belongs to — id, path and mime, not just the id — because the
 * same tile or slide can come back with another source and the previous file's bytes must not be
 * painted over it. The store answers by id and keeps the url for the session
 * (`src/lib/storage/attachments.ts:134-159`), so bytes replaced under the same id are its answer.
 */
export function useAttachmentSrcOnDemand(source: AttachmentSource | undefined, isDue: boolean): string | undefined {
  const id = source?.id;
  const relativePath = source?.relativePath;
  const mimeType = source?.mimeType;
  const sourceKey = id && relativePath ? `${id}\n${relativePath}\n${mimeType ?? ''}` : undefined;
  const [resolved, setResolved] = useState<{ sourceKey: string; url: string } | undefined>(undefined);

  useEffect(() => {
    if (!isDue || !id || !relativePath || !sourceKey) return;
    let alive = true;
    void storage.getAttachmentUrl(id, relativePath, mimeType).then((url) => {
      if (alive && url) setResolved({ sourceKey, url });
    }).catch((error: unknown) => {
      // No bytes is a frame, not a crash: the caller shows a placeholder.
      mediaLog.warn(`Attachment bytes could not be resolved: ${relativePath}`, error);
    });
    return () => { alive = false; };
  }, [isDue, id, relativePath, mimeType, sourceKey]);

  if (source?.dataUrl) return source.dataUrl;
  if (!sourceKey || !resolved) return undefined;
  return resolved.sourceKey === sourceKey ? resolved.url : undefined;
}

/**
 * One observer for the whole grid: a tile reports itself through `registerTile` and names itself in
 * `data-media-tile`, so the grid keeps one callback instead of one observer per tile. A tile is
 * unobserved as soon as it is seen, and the callback's own cleanup unobserves a tile that goes
 * away. `rootMargin` only widens the box a tile must enter — it preloads what sits just outside the
 * column and never changes what is listed. Without `IntersectionObserver` every tile counts as
 * seen, which is the old behaviour rather than an empty grid.
 *
 * The seen ids are tied to the list they came from: another folder, even one with the same number
 * of photos, starts with nothing seen and cannot inherit ids the grid no longer renders.
 */
export function useSeenTiles(ids: readonly string[]) {
  const idsKey = ids.join('\n');
  const supportsObserver = typeof IntersectionObserver !== 'undefined';
  const currentIds = new Set(ids);
  const [state, setState] = useState<{ key: string; seen: ReadonlySet<string> }>(
    () => ({ key: idsKey, seen: new Set() }),
  );
  const observerRef = useRef<IntersectionObserver | null>(null);

  // The same grid after an edit keeps what it has already seen for the ids still there and drops
  // the ones that left; a tile that kept its node is not observed again, so forgetting it would
  // leave it unresolved. Without an observer every current id counts as seen, derived, not stored.
  const retained = state.key === idsKey
    ? state.seen
    : new Set([...state.seen].filter((id) => currentIds.has(id)));
  if (state.key !== idsKey) setState({ key: idsKey, seen: retained });
  const seen = supportsObserver ? retained : currentIds;

  const onEntries = useCallback((entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
    const arrived: string[] = [];
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const id = (entry.target as HTMLElement).dataset.mediaTile;
      // A queued entry can arrive after the tile left the grid: only what is still on the page counts.
      if (id && entry.target.isConnected) arrived.push(id);
    }
    if (arrived.length === 0) return;
    setState((current) => {
      if (arrived.every((id) => current.seen.has(id))) return current;
      const next = new Set(current.seen);
      arrived.forEach((id) => next.add(id));
      return { key: current.key, seen: next };
    });
  }, []);

  const registerTile = useCallback((node: HTMLElement | null) => {
    if (!node || !supportsObserver) return;
    // React 19 calls the cleanup on detach instead of the callback with `null`; the observer is
    // recreated when a React StrictMode pass has already torn it down, so reattached tiles observe.
    observerRef.current ??= new IntersectionObserver(onEntries, { rootMargin: '120px' });
    const observer = observerRef.current;
    observer.observe(node);
    return () => observer.unobserve(node);
  }, [onEntries, supportsObserver]);

  useEffect(() => () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  return { seen, registerTile };
}
