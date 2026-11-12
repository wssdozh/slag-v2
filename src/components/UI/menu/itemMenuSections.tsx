import React from 'react';
import {
  Maximize2,
  Trash2,
  Copy,
  FolderOpen,
  CheckSquare,
  FileText,
  StickyNote,
  CornerUpLeft,
  Pin,
  ChevronRight,
  Sparkles,
  MoreVertical,
} from 'lucide-react';
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
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <CornerUpLeft className="w-3.5 h-3.5 text-zinc-400" />
        <span>Ответить</span>
      </div>
      <span className="text-[10px] text-zinc-500 font-mono">R</span>
    </button>

    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onOpenFocus}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
        <span>Фокус-редактор</span>
      </div>
      <span className="text-[10px] text-zinc-500 font-mono">⌘E</span>
    </button>

    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onTogglePin}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Pin className={`w-3.5 h-3.5 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'}`} />
        <span>{item.isPinned ? 'Открепить' : 'Закрепить'}</span>
      </div>
      <span className="text-[10px] text-zinc-500 font-mono">P</span>
    </button>

    {item.type === 'task' && item.recurrence && item.status !== 'done' && (
      <button
        onMouseEnter={onOtherItemMouseEnter}
        onClick={onCompleteTaskForever}
        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-amber-300 text-amber-400/90 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Завершить навсегда</span>
        </div>
      </button>
    )}

    <div className="my-0.5 border-t border-white/[0.06]" />

    {/* AI Action */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onAiDecompose}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
        <span>Разобрать с ИИ</span>
      </div>
      <span className="text-[10px] text-zinc-500 font-mono">AI</span>
    </button>

    <div className="my-0.5 border-t border-white/[0.06]" />

    {/* Quick Type Switching Flyout Submenu */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('type', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('type', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'type' ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        {item.type === 'task' ? (
          <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />
        ) : item.type === 'article' ? (
          <FileText className="w-3.5 h-3.5 text-zinc-400" />
        ) : (
          <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
        )}
        <span>Сменить тип</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-zinc-500 font-mono">{TYPE_LABELS[item.type]}</span>
        <ChevronRight className="w-3 h-3 text-zinc-500" />
      </div>
    </button>

    {/* Explorer Flyout Submenu */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('explorer', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('explorer', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'explorer' ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
        <span>Проводник</span>
      </div>
      <ChevronRight className="w-3 h-3 text-zinc-500" />
    </button>

    {/* Clipboard */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onCopyMarkdown}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Copy className="w-3.5 h-3.5 text-zinc-400" />
        <span>Копировать текст</span>
      </div>
      <span className="text-[10px] text-zinc-500 font-mono">⌘C</span>
    </button>

    {/* Additional Utilities Flyout Submenu */}
    <button
      onMouseEnter={(e) => onTriggerMouseEnter('more', e)}
      onMouseLeave={onTriggerMouseLeave}
      onClick={(e) => onTriggerClick('more', e)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
        activeSubmenu === 'more' ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <MoreVertical className="w-3.5 h-3.5 text-zinc-400" />
        <span>Дополнительно</span>
      </div>
      <ChevronRight className="w-3 h-3 text-zinc-500" />
    </button>

    <div className="my-0.5 border-t border-white/[0.06]" />

    {/* Danger Zone */}
    <button
      onMouseEnter={onOtherItemMouseEnter}
      onClick={onDelete}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Trash2 className="w-3.5 h-3.5" />
        <span>Удалить</span>
      </div>
      <span className="text-[10px] text-rose-400/60 font-mono">⌫</span>
    </button>
  </>
);
