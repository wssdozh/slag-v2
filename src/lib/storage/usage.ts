// What the store actually occupies: the settings file, the vault's state and files on disk, media by
// type, snapshots and memory. A browser build has no files at all, so there it counts what `prefs`
// holds — the keys the app used to count by walking the profile itself.
import type { BackupSnapshotMeta, SlagAttachment, SlagItem } from '../../types';
import { isTauri } from '@tauri-apps/api/core';
import { BaseDirectory, readDir, stat } from '@tauri-apps/plugin-fs';
import { STORAGE_KEYS } from '../../config/storage';
import { formatBytes } from '../text/formatBytes';
import { logger } from '../logger/logger';
import { getPrefEntries } from './prefs';
import { storage } from './index';

const usageLog = logger.scope('APP');

/** The installation's settings: `<AppData>/settings.json`, the one file `prefs` owns. */
const SETTINGS_FILE = 'settings.json';

/** Top of the heaviest-files list. One screen, no scrolling for the sake of scrolling. */
const HEAVIEST_LIMIT = 12;

export type MediaKind = SlagAttachment['type'];

export interface LocalUsageGroup {
  id: string;
  label: string;
  bytes: number;
  /** Files on disk, or keys in the browser profile: one entry of the thing named above. */
  count: number;
}

export interface LocalUsage {
  totalBytes: number;
  totalCount: number;
  groups: LocalUsageGroup[];
}

export interface MediaTypeUsage {
  type: MediaKind;
  count: number;
  bytes: number;
}

export interface HeavyAttachment {
  attachmentId: string;
  name: string;
  size: number;
  type: MediaKind;
  itemId: string;
  itemTitle: string;
}

export interface MediaUsage {
  totalBytes: number;
  count: number;
  byType: MediaTypeUsage[];
  heaviest: HeavyAttachment[];
}

export interface SnapshotUsage {
  count: number;
  bytes: number;
}

export interface MemoryUsage {
  count: number;
  bytes: number;
}

export interface StorageUsage {
  local: LocalUsage;
  media: MediaUsage;
  snapshots: SnapshotUsage;
  memory: MemoryUsage;
}

export const MEDIA_TYPES: readonly MediaKind[] = ['image', 'audio', 'video', 'file'];

/** Captions for the media breakdown rows. */
export const MEDIA_TYPE_LABEL: Record<MediaKind, string> = {
  image: 'Изображения',
  audio: 'Аудио',
  video: 'Видео',
  file: 'Файлы',
};

interface LocalGroupSpec {
  id: string;
  label: string;
  prefixes?: readonly string[];
  exactKeys?: readonly string[];
}

/**
 * Plain settings keys have no shared prefix, so they are listed. Workspace state is UI state
 * kept per vault: it is a preference, not content, so it counts as settings.
 *
 * These are the browser profile's groups. On a native build the same data lives in files and the
 * groups are the files themselves; the ids are the same so the panel reads the same either way.
 */
const SETTINGS_KEYS: readonly string[] = [
  STORAGE_KEYS.VAULTS,
  STORAGE_KEYS.CURRENT_VAULT,
  STORAGE_KEYS.AI_SETTINGS,
  STORAGE_KEYS.SIDEBAR_WIDTH,
  STORAGE_KEYS.RIGHT_PANEL_WIDTH,
  STORAGE_KEYS.FEED_CONTENT_WIDTH,
  STORAGE_KEYS.MOBILE_DOCK_TABS,
  STORAGE_KEYS.UI_CONFIG,
  STORAGE_KEYS.BACKUP_SETTINGS,
  STORAGE_KEYS.DETACHED_WINDOWS,
  STORAGE_KEYS.FULLSCREEN_WIDTH,
  STORAGE_KEYS.SESSION_BREADCRUMBS,
];

/**
 * `slag_attachments_*` is the metadata index of the notes' media, not the bytes: it travels with
 * the notes and is counted there.
 */
const LOCAL_GROUPS: readonly LocalGroupSpec[] = [
  {
    id: 'notes',
    label: 'Заметки',
    prefixes: [STORAGE_KEYS.ITEMS_PREFIX, STORAGE_KEYS.ATTACHMENTS_PREFIX],
  },
  { id: 'folders', label: 'Папки', prefixes: [STORAGE_KEYS.FOLDERS_PREFIX] },
  {
    id: 'drafts',
    label: 'Черновики',
    // Composer drafts and fullscreen drafts are two keys, one kind of thing.
    prefixes: [STORAGE_KEYS.FULLSCREEN_DRAFTS_PREFIX, STORAGE_KEYS.DRAFTS_PREFIX],
  },
  { id: 'chat', label: 'Чат', prefixes: [STORAGE_KEYS.ASSISTANT_PREFIX] },
  { id: 'memory', label: 'Память', prefixes: [STORAGE_KEYS.MEMORY_PREFIX] },
  {
    id: 'settings',
    label: 'Настройки',
    prefixes: [STORAGE_KEYS.WORKSPACE_STATE_PREFIX],
    exactKeys: SETTINGS_KEYS,
  },
];

