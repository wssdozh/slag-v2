import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Check,
  FileCode2,
  ArrowRight,
} from 'lucide-react';
import type { SlagItem, ItemUpdates } from '../../types';
import { applyItemUpdates } from '../../context/AppContext';
import { computeSideBySideDiff, computeMetadataDiff } from '../../lib/diffUtils';

export interface DiffModalItemEntry {
  title: string;
  targetItem?: SlagItem;
  updates?: ItemUpdates;
}

export interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  items: DiffModalItemEntry[];
  initialIndex?: number;
  onApply?: () => void;
  isApplied?: boolean;
}

interface FullscreenDiffEditorProps {
  onClose: () => void;
  title: string;
  items: DiffModalItemEntry[];
  initialIndex: number;
  onApply?: () => void;
  isApplied: boolean;
}

/**
 * Lightweight inline Markdown highlighter for rich editor-grade contrast.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  if (parts.length === 1 && !parts[0].startsWith('**') && !parts[0].startsWith('`')) {
    return text;
  }

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="text-zinc-100 font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={i} className="text-amber-300 bg-amber-500/15 px-1 py-0.5 rounded font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderSyntaxLine(text: string): React.ReactNode {
  if (!text) return ' ';

  // Heading 1-6
  const headingMatch = text.match(/^(#{1,6}\s+)(.*)$/);
  if (headingMatch) {
    return (
      <span>
        <span className="text-blue-400 font-bold select-none">{headingMatch[1]}</span>
        <span className="text-white font-semibold">{headingMatch[2]}</span>
      </span>
    );
  }

  // Task Checkbox: - [ ] or - [x]
  const taskMatch = text.match(/^(\s*[-*]\s+\[([ xX])\]\s+)(.*)$/);
  if (taskMatch) {
    const isDone = taskMatch[2].toLowerCase() === 'x';
    return (
      <span>
        <span className={isDone ? 'text-emerald-400 font-mono select-none font-semibold' : 'text-zinc-500 font-mono select-none'}>
          {taskMatch[1]}
        </span>
        <span className={isDone ? 'text-zinc-400 line-through' : 'text-zinc-200'}>
          {taskMatch[3]}
        </span>
      </span>
    );
  }

  // Bullet List
  const listMatch = text.match(/^(\s*[-*]\s+)(.*)$/);
  if (listMatch) {
    return (
      <span>
        <span className="text-zinc-500 font-bold select-none">{listMatch[1]}</span>
        <span className="text-zinc-200">{renderInlineMarkdown(listMatch[2])}</span>
      </span>
    );
  }

  return renderInlineMarkdown(text);
}

const FullscreenDiffEditor: React.FC<FullscreenDiffEditorProps> = ({
  onClose,
  title: _title,
  items,
  initialIndex,
  onApply,
  isApplied,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(0, items.length - 1))
  );

  // Synchronized Esc and Enter keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!isApplied && onApply) {
          e.preventDefault();
          onApply();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onApply, isApplied]);

  const currentEntry = items[selectedIndex] || items[0];
  const oldItem = currentEntry.targetItem;
  const rawUpdates = currentEntry.updates;

  const oldText = oldItem?.content || '';
  const currentProposedText = rawUpdates?.content !== undefined
    ? rawUpdates.content
    : oldText;

  const tempNewItem: SlagItem | undefined = useMemo(() => {
    if (!oldItem) return undefined;
    return applyItemUpdates(oldItem, { ...(rawUpdates || {}), content: currentProposedText });
  }, [oldItem, rawUpdates, currentProposedText]);

  const diffResult = useMemo(
    () => computeSideBySideDiff(oldText, currentProposedText),
    [oldText, currentProposedText]
  );

  const metaDiff = useMemo(
    () => computeMetadataDiff(oldItem, tempNewItem),
    [oldItem, tempNewItem]
  );

  const handleApplyClick = () => {
    if (onApply) {
      onApply();
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Сравнение изменений"
      className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col text-[#f4f4f5] animate-in fade-in duration-150 select-none overflow-hidden"
    >
      {/* Top Control Bar */}
      <header
        className="min-h-14 border-b border-white/[0.06] bg-[#0c0c0e] shrink-0 flex items-center"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between px-4 md:px-8 gap-4">
          {/* Left Side: Clean, unified, non-cluttered header */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0 active:scale-[0.96]"
              title="Вернуться назад (Esc)"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-medium">Назад</span>
            </button>

            <span className="text-zinc-600 shrink-0">/</span>

            <span className="text-xs font-semibold text-zinc-200 truncate max-w-xs md:max-w-md">
              {items.length > 1
                ? 'Сравнение изменений'
                : `Сравнение: ${items[0]?.title || 'Запись'}`}
            </span>

            {items.length > 1 && (
              <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                ({selectedIndex + 1}/{items.length})
              </span>
            )}
          </div>

          {/* Right Side: Diff Counters, Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Flat monospace diff statistics */}
            <div className="flex items-center gap-2 font-mono text-xs">
              {diffResult.removedCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                  -{diffResult.removedCount}
                </span>
              )}
              {diffResult.addedCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                  +{diffResult.addedCount}
                </span>
              )}
              {diffResult.removedCount === 0 && diffResult.addedCount === 0 && (
                <span className="text-zinc-500 text-[11px] hidden sm:inline">Без изменений</span>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] text-xs font-medium transition-all active:scale-[0.96] cursor-pointer"
            >
              Закрыть
            </button>

            {/* Apply Button */}
            {!isApplied && onApply && (
              <button
                type="button"
                onClick={handleApplyClick}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all active:scale-[0.96] cursor-pointer shadow-sm shadow-blue-500/20"
                title="Применить изменения (Ctrl+Enter)"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Применить изменения</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sub-bar: Existing-style borderless rounded tabs & flat metadata */}
      {(items.length > 1 || metaDiff.length > 0) && (
        <div className="border-b border-white/[0.06] bg-[#0c0c0e]/70 shrink-0">
          <div className="max-w-6xl mx-auto w-full px-4 md:px-8 py-2.5 flex flex-col gap-2.5">
            {/* Existing Tab Style: Borderless rounded tabs matching dockview-theme-slag.css & FolderMediaTabs */}
            {items.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {items.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const curOld = item.targetItem?.content || '';
                  const curNew = item.updates?.content !== undefined
                    ? item.updates.content
                    : curOld;
                  const tabDiff = computeSideBySideDiff(curOld, curNew);

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className={`h-[28px] px-3 text-[11px] font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap active:scale-[0.98] ${
                        isSelected
                          ? 'bg-white/10 text-white font-medium border border-white/[0.08] shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <FileCode2 className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-zinc-500'}`} />
                      <span className="max-w-[200px] truncate">{item.title}</span>
                      {(tabDiff.addedCount > 0 || tabDiff.removedCount > 0) && (
                        <span className="flex items-center gap-1 text-[10px] font-mono ml-0.5">
                          {tabDiff.removedCount > 0 && (
                            <span className="text-rose-400">-{tabDiff.removedCount}</span>
                          )}
                          {tabDiff.addedCount > 0 && (
                            <span className="text-emerald-400">+{tabDiff.addedCount}</span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Flat Metadata Differences (Anti-matryoshka: clean typography directly on surface) */}
            {metaDiff.length > 0 && (
              <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 flex-wrap">
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Свойства:
                </span>
                {metaDiff.map((md, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-zinc-400">{md.label}:</span>
                    <span className="text-rose-400/90 line-through">{md.oldValue}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600 inline" />
                    <span className="text-emerald-400 font-semibold">{md.newValue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Subheaders: Flat single plane with hairline divider */}
      <div className="border-b border-white/[0.06] bg-[#0c0c0e] shrink-0 select-none">
        <div className="max-w-6xl mx-auto w-full px-4 md:px-8">
          <div className="grid grid-cols-2 divide-x divide-white/[0.06] py-2">
            {/* Left Column Header */}
            <div className="flex items-center justify-between pr-4 pl-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-xs shadow-rose-500/50" />
                <span className="text-xs font-semibold text-zinc-200">Было (Текущая версия)</span>
              </div>
              {diffResult.removedCount > 0 && (
                <span className="text-[11px] font-mono font-medium text-rose-400">
                  -{diffResult.removedCount} {diffResult.removedCount === 1 ? 'строка' : 'строк'}
                </span>
              )}
            </div>

            {/* Right Column Header */}
            <div className="flex items-center justify-between pl-4 pr-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                <span className="text-xs font-semibold text-zinc-200">Стало (Предлагаемая версия)</span>
              </div>
              {diffResult.addedCount > 0 && (
                <span className="text-[11px] font-mono font-medium text-emerald-400">
                  +{diffResult.addedCount} {diffResult.addedCount === 1 ? 'строка' : 'строк'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Flat Editor Canvas: No cards, no box-in-a-box, full height with rich contrast */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#09090b]">
        <div className="max-w-6xl mx-auto w-full min-h-full px-4 md:px-8 flex flex-col">
          {diffResult.rows.length === 0 ? (
            <div className="grid grid-cols-2 divide-x divide-white/[0.06] flex-1 min-h-[300px]">
              <div className="p-16 flex items-center justify-center text-zinc-500 text-xs font-mono">
                Текст заметки пустой
              </div>
              <div className="p-16 flex items-center justify-center text-zinc-500 text-xs font-mono">
                Изменения отсутствуют
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 divide-y divide-white/[0.02]">
              {diffResult.rows.map((row, idx) => {
                const isRemoved = row.oldType === 'removed';
                const isAdded = row.newType === 'added';

                return (
                  <div key={idx} className="grid grid-cols-2 divide-x divide-white/[0.06]">
                    {/* Left Pane (Old Version) */}
                    <div
                      className={`flex items-start min-w-0 transition-colors ${
                        isRemoved
                          ? 'bg-rose-500/[0.10] text-rose-100'
                          : row.oldType === 'empty'
                          ? 'bg-black/25 select-none'
                          : 'hover:bg-white/[0.02] text-zinc-200'
                      }`}
                    >
                      {/* Darker contrast gutter */}
                      <span
                        className={`w-11 shrink-0 text-right pr-3 select-none text-[11px] font-mono leading-6 border-r ${
                          isRemoved
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/25'
                            : row.oldType === 'empty'
                            ? 'bg-black/40 text-transparent border-white/[0.04]'
                            : 'bg-black/35 text-zinc-500 border-white/[0.05]'
                        }`}
                      >
                        {row.oldLineNum ?? ''}
                      </span>
                      {/* Line content with syntax highlighting */}
                      <div className="flex-1 min-w-0 pl-3 pr-4 text-[12px] md:text-[13px] font-mono leading-6 whitespace-pre-wrap break-words min-h-[24px]">
                        {row.oldWords && row.oldWords.length > 0 ? (
                          row.oldWords.map((chunk, cIdx) => (
                            <span
                              key={cIdx}
                              className={
                                chunk.type === 'removed'
                                  ? 'bg-rose-500/30 text-white font-medium rounded-[2px] px-1 shadow-xs'
                                  : ''
                              }
                            >
                              {renderSyntaxLine(chunk.text)}
                            </span>
                          ))
                        ) : row.oldContent ? (
                          renderSyntaxLine(row.oldContent)
                        ) : (
                          ' '
                        )}
                      </div>
                    </div>

                    {/* Right Pane (New Version) */}
                    <div
                      className={`flex items-start min-w-0 transition-colors ${
                        isAdded
                          ? 'bg-emerald-500/[0.10] text-emerald-100'
                          : row.newType === 'empty'
                          ? 'bg-black/25 select-none'
                          : 'hover:bg-white/[0.02] text-zinc-200'
                      }`}
                    >
                      {/* Darker contrast gutter */}
                      <span
                        className={`w-11 shrink-0 text-right pr-3 select-none text-[11px] font-mono leading-6 border-r ${
                          isAdded
                            ? 'bg-emerald-500/20 text-emerald-300 font-semibold border-emerald-500/25'
                            : row.newType === 'empty'
                            ? 'bg-black/40 text-transparent border-white/[0.04]'
                            : 'bg-black/35 text-zinc-500 border-white/[0.05]'
                        }`}
                      >
                        {row.newLineNum ?? ''}
                      </span>
                      {/* Line content with syntax highlighting */}
                      <div className="flex-1 min-w-0 pl-3 pr-4 text-[12px] md:text-[13px] font-mono leading-6 whitespace-pre-wrap break-words min-h-[24px]">
                        {row.newWords && row.newWords.length > 0 ? (
                          row.newWords.map((chunk, cIdx) => (
                            <span
                              key={cIdx}
                              className={
                                chunk.type === 'added'
                                  ? 'bg-emerald-500/30 text-white font-medium rounded-[2px] px-1 shadow-xs'
                                  : ''
                              }
                            >
                              {renderSyntaxLine(chunk.text)}
                            </span>
                          ))
                        ) : row.newContent ? (
                          renderSyntaxLine(row.newContent)
                        ) : (
                          ' '
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Full-Height Bottom Extension (Continues the divider and gutters down) */}
              <div className="grid grid-cols-2 divide-x divide-white/[0.06] flex-1 min-h-[48px]">
                <div className="flex items-stretch min-w-0">
                  <div className="w-11 shrink-0 bg-black/35 border-r border-white/[0.05]" />
                  <div className="flex-1" />
                </div>
                <div className="flex items-stretch min-w-0">
                  <div className="w-11 shrink-0 bg-black/35 border-r border-white/[0.05]" />
                  <div className="flex-1" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DiffModal: React.FC<DiffModalProps> = ({
  isOpen,
  onClose,
  title = 'Сравнение изменений',
  items,
  initialIndex = 0,
  onApply,
  isApplied = false,
}) => {
  if (!isOpen || items.length === 0) return null;

  const instanceKey = items.map(it => it.title).join('|') + `_${initialIndex}`;

  return (
    <FullscreenDiffEditor
      key={instanceKey}
      onClose={onClose}
      title={title}
      items={items}
      initialIndex={initialIndex}
      onApply={onApply}
      isApplied={isApplied}
    />
  );
};
