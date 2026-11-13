// "Занятое место": the whole store's footprint — local keys, media, snapshots and assistant memory.
import React, { useEffect, useMemo, useState } from 'react';
import { File, Image, Music, RefreshCw, Video } from 'lucide-react';
import type { SlagAttachment, SlagItem } from '../../types';
import { MEMORY_LIMIT } from '../../lib/memory';
import { pluralRu } from '../../lib/time/dateUtils';
import { useApp } from '../../context/AppContext';
import {
  MEDIA_TYPE_LABEL,
  MEDIA_TYPE_NAME,
  collectStorageUsage,
  formatUsageBytes,
  formatUsageShare,
  usageShare,
  type MediaTypeUsage,
  type StorageUsage,
} from '../../lib/storage/usage';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';

const MEDIA_ICON: Record<SlagAttachment['type'], React.ReactNode> = {
  image: <Image className="w-3.5 h-3.5" />,
  audio: <Music className="w-3.5 h-3.5" />,
  video: <Video className="w-3.5 h-3.5" />,
  file: <File className="w-3.5 h-3.5" />,
};

/**
 * Four kinds, four existing tokens: the ring reads at a glance, and no colour is invented here.
 * Zinc for "just a file" keeps the loudest hues on the media people actually look for.
 */
const MEDIA_TONE: Record<SlagAttachment['type'], { stroke: string; dot: string }> = {
  video: { stroke: 'stroke-accent', dot: 'bg-accent' },
  image: { stroke: 'stroke-mention', dot: 'bg-mention' },
  audio: { stroke: 'stroke-success', dot: 'bg-success' },
  file: { stroke: 'stroke-fg-muted', dot: 'bg-fg-muted' },
};

const shareOf = (part: number, whole: number): string =>
  whole > 0 ? formatUsageShare(usageShare(part, whole)) : '';

