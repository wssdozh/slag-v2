import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { triageInboxItems } from '../../lib/aiService';
import type { TriageSuggestion } from '../../lib/aiService';
import {
  Sparkles,
  X,
  ArrowRight,
  Check,
  Loader2
} from 'lucide-react';

const TriageModalDialog: React.FC = () => {
  const {
    setIsTriageModalOpen,
    items,
    folders,
    aiSettings,
    moveItem,
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
        moveItem(s.itemId, s.targetFolder);
        count++;
      }
    });

    setIsTriageModalOpen(false);
    addToast(`ИИ успешно распределил ${count} заметок по папкам`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-[#141416] border border-white/[0.08] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">AI Triage — Сортировка Входящих</h3>
              <p className="text-[11px] text-zinc-400">
                Распределение заметок по смыслу на основе описаний папок
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsTriageModalOpen(false)}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
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
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[11px] text-zinc-500 pb-1">
                <span>Предложенные перемещения:</span>
                <button
                  onClick={() => {
                    if (selectedIds.size === suggestions.length) setSelectedIds(new Set());
                    else setSelectedIds(new Set(suggestions.map(s => s.itemId)));
                  }}
                  className="hover:text-white transition-colors"
                >
                  {selectedIds.size === suggestions.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>

              {suggestions.map(s => {
                const isChecked = selectedIds.has(s.itemId);
                return (
                  <div
                    key={s.itemId}
                    onClick={() => toggleSelect(s.itemId)}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-white/[0.04] border-white/[0.12] text-white'
                        : 'bg-transparent border-white/[0.04] text-zinc-500 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                        isChecked
                          ? 'bg-white border-white text-black'
                          : 'border-zinc-700 bg-transparent'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {s.itemTitle}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 shrink-0">
                          <span>Входящие</span>
                          <ArrowRight className="w-3 h-3 text-zinc-500" />
                          <span className="text-white font-medium">{s.targetFolder}</span>
                        </div>
                      </div>

                      <span className="text-[11px] text-zinc-400 italic">
                        {s.reason}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] bg-[#0f0f11] flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Выбрано: {selectedIds.size} из {suggestions.length}
          </span>

          <div className="flex gap-2">
            <button
              onClick={() => setIsTriageModalOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleApply}
              disabled={selectedIds.size === 0}
              className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Применить перемещение
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TriageModal: React.FC = () => {
  const { isTriageModalOpen } = useApp();

  if (!isTriageModalOpen) return null;

  return <TriageModalDialog />;
};
