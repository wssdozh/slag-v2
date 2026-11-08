import React, { useCallback, useState } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { useSheetDrag } from '../../hooks/gestures/useSheetDrag';
import { useApp } from '../../context/AppContext';
import {
  Maximize2,
  Trash2,
  Copy,
  CheckSquare,
  FileText,
  StickyNote,
  CornerUpLeft,
  Pin,
  Sparkles,
  CopyPlus,
  Archive,
  Link2,
} from 'lucide-react';
import { useItemActions } from '../../hooks/useItemActions';

export const MobileActionSheet: React.FC = () => {
  const {
    mobileActionSheetItem,
    setMobileActionSheetItem,
    navigateToFolder,
  } = useApp();

  const handleClose = useCallback(() => {
    setMobileActionSheetItem(null);
  }, [setMobileActionSheetItem]);

  const isOpen = mobileActionSheetItem !== null;
  const { ref, phase, isPresent, onTransitionEnd } = usePresence(isOpen);
  const { panelRef, scrimRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel, panelStyle } =
    useSheetDrag({ isOpen, onDismiss: handleClose });
  const [lastItem, setLastItem] = useState(mobileActionSheetItem);
  if (mobileActionSheetItem && mobileActionSheetItem !== lastItem) setLastItem(mobileActionSheetItem);
  const actions = useItemActions(mobileActionSheetItem, handleClose);

  if (!isPresent || !lastItem) return null;

  const item = mobileActionSheetItem || lastItem;

  return (
    <div
      ref={(node) => {
        ref.current = node;
        scrimRef.current = node;
      }}
      data-testid="action-sheet"
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={mobileActionSheetItem === null}
      aria-hidden={mobileActionSheetItem === null || undefined}
      onClick={handleClose}
      className="fixed inset-0 z-[110] bg-black/85 flex flex-col justify-end motion-fade motion-scrim-hold select-none"
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        data-testid="sheet-panel"
        data-motion-state={phase}
        className="w-full bg-canvas-subtle border-t border-white/[0.08] rounded-t-2xl p-3 flex flex-col gap-2 max-h-[85vh] overflow-y-auto motion-sheet"
        style={{ paddingBottom: 'max(var(--sab), 0.75rem)', ...panelStyle }}
      >
        {/* The handle owns the gesture; the scroller below keeps scrolling. */}
        <div
          data-sheet-handle
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerCancel}
          style={{ touchAction: 'none' }}
          className="flex flex-col gap-2 shrink-0"
        >
          <div className="w-8 h-1 bg-white/20 rounded-full mx-auto shrink-0 mb-1" />

          {/* Item Title Header */}
          <div className="px-3 py-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface">
            <div className="flex items-center gap-2 min-w-0">
              {item.type === 'task' && <CheckSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
              {item.type === 'article' && <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
              {item.type === 'note' && <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
              <span className="text-xs font-semibold text-zinc-200 truncate">
                {item.title || item.content.slice(0, 40) || 'Без названия'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                handleClose();
                navigateToFolder(item.folder, item.id);
              }}
              className="text-[10px] font-mono text-zinc-500 hover:text-zinc-200 hover:underline transition-colors cursor-pointer shrink-0 ml-2"
              title={`Перейти в папку «${item.folder}» и перейти к этой записи`}
            >
              {item.folder}
            </button>
          </div>
        </div>

        {/* Quick Type Switcher (Segmented Control) */}
        <div className="grid grid-cols-3 p-0.5 rounded-xl bg-surface border border-white/[0.06] text-xs gap-1">
          <button
            type="button"
            onClick={() => actions.handleChangeType('note')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer ${
              item.type === 'note'
                ? 'bg-surface-elevated text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Заметка</span>
          </button>
          <button
            type="button"
            onClick={() => actions.handleChangeType('task')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer ${
              item.type === 'task'
                ? 'bg-surface-elevated text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Таска</span>
          </button>
          <button
            type="button"
            onClick={() => actions.handleChangeType('article')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer ${
              item.type === 'article'
                ? 'bg-surface-elevated text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Статья</span>
          </button>
        </div>

        {/* Top 4 Quick Actions (Unified Segmented Row, No Clunky Podlozhki) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={actions.handleReply}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-white/[0.06] text-zinc-300 hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <CornerUpLeft className="w-5 h-5 text-zinc-400 shrink-0" />
            <span className="text-[11px] font-medium leading-tight text-center">Ответить</span>
          </button>

          <button
            onClick={actions.handleOpenFocus}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-white/[0.06] text-zinc-300 hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Maximize2 className="w-5 h-5 text-zinc-400 shrink-0" />
            <span className="text-[11px] font-medium leading-tight text-center">Фокус-редактор</span>
          </button>

          <button
            onClick={actions.handleTogglePin}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-white/[0.06] text-zinc-300 hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Pin className={`w-5 h-5 shrink-0 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'}`} />
            <span className="text-[11px] font-medium leading-tight text-center">
              {item.isPinned ? 'Открепить' : 'Закрепить'}
            </span>
          </button>

          <button
            onClick={actions.handleCopyMarkdown}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-white/[0.06] text-zinc-300 hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Copy className="w-5 h-5 text-zinc-400 shrink-0" />
            <span className="text-[11px] font-medium leading-tight text-center">Копировать текст</span>
          </button>
        </div>

        {/* 5th Main Action: AI Triage Banner */}
        <button
          onClick={actions.handleAiDecompose}
          className="w-full h-12 px-3.5 rounded-xl border border-white/[0.08] hover:bg-surface-hover active:bg-white/10 flex items-center justify-between text-xs text-zinc-200 transition-colors cursor-pointer bg-surface"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-medium">Разобрать с ИИ</span>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">AI</span>
        </button>

        {/* Secondary Utilities List (Clean hairline divide, no card-in-card podlozhki) */}
        <div className="flex flex-col rounded-xl overflow-hidden divide-y divide-white/[0.06] border border-white/[0.06] bg-surface">
          <button
            onClick={actions.handleDuplicate}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:text-white hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer text-left"
          >
            <CopyPlus className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Дублировать</span>
          </button>

          <button
            onClick={actions.handleCopyFullLink}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:text-white hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer text-left"
          >
            <Link2 className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Скопировать фулл ссылку</span>
          </button>

          <button
            onClick={actions.handleCopyLink}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:text-white hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer text-left"
          >
            <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Копировать [[линк]]</span>
          </button>

          <button
            onClick={actions.handleToggleArchive}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:text-white hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer text-left"
          >
            <Archive className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>{item.isArchived ? 'Разархивировать' : 'В архив'}</span>
          </button>

          <button
            onClick={actions.handleDelete}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors cursor-pointer text-left"
          >
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-medium">Удалить</span>
          </button>
        </div>

        {/* Cancel Button */}
        <button
          onClick={handleClose}
          className="w-full h-10 rounded-xl bg-surface-elevated hover:bg-surface-hover active:bg-surface-hover text-zinc-300 hover:text-white font-medium text-xs flex items-center justify-center transition-colors cursor-pointer"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
