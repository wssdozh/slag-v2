import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { triageInboxItems } from '../../lib/aiService';
import type { TriageSuggestion } from '../../lib/aiService';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  X,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import { BaseModal } from './BaseModal';
import { Checkbox } from '../UI/Checkbox';
import { Select } from '../UI/Select';

const TriageModalDialog: React.FC = () => {
  const {
    setIsTriageModalOpen,
    items,
    folders,
    aiSettings,
    updateItem,
    addToast,
    isMobile,
  } = useApp();

  const inboxItems = useMemo(
    () => items.filter(i => i.folder === 'Входящие'),
    [items]
  );

  const eligibleFolders = useMemo(
    () => folders.filter(f => f.path !== 'Входящие'),
    [folders]
  );

  const folderOptions = useMemo(
    () => eligibleFolders.map(f => ({ value: f.path, label: f.name })),
    [eligibleFolders]
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
        if (originalItem) {
          const mergedTags = s.tags && s.tags.length > 0
            ? Array.from(new Set([...originalItem.tags, ...s.tags]))
            : originalItem.tags;
          const nextTitle = s.suggestedTitle?.trim() || originalItem.title;
          updateItem({
            ...originalItem,
            title: nextTitle,
            folder: s.targetFolder,
            tags: mergedTags,
            updatedAt: Date.now(),
          });
          count++;
        }
      }
    });

    setIsTriageModalOpen(false);
    addToast(`ИИ распределил ${count} заметок и нормализовал названия`, 'success');
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

  const triageContent = (
    <>
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
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex justify-between items-center text-[11px] text-zinc-500 px-3 py-1.5 border-b border-white/[0.04] mb-1 shrink-0">
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

          <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
            {suggestions.map(s => {
              const isChecked = selectedIds.has(s.itemId);
              return (
                <div
                  key={s.itemId}
                  onClick={() => toggleSelect(s.itemId)}
                  className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-white/[0.03] border-white/[0.08] text-zinc-200'
                      : 'bg-transparent border-transparent text-zinc-500 opacity-40 hover:opacity-75'
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onChange={() => toggleSelect(s.itemId)}
                    className="mt-0.5 pointer-events-none shrink-0"
                  />

                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {/* Top line: Title & Folder Selector */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {s.suggestedTitle || s.itemTitle}
                        </span>
                        {s.suggestedTitle && s.suggestedTitle !== s.itemTitle && (
                          <span
                            className="text-[10px] text-zinc-500 line-through truncate max-w-[140px] hidden sm:inline"
                            title={`Исходный заголовок: ${s.itemTitle}`}
                          >
                            {s.itemTitle}
                          </span>
                        )}
                      </div>

                      {/* Interactive Folder Selector */}
                      <div
                        className="flex items-center gap-1.5 text-[11px] shrink-0 font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-zinc-500 hidden sm:inline">
                          Входящие
                        </span>
                        <ArrowRight className="w-3 h-3 text-zinc-600 hidden sm:inline" />
                        <Select
                          value={s.targetFolder}
                          onChange={(val) => updateSuggestionFolder(s.itemId, val)}
                          options={folderOptions}
                          size="sm"
                          variant="ghost"
                          className="w-auto min-w-[5rem]"
                          aria-label="Сменить целевую папку"
                        />
                      </div>
                    </div>

                    {/* Bottom line: Interactive Tags */}
                    <div
                      className="flex items-center gap-2 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.tags.map(t => (
                        <span
                          key={t}
                          className="group/tag inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
                        >
                          <span>#{t}</span>
                          <button
                            type="button"
                            onClick={() => removeSuggestionTag(s.itemId, t)}
                            className="text-zinc-600 hover:text-rose-400 opacity-60 group-hover/tag:opacity-100 transition-all cursor-pointer p-0.5"
                            title={`Удалить тег #${t}`}
                            aria-label={`Удалить тег #${t}`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}

                      {/* Inline Tag Adder */}
                      {activeTagInputId === s.itemId ? (
                        <div className="inline-flex items-center text-[11px] font-mono text-zinc-400 shrink-0">
                          <span>#</span>
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
                            className="w-16 px-0.5 py-0 bg-transparent border-b border-zinc-600 focus:border-zinc-300 text-[11px] font-mono text-zinc-200 outline-none"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTagInputId(s.itemId);
                            setTagInputText('');
                          }}
                          className="inline-flex items-center gap-0.5 text-[11px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer py-0.5 shrink-0"
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
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 bg-[#09090b] flex flex-col select-none animate-in slide-in-from-bottom duration-200 overflow-hidden">
        {/* Mobile Header */}
        <div
          className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0c0c0e]"
          style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsTriageModalOpen(false)}
              className="p-1.5 -ml-1 text-zinc-400 hover:text-white cursor-pointer active:scale-95"
              title="Закрыть"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">AI Triage — Сортировка</span>
              </h3>
              <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[240px]">
                {modalSubtitle}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
          {triageContent}
        </div>

        {/* Fixed Mobile Footer */}
        <div
          className="px-4 py-3 border-t border-white/[0.08] bg-[#0c0c0e] shrink-0 flex items-center justify-between"
          style={{ paddingBottom: 'max(var(--sab), 0.75rem)' }}
        >
          <span className="text-xs text-zinc-500 font-mono">
            Выбрано: {selectedIds.size} из {suggestions.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsTriageModalOpen(false)}
              className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedIds.size === 0}
              className="px-4 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm active:scale-95"
            >
              Применить перемещение
            </button>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="p-3 md:p-4 flex flex-col gap-2 max-h-[480px] overflow-y-auto">
        {triageContent}
      </div>
    </BaseModal>
  );
};

export const TriageModal: React.FC = () => {
  const { isTriageModalOpen } = useApp();

  if (!isTriageModalOpen) return null;

  return <TriageModalDialog />;
};
