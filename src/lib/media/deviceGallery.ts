import { invoke } from '@tauri-apps/api/core';
import { isMobilePlatform } from '../windowControls';
import type { DeviceMediaItem, DeviceMediaKind, DeviceMediaPage, GalleryAccess } from '../../types';

/**
 * The device gallery. Only Android has one: rows come from MediaStore through
 * `MediaGalleryPlugin.kt`, because the webview can neither query the media database nor read
 * `content://` URIs. Thumbnails arrive inline, so the grid never asks the file system itself.
 */
export interface GalleryPing {
  ok: boolean;
  sdk: number;
}

export interface DeviceMediaBytes {
  mimeType: string;
  size: number;
  dataUrl: string;
}

export const isDeviceGalleryAvailable = (): boolean => isMobilePlatform();

export async function pingDeviceGallery(): Promise<GalleryPing> {
  return invoke<GalleryPing>('gallery_ping');
}

export async function getGalleryAccess(): Promise<GalleryAccess> {
  return invoke<GalleryAccess>('gallery_access');
}

export async function requestGalleryAccess(): Promise<GalleryAccess> {
  return invoke<GalleryAccess>('gallery_request_access');
}

export async function listDeviceMedia(kind: DeviceMediaKind, offset: number, limit: number): Promise<DeviceMediaPage> {
  return invoke<DeviceMediaPage>('gallery_list', { kind, offset, limit });
}

export async function readDeviceMedia(id: string): Promise<DeviceMediaBytes> {
  return invoke<DeviceMediaBytes>('gallery_read', { id });
}

export type { DeviceMediaItem, DeviceMediaKind };
