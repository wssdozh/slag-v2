import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SlagItem } from '../../../types';
import { stripAttachmentData } from '../../../lib/storage/attachmentData';
import { computeHash } from '../../../lib/sync/crypto';
import { syncEngine } from '../../../lib/sync/syncEngine';

const indicators = {
  local: ['Только на этом устройстве', 'border border-fg-muted'],
  unconfirmed: ['Нет подтверждения от релея', 'border border-fg-secondary'],
  pending: ['Ожидает отправки или подтверждения', 'bg-warning'],
  accepted: ['Версия записи принята релеем', 'bg-success'],
  error: ['Ошибка отправки: подтверждение не получено', 'bg-danger'],
  conflict: ['Конфликт версий — откройте настройки синхронизации', 'bg-danger'],
} as const;

const subscribe = (listener: () => void) => syncEngine.subscribe(listener);

export function ItemSyncDot({ item }: { item: SlagItem }) {
  const [fingerprint, setFingerprint] = useState<{ item: SlagItem; hash: string }>();
  useEffect(() => {
    let active = true;
    void computeHash(JSON.stringify(stripAttachmentData([item])[0])).then((hash) => {
      if (active) setFingerprint({ item, hash });
    }, () => {
      if (active) setFingerprint(undefined); // No digest means no proof of delivery.
    });
    return () => { active = false; };
  }, [item]);
  const hash = fingerprint?.item === item ? fingerprint.hash : undefined;
  const snapshot = useCallback(() => syncEngine.getItemDeliveryStatus(item, hash), [item, hash]);
  const status = useSyncExternalStore(subscribe, snapshot);
  const [label, color] = indicators[status];
  // On the 12px card radius, a 6px inset leaves the 6px dot ~4.8px of air at the diagonal.
  return <span className={`absolute end-1.5 top-1.5 z-30 size-1.5 rounded-full ${color}`}
    role="img" aria-label={label} title={label} data-sync-status={status} />;
}
