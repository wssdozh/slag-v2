import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { SlagItemType } from '../../types';
import {
  Maximize2,
  Trash2,
  FolderInput,
  Copy,
  CheckSquare,
  FileText,
  StickyNote,
  CornerUpLeft,
  Pin,
  Check,
  ChevronRight
} from 'lucide-react';

export const MobileActionSheet: React.FC = () => {
  const {
    mobileActionSheetItem,
    setMobileActionSheetItem,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    deleteItem,
    updateItem,
    folders,
    moveItem,
    setReplyTarget,
    addToast
  } = useApp();

  const [isMoveFolderOpen, setIsMoveFolderOpen] = useState(false);
  const [isTypeSelectOpen, setIsTypeSelectOpen] = useState(false);

  if (!mobileActionSheetItem) return null;

  const item = mobileActionSheetItem;

  const handleClose = () => {
    setIsMoveFolderOpen(false);
    setIsTypeSelectOpen(false);
    setMobileActionSheetItem(null);
  };

  const handleOpenFocus = () => {
    setSelectedItem(item);
    setIsFullscreenEditorOpen(true);
    handleClose();
  };

  const handleReply = () => {
    setReplyTarget(item);
    handleClose();
    addToast('Ответ на заметку', 'info');
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(item.content);
    addToast('Markdown скопирован', 'success');
    handleClose();
  };

  const handleTogglePin = () => {
    updateItem({ ...item, isPinned: !item.isPinned });
    addToast(item.isPinned ? 'Запись откреплена' : 'Запись закреплена', 'success');
    handleClose();
  };

  const handleChangeType = (newType: SlagItemType) => {
    updateItem({ ...item, type: newType });
    addToast(
      `Превращено в: ${newType === 'task' ? 'таску' : newType === 'article' ? 'статью' : 'заметку'}`,
      'success'
    );
    handleClose();
  };

  const handleDelete = () => {
    deleteItem(item.id);
    addToast('Запись перемещена в корзину', 'info');
    handleClose();
  };

  const handleMoveToFolder = (targetFolder: string) => {
    moveItem(item.id, targetFolder);
    addToast(`Перемещено в «${targetFolder}»`, 'success');
    handleClose();
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full bg-[#18181c] border-t border-white/[0.08] rounded-t-3xl p-4 flex flex-col gap-2 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'max(var(--sab), 1rem)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2 shrink-0" />

        {/* Item Title / Snippet Header */}
        <div className="px-2 py-1.5 border-b border-white/[0.06] mb-1">
          <div className="flex items-center gap-2">
            {item.type === 'task' && <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />}
            {item.type === 'article' && <FileText className="w-4 h-4 text-blue-400 shrink-0" />}
            {item.type === 'note' && <StickyNote className="w-4 h-4 text-zinc-400 shrink-0" />}
            <span className="text-sm font-semibold text-white truncate">
              {item.title || item.content.slice(0, 40) || 'Без названия'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 mt-0.5 block">
            {item.folder}
          </span>
        </div>

        {/* Sub-view: Move to Folder */}
        {isMoveFolderOpen ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 py-1 text-xs text-zinc-400 font-mono">
              <span>Выберите папку:</span>
              <button
                onClick={() => setIsMoveFolderOpen(false)}
                className="text-blue-400 hover:underline cursor-pointer"
              >
                Назад
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto py-1">
              {folders.map(f => (
                <button
                  key={f.path}
                  onClick={() => handleMoveToFolder(f.path)}
                  className={`w-full h-12 px-3 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    item.folder === f.path
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="truncate">{f.name}</span>
                  {item.folder === f.path && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        ) : isTypeSelectOpen ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 py-1 text-xs text-zinc-400 font-mono">
              <span>Сменить тип:</span>
              <button
                onClick={() => setIsTypeSelectOpen(false)}
                className="text-blue-400 hover:underline cursor-pointer"
              >
                Назад
              </button>
            </div>
            <div className="flex flex-col gap-1 py-1">
              {(['note', 'task', 'article'] as SlagItemType[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleChangeType(t)}
                  className={`w-full h-12 px-3 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    item.type === t
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {t === 'task' && <CheckSquare className="w-4 h-4 text-amber-400" />}
                    {t === 'article' && <FileText className="w-4 h-4 text-blue-400" />}
                    {t === 'note' && <StickyNote className="w-4 h-4 text-zinc-400" />}
                    <span className="capitalize">{t === 'task' ? 'Таска' : t === 'article' ? 'Статья' : 'Заметка'}</span>
                  </div>
                  {item.type === t && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Main Action Buttons (Min height 48px for thumb ergonomics) */
          <div className="flex flex-col gap-1">
            <button
              onClick={handleOpenFocus}
              className="w-full h-12 px-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] flex items-center gap-3 text-sm text-zinc-200 transition-all cursor-pointer"
            >
              <Maximize2 className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Открыть в редакторе</span>
            </button>

            <button
              onClick={handleReply}
              className="w-full h-12 px-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] flex items-center gap-3 text-sm text-zinc-200 transition-all cursor-pointer"
            >
              <CornerUpLeft className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Ответить</span>
            </button>

            <button
              onClick={handleTogglePin}
              className="w-full h-12 px-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] flex items-center gap-3 text-sm text-zinc-200 transition-all cursor-pointer"
            >
              <Pin className={`w-4 h-4 shrink-0 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'}`} />
              <span>{item.isPinned ? 'Открепить запись' : 'Закрепить вверху'}</span>
            </button>

            <button
              onClick={() => setIsTypeSelectOpen(true)}
              className="w-full h-12 px-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] flex items-center justify-between text-sm text-zinc-200 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <CheckSquare className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Сменить тип</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>

            <button
              onClick={() => setIsMoveFolderOpen(true)}
              className="w-full h-12 px-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] flex items-center justify-between text-sm text-zinc-200 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <FolderInput className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Переместить в папку</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>

            <button
              onClick={handleCopyMarkdown}
              className="w-full h-12 px-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] active:scale-[0.98] flex items-center gap-3 text-sm text-zinc-200 transition-all cursor-pointer"
            >
              <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>Скопировать Markdown</span>
            </button>

            <button
              onClick={handleDelete}
              className="w-full h-12 px-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.98] flex items-center gap-3 text-sm text-rose-400 transition-all cursor-pointer mt-1"
            >
              <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Удалить в корзину</span>
            </button>
          </div>
        )}

        {/* Cancel Button */}
        <button
          onClick={handleClose}
          className="w-full h-12 rounded-2xl bg-white/[0.06] hover:bg-white/10 active:scale-[0.98] text-white font-medium text-sm flex items-center justify-center transition-all cursor-pointer mt-2"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};
