// "Занятое место": the whole store's footprint — local keys, media, snapshots and assistant memory.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { SlagAttachment, SlagItem } from '../../types';
import { MEMORY_LIMIT } from '../../lib/memory';
import { pluralRu } from '../../lib/time/dateUtils';
import { useApp } from '../../context/AppContext';
import {
  collectSegments,
  collectStorageUsage,
  formatUsageBytes,
  formatUsageShare,
  sharePercent,
  usageTotalBytes,
  type StorageUsage,
  type UsageSegment,
  type UsageUnit,
} from '../../lib/storage/usage';
import { SettingsGroup } from './SettingsUI';

const MEDIA_ICON: Record<SlagAttachment['type'], React.ReactNode> = {
  image: <Icon name="entity.image" size="sm" tone="inherit" />,
  audio: <Icon name="media.music" size="sm" tone="inherit" />,
  video: <Icon name="media.video" size="sm" tone="inherit" />,
  file: <Icon name="entity.file" size="sm" tone="inherit" />,
};

/**
 * Six kinds, six existing tokens: the ring reads at a glance, and no colour is invented here.
 * Media gets the loud hues, plain data and snapshots stay in the grey/amber register.
 */
const SEGMENT_TONE: Record<string, { stroke: string; dot: string }> = {
  video: { stroke: 'stroke-accent', dot: 'bg-accent' },
  image: { stroke: 'stroke-success', dot: 'bg-success' },
  audio: { stroke: 'stroke-mention', dot: 'bg-mention' },
  file: { stroke: 'stroke-fg-muted', dot: 'bg-fg-muted' },
  data: { stroke: 'stroke-fg-secondary', dot: 'bg-fg-secondary' },
  snapshots: { stroke: 'stroke-warning', dot: 'bg-warning' },
};

const toneOf = (id: string) => SEGMENT_TONE[id] ?? SEGMENT_TONE.data;

/** Only the media sectors carry a test hook; data and snapshots are not files. */
const MEDIA_SEGMENT_IDS = new Set(['image', 'audio', 'video', 'file']);

const UNIT_FORMS: Record<UsageUnit, [string, string, string]> = {
  'файл': ['файл', 'файла', 'файлов'],
  'ключ': ['ключ', 'ключа', 'ключей'],
  'снимок': ['снимок', 'снимка', 'снимков'],
};

const countOf = (count: number, unit: UsageUnit): string =>
  `${count} ${pluralRu(count, UNIT_FORMS[unit])}`;

const shareOf = (part: number, whole: number): string =>
  formatUsageShare(sharePercent(part, whole));

