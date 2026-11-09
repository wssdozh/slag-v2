import { invoke } from '@tauri-apps/api/core';
import { isMobilePlatform } from '../windowControls';
import type { DeviceMediaItem, DeviceMediaKind, DeviceMediaPage, GalleryAccess } from '../../types';

/**
 * The device gallery. Only Android has one: rows come from MediaStore through
 * `MediaGalleryPlugin.kt`, because the webview can neither query the media database nor read
 * `content://` URIs. Rows carry a content URI; thumbnails and bytes for it come from
 * `folderBrowser.ts`, which is the same plugin path every other picked file takes.
 */
export const isDeviceGalleryAvailable = (): boolean => isMobilePlatform();

/** Kotlin hands back the bare URI string; the rest of the app speaks `DeviceUri`. */
interface DeviceMediaRow extends Omit<DeviceMediaItem, 'uri'> {
  uri: string;
}

interface DeviceMediaRawPage {
  items: DeviceMediaRow[];
  hasMore: boolean;
}

export async function getGalleryAccess(): Promise<GalleryAccess> {
  return invoke<GalleryAccess>('gallery_access');
}

export async function requestGalleryAccess(): Promise<GalleryAccess> {
  return invoke<GalleryAccess>('gallery_request_access');
}

export async function listDeviceMedia(kind: DeviceMediaKind, offset: number, limit: number): Promise<DeviceMediaPage> {
  const page = await invoke<DeviceMediaRawPage>('gallery_list', { kind, offset, limit });
  return {
    hasMore: page.hasMore,
    items: page.items.map((row) => ({ ...row, uri: { uri: row.uri, documentTopTreeUri: null } })),
  };
}

export type { DeviceMediaItem, DeviceMediaKind };
