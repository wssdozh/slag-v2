// The assistant's memory in settings: what it thinks it knows, and the way to cut it.
import React, { Fragment, useCallback, useEffect, useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { MemoryItem } from '../../types';
import { MEMORY_KIND_LABEL, memoryService } from '../../lib/memory';
import { useApp } from '../../context/AppContext';
import { SettingsDivider, SettingsGroup, SettingsRow } from './SettingsUI';

const KIND_ORDER: MemoryItem['kind'][] = ['rule', 'pref', 'fact', 'event', 'note'];

/** Grouped by kind, newest first inside a kind: the list reads as a brief, not a dump. */
function sortedMemory(): MemoryItem[] {
  return memoryService.all().sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : b.updatedAt - a.updatedAt;
  });
}

export const MemoryList: React.FC = () => {
  const { confirmAction, addToast } = useApp();
  const [items, setItems] = useState<MemoryItem[]>(sortedMemory);

  const reload = useCallback(() => setItems(sortedMemory()), []);

  // A bundle from another device lands without a React update: the sync event is the signal.
  useEffect(() => {
    window.addEventListener('slag-sync-updated', reload);
    return () => window.removeEventListener('slag-sync-updated', reload);
  }, [reload]);

  const forget = useCallback(
    (item: MemoryItem) => {
      memoryService.forget(item.id);
      reload();
    },
    [reload]
  );

  const clearAll = useCallback(async () => {
    const confirmed = await confirmAction({
      title: 'Стереть память ассистента?',
      description: 'Он забудет всё, что записал о вас: правила, предпочтения и обстоятельства. Заметки это не трогает.',
      confirmLabel: 'Стереть',
      isDestructive: true,
    });
    if (!confirmed) return;
    memoryService.clear();
    reload();
    addToast('Память очищена', 'success');
  }, [addToast, confirmAction, reload]);

  return (
    <SettingsGroup
      title="Память ассистента"
      action={<span className="text-2xs font-mono text-fg-dim">{items.length}</span>}
    >
      {items.length === 0 ? (
        <p className="px-3.5 py-3 text-2xs leading-relaxed text-fg-muted">
          Пока пусто. Скажите ассистенту запомнить что-то важное — оно появится здесь.
        </p>
      ) : (
        <>
          {items.map((item, index) => (
            <Fragment key={item.id}>
              <SettingsRow
                testId={`memory-item-${item.id}`}
                label={item.text}
                description={`${MEMORY_KIND_LABEL[item.kind]}${item.tag ? ` · ${item.tag}` : ''}${item.isPinned ? ' · закреплено' : ''} · ${item.mentions}×`}
                right={
                  <button
                    type="button"
                    aria-label={`Удалить из памяти: ${item.text}`}
                    onClick={() => forget(item)}
                    className="p-1.5 rounded-md text-fg-dim transition-colors hover:text-danger hover:bg-surface-hover outline-none"
                  >
                    <Icon name="action.delete" size="sm" tone="inherit" />
                  </button>
                }
              />
              {index < items.length - 1 && <SettingsDivider />}
            </Fragment>
          ))}
        </>
      )}
      {items.length > 0 && (
        <>
          <SettingsDivider />
          <SettingsRow label="Стереть всю память" danger onClick={() => { void clearAll(); }} testId="memory-clear" />
        </>
      )}
    </SettingsGroup>
  );
};