/** Composition of the media store as a ring: the biggest kind takes the full accent. */
const UsageRing: React.FC<{ kinds: MediaTypeUsage[]; total: number; count: number }> = ({
  kinds,
  total,
  count,
}) => {
  const size = 104;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const lengths = kinds.map((kind) => (total > 0 ? (kind.bytes / total) * circumference : 0));

  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-white/[0.06]"
        />
        {kinds.map((kind, index) => {
          // A 2px gap keeps two neighbouring arcs from reading as one.
          const dash = Math.max(lengths[index] - 2, 0.5);
          const dashOffset = -lengths.slice(0, index).reduce((sum, value) => sum + value, 0);
          return (
            <circle
              key={kind.type}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              className={MEDIA_TONE[kind.type].stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-mono text-[13px] text-fg-primary">{formatUsageBytes(total)}</span>
        <span className="text-2xs text-fg-dim">
          {count} {pluralRu(count, ['файл', 'файла', 'файлов'])}
        </span>
      </span>
    </div>
  );
};

/**
 * Read once on mount, then on demand: the stamp is what makes the button a real recount
 * instead of a re-render of numbers that were collected minutes ago.
 */
export const StorageUsageSection: React.FC = () => {
  const { items, backupSnapshots, setSelectedItem, setIsFullscreenEditorOpen } = useApp();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    void collectStorageUsage({ items, snapshots: backupSnapshots }).then((next) => {
      if (!isCancelled) setUsage(next);
    });
    return () => {
      isCancelled = true;
    };
  }, [items, backupSnapshots, stamp]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const openItem = (item: SlagItem) => {
    setSelectedItem(item);
    setIsFullscreenEditorOpen(true);
  };

  const refreshButton = (
    <button
      type="button"
      onClick={() => setStamp((value) => value + 1)}
      aria-label="Обновить"
      title="Пересчитать занятое место"
      className="flex items-center gap-1 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
    >
      <RefreshCw className="w-3 h-3" />
      Обновить
    </button>
  );

  if (!usage) {
    return (
      <div data-testid="storage-usage" className="flex flex-col gap-3">
        <SettingsGroup title="Занятое место" action={refreshButton}>
          <div className="px-3.5 py-3 text-2xs text-fg-muted">Считаю…</div>
        </SettingsGroup>
      </div>
    );
  }

  const { local, media, snapshots, memory, quota } = usage;
  const quotaBytes = quota.quotaBytes;
  // The platform estimate can lag or miss bytes kept outside the origin (desktop and FSA vaults),
  // so the total never reads lower than the rows above it add up to. Snapshots are copies, not
  // part of the live store, and keep their own row.
  const measuredBytes = local.totalBytes + media.totalBytes;
  const usedBytes =
    quota.usageBytes === undefined ? measuredBytes : Math.max(quota.usageBytes, measuredBytes);
  const share = usageShare(usedBytes, quotaBytes);
  const totalText =
    quotaBytes === undefined
      ? `занято ${formatUsageBytes(usedBytes)}`
      : `занято ${formatUsageBytes(usedBytes)} из ${formatUsageBytes(quotaBytes)} (${formatUsageShare(share)})`;
  const isEmpty =
    local.totalBytes === 0 && media.count === 0 && snapshots.count === 0 && memory.count === 0;
  const filledGroups = local.groups.filter((group) => group.keys > 0);
  const mediaKinds = [...media.byType.filter((kind) => kind.bytes > 0)].sort(
    (left, right) => right.bytes - left.bytes,
  );

  return (
    <div data-testid="storage-usage" className="flex flex-col gap-3">
      <SettingsGroup title="Занятое место" action={refreshButton}>
        <SettingsRow
          testId="storage-total"
          label="Хранилище"
          description={
            <span className="flex flex-col gap-2">
              <span className="font-mono">{totalText}</span>
              {share !== null && (
                <span className="block h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <span
                    className="block h-full rounded-full bg-accent-strong"
                    style={{ width: `${share}%` }}
                  />
                </span>
              )}
              {isEmpty && <span>пока пусто</span>}
            </span>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Медиа">
        {mediaKinds.length === 0 ? (
          <div className="px-3.5 py-3 text-2xs text-fg-muted">пока пусто</div>
        ) : (
          <div className="flex items-center gap-4 px-3.5 py-4">
            <UsageRing kinds={mediaKinds} total={media.totalBytes} count={media.count} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {mediaKinds.map((kind) => (
                <div key={kind.type} data-testid={`media-kind-${kind.type}`} className="flex items-baseline gap-2 text-xs">
                  <span
                    className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${MEDIA_TONE[kind.type].dot}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-fg-secondary">
                    {MEDIA_TYPE_LABEL[kind.type]}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-fg-dim">
                    {shareOf(kind.bytes, media.totalBytes)}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-2xs text-fg-secondary">
                    {formatUsageBytes(kind.bytes)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Локальные данные"
        action={
          <span className="text-2xs font-mono text-fg-dim">
            {formatUsageBytes(local.totalBytes)} · {local.totalKeys}{' '}
            {pluralRu(local.totalKeys, ['ключ', 'ключа', 'ключей'])}
          </span>
        }
      >
        {filledGroups.length === 0 ? (
          <div className="px-3.5 py-3 text-2xs text-fg-muted">пока пусто</div>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {filledGroups.map((group) => (
              <SettingsRow
                key={group.id}
                label={group.label}
                description={`${group.keys} ${pluralRu(group.keys, ['ключ', 'ключа', 'ключей'])}`}
                value={
                  <span className="font-mono">
                    {shareOf(group.bytes, local.totalBytes)} · {formatUsageBytes(group.bytes)}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Снимки и память">
        <SettingsRow
          label="Точки восстановления"
          description="Снимки хранилища"
          value={
            <span className="font-mono">
              {snapshots.count} · {formatUsageBytes(snapshots.bytes)}
            </span>
          }
        />
        <SettingsDivider />
        <SettingsRow
          label="Память ассистента"
          description={`${memory.count} ${pluralRu(memory.count, ['факт', 'факта', 'фактов'])} из ${MEMORY_LIMIT}`}
          value={<span className="font-mono">{formatUsageBytes(memory.bytes)}</span>}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Самые тяжёлые файлы"
        action={
          media.heaviest.length > 0 ? (
            <span className="text-2xs font-mono text-fg-dim">топ {media.heaviest.length}</span>
          ) : undefined
        }
      >
        {media.heaviest.length === 0 ? (
          <div className="px-3.5 py-3 text-2xs text-fg-muted">пока пусто</div>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {media.heaviest.map((file) => {
              const item = itemsById.get(file.itemId);
              return (
                <SettingsRow
                  key={file.attachmentId}
                  testId={`heavy-file-${file.attachmentId}`}
                  icon={MEDIA_ICON[file.type]}
                  label={<span className="block truncate">{file.name}</span>}
                  description={<span className="block truncate">{file.itemTitle}</span>}
                  value={
                    <span className="font-mono">
                      {MEDIA_TYPE_NAME[file.type]} · {formatUsageBytes(file.size)}
                    </span>
                  }
                  onClick={item ? () => openItem(item) : undefined}
                  disabled={!item}
                />
              );
            })}
          </div>
        )}
      </SettingsGroup>
    </div>
  );
};
