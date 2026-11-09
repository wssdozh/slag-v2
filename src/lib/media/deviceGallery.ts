import { invoke } from '@tauri-apps/api/core';
import { isMobilePlatform } from '../windowControls';

/**
 * The device gallery. Only Android has one: the rows come from MediaStore through
 * `MediaGalleryPlugin.kt` (`plugin:slag-media|…`), because the webview can neither query the
 * media database nor read `content://` URIs.
 */
export interface GalleryPing {
  ok: boolean;
  sdk: number;
}

export const isDeviceGalleryAvailable = (): boolean => isMobilePlatform();

export async function pingDeviceGallery(): Promise<GalleryPing> {
  return invoke<GalleryPing>('gallery_ping');
}
