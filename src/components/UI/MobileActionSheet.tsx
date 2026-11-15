// Phone action sheet for a feed item: drag to dismiss, the same actions as right-click.
import React, { useCallback, useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useSheetDrag } from '../../hooks/gestures/useSheetDrag';
import { useApp } from '../../context/AppContext';
import { Icon } from './icons/Icon';
import { useItemActions } from '../../hooks/useItemActions';

export const MobileActionSheet: React.FC = () => {
  const {
    mobileActionSheetItem,
    setMobileActionSheetItem,
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
      className="fixed inset-0 z-[110] bg-scrim-85 flex flex-col justify-end motion-fade motion-scrim-hold select-none"
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        data-testid="sheet-panel"
        data-motion-state={phase}
        className="w-full bg-canvas-subtle border-t border-tint-8 rounded-t-2xl p-3 flex flex-col gap-2 max-h-[85vh] overflow-y-auto motion-sheet"
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
          <div className="w-8 h-1 bg-tint-20 rounded-full mx-auto shrink-0 mb-1" />
        </div>

        {/* Quick Type Switcher (Segmented Control) */}
        <div className="grid grid-cols-3 p-0.5 rounded-xl bg-surface border border-tint-6 text-xs gap-1">
          <button
            type="button"
            onClick={() => actions.handleChangeType('note')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer ${
              item.type === 'note'
                ? 'bg-surface-elevated text-white shadow-sm'
                : 'text-fg-secondary hover:text-fg-soft'
            }`}
          >
            <Icon name="entity.note" size="sm" className="shrink-0" />
            <span>Заметка</span>
          </button>
          <button
            type="button"
            onClick={() => actions.handleChangeType('task')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer ${
              item.type === 'task'
                ? 'bg-surface-elevated text-white shadow-sm'
                : 'text-fg-secondary hover:text-fg-soft'
            }`}
          >
            <Icon name="entity.task" size="sm" className="shrink-0" />
            <span>Таска</span>
          </button>
          <button
            type="button"
            onClick={() => actions.handleChangeType('article')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-colors cursor-pointer ${
              item.type === 'article'
                ? 'bg-surface-elevated text-white shadow-sm'
                : 'text-fg-secondary hover:text-fg-soft'
            }`}
          >
            <Icon name="entity.article" size="sm" className="shrink-0" />
            <span>Статья</span>
          </button>
        </div>

        {/* Top 4 Quick Actions (Unified Segmented Row, No Clunky Podlozhki) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={actions.handleReply}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-tint-6 text-fg-tertiary hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Icon name="action.reply" size="lg" className="shrink-0" />
            <span className="text-2xs font-medium leading-tight text-center">Ответить</span>
          </button>

          <button
            onClick={actions.handleOpenFocus}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-tint-6 text-fg-tertiary hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Icon name="action.expand" size="lg" className="shrink-0" />
            <span className="text-2xs font-medium leading-tight text-center">Фокус-редактор</span>
          </button>

          <button
            onClick={actions.handleTogglePin}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-tint-6 text-fg-tertiary hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Icon name="action.pin" size="lg" tone="inherit" className={`shrink-0 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-fg-secondary'}`} />
            <span className="text-2xs font-medium leading-tight text-center">
              {item.isPinned ? 'Открепить' : 'Закрепить'}
            </span>
          </button>

          <button
            onClick={actions.handleCopyMarkdown}
            className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface border border-tint-6 text-fg-tertiary hover:bg-surface-hover hover:text-white active:bg-surface-hover transition-colors cursor-pointer"
          >
            <Icon name="action.copy" size="lg" className="shrink-0" />
            <span className="text-2xs font-medium leading-tight text-center">Копировать текст</span>
          </button>
        </div>

        {/* 5th Main Action: AI Triage Banner */}
        <button
          onClick={actions.handleAiDecompose}
          className="w-full h-12 px-3.5 rounded-xl border border-tint-8 hover:bg-surface-hover active:bg-tint-10 flex items-center justify-between text-xs text-fg-soft transition-colors cursor-pointer bg-surface"
        >
          <div className="flex items-center gap-2.5">
            <Icon name="system.ai" size="md" tone="accent" className="shrink-0" />
            <span className="font-medium">Разобрать с ИИ</span>
          </div>
          <span className="text-3xs text-fg-muted font-mono">AI</span>
        </button>

        {/* Secondary Utilities List (Clean hairline divide, no card-in-card podlozhki) */}
        <div className="flex flex-col rounded-xl overflow-hidden divide-y divide-tint-6 border border-tint-6 bg-surface">
          <button
            onClick={actions.handleCopyLink}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-fg-tertiary hover:text-white hover:bg-surface-hover active:bg-surface-hover transition-colors cursor-pointer text-left"
          >
            <Icon name="action.copy" size="md" className="shrink-0" />
            <span>Копировать [[линк]]</span>
          </button>

          <button
            onClick={actions.handleDelete}
            className="w-full h-11 px-3.5 flex items-center gap-3 text-xs text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors cursor-pointer text-left"
          >
            <Icon name="action.delete" size="md" tone="danger" className="shrink-0" />
            <span className="font-medium">Удалить</span>
          </button>
        </div>
      </div>
    </div>
  );
};
