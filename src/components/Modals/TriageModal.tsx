import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { triageInboxItems } from '../../lib/aiService';
import type { TriageSuggestion } from '../../lib/aiService';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  ChevronDown,
  X,
  Plus
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

  const eligibleFolders = useMemo(
    () => folders.filter(f => f.path !== 'Входящие'),
    [folders]
  );

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ processed: number; total: number }>({
    processed: 0,
    total: inboxItems.length,
  });
  const [suggestions, setSuggestions] = useState<TriageSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline tag addition state
  const [activeTagInputId, setActiveTagInputId] = useState<string | null>(null);
  const [tagInputText, setTagInputText] = useState('');
  const tagInputRef = useRef<HTMLInputElement | null>(null);

  const isAnalyzing = loading && inboxItems.length > 0;

  useEffect(() => {
    let isCancelled = false;

    if (inboxItems.length === 0) {
      return;
    }

    triageInboxItems(
      inboxItems,
      folders,
      aiSettings,
      (chunkSuggestions, prog) => {
        if (!isCancelled) {
          setSuggestions(prev => {
            const existingIds = new Set(prev.map(p => p.itemId));
            const fresh = chunkSuggestions.filter(c => !existingIds.has(c.itemId));
            return [...prev, ...fresh];
          });
          setSelectedIds(prev => {
            const next = new Set(prev);
            chunkSuggestions.forEach(s => next.add(s.itemId));
            return next;
          });
          setProgress(prog);
        }
      }
    )
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

  useEffect(() => {
    if (activeTagInputId && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [activeTagInputId]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const updateSuggestionFolder = (itemId: string, newFolder: string) => {
    setSuggestions(prev =>
      prev.map(s => (s.itemId === itemId ? { ...s, targetFolder: newFolder } : s))
    );
  };

  const removeSuggestionTag = (itemId: string, tagToRemove: string) => {
    setSuggestions(prev =>
      prev.map(s =>
        s.itemId === itemId
          ? { ...s, tags: s.tags.filter(t => t !== tagToRemove) }
          : s
      )
    );
  };

  const addSuggestionTag = (itemId: string, rawTag: string) => {
    const clean = rawTag.toLowerCase().replace(/^#/, '').trim();
    if (!clean) {
      setActiveTagInputId(null);
      setTagInputText('');
      return;
    }

    setSuggestions(prev =>
      prev.map(s => {
        if (s.itemId === itemId) {
          const merged = Array.from(new Set([...s.tags, clean]));
          return { ...s, tags: merged };
        }
        return s;
      })
    );

    setActiveTagInputId(null);
    setTagInputText('');
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

  const modalSubtitle = isAnalyzing ? (
    <span className="flex items-center gap-1.5 text-zinc-400">
      <Loader2 className="w-3 h-3 animate-spin text-amber-400 shrink-0" />
      <span>
        Пакетный анализ: {progress.processed} из {progress.total}...
      </span>
    </span>
  ) : (
    'Распределение по папкам и авто-тегирование на основе описаний'
  );

  const footer = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span>
          Выбрано: {selectedIds.size} из {suggestions.length}
        </span>
        {isAnalyzing && (
          <span className="text-[11px] text-amber-400/80 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>обрабатываются следующие...</span>
          </span>
        )}
      </div>

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
      subtitle={modalSubtitle}
      icon={<Sparkles className="w-4 h-4" />}
      maxWidth="max-w-xl"
      footer={footer}
    >
      <div className="p-3 md:p-4 flex flex-col gap-2">
        {isAnalyzing && suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
            <p className="text-xs">
              ИИ анализирует первую партию заметок из «Входящих»...
            </p>
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

                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {s.itemTitle}
                        </span>

                        {/* Interactive Folder Selector */}
                        <div
                          className="flex items-center gap-1.5 text-[11px] shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-zinc-500 font-mono hidden sm:inline">
                            Входящие
                          </span>
                          <ArrowRight className="w-3 h-3 text-zinc-600 hidden sm:inline" />
                          <div className="relative inline-flex items-center">
                            <select
                              value={s.targetFolder}
                              onChange={(e) =>
                                updateSuggestionFolder(s.itemId, e.target.value)
                              }
                              className="bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-[11px] font-medium rounded px-2 py-0.5 border border-white/10 outline-none cursor-pointer appearance-none pr-5 transition-colors"
                              title="Сменить целевую папку"
                            >
                              {eligibleFolders.map(f => (
                                <option
                                  key={f.path}
                                  value={f.path}
                                  className="bg-[#141417] text-zinc-200"
                                >
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-1.5 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      {/* Interactive Tags Row */}
                      <div
                        className="flex items-center gap-1 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.tags.map(t => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-zinc-300 border border-white/[0.04]"
                          >
                            <span>#{t}</span>
                            <button
                              type="button"
                              onClick={() => removeSuggestionTag(s.itemId, t)}
                              className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title={`Удалить тег #${t}`}
                              aria-label={`Удалить тег #${t}`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}

                        {/* Inline Tag Adder */}
                        {activeTagInputId === s.itemId ? (
                          <div className="inline-flex items-center">
                            <input
                              ref={tagInputRef}
                              type="text"
                              value={tagInputText}
                              onChange={(e) => setTagInputText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addSuggestionTag(s.itemId, tagInputText);
                                } else if (e.key === 'Escape') {
                                  setActiveTagInputId(null);
                                  setTagInputText('');
                                }
                              }}
                              onBlur={() => {
                                if (tagInputText.trim()) {
                                  addSuggestionTag(s.itemId, tagInputText);
                                } else {
                                  setActiveTagInputId(null);
                                }
                              }}
                              placeholder="тег..."
                              className="w-16 px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-[10px] font-mono text-zinc-200 outline-none"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTagInputId(s.itemId);
                              setTagInputText('');
                            }}
                            className="px-1.5 py-0.5 rounded hover:bg-white/[0.06] text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer flex items-center gap-0.5"
                            title="Добавить тег к этой заметке"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>тег</span>
                          </button>
                        )}
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