/** The composition of everything the store holds: total in the middle, one arc per sector. */
const UsageRing: React.FC<{ segments: UsageSegment[]; total: number }> = ({ segments, total }) => {
  const size = 168;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const lengths = segments.map((segment) => (total > 0 ? (segment.bytes / total) * circumference : 0));

  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-tint-6"
        />
        {segments.map((segment, index) => {
          // A 2px gap keeps two neighbouring arcs from reading as one.
          const dash = Math.max(lengths[index] - 2, 0.5);
          const dashOffset = -lengths.slice(0, index).reduce((sum, value) => sum + value, 0);
          return (
            <circle
              key={segment.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              className={toneOf(segment.id).stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div
        data-testid="storage-total"
        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
      >
        <span className="font-mono text-base text-fg-primary">{formatUsageBytes(total)}</span>
        <span className="text-2xs text-fg-dim">всего</span>
      </div>
    </div>
  );
};

interface UsageLineProps {
  testId?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/** One line per entry, 32px tall: a second line of description is what made the old list tall. */
const UsageLine: React.FC<UsageLineProps> = ({ testId, onClick, disabled = false, children }) => {
  const interactive = Boolean(onClick);
  const Element = interactive ? 'button' : 'div';

  return (
    <Element
      {...(interactive
        ? { type: 'button' as const, onClick, disabled, 'aria-disabled': disabled }
        : {})}
      data-testid={testId}
      className={`flex h-8 w-full items-center gap-2 px-3.5 text-left ${
        interactive
          ? 'cursor-pointer transition-colors hover:bg-surface-hover active:bg-tint-10 active:duration-0'
          : ''
      } ${disabled ? 'opacity-40' : ''}`}
    >
      {children}
    </Element>
  );
};

const EmptyLine: React.FC = () => <div className="px-3.5 py-3 text-2xs text-fg-muted">пока пусто</div>;

/**
 * Read once on mount, then on demand: the stamp is what makes the button a real recount
 * instead of a re-render of numbers that were collected minutes ago.
 */
export const StorageUsageSection: React.FC = () => {
  const { vault, items, backupSnapshots, setSelectedItem, setIsFullscreenEditorOpen } = useApp();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [stamp, setStamp] = useState(0);

  // The collector walks the whole localStorage index, so a save must not start it: the live
  // inputs sit in a ref, and only the button's stamp — or another vault — asks for a new count.
  const sourceRef = useRef({ items, snapshots: backupSnapshots });
  useEffect(() => {
    sourceRef.current = { items, snapshots: backupSnapshots };
  }, [items, backupSnapshots]);

  useEffect(() => {
    let isCancelled = false;
    void collectStorageUsage(sourceRef.current).then((next) => {
      if (!isCancelled) setUsage(next);
    });
    return () => {
      isCancelled = true;
    };
  }, [stamp, vault.id]);

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
      className="flex items-center gap-1 text-2xs font-mono text-fg-muted hover:text-fg-soft transition-colors cursor-pointer"
    >
      <Icon name="action.refresh" size="xs" tone="inherit" />
      Обновить
    </button>
  );

  const header = (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-2xs font-mono uppercase tracking-wider text-fg-muted">
        Занятое место
      </span>
      {refreshButton}
    </div>
  );

  if (!usage) {
    return (
      <div data-testid="storage-usage" className="flex flex-col gap-3">
        {header}
        <div className="py-6 text-center text-2xs text-fg-muted">Считаю…</div>
      </div>
    );
  }

  const { local, media, snapshots, memory } = usage;
  const total = usageTotalBytes({ media, local, snapshots });
  // The ring is the total: media sectors, local data and snapshots, biggest first.
  const segments = collectSegments({ media, local, snapshots });
  const filledGroups = local.groups.filter((group) => group.keys > 0);

  return (
    <div data-testid="storage-usage" className="flex flex-col gap-3">
      {header}

      <div className="flex justify-center py-1">
        <UsageRing segments={segments} total={total} />
      </div>

      <SettingsGroup title="Состав">
        {segments.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {segments.map((segment) => (
              <UsageLine
                key={segment.id}
                testId={MEDIA_SEGMENT_IDS.has(segment.id) ? `media-kind-${segment.id}` : undefined}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${toneOf(segment.id).dot}`} />
                <span className="min-w-0 flex-1 truncate text-xs text-fg-secondary">
                  {segment.label}
                </span>
                <span className="shrink-0 font-mono text-2xs text-fg-dim">
                  {countOf(segment.count, segment.unit)}
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-2xs text-fg-dim">
                  {shareOf(segment.bytes, total)}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-2xs text-fg-secondary">
                  {formatUsageBytes(segment.bytes)}
                </span>
              </UsageLine>
            ))}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Локальные данные">
        {filledGroups.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {filledGroups.map((group) => (
              <UsageLine key={group.id}>
                <span className="min-w-0 flex-1 truncate text-xs text-fg-secondary">
                  {group.label}
                </span>
                <span className="shrink-0 font-mono text-2xs text-fg-dim">
                  {countOf(group.keys, 'ключ')}
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-2xs text-fg-dim">
                  {shareOf(group.bytes, total)}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-2xs text-fg-secondary">
                  {formatUsageBytes(group.bytes)}
                </span>
              </UsageLine>
            ))}
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Снимки и память">
        <div className="flex flex-col divide-y divide-border-subtle">
          <UsageLine>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-secondary">Снимки</span>
            <span className="shrink-0 font-mono text-2xs text-fg-dim">
              {snapshots.count} · {formatUsageBytes(snapshots.bytes)}
            </span>
          </UsageLine>
          <UsageLine>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-secondary">
              Память ассистента
            </span>
            <span className="shrink-0 font-mono text-2xs text-fg-dim">
              {memory.count} из {MEMORY_LIMIT} · {formatUsageBytes(memory.bytes)}
            </span>
          </UsageLine>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Самые тяжёлые файлы">
        {media.heaviest.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {media.heaviest.map((file) => {
              const item = itemsById.get(file.itemId);
              return (
                <UsageLine
                  key={file.attachmentId}
                  testId={`heavy-file-${file.attachmentId}`}
                  onClick={item ? () => openItem(item) : undefined}
                  disabled={!item}
                >
                  <span className="flex w-4 shrink-0 items-center justify-center text-fg-muted">
                    {MEDIA_ICON[file.type]}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    <span className="truncate text-xs text-fg-secondary">{file.name}</span>
                    <span className="shrink-0 text-2xs text-fg-dim">·</span>
                    <span className="truncate text-2xs text-fg-dim">{file.itemTitle}</span>
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-2xs text-fg-secondary">
                    {formatUsageBytes(file.size)}
                  </span>
                </UsageLine>
              );
            })}
          </div>
        )}
      </SettingsGroup>
    </div>
  );
};
