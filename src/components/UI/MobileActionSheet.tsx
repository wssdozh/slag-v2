import React from 'react';
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
  } = useApp();

  const handleClose = () => {
    setMobileActionSheetItem(null);
  };

  const actions = useItemActions(mobileActionSheetItem, handleClose);

  if (!mobileActionSheetItem) return null;

  const item = mobileActionSheetItem;

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full bg-[#121215] border-t border-white/[0.08] rounded-t-2xl p-3 flex flex-col gap-2 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'max(var(--sab), 0.75rem)' }}
      >
        {/* Drag handle */}
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto shrink-0 mb-1" />

        {/* Item Title Header */}
        <div className="px-3 py-1.5 flex items-center justify-between border-b border-white/[0.05]">
          <div className="flex items-center gap-2 min-w-0">
            {item.type === 'task' && <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            {item.type === 'article' && <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
            {item.type === 'note' && <StickyNote className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
            <span className="text-xs font-semibold text-zinc-200 truncate">
              {item.title || item.content.slice(0, 40) || 'Без названия'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
            {item.folder}
          </span>
        </div>

        {/* Single Unified Linear-style Action List (Zero-Matryoshka) */}
        <div className="flex flex-col rounded-xl overflow-hidden divide-y divide-white/[0.04] border border-white/[0.05] bg-[#161619]/60">
          <button
            onClick={actions.handleReply}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <CornerUpLeft className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="font-medium">Ответить</span>
          </button>

          <button
            onClick={actions.handleOpenFocus}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <Maximize2 className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="font-medium">Фокус-редактор</span>
          </button>

          <button
            onClick={actions.handleTogglePin}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <Pin className={`w-4 h-4 shrink-0 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'}`} />
            <span className="font-medium">{item.isPinned ? 'Открепить' : 'Закрепить'}</span>
          </button>

          <button
            onClick={actions.handleCopyMarkdown}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="font-medium">Копировать текст</span>
          </button>

          <button
            onClick={actions.handleAiDecompose}
            className="w-full h-10 px-3.5 flex items-center justify-between text-xs text-zinc-200 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="font-medium">Разобрать с ИИ</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">AI</span>
          </button>

          <button
            onClick={actions.handleDuplicate}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <CopyPlus className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Дублировать</span>
          </button>

          <button
            onClick={actions.handleCopyLink}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <Link2 className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Копировать [[линк]]</span>
          </button>

          <button
            onClick={actions.handleToggleArchive}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-zinc-300 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left"
          >
            <Archive className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>{item.isArchived ? 'Разархивировать' : 'В архив'}</span>
          </button>

          <button
            onClick={actions.handleDelete}
            className="w-full h-10 px-3.5 flex items-center gap-3 text-xs text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/15 transition-colors cursor-pointer text-left"
          >
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-medium">Удалить</span>
          </button>
        </div>

        {/* Cancel Button */}
        <button
          onClick={handleClose}
          className="w-full h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] active:bg-white/10 text-zinc-300 hover:text-white font-medium text-xs flex items-center justify-center transition-all cursor-pointer"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