const OTHER_GROUP: LocalGroupSpec = { id: 'other', label: 'Прочее' };

function matchesGroup(spec: LocalGroupSpec, key: string): boolean {
  if (spec.exactKeys?.includes(key)) return true;
  return spec.prefixes?.some((prefix) => key.startsWith(prefix)) ?? false;
}

function groupForKey(key: string): LocalGroupSpec {
  return LOCAL_GROUPS.find((spec) => matchesGroup(spec, key)) ?? OTHER_GROUP;
}

/** Accepts whatever the platform reports: a non-number or a negative is "unknown". */
function asBytes(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

/** Local keys keep UTF-16: every character of key and value is two bytes. */
function collectPrefsLocal(): LocalUsage {
  const entries = getPrefEntries();
  const groups: LocalUsageGroup[] = LOCAL_GROUPS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    bytes: 0,
    count: 0,
  }));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const other: LocalUsageGroup = { id: OTHER_GROUP.id, label: OTHER_GROUP.label, bytes: 0, count: 0 };
  let totalBytes = 0;

  for (const [key, value] of entries) {
    const bytes = (key.length + value.length) * 2;
    totalBytes += bytes;
    const group = groupsById.get(groupForKey(key).id) ?? other;
    group.bytes += bytes;
    group.count += 1;
  }

  return { totalBytes, totalCount: entries.length, groups: [...groups, other] };
}

/** One file on disk, as a group: a missing file is an absent group, not a zero row. */
async function collectFileGroup(id: string, label: string, path: string): Promise<LocalUsageGroup> {
  try {
    const info = await stat(path, { baseDir: BaseDirectory.AppData });
    return { id, label, bytes: asBytes(info.size) ?? 0, count: 1 };
  } catch (err) {
    usageLog.warn(`Storage usage: could not measure ${path}`, { error: String(err) });
    return { id, label, bytes: 0, count: 0 };
  }
}

/** Settings and the loaded vault's state: the two files that are not content and not media. */
async function collectDiskLocal(): Promise<LocalUsage> {
  const groups = await Promise.all([
    collectFileGroup('settings', 'Настройки', SETTINGS_FILE),
    collectFileGroup('vault', 'Данные хранилища', storage.getVaultStatePath()),
  ]);
  const present = groups.filter((group) => group.count > 0);
  return {
    totalBytes: present.reduce((sum, group) => sum + group.bytes, 0),
    totalCount: present.reduce((sum, group) => sum + group.count, 0),
    groups,
  };
}

/** File name inside `.attachments/`: the same basename the attachment store writes. */
function attachmentBasename(attachment: SlagAttachment): string {
  const parts = attachment.relativePath.split(/[\\/]/);
  return parts[parts.length - 1] || attachment.name;
}

function heaviestAttachments(items: SlagItem[]): HeavyAttachment[] {
  const candidates: HeavyAttachment[] = [];
  for (const item of items) {
    for (const attachment of item.attachments) {
      const size = asBytes(attachment.size) ?? 0;
      if (size <= 0) continue;
      candidates.push({
        attachmentId: attachment.id,
        name: attachment.name,
        size,
        type: attachment.type,
        itemId: item.id,
        itemTitle: item.title,
      });
    }
  }
  candidates.sort((left, right) => right.size - left.size);
  return candidates.slice(0, HEAVIEST_LIMIT);
}

/** The media breakdown the notes promise: exact per-file sizes without reading a single blob. */
function collectMedia(items: SlagItem[]): MediaUsage {
  const byType: MediaTypeUsage[] = MEDIA_TYPES.map((type) => ({ type, count: 0, bytes: 0 }));
  const byTypeIndex = new Map(byType.map((entry) => [entry.type, entry]));
  let count = 0;
  let totalBytes = 0;

  for (const item of items) {
    for (const attachment of item.attachments) {
      const size = asBytes(attachment.size) ?? 0;
      count += 1;
      totalBytes += size;
      const typeEntry = byTypeIndex.get(attachment.type);
      if (typeEntry) {
        typeEntry.count += 1;
        typeEntry.bytes += size;
      }
    }
  }

  return { totalBytes, count, byType, heaviest: heaviestAttachments(items) };
}

/**
 * `.attachments/` as the disk holds it: the real bytes, including a file a draft saved before the
 * note existed. The type of a file the notes do not name is unknown, so it counts as `file`.
 * `null` means there is no directory to read — a vault that never wrote an attachment.
 */
