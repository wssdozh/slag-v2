// Item right-click entries: reply, pin, type switch, AI split, copy and delete.
import React from 'react';
import { Icon } from '../icons/Icon';
import type { SlagItem } from '../../../types';
import { TYPE_LABELS } from '../../../hooks/useItemActions';
import type { MenuSubmenuName } from './MenuSubmenus';

export interface ItemMenuSectionsProps {
  item: SlagItem;
  activeSubmenu: MenuSubmenuName | null;
  onReply: () => void;
  onOpenFocus: () => void;
  onTogglePin: () => void;
  onCompleteTaskForever: () => void;
  onAiDecompose: () => void;
  onCopyMarkdown: () => void;
  onDelete: () => void;
  onTriggerMouseEnter: (name: MenuSubmenuName, e: React.MouseEvent<HTMLButtonElement>) => void;
  onTriggerMouseLeave: () => void;
  onTriggerClick: (name: MenuSubmenuName, e: React.MouseEvent<HTMLButtonElement>) => void;
  onOtherItemMouseEnter: () => void;
}

export const ItemMenuSections: React.FC<ItemMenuSectionsProps> = ({
  item,
  activeSubmenu,
  onReply,
  onOpenFocus,
  onTogglePin,
  onCompleteTaskForever,
  onAiDecompose,
  onCopyMarkdown,
  onDelete,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  onTriggerClick,
  onOtherItemMouseEnter,
}) => (
  <>
    {/* Quick Primary Actions */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onReply}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="action.reply" size="sm" />
        <span>Ответить</span>
      </div>
      <span className="text-3xs text-fg-muted font-mono">R</span>
    </button>

    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onOpenFocus}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="action.expand" size="sm" />
        <span>Фокус-редактор</span>
      </div>
      <span className="text-3xs text-fg-muted font-mono">⌘E</span>
    </button>

    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onTogglePin}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="action.pin" size="sm" tone="inherit" className={`${item.isPinned ? 'text-amber-400 rotate-45' : 'text-fg-secondary'}`} />
        <span>{item.isPinned ? 'Открепить' : 'Закрепить'}</span>
      </div>
      <span className="text-3xs text-fg-muted font-mono">P</span>
    </button>

    {item.type === 'task' && item.recurrence && item.status !== 'done' && (
      <button
        onMouseEnter={onOtherItemMouseEnter}
        onClick={onCompleteTaskForever}
        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-amber-300 text-amber-400/90 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Icon name="entity.task" size="sm" tone="inherit" />
          <span>Завершить навсегда</span>
        </div>
      </button>
    )}

    <div className="my-0.5 border-t border-tint-6" />

    {/* AI Action */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onAiDecompose}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="system.ai" size="sm" />
        <span>Разобрать с ИИ</span>
      </div>
      <span className="text-3xs text-fg-muted font-mono">AI</span>
    </button>

    <div className="my-0.5 border-t border-tint-6" />

    {/* Quick Type Switching Flyout Submenu */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('type', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('type', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'type' ? 'bg-tint-8 text-white' : 'hover:bg-tint-6 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        {item.type === 'task' ? (
          <Icon name="entity.task" size="sm" />
        ) : item.type === 'article' ? (
          <Icon name="entity.article" size="sm" />
        ) : (
          <Icon name="entity.note" size="sm" />
        )}
        <span>Сменить тип</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-3xs text-fg-muted font-mono">{TYPE_LABELS[item.type]}</span>
        <Icon name="nav.next" size="sm" tone="muted" />
      </div>
    </button>

    {/* File Flyout Submenu: path, id and wiki link */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('explorer', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('explorer', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'explorer' ? 'bg-tint-8 text-white' : 'hover:bg-tint-6 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon name="entity.folderOpen" size="sm" />
        <span>Файл</span>
      </div>
      <Icon name="nav.next" size="sm" tone="muted" />
    </button>

    {/* Clipboard */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onCopyMarkdown}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="action.copy" size="sm" />
        <span>Копировать текст</span>
      </div>
      <span className="text-3xs text-fg-muted font-mono">⌘C</span>
    </button>

    <div className="my-0.5 border-t border-tint-6" />

    {/* Danger Zone */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onDelete}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="action.delete" size="sm" tone="inherit" />
        <span>Удалить</span>
      </div>
      <span className="text-3xs text-rose-400/60 font-mono">⌫</span>
    </button>
  </>
);
