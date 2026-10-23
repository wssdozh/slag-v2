import React, { useState } from 'react';
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
  StickyNote,
  CornerUpLeft,
  Link2,
  Pin,
  ChevronRight,
  ChevronDown,
  Repeat,
  Check
} from 'lucide-react';
import type { SlagItemType } from '../../types';

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
    updateItem,
    currentFolder,
    folders,
    moveItem,
    setReplyTarget,
    addToast
  } = useApp();

  const [isMoveSubmenuOpen, setIsMoveSubmenuOpen] = useState(false);
  const [isTypeSubmenuOpen, setIsTypeSubmenuOpen] = useState(false);

  if (!contextMenu) return null;

  const { x, y, type, item, folder } = contextMenu;

  // Viewport clamping
  const menuWidth = 224; // w-56
  const menuHeight = 320;
  const clampedX = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(Math.max(8, y), window.innerHeight - menuHeight - 8);

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

  const handleTogglePin = () => {
    if (item) {
      updateItem({ ...item, isPinned: !item.isPinned });
      addToast(item.isPinned ? 'Запись откреплена' : 'Запись закреплена', 'success');
    }
    closeContextMenu();
  };

  const handleChangeType = (newType: SlagItemType) => {
    if (item) {
      updateItem({ ...item, type: newType });
      addToast(`Превращено в: ${newType === 'task' ? 'таску' : newType === 'article' ? 'статью' : 'заметку'}`, 'success');
    }
    closeContextMenu();
  };

  const handleDeleteItem = () => {
    if (item) {
      deleteItem(item.id);
      addToast('Запись удалена', 'info');
    }
    closeContextMenu();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-50 z-[110] w-56 rounded-xl bg-[#121215]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {type === 'item' && item && (
        <>
          {/* Quick Actions */}
          <button
            onClick={() => {
              setReplyTarget(item);
              closeContextMenu();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <CornerUpLeft className="w-3.5 h-3.5 text-zinc-400" />
              <span>Ответить</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">R</span>
          </button>

          <button
            onClick={handleOpenFocus}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Maximize2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Фокус-редактор</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘E</span>
          </button>

          <button
            onClick={handleTogglePin}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Pin className={`w-3.5 h-3.5 ${item.isPinned ? 'text-amber-400 rotate-45' : 'text-zinc-400'}`} />
              <span>{item.isPinned ? 'Открепить' : 'Закрепить'}</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">P</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Type Conversion */}
          <button
            onClick={() => setIsTypeSubmenuOpen(!isTypeSubmenuOpen)}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5 text-zinc-400" />
              <span>Сменить тип</span>
            </div>
            {isTypeSubmenuOpen ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
          </button>

          {isTypeSubmenuOpen && (
            <div className="px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5">
              {item.type !== 'note' && (
                <button
                  onClick={() => handleChangeType('note')}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <StickyNote className="w-3 h-3 text-zinc-400" />
                  <span>Превратить в заметку</span>
                </button>
              )}
              {item.type !== 'task' && (
                <button
                  onClick={() => handleChangeType('task')}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <CheckSquare className="w-3 h-3 text-amber-400" />
                  <span>Превратить в таску</span>
                </button>
              )}
              {item.type !== 'article' && (
                <button
                  onClick={() => handleChangeType('article')}
                  className="flex items-center gap-2 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <FileText className="w-3 h-3 text-blue-400" />
                  <span>Превратить в статью</span>
                </button>
              )}
            </div>
          )}

          {/* Move to folder */}
          <button
            onClick={() => setIsMoveSubmenuOpen(!isMoveSubmenuOpen)}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <FolderInput className="w-3.5 h-3.5 text-zinc-400" />
              <span>Переместить в папку</span>
            </div>
            {isMoveSubmenuOpen ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
          </button>

          {isMoveSubmenuOpen && (
            <div className="max-h-36 overflow-y-auto px-1 py-1 flex flex-col gap-0.5 bg-white/[0.02] rounded-lg border border-white/[0.04] my-0.5">
              {folders.map(f => {
                const isCurrent = f.path === item.folder;
                return (
                  <button
                    key={f.path}
                    onClick={() => {
                      moveItem(item.id, f.path);
                      addToast(`Перемещено в «${f.name}»`, 'success');
                      closeContextMenu();
                    }}
                    disabled={isCurrent}
                    className={`flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                      isCurrent
                        ? 'text-zinc-500 opacity-60 cursor-default'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="truncate">{f.name}</span>
                    {isCurrent && <Check className="w-3 h-3 text-zinc-500 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Copying */}
          <button
            onClick={() => {
              const linkText = `[[${item.title || item.id}]]`;
              navigator.clipboard.writeText(linkText);
              addToast(`Скопирован: ${linkText}`, 'success');
              closeContextMenu();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Копировать [[линк]]</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘L</span>
          </button>

          <button
            onClick={handleCopyMarkdown}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
              <span>Копировать текст</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘C</span>
          </button>

          <div className="my-0.5 border-t border-white/[0.06]" />

          {/* Delete */}
          <button
            onClick={handleDeleteItem}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left"
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
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left"
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
