import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Maximize2,
  Trash2,
  Copy,
  FolderPlus,
  Edit2,
  Search,
  CheckSquare,
  FileText,
  StickyNote,
  CornerUpLeft,
  Link2,
  Pin,
  ChevronRight,
  ChevronDown,
  Sparkles,
  CopyPlus,
  Archive,
  Info,
  MoreHorizontal,
} from 'lucide-react';
import { useItemActions } from '../../hooks/useItemActions';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    openCreateFolderModal,
    openEditFolderModal,
    openFolderInfoModal,
    deleteFolder,
    setIsSearchOpen,
    saveItem,
    currentFolder,
  } = useApp();

  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const actions = useItemActions(contextMenu?.item, closeContextMenu);

  if (!contextMenu) return null;

  const { x, y, type, item, folder } = contextMenu;

  // Viewport clamping
  const menuWidth = 240;
  const menuHeight = 280;
  const clampedX = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(Math.max(8, y), window.innerHeight - menuHeight - 8);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-50 z-[110] w-60 max-h-[calc(100vh-24px)] overflow-y-auto scrollbar-thin rounded-xl bg-[#121215]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {type === 'item' && item && (
        <>
          {/* Quick Primary Actions */}
          <button
            onClick={actions.handleReply}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <CornerUpLeft className="w-3.5 h-3.5 text-zinc-400" />
              <span>Ответить</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">R</span>
          </button>

          <button
            onClick={actions.handleOpenFocus}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Фокус-редактор</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘E</span>
          </button>

          <button
            onClick={actions.handleTogglePin}
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
              onClick={actions.handleCompleteTaskForever}
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
            onClick={actions.handleAiDecompose}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span>Разобрать с ИИ</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">AI</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Clipboard & Additional Utilities */}
          <button
            onClick={actions.handleCopyMarkdown}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>Копировать текст</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘C</span>
          </button>

          <button
            onClick={() => setIsMoreOpen(prev => !prev)}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <MoreHorizontal className="w-3.5 h-3.5 text-zinc-400" />
              <span>Дополнительно</span>
            </div>
            {isMoreOpen ? (
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            )}
          </button>

          {isMoreOpen && (
            <div className="px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5">
              <button
                onClick={actions.handleCopyLink}
                className="flex items-center justify-between px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Link2 className="w-3 h-3 text-zinc-400" />
                  <span>Копировать [[линк]]</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">⌘L</span>
              </button>

              <button
                onClick={actions.handleDuplicate}
                className="flex items-center justify-between px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CopyPlus className="w-3 h-3 text-zinc-400" />
                  <span>Дублировать</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">⌘D</span>
              </button>

              <button
                onClick={actions.handleToggleArchive}
                className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Archive className="w-3 h-3 text-zinc-400" />
                <span>{item.isArchived ? 'Разархивировать' : 'В архив'}</span>
              </button>
            </div>
          )}

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Danger Zone */}
          <button
            onClick={actions.handleDelete}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </div>
            <span className="text-[10px] text-rose-400/60 font-mono">⌫</span>
          </button>
        </>
      )}

      {type === 'folder' && folder && (
        <>
          <button
            onClick={() => {
              openFolderInfoModal(folder.path);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>Информация и медиа</span>
          </button>

          <button
            onClick={() => {
              openCreateFolderModal(folder.path);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Создать подпапку</span>
          </button>

          <button
            onClick={() => {
              openEditFolderModal(folder);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Иконка и описание</span>
          </button>

          {folder.path !== 'Входящие' && (
            <>
              <div className="my-0.5 border-t border-white/[0.06]" />
              <button
                onClick={() => {
                  deleteFolder(folder.path);
                  closeContextMenu();
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить папку</span>
              </button>
            </>
          )}
        </>
      )}

      {type === 'feed' && (
        <>
          <button
            onClick={() => {
              saveItem({ type: 'note', title: 'Быстрая заметка', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
            <span>Новая заметка</span>
          </button>

          <button
            onClick={() => {
              saveItem({ type: 'task', title: 'Новая задача', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Новая таска</span>
          </button>

          <button
            onClick={() => {
              saveItem({ type: 'article', title: 'Новая статья', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Новая статья</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          <button
            onClick={() => {
              setIsSearchOpen(true);
              closeContextMenu();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span>Поиск</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘K</span>
          </button>
        </>
      )}
    </div>
  );
};
