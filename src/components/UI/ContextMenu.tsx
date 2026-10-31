import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Sparkles,
  CopyPlus,
  Archive,
  Info,
  MoreHorizontal,
  Check,
} from 'lucide-react';
import { useItemActions, TYPE_LABELS } from '../../hooks/useItemActions';

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

  const [activeSubmenu, setActiveSubmenu] = useState<'more' | 'type' | null>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const actions = useItemActions(contextMenu?.item, closeContextMenu);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Keyboard navigation & quick shortcuts while context menu is open
  useEffect(() => {
    if (!contextMenu || contextMenu.type !== 'item' || !contextMenu.item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (!mod) {
        // Fast Type Switching keys: 1 (Note), 2 (Task), 3 (Article)
        if (e.code === 'Digit1' || e.key === '1') {
          e.preventDefault();
          actions.handleChangeType('note');
          return;
        }
        if (e.code === 'Digit2' || e.key === '2') {
          e.preventDefault();
          actions.handleChangeType('task');
          return;
        }
        if (e.code === 'Digit3' || e.key === '3') {
          e.preventDefault();
          actions.handleChangeType('article');
          return;
        }

        // Quick letter shortcuts
        if (e.code === 'KeyN' || e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'т') {
          e.preventDefault();
          actions.handleChangeType('note');
          return;
        }
        if (e.code === 'KeyT' || e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'е') {
          e.preventDefault();
          actions.handleChangeType('task');
          return;
        }
        if (e.code === 'KeyA' || e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'ф') {
          e.preventDefault();
          actions.handleChangeType('article');
          return;
        }
        if (e.code === 'KeyR' || e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'к') {
          e.preventDefault();
          actions.handleReply();
          return;
        }
        if (e.code === 'KeyP' || e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'з') {
          e.preventDefault();
          actions.handleTogglePin();
          return;
        }
      }

      if (mod && (e.code === 'KeyE' || e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'у')) {
        e.preventDefault();
        actions.handleOpenFocus();
        return;
      }
      if (mod && (e.code === 'KeyD' || e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'в')) {
        e.preventDefault();
        actions.handleDuplicate();
        return;
      }
      if (mod && (e.code === 'KeyL' || e.key.toLowerCase() === 'l' || e.key.toLowerCase() === 'д')) {
        e.preventDefault();
        actions.handleCopyLink();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        actions.handleDelete();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu, actions]);

  const handleTriggerMouseEnter = useCallback((name: 'more' | 'type', e: React.MouseEvent<HTMLButtonElement>) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setTriggerRect(e.currentTarget.getBoundingClientRect());
    setActiveSubmenu(name);
  }, []);

  const handleTriggerMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 150);
  }, []);

  const handleTriggerClick = useCallback((name: 'more' | 'type', e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setTriggerRect(e.currentTarget.getBoundingClientRect());
    setActiveSubmenu(name);
  }, []);

  const handleSubmenuMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  }, []);

  const handleSubmenuMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 150);
  }, []);

  const handleOtherItemMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setActiveSubmenu(null);
  }, []);

  if (!contextMenu) return null;

  const { x, y, type, item, folder } = contextMenu;

  // Viewport clamping
  const menuWidth = 240;
  const menuHeight = 280;
  const clampedX = Math.min(Math.max(8, x), window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(Math.max(8, y), window.innerHeight - menuHeight - 8);

  // Submenu geometry calculation
  const submenuWidth = 192;
  const gap = 4;
  const margin = 8;
  const spaceRight = window.innerWidth - (clampedX + menuWidth + gap + margin);
  const submenuDirection: 'right' | 'left' = spaceRight >= submenuWidth ? 'right' : 'left';
  const submenuX = submenuDirection === 'right' ? menuWidth + gap : -(submenuWidth + gap);

  // Vertical alignment clamped to screen
  const rawTop = triggerRect ? triggerRect.top - clampedY : 0;
  const submenuHeight = 120;
  const maxTop = window.innerHeight - margin - clampedY - submenuHeight;
  const submenuY = Math.max(0, Math.min(rawTop, maxTop));

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      className="fixed z-50 z-[110]"
    >
      {/* Main Menu Container */}
      <div className="w-60 max-h-[calc(100vh-24px)] overflow-y-auto scrollbar-thin rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100">
        {type === 'item' && item && (
          <>
            {/* Quick Primary Actions */}
            <button
              onMouseEnter={handleOtherItemMouseEnter}
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
              onMouseEnter={handleOtherItemMouseEnter}
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
              onMouseEnter={handleOtherItemMouseEnter}
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
                onMouseEnter={handleOtherItemMouseEnter}
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
              onMouseEnter={handleOtherItemMouseEnter}
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

            {/* Quick Type Switching Flyout Submenu */}
            <button
              onMouseEnter={(e) => handleTriggerMouseEnter('type', e)}
              onMouseLeave={handleTriggerMouseLeave}
              onClick={(e) => handleTriggerClick('type', e)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
                activeSubmenu === 'type' ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {item.type === 'task' ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : item.type === 'article' ? (
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
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

            {/* Clipboard */}
            <button
              onMouseEnter={handleOtherItemMouseEnter}
              onClick={actions.handleCopyMarkdown}
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
              onMouseEnter={(e) => handleTriggerMouseEnter('more', e)}
              onMouseLeave={handleTriggerMouseLeave}
              onClick={(e) => handleTriggerClick('more', e)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left cursor-pointer ${
                activeSubmenu === 'more' ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <MoreHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                <span>Дополнительно</span>
              </div>
              <ChevronRight className="w-3 h-3 text-zinc-500" />
            </button>

            <div className="my-0.5 border-t border-white/[0.06]" />

            {/* Danger Zone */}
            <button
              onMouseEnter={handleOtherItemMouseEnter}
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

      {/* Side Submenu Panel: Quick Type Change */}
      {type === 'item' && item && activeSubmenu === 'type' && (
        <div
          style={{ left: `${submenuX}px`, top: `${submenuY}px` }}
          onMouseEnter={handleSubmenuMouseEnter}
          onMouseLeave={handleSubmenuMouseLeave}
          className="absolute z-[120] w-48 rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Bridge hit-area */}
          <div
            className={`absolute top-0 bottom-0 w-3 pointer-events-auto ${
              submenuDirection === 'right' ? '-left-2' : '-right-2'
            }`}
          />

          <button
            onClick={() => actions.handleChangeType('note')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left cursor-pointer ${
              item.type === 'note' ? 'text-white bg-white/[0.06]' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
              <span>Заметка</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-mono">1</span>
              {item.type === 'note' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
            </div>
          </button>

          <button
            onClick={() => actions.handleChangeType('task')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left cursor-pointer ${
              item.type === 'task' ? 'text-amber-300 bg-amber-400/10' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
              <span>Таска</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-mono">2</span>
              {item.type === 'task' && <Check className="w-3.5 h-3.5 text-amber-400" />}
            </div>
          </button>

          <button
            onClick={() => actions.handleChangeType('article')}
            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-left cursor-pointer ${
              item.type === 'article' ? 'text-blue-300 bg-blue-400/10' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Статья</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-mono">3</span>
              {item.type === 'article' && <Check className="w-3.5 h-3.5 text-blue-400" />}
            </div>
          </button>
        </div>
      )}

      {/* Side Submenu Panel: Additional Utilities */}
      {type === 'item' && item && activeSubmenu === 'more' && (
        <div
          style={{ left: `${submenuX}px`, top: `${submenuY}px` }}
          onMouseEnter={handleSubmenuMouseEnter}
          onMouseLeave={handleSubmenuMouseLeave}
          className="absolute z-[120] w-48 rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl p-1 text-xs text-zinc-300 flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Bridge hit-area */}
          <div
            className={`absolute top-0 bottom-0 w-3 pointer-events-auto ${
              submenuDirection === 'right' ? '-left-2' : '-right-2'
            }`}
          />

          <button
            onClick={actions.handleCopyLink}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Копировать [[линк]]</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘L</span>
          </button>

          <button
            onClick={actions.handleDuplicate}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <CopyPlus className="w-3.5 h-3.5 text-zinc-400" />
              <span>Дублировать</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">⌘D</span>
          </button>

          <button
            onClick={actions.handleToggleArchive}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-zinc-400" />
            <span>{item.isArchived ? 'Разархивировать' : 'В архив'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
