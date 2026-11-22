import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SlagItem } from '../../../types';
import { stripAttachmentData } from '../../../lib/storage/attachmentData';
import { computeHash } from '../../../lib/sync/crypto';
import { syncEngine } from '../../../lib/sync/syncEngine';

import { Icon } from '../../UI/icons/Icon';

const indicators = {
  local: ['Только на этом устройстве', 'status.todo', 'text-fg-muted'],
  unconfirmed: ['Нет подтверждения от релея', 'status.backlog', 'text-fg-secondary'],
  pending: ['В очереди на отправку', 'time.time', 'text-fg-secondary'],
  sending: ['Отправляем или ждём ответа релея', 'action.refresh', 'text-accent motion-safe:animate-spin'],
  accepted: ['Версия записи принята релеем', 'status.checked', 'text-success'],
  error: ['Ошибка отправки: подтверждение не получено', 'status.alert', 'text-danger'],
  conflict: ['Конфликт версий — откройте настройки синхронизации', 'status.warning', 'text-danger'],
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
  const [label, icon, tone] = indicators[status];
  return <span className="inline-flex shrink-0" role="img" aria-label={label} title={label} data-sync-status={status}>
    <Icon name={icon} tone="inherit" className={`size-3 ${tone}`} />
  </span>;
}
