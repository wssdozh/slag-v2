import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Maximize2,
  Trash2,
  FolderInput,
  Copy,
  FolderPlus,
  Edit2,
  Search,
  CheckSquare,
  FileText,
  StickyNote
} from 'lucide-react';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    setSelectedItem,
    setIsFullscreenEditorOpen,
    deleteItem,
    openCreateFolderModal,
    openEditFolderModal,
    deleteFolder,
    setIsSearchOpen,
    saveItem,
    currentFolder,
    folders,
    moveItem,
    addToast
  } = useApp();

  if (!contextMenu) return null;

  const { x, y, type, item, folder } = contextMenu;

  // Clamp position within viewport
  const menuWidth = 190;
  const menuHeight = 220;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const handleOpenFocus = () => {
    if (item) {
      setSelectedItem(item);
      setIsFullscreenEditorOpen(true);
    }
    closeContextMenu();
  };

  const handleCopyMarkdown = () => {
    if (item) {
      navigator.clipboard.writeText(item.content);
      addToast('Markdown скопирован', 'success');
    }
    closeContextMenu();
  };

  const handleDeleteItem = () => {
    if (item) {
      deleteItem(item.id);
    }
    closeContextMenu();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-50 w-48 rounded-xl bg-[#141417]/95 backdrop-blur-md border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {type === 'item' && item && (
        <>
          <button
            onClick={handleOpenFocus}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Фокус-редактор</span>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
            <span>Копировать текст</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Quick Move Submenu */}
          <div className="px-2.5 py-1 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
            В папку:
          </div>
          {folders.filter(f => f.path !== item.folder).slice(0, 4).map(f => (
            <button
              key={f.path}
              onClick={() => {
                moveItem(item.id, f.path);
                closeContextMenu();
              }}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors text-left truncate"
            >
              <FolderInput className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}

          <div className="my-0.5 border-t border-white/[0.06]" />

          <button
            onClick={handleDeleteItem}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Удалить</span>
          </button>
        </>
      )}

      {type === 'folder' && folder && (
        <>
          <button
            onClick={() => {
              openCreateFolderModal(folder.path);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Создать подпапку</span>
          </button>

          <button
            onClick={() => {
              openEditFolderModal(folder);
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
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
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left"
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
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
            <span>Новая заметка</span>
          </button>

          <button
            onClick={() => {
              saveItem({ type: 'task', title: 'Новая задача', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Новая таска</span>
          </button>

          <button
            onClick={() => {
              saveItem({ type: 'article', title: 'Новая статья', content: '', folder: currentFolder });
              closeContextMenu();
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
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
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span>Поиск (⌘K)</span>
          </button>
        </>
      )}
    </div>
  );
};
