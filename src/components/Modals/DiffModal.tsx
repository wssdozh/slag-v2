// What an AI edit would change, before it is applied: the line diff and the accept/reject pair.
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { SlagItem, ItemUpdates } from '../../types';
import { applyItemUpdates } from '../../lib/vault/itemUpdates';
import { computeSideBySideDiff, computeMetadataDiff } from '../../lib/text/diffUtils';
import { usePresence } from '../../hooks/ui/usePresence';

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
  presencePhase?: string;
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
        <strong key={i} className="text-fg-primary font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={i} className="text-amber-300 bg-amber-500/15 px-1 py-0.5 rounded font-mono text-2xs">
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
        <span className={isDone ? 'text-emerald-400 font-mono select-none font-semibold' : 'text-fg-muted font-mono select-none'}>
          {taskMatch[1]}
        </span>
        <span className={isDone ? 'text-fg-secondary line-through' : 'text-fg-soft'}>
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
        <span className="text-fg-muted font-bold select-none">{listMatch[1]}</span>
        <span className="text-fg-soft">{renderInlineMarkdown(listMatch[2])}</span>
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
  presencePhase,
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
    : rawUpdates?.appendContent
      ? (oldText ? `${oldText}\n\n${rawUpdates.appendContent}` : rawUpdates.appendContent)
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
      data-motion-state={presencePhase}
      className="fixed inset-0 z-[100] bg-canvas flex flex-col text-fg-primary motion-fade select-none overflow-hidden"
    >
      {/* Top Control Bar */}
      <header
        className="min-h-14 border-b border-tint-6 bg-panel shrink-0 flex items-center"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between px-4 md:px-8 gap-4">
          {/* Left Side: Clean, unified, non-cluttered header */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-fg-secondary hover:text-white hover:bg-tint-6 motion-press cursor-pointer shrink-0"
              title="Вернуться назад (Esc)"
            >
              <Icon name="nav.back" size="md" tone="inherit" />
              <span className="font-medium">Назад</span>
            </button>

            <span className="text-fg-dim shrink-0">/</span>

            <span className="text-xs font-semibold text-fg-soft truncate max-w-xs md:max-w-md">
              {items.length > 1
                ? 'Сравнение изменений'
                : `Сравнение: ${items[0]?.title || 'Запись'}`}
            </span>

            {items.length > 1 && (
              <span className="text-2xs font-mono text-fg-muted shrink-0">
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
                <span className="text-fg-muted text-2xs hidden sm:inline">Без изменений</span>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-fg-secondary hover:text-white hover:bg-tint-6 text-xs font-medium motion-press cursor-pointer"
            >
              Закрыть
            </button>

            {/* Apply Button */}
            {!isApplied && onApply && (
              <button
                type="button"
                onClick={handleApplyClick}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium motion-press cursor-pointer shadow-sm shadow-blue-500/20"
                title="Применить изменения (Ctrl+Enter)"
              >
                <Icon name="action.check" size="sm" tone="inherit" />
                <span>Применить изменения</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sub-bar: Existing-style borderless rounded tabs & flat metadata */}
      {(items.length > 1 || metaDiff.length > 0) && (
        <div className="border-b border-tint-6 bg-panel/70 shrink-0">
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
                      className={`h-[28px] px-3 text-2xs font-medium rounded-md motion-press cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        isSelected
                          ? 'bg-tint-10 text-white font-medium border border-tint-8 shadow-xs'
                          : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-4'
                      }`}
                    >
                      <Icon name="entity.fileCode" size="sm" tone="inherit" className={`${isSelected ? 'text-blue-400' : 'text-fg-muted'}`} />
                      <span className="max-w-[200px] truncate">{item.title}</span>
                      {(tabDiff.addedCount > 0 || tabDiff.removedCount > 0) && (
                        <span className="flex items-center gap-1 text-3xs font-mono ml-0.5">
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
              <div className="flex items-center gap-4 text-xs font-mono text-fg-secondary flex-wrap">
                <span className="text-2xs text-fg-muted uppercase tracking-wider font-semibold">
                  Свойства:
                </span>
                {metaDiff.map((md, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-fg-secondary">{md.label}:</span>
                    <span className="text-rose-400/90 line-through">{md.oldValue}</span>
                    <Icon name="nav.forward" size="xs" tone="dim" className="inline" />
                    <span className="text-emerald-400 font-semibold">{md.newValue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Subheaders: Flat single plane with hairline divider */}
      <div className="border-b border-tint-6 bg-panel shrink-0 select-none">
        <div className="max-w-6xl mx-auto w-full px-4 md:px-8">
          <div className="grid grid-cols-2 divide-x divide-tint-6 py-2">
            {/* Left Column Header */}
            <div className="flex items-center justify-between pr-4 pl-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-xs shadow-rose-500/50" />
                <span className="text-xs font-semibold text-fg-soft">Было (Текущая версия)</span>
              </div>
              {diffResult.removedCount > 0 && (
                <span className="text-2xs font-mono font-medium text-rose-400">
                  -{diffResult.removedCount} {diffResult.removedCount === 1 ? 'строка' : 'строк'}
                </span>
              )}
            </div>

            {/* Right Column Header */}
            <div className="flex items-center justify-between pl-4 pr-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                <span className="text-xs font-semibold text-fg-soft">Стало (Предлагаемая версия)</span>
              </div>
              {diffResult.addedCount > 0 && (
                <span className="text-2xs font-mono font-medium text-emerald-400">
                  +{diffResult.addedCount} {diffResult.addedCount === 1 ? 'строка' : 'строк'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Flat Editor Canvas: No cards, no box-in-a-box, full height with rich contrast */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-canvas">
        <div className="max-w-6xl mx-auto w-full min-h-full px-4 md:px-8 flex flex-col">
          {diffResult.rows.length === 0 ? (
            <div className="grid grid-cols-2 divide-x divide-tint-6 flex-1 min-h-[300px]">
              <div className="p-16 flex items-center justify-center text-fg-muted text-xs font-mono">
                Текст заметки пустой
              </div>
              <div className="p-16 flex items-center justify-center text-fg-muted text-xs font-mono">
                Изменения отсутствуют
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 divide-y divide-tint-2">
              {diffResult.rows.map((row, idx) => {
                const isRemoved = row.oldType === 'removed';
                const isAdded = row.newType === 'added';

                return (
                  <div key={idx} className="grid grid-cols-2 divide-x divide-tint-6">
                    {/* Left Pane (Old Version) */}
                    <div
                      className={`flex items-start min-w-0 transition-colors ${
                        isRemoved
                          ? 'bg-rose-500/[0.10] text-rose-100'
                          : row.oldType === 'empty'
                          ? 'bg-scrim-25 select-none'
                          : 'hover:bg-tint-2 text-fg-soft'
                      }`}
                    >
                      {/* Darker contrast gutter */}
                      <span
                        className={`w-11 shrink-0 text-right pr-3 select-none text-2xs font-mono leading-6 border-r ${
                          isRemoved
                            ? 'bg-rose-500/20 text-rose-300 font-semibold border-rose-500/25'
                            : row.oldType === 'empty'
                            ? 'bg-scrim-40 text-transparent border-tint-4'
                            : 'bg-scrim-35 text-fg-muted border-tint-5'
                        }`}
                      >
                        {row.oldLineNum ?? ''}
                      </span>
                      {/* Line content with syntax highlighting */}
                      <div className="flex-1 min-w-0 pl-3 pr-4 text-xs md:text-ui font-mono leading-6 whitespace-pre-wrap break-words min-h-[24px]">
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
                          ? 'bg-scrim-25 select-none'
                          : 'hover:bg-tint-2 text-fg-soft'
                      }`}
                    >
                      {/* Darker contrast gutter */}
                      <span
                        className={`w-11 shrink-0 text-right pr-3 select-none text-2xs font-mono leading-6 border-r ${
                          isAdded
                            ? 'bg-emerald-500/20 text-emerald-300 font-semibold border-emerald-500/25'
                            : row.newType === 'empty'
                            ? 'bg-scrim-40 text-transparent border-tint-4'
                            : 'bg-scrim-35 text-fg-muted border-tint-5'
                        }`}
                      >
                        {row.newLineNum ?? ''}
                      </span>
                      {/* Line content with syntax highlighting */}
                      <div className="flex-1 min-w-0 pl-3 pr-4 text-xs md:text-ui font-mono leading-6 whitespace-pre-wrap break-words min-h-[24px]">
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
              <div className="grid grid-cols-2 divide-x divide-tint-6 flex-1 min-h-[48px]">
                <div className="flex items-stretch min-w-0">
                  <div className="w-11 shrink-0 bg-scrim-35 border-r border-tint-5" />
                  <div className="flex-1" />
                </div>
                <div className="flex items-stretch min-w-0">
                  <div className="w-11 shrink-0 bg-scrim-35 border-r border-tint-5" />
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
  const isDiffOpen = isOpen && items.length > 0;
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isDiffOpen);

  const [cachedItems, setCachedItems] = useState(items);
  if (items.length > 0 && items !== cachedItems) {
    setCachedItems(items);
  }
  const effectiveItems = items.length > 0 ? items : cachedItems;

  if (!isPresent || effectiveItems.length === 0) return null;

  const instanceKey = effectiveItems.map(it => it.title).join('|') + `_${initialIndex}`;

  return (
    <div
      ref={ref}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isDiffOpen}
      className="fixed inset-0 z-[100] motion-presence-hold"
    >
      <FullscreenDiffEditor
        key={instanceKey}
        onClose={onClose}
        title={title}
        items={effectiveItems}
        initialIndex={initialIndex}
        onApply={onApply}
        isApplied={isApplied}
        presencePhase={phase}
      />
    </div>
  );
};
