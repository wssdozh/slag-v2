// AI triage of the inbox: one batch of notes, folders and tags confirmed in a single pass.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { triageInboxItems } from '../../lib/ai/aiService';
import type { TriageSuggestion } from '../../lib/ai/aiService';
import { Icon } from '../UI/icons/Icon';
import { BaseModal } from './BaseModal';
import { Checkbox } from '../UI/Checkbox';
import { Select } from '../UI/Select';
import { DEFAULT_INBOX_FOLDER } from '../../config';

const TriageModalDialog: React.FC<{ presence: ReturnType<typeof usePresence> }> = ({ presence }) => {
  const { isPresent } = presence;
  const {
    isTriageModalOpen,
    setIsTriageModalOpen,
    items,
    folders,
    aiSettings,
    updateItem,
    addToast,
    isMobile,
  } = useApp();

  const inboxItems = useMemo(
    () => items.filter(i => i.folder === DEFAULT_INBOX_FOLDER),
    [items]
  );

  const eligibleFolders = useMemo(
    () => folders.filter(f => f.path !== DEFAULT_INBOX_FOLDER),
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

    if (!isTriageModalOpen || inboxItems.length === 0) {
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
  }, [isTriageModalOpen, inboxItems, folders, aiSettings]);

  useEffect(() => {
    if (isTriageModalOpen && activeTagInputId && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [isTriageModalOpen, activeTagInputId]);

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
    <span className="flex items-center gap-1.5 text-fg-secondary">
      <Icon name="status.loading" size="xs" tone="warning" className="animate-spin shrink-0" />
      <span>
        Пакетный анализ: {progress.processed} из {progress.total}...
      </span>
    </span>
  ) : (
    'Распределение по папкам и авто-тегирование на основе описаний'
  );

  const footer = (
    <div className="flex items-center justify-between">
      <span className="text-xs text-fg-muted">
        Выбрано: {selectedIds.size} из {suggestions.length}
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsTriageModalOpen(false)}
          className="px-3 py-1.5 rounded-lg text-xs text-fg-secondary hover:text-white transition-colors cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={selectedIds.size === 0}
          className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-fg-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          Применить перемещение
        </button>
      </div>
    </div>
  );

  const triageContent = (
    <>
      {isAnalyzing && suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-fg-secondary">
          <Icon name="status.loading" size="none" tone="primary" className="w-6 h-6 animate-spin" />
          <p className="text-xs">
            ИИ анализирует первую партию заметок из «Входящих»...
          </p>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-10 text-xs text-fg-muted">
          Нет заметок во «Входящих» для распределения.
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex justify-between items-center text-2xs text-fg-muted px-3 py-1.5 border-b border-tint-4 mb-1 shrink-0">
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
                  className={`group flex items-start gap-3 p-3 rounded-xl border motion-surface cursor-pointer ${
                    isChecked
                      ? 'bg-tint-3 border-tint-8 text-fg-soft'
                      : 'bg-transparent border-transparent text-fg-muted opacity-40 hover:opacity-75'
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
                        <span className="text-xs font-semibold text-fg-soft truncate">
                          {s.suggestedTitle || s.itemTitle}
                        </span>
                        {s.suggestedTitle && s.suggestedTitle !== s.itemTitle && (
                          <span
                            className="text-3xs text-fg-muted line-through truncate max-w-[140px] hidden sm:inline"
                            title={`Исходный заголовок: ${s.itemTitle}`}
                          >
                            {s.itemTitle}
                          </span>
                        )}
                      </div>

                      {/* Interactive Folder Selector */}
                      <div
                        className="flex items-center gap-1.5 text-2xs shrink-0 font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-fg-muted hidden sm:inline">
                          Входящие
                        </span>
                        <Icon name="nav.forward" size="xs" tone="dim" className="hidden sm:inline" />
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
                          className="group/tag inline-flex items-center gap-1 text-2xs font-mono text-fg-secondary hover:text-fg-soft transition-colors shrink-0"
                        >
                          <span>#{t}</span>
                          <button
                            type="button"
                            onClick={() => removeSuggestionTag(s.itemId, t)}
                            className="text-fg-dim hover:text-rose-400 opacity-60 group-hover/tag:opacity-100 motion-surface cursor-pointer p-0.5"
                            title={`Удалить тег #${t}`}
                            aria-label={`Удалить тег #${t}`}
                          >
                            <Icon name="action.close" size="none" tone="inherit" className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}

                      {/* Inline Tag Adder */}
                      {activeTagInputId === s.itemId ? (
                        <div className="inline-flex items-center text-2xs font-mono text-fg-secondary shrink-0">
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
                            className="w-16 px-0.5 py-0 bg-transparent border-b border-fg-dim focus:border-fg-tertiary text-2xs font-mono text-fg-soft outline-none"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTagInputId(s.itemId);
                            setTagInputText('');
                          }}
                          className="inline-flex items-center gap-0.5 text-2xs font-mono text-fg-dim hover:text-fg-tertiary transition-colors cursor-pointer py-0.5 shrink-0"
                          title="Добавить тег к этой заметке"
                        >
                          <Icon name="action.add" size="none" tone="inherit" className="w-2.5 h-2.5" />
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

  if (!isPresent) return null;

  if (isMobile) {
    if (!isTriageModalOpen) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Сортировка входящих"
        className="fixed inset-0 z-50 bg-canvas flex flex-col select-none motion-fade overflow-hidden"
      >
        {/* Mobile Header */}
        <div
          className="px-4 py-3 border-b border-tint-6 flex items-center justify-between shrink-0 bg-panel"
          style={{ paddingTop: 'max(var(--sat), 0.75rem)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsTriageModalOpen(false)}
              className="p-1.5 -ml-1 text-fg-secondary hover:text-white cursor-pointer motion-press"
              title="Закрыть"
            >
              <Icon name="nav.back" size="lg" tone="inherit" />
            </button>
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 truncate">
                <Icon name="system.ai" size="sm" tone="accent" className="shrink-0" />
                <span className="truncate">AI Triage — Сортировка</span>
              </h3>
              <span className="text-3xs text-fg-muted font-mono truncate max-w-[240px]">
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
          className="px-4 py-3 border-t border-tint-8 bg-panel shrink-0 flex items-center justify-between"
          style={{ paddingBottom: 'max(var(--sab), 0.75rem)' }}
        >
          <span className="text-xs text-fg-muted font-mono">
            Выбрано: {selectedIds.size} из {suggestions.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsTriageModalOpen(false)}
              className="px-3 py-1.5 rounded-xl text-xs text-fg-secondary hover:text-white transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedIds.size === 0}
              className="px-4 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-fg-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm motion-press"
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
      presence={presence}
      isOpen={isTriageModalOpen}
      onClose={() => setIsTriageModalOpen(false)}
      title="AI Triage — Сортировка Входящих"
      subtitle={modalSubtitle}
      icon={<Icon name="system.ai" size="md" tone="inherit" />}
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

  const presence = usePresence(isTriageModalOpen);
  const [session, setSession] = useState({ open: isTriageModalOpen, id: 0 });
  if (session.open !== isTriageModalOpen) {
    setSession({ open: isTriageModalOpen, id: session.id + (isTriageModalOpen ? 1 : 0) });
  }
  if (!presence.isPresent) return null;

  return <TriageModalDialog key={session.id} presence={presence} />;
};
