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
      className="fixed inset-0 z-50 z-[110] bg-black/60 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full bg-[#161619] border-t border-white/[0.08] rounded-t-3xl p-4 flex flex-col gap-2.5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'max(var(--sab), 1rem)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto shrink-0 mb-1" />

        {/* Header */}
        <div className="px-1 py-1 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {item.type === 'task' && <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />}
            {item.type === 'article' && <FileText className="w-4 h-4 text-blue-400 shrink-0" />}
            {item.type === 'note' && <StickyNote className="w-4 h-4 text-zinc-400 shrink-0" />}
            <span className="text-sm font-semibold text-white truncate">
              {item.title || item.content.slice(0, 40) || 'Без названия'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
            {item.folder}
          </span>
        </div>

        {/* Quick Actions Horizontal Bar (4 Large Touch Tiles) */}
        <div className="grid grid-cols-4 gap-2 pt-1 pb-1">
          <button
            onClick={actions.handleReply}
            className="py-2 px-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 text-zinc-300 cursor-pointer h-15"
          >
            <CornerUpLeft className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-[10px] font-medium leading-tight text-center">Ответить</span>
          </button>

          <button
            onClick={actions.handleOpenFocus}
            className="py-2 px-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 text-zinc-300 cursor-pointer h-15"
          >
            <Maximize2 className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-[10px] font-medium leading-tight text-center max-w-[68px]">
              Фокус-редактор
            </span>
          </button>

          <button
            onClick={actions.handleTogglePin}
            className="py-2 px-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 text-zinc-300 cursor-pointer h-15"
          >
            <Pin
              className={`w-4 h-4 shrink-0 ${
                item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'
              }`}
            />
            <span className="text-[10px] font-medium leading-tight text-center max-w-[68px]">
              {item.isPinned ? 'Открепить' : 'Закрепить'}
            </span>
          </button>

          <button
            onClick={actions.handleCopyMarkdown}
            className="py-2 px-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 text-zinc-300 cursor-pointer h-15"
          >
            <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-[10px] font-medium leading-tight text-center max-w-[68px]">
              Копировать текст
            </span>
          </button>
        </div>

        {/* AI Action Banner */}
        <button
          onClick={actions.handleAiDecompose}
          className="w-full h-11 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] active:scale-[0.98] flex items-center justify-between text-xs text-zinc-200 transition-all cursor-pointer font-medium"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Разобрать с ИИ</span>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">AI</span>
        </button>

        {/* Secondary Utilities */}
        <div className="flex flex-col gap-1">
          <button
            onClick={actions.handleDuplicate}
            className="w-full h-10 px-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] active:scale-[0.98] flex items-center gap-2.5 text-xs text-zinc-300 transition-all cursor-pointer"
          >
            <CopyPlus className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Дублировать</span>
          </button>

          <button
            onClick={actions.handleCopyLink}
            className="w-full h-10 px-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] active:scale-[0.98] flex items-center gap-2.5 text-xs text-zinc-300 transition-all cursor-pointer"
          >
            <Link2 className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Копировать [[линк]]</span>
          </button>

          <button
            onClick={actions.handleToggleArchive}
            className="w-full h-10 px-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] active:scale-[0.98] flex items-center gap-2.5 text-xs text-zinc-300 transition-all cursor-pointer"
          >
            <Archive className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>{item.isArchived ? 'Разархивировать' : 'В архив'}</span>
          </button>

          {/* Danger Zone */}
          <button
            onClick={actions.handleDelete}
            className="w-full h-10 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] flex items-center gap-2.5 text-xs text-rose-400 transition-all cursor-pointer mt-1"
          >
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Удалить</span>
          </button>
        </div>

        {/* Cancel Button */}
        <button
          onClick={handleClose}
          className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/10 active:scale-[0.98] text-white font-medium text-xs flex items-center justify-center transition-all cursor-pointer mt-0.5"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
