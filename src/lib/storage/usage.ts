// What the store actually occupies: localStorage by key group, media by type, snapshots and memory.
import type { BackupSnapshotMeta, SlagAttachment, SlagItem } from '../../types';
import { STORAGE_KEYS } from '../../config/storage';
import { formatBytes } from '../text/formatBytes';
import { logger } from '../logger/logger';
import { storage } from './index';

const usageLog = logger.scope('APP');

/** Top of the heaviest-files list. One screen, no scrolling for the sake of scrolling. */
const HEAVIEST_LIMIT = 12;

export type MediaKind = SlagAttachment['type'];

export interface LocalUsageGroup {
  id: string;
  label: string;
  bytes: number;
  keys: number;
}

export interface LocalUsage {
  totalBytes: number;
  totalKeys: number;
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
  { id: 'trash', label: 'Корзина', prefixes: [STORAGE_KEYS.TRASH_PREFIX] },
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

/** Local storage keeps UTF-16: every character of key and value is two bytes. */
function readLocalStorageEntries(): { key: string; bytes: number }[] {
  if (typeof localStorage === 'undefined') return [];
  const entries: { key: string; bytes: number }[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? '';
      entries.push({ key, bytes: (key.length + value.length) * 2 });
    }
  } catch (err) {
    usageLog.warn('Storage usage: localStorage is not readable', { err });
    return [];
  }
  return entries;
}

function collectLocal(): LocalUsage {
  const entries = readLocalStorageEntries();
  const groups: LocalUsageGroup[] = LOCAL_GROUPS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    bytes: 0,
    keys: 0,
  }));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const other: LocalUsageGroup = { id: OTHER_GROUP.id, label: OTHER_GROUP.label, bytes: 0, keys: 0 };
  let totalBytes = 0;

  for (const entry of entries) {
    totalBytes += entry.bytes;
    const group = groupsById.get(groupForKey(entry.key).id) ?? other;
    group.bytes += entry.bytes;
    group.keys += 1;
  }

  return { totalBytes, totalKeys: entries.length, groups: [...groups, other] };
}

function collectMedia(items: SlagItem[]): MediaUsage {
  const byType: MediaTypeUsage[] = MEDIA_TYPES.map((type) => ({ type, count: 0, bytes: 0 }));
  const byTypeIndex = new Map(byType.map((entry) => [entry.type, entry]));
  const candidates: HeavyAttachment[] = [];
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
      if (size > 0) {
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
  }

  candidates.sort((left, right) => right.size - left.size);

  return {
    totalBytes,
    count,
    byType,
    heaviest: candidates.slice(0, HEAVIEST_LIMIT),
  };
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
  return {
    local: collectLocal(),
    media: collectMedia(input.items),
    snapshots: collectSnapshots(input.snapshots),
    memory: collectMemory(),
  };
}

export type UsageUnit = 'файл' | 'ключ' | 'снимок';

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
    label: 'Заметки и данные',
    bytes: usage.local.totalBytes,
    count: usage.local.totalKeys,
    unit: 'ключ',
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