async function collectDiskMedia(items: SlagItem[]): Promise<MediaUsage | null> {
  const dir = storage.getVaultAttachmentsPath();
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    usageLog.warn('Storage usage: no .attachments directory to measure', { error: String(err) });
    return null;
  }

  const typeByFile = new Map<string, MediaKind>();
  for (const item of items) {
    for (const attachment of item.attachments) typeByFile.set(attachmentBasename(attachment), attachment.type);
  }

  const byType: MediaTypeUsage[] = MEDIA_TYPES.map((type) => ({ type, count: 0, bytes: 0 }));
  const byTypeIndex = new Map(byType.map((entry) => [entry.type, entry]));
  let count = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile) continue;
    let size: number;
    try {
      const info = await stat(`${dir}/${entry.name}`, { baseDir: BaseDirectory.AppData });
      size = asBytes(info.size) ?? 0;
    } catch (err) {
      usageLog.warn(`Storage usage: could not measure attachment ${entry.name}`, { error: String(err) });
      continue;
    }
    count += 1;
    totalBytes += size;
    const typeEntry = byTypeIndex.get(typeByFile.get(entry.name) ?? 'file');
    if (typeEntry) {
      typeEntry.count += 1;
      typeEntry.bytes += size;
    }
  }

  return { totalBytes, count, byType, heaviest: heaviestAttachments(items) };
}

function collectSnapshots(snapshots: BackupSnapshotMeta[]): SnapshotUsage {
  let bytes = 0;
  for (const snapshot of snapshots) {
    bytes += asBytes(snapshot.sizeBytes) ?? 0;
  }
  return { count: snapshots.length, bytes };
}

function collectMemory(): MemoryUsage {
  const items = storage.getMemory();
  // The stored value is the JSON of the fact list; an empty list costs nothing worth a row.
  const bytes = items.length > 0 ? JSON.stringify(items).length * 2 : 0;
  return { count: items.length, bytes };
}

export async function collectStorageUsage(input: {
  items: SlagItem[];
  snapshots: BackupSnapshotMeta[];
}): Promise<StorageUsage> {
  const onDisk = isTauri();
  // A missing `.attachments/` falls back to the metadata: the notes know what they carry even when
  // the file has not been written yet.
  const media = onDisk ? (await collectDiskMedia(input.items)) ?? collectMedia(input.items) : collectMedia(input.items);
  return {
    local: onDisk ? await collectDiskLocal() : collectPrefsLocal(),
    media,
    snapshots: collectSnapshots(input.snapshots),
    memory: collectMemory(),
  };
}

export type UsageUnit = 'файл' | 'запись' | 'снимок';

/** Один сектор кольца: медиа по видам, все локальные данные и снимки. */
export interface UsageSegment {
  id: string;            // тип медиа ('image'|'audio'|'video'|'file') либо 'data' либо 'snapshots'
  label: string;
  bytes: number;
  count: number;
  unit: UsageUnit;
}

export const DATA_SEGMENT_ID = 'data';
export const SNAPSHOT_SEGMENT_ID = 'snapshots';

/** Состав занятого места: медиа по видам + локальные данные одной группой + снимки. Пустые сектора не отдаём, порядок — по убыванию. */
export function collectSegments(usage: Pick<StorageUsage, 'media' | 'local' | 'snapshots'>): UsageSegment[] {
  const segments: UsageSegment[] = usage.media.byType.map((entry) => ({
    id: entry.type,
    label: MEDIA_TYPE_LABEL[entry.type],
    bytes: entry.bytes,
    count: entry.count,
    unit: 'файл',
  }));

  segments.push({
    id: DATA_SEGMENT_ID,
    label: 'Данные',
    bytes: usage.local.totalBytes,
    count: usage.local.totalCount,
    unit: 'запись',
  });
  segments.push({
    id: SNAPSHOT_SEGMENT_ID,
    label: 'Снимки',
    bytes: usage.snapshots.bytes,
    count: usage.snapshots.count,
    unit: 'снимок',
  });

  return segments.filter((segment) => segment.bytes > 0).sort((left, right) => right.bytes - left.bytes);
}

/** Всё, что реально занимает место: медиа + локальные данные + снимки. Память ассистента уже внутри локальных данных, второй раз её не считаем. */
export function usageTotalBytes(usage: Pick<StorageUsage, 'media' | 'local' | 'snapshots'>): number {
  return usage.media.totalBytes + usage.local.totalBytes + usage.snapshots.bytes;
}

/** `formatBytes` stays silent for zero; a usage row must still read as a number. */
export function formatUsageBytes(bytes: number): string {
  return formatBytes(Math.max(0, Math.round(bytes))) || '0 B';
}

/** Share of the whole in percent, clamped to the bar it drives. */
export function sharePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(whole) || whole <= 0) return null;
  const share = (part / whole) * 100;
  if (!Number.isFinite(share)) return null;
  return Math.min(100, Math.max(0, share));
}

export function formatUsageShare(share: number | null): string {
  if (share === null) return '';
  if (share === 0) return '0%';
  if (share < 0.1) return '<0.1%';
  if (share < 10) return `${share.toFixed(1)}%`;
  return `${Math.round(share)}%`;
}
