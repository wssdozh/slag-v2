import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { triageInboxItems } from '../../lib/aiService';
import type { TriageSuggestion } from '../../lib/aiService';
import {
  Sparkles,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { BaseModal } from './BaseModal';
import { Checkbox } from '../UI/Checkbox';

const TriageModalDialog: React.FC = () => {
  const {
    setIsTriageModalOpen,
    items,
    folders,
    aiSettings,
    moveItem,
    updateItem,
    addToast
  } = useApp();

  const inboxItems = useMemo(
    () => items.filter(i => i.folder === 'Входящие'),
    [items]
  );

  const [loading, setLoading] = useState(() => inboxItems.length > 0);
  const [suggestions, setSuggestions] = useState<TriageSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isCancelled = false;

    if (inboxItems.length === 0) {
      return;
    }

    triageInboxItems(inboxItems, folders, aiSettings)
      .then(res => {
        if (!isCancelled) {
          setSuggestions(res);
          setSelectedIds(new Set(res.map(s => s.itemId)));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [inboxItems, folders, aiSettings]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleApply = () => {
    let count = 0;
    suggestions.forEach(s => {
      if (selectedIds.has(s.itemId)) {
        const originalItem = items.find(i => i.id === s.itemId);
        if (originalItem && s.tags && s.tags.length > 0) {
          const mergedTags = Array.from(new Set([...originalItem.tags, ...s.tags]));
          updateItem({
            ...originalItem,
            folder: s.targetFolder,
            tags: mergedTags,
            updatedAt: Date.now(),
          });
        } else {
          moveItem(s.itemId, s.targetFolder);
        }
        count++;
      }
    });

    setIsTriageModalOpen(false);
    addToast(`ИИ распределил ${count} заметок и обновил теги`, 'success');
  };

  const footer = (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">
        Выбрано: {selectedIds.size} из {suggestions.length}
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsTriageModalOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={selectedIds.size === 0}
          className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Применить перемещение
        </button>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={true}
      onClose={() => setIsTriageModalOpen(false)}
      title="AI Triage — Сортировка Входящих"
      subtitle="Распределение по папкам и авто-тегирование на основе описаний"
      icon={<Sparkles className="w-4 h-4" />}
      maxWidth="max-w-lg"
      footer={footer}
    >
      <div className="p-3 md:p-4 flex flex-col gap-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
            <p className="text-xs">ИИ анализирует содержимое заметок и описания папок...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-10 text-xs text-zinc-500">
            Нет заметок во «Входящих» для распределения.
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex justify-between items-center text-[11px] text-zinc-500 px-3 py-1.5 border-b border-white/[0.04] mb-1">
              <span>Предложенные перемещения:</span>
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size === suggestions.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(suggestions.map(s => s.itemId)));
                }}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {selectedIds.size === suggestions.length ? 'Снять все' : 'Выбрать все'}
              </button>
            </div>

            <div className="flex flex-col gap-0.5 max-h-[380px] overflow-y-auto">
              {suggestions.map(s => {
                const isChecked = selectedIds.has(s.itemId);
                return (
                  <div
                    key={s.itemId}
                    onClick={() => toggleSelect(s.itemId)}
                    className={`group flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'text-zinc-200 hover:bg-white/[0.04]'
                        : 'text-zinc-500 opacity-40 hover:opacity-75 hover:bg-white/[0.02]'
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onChange={() => toggleSelect(s.itemId)}
                      className="mt-0.5 pointer-events-none"
                    />

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {s.itemTitle}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 shrink-0">
                          <span className="text-zinc-500">Входящие</span>
                          <ArrowRight className="w-3 h-3 text-zinc-600" />
                          <span className="text-zinc-200 font-medium">{s.targetFolder}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {s.tags && s.tags.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            {s.tags.map(t => (
                              <span
                                key={t}
                                className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-zinc-400"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-zinc-500 leading-normal line-clamp-1">
                          {s.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
};

export const TriageModal: React.FC = () => {
  const { isTriageModalOpen } = useApp();

  if (!isTriageModalOpen) return null;

  return <TriageModalDialog />;
};
