import * as androidFs from 'tauri-plugin-android-fs-api';
import { logger } from '../logger/logger';
import type { DeviceFolder, DeviceUri, FolderEntry } from '../../types';

const pickerLog = logger.scope('MEDIA');

/**
 * Everything that goes through `tauri-plugin-android-fs`: the folders a person handed over once,
 * the files inside them, thumbnails and raw bytes. MediaStore rows use the same two calls at the
 * end, because a `content://` URI from the gallery is just another URI here.
 */
const toDeviceUri = (uri: androidFs.FsUri): DeviceUri => ({ uri: uri.uri, documentTopTreeUri: uri.documentTopTreeUri });

/** Last path segment of a tree URI, for the rare case the plugin cannot name the folder. */
function labelFromUri(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const segments = decoded.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? uri;
}

function compareEntries(a: FolderEntry, b: FolderEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name, 'ru');
}

function toEntry(entry: androidFs.EntryMetadataWithUri): FolderEntry {
  return {
    uri: toDeviceUri(entry.uri),
    name: entry.name,
    isDir: entry.type === 'Dir',
    size: entry.type === 'File' ? entry.byteLength : 0,
    mimeType: entry.type === 'File' ? entry.mimeType : '',
    modified: entry.lastModified.getTime(),
  };
}

async function nameOf(uri: androidFs.FsUri): Promise<string> {
  return androidFs.getName(uri).catch(() => labelFromUri(uri.uri));
}

/** Folders the person already granted; the grant survives restarts and app updates. */
export async function listFolders(): Promise<DeviceFolder[]> {
  const grants = await androidFs.listAllPersistedPickerUriPermissions();
  const readable = grants.filter((grant) => grant.type === 'Dir' && grant.hasReadPermission);
  return Promise.all(readable.map(async (grant) => ({
    uri: toDeviceUri(grant.uri),
    name: await nameOf(grant.uri),
  })));
}

/** One system directory dialog. Re-granting an already granted folder throws, hence the catch. */
export async function pickFolder(): Promise<DeviceFolder | null> {
  const picked = await androidFs.showOpenDirPicker({});
  if (!picked) return null;
  await androidFs.persistPickerUriPermission(picked).catch((error: unknown) => {
    pickerLog.warn('Folder grant was not persisted', error);
  });
  return { uri: toDeviceUri(picked), name: await nameOf(picked) };
}

/**
 * Everything inside one granted folder, sorted here rather than on the device: the bridge pages
 * per directory entry, so a global order can only be built after the whole list arrives.
 * ponytail: one listing per folder in memory — fine for folders of photos, revisit if a
 * directory with tens of thousands of entries shows up.
 */
export async function listFolderEntries(folder: DeviceUri): Promise<FolderEntry[]> {
  const entries = await androidFs.readDir(folder);
  return entries.map(toEntry).sort(compareEntries);
}

/** The system dialog, kept as the way out when a folder cannot be granted (root, Download). */
export async function pickFilesFromSystem(): Promise<FolderEntry[]> {
  const uris = await androidFs.showOpenFilePicker({ multiple: true });
  return Promise.all(uris.map(async (uri) => {
    const metadata = await androidFs.getMetadata(uri);
    if (metadata.type === 'Dir') {
      return { uri: toDeviceUri(uri), name: metadata.name, isDir: true, size: 0, mimeType: '', modified: metadata.lastModified.getTime() };
    }
    return {
      uri: toDeviceUri(uri),
      name: metadata.name,
      isDir: false,
      size: metadata.byteLength,
      mimeType: metadata.mimeType,
      modified: metadata.lastModified.getTime(),
    };
  }));
}

/** Raw bytes of any picked entry, as a data URL the attachment pipeline already understands. */
export async function readEntryBytes(uri: DeviceUri, mimeType: string): Promise<string> {
  return androidFs.readFileAsDataURL(uri, { mimeType });
}

/**
 * The original entry as an object URL. A photo on a phone is megabytes: as a data URL that is a
 * base64 string twice as big to hold and copy, which is what made the full-screen viewer stall.
 * The caller owns the URL and must revoke it.
 */
export async function readEntryObjectUrl(uri: DeviceUri, mimeType: string): Promise<string> {
  const bytes = await androidFs.readFile(uri);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/**
 * The same entry as a URL a `<video>` can stream: the plugin's own protocol serves the content
 * URI with range requests, so seeking works and a 200 MB clip never lands in the webview heap.
 * The caller owns nothing — there is no blob to revoke.
 */
export function entryStreamSrc(uri: DeviceUri): string {
  return androidFs.convertFileSrc(uri);
}

/**
 * A preview for a grid cell, or a bigger one when the cell is opened full screen.
 * `null` means "no preview", not "broken".
 */
export async function readEntryThumbnail(uri: DeviceUri, width = 400): Promise<string | null> {
  try {
    // A third of the sheet on a 3× screen is ~400 device pixels wide.
    return await androidFs.getFileThumbnailAsDataURL(uri, { width, format: 'webp' });
  } catch (error) {
    pickerLog.warn('Thumbnail failed', error);
    return null;
  }
}
