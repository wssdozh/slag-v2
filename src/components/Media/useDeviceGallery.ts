// Paged device gallery rows, with the permission state kept next to the items.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getGalleryAccess, listDeviceMedia, requestGalleryAccess } from '../../lib/media/deviceGallery';
import type { DeviceMediaItem, DeviceMediaKind, GalleryAccess, GalleryPermission } from '../../types';

const PAGE_SIZE = 30;

/** MediaStore reports `images`, the UI talks about a `image` tab. One mapping, one place. */
const ACCESS_KEY: Record<DeviceMediaKind, keyof GalleryAccess> = {
  image: 'images',
  video: 'video',
  audio: 'audio',
};

/**
 * Rows of the device gallery, paged. Permission is part of the state: a grid that silently shows
 * nothing is worse than one that says the photo library is closed.
 */
export function useDeviceGallery(kind: DeviceMediaKind, isOpen: boolean) {
  const [access, setAccess] = useState<GalleryPermission>('prompt');
  const [items, setItems] = useState<DeviceMediaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const offsetRef = useRef(0);
  const inFlightRef = useRef(false);

  const appendPage = useCallback(async (reset: boolean) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);
    try {
      const offset = reset ? 0 : offsetRef.current;
      const page = await listDeviceMedia(kind, offset, PAGE_SIZE);
      offsetRef.current = offset + page.items.length;
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setHasMore(page.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [kind]);

  // Access and the first page arrive together: a grid appears only after the library is open,
  // and the spinner never sits on an empty screen waiting for a permission nobody asked for.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void (async () => {
      const state = await getGalleryAccess().catch(() => null);
      if (!alive) return;
      const next = state?.[ACCESS_KEY[kind]] ?? 'denied';
      setAccess(next);
      if (next !== 'granted') return;
      const page = await listDeviceMedia(kind, 0, PAGE_SIZE).catch(() => null);
      if (!alive || !page) return;
      offsetRef.current = page.items.length;
      setItems(page.items);
      setHasMore(page.hasMore);
    })();
    return () => { alive = false; };
  }, [isOpen, kind]);

  const request = useCallback(async () => {
    const state = await requestGalleryAccess().catch(() => null);
    const next = state?.[ACCESS_KEY[kind]] ?? 'denied';
    setAccess(next);
    if (next === 'granted') await appendPage(true);
  }, [appendPage, kind]);

  return {
    access,
    items,
    hasMore,
    isLoading,
    loadMore: () => { void appendPage(false); },
    request,
  };
}
