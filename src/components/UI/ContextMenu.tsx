// Right-click menu for items, folders and feed rows: sections, submenus and hover bridge.
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/storage';
import { useItemActions } from '../../hooks/useItemActions';
import { usePresence } from '../../hooks/ui/usePresence';
import { ItemMenuSections } from './menu/itemMenuSections';
import { FolderMenuSections } from './menu/folderMenuSections';
import { FeedMenuSections } from './menu/feedMenuSections';
import { MenuSubmenus } from './menu/MenuSubmenus';
import type { MenuSubmenuName } from './menu/MenuSubmenus';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu,
    closeContextMenu,
    openCreateFolderModal,
    openFolderInfoModal,
    openFolderInExplorer,
    deleteFolder,
    setIsSearchOpen,
    saveItem,
    addToast,
    currentFolder,
  } = useApp();

  const isOpen = contextMenu !== null;
  const { ref: menuRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);

  // Retain the target while exiting so it fades out with its content instead of vanishing
  const [cachedTarget, setCachedTarget] = useState(contextMenu);
  if (contextMenu && contextMenu !== cachedTarget) {
    setCachedTarget(contextMenu);
  }
  const activeTarget = contextMenu || cachedTarget;

  const [activeSubmenu, setActiveSubmenu] = useState<MenuSubmenuName | null>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const [prevContextMenu, setPrevContextMenu] = useState(contextMenu);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Rendered height of the current target's panel. Entries differ per target, so a
  // constant clamp let the last row sit below the window edge.
  const [panelHeight, setPanelHeight] = useState(0);

  // Synchronously reset submenu state when the menu target changes
  if (contextMenu !== prevContextMenu) {
    setPrevContextMenu(contextMenu);
    if (contextMenu) {
      setActiveSubmenu(null);
      setTriggerRect(null);
      setPanelHeight(0);
    }
  }

  // Measure before paint so the menu never flashes at the wrong edge.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Border-box height, so the clamp accounts for the panel's border as well.
    const height = panel.getBoundingClientRect().height;
    setPanelHeight(current => (current === height ? current : height));
  }, [isOpen, activeTarget]);

  const actions = useItemActions(contextMenu?.item, closeContextMenu);

  // Cancel pending submenu changes when logical ownership ends, not after exit.
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [isOpen]);

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
        if (e.code === 'KeyO' || e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'щ') {
          e.preventDefault();
          actions.handleOpenInExplorer();
          return;
        }
      }

      if (mod && (e.code === 'KeyO' || e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'щ')) {
        e.preventDefault();
        actions.handleOpenInExplorer();
        return;
      }
      if (mod && (e.code === 'KeyE' || e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'у')) {
        e.preventDefault();
        actions.handleOpenFocus();
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

  const handleTriggerMouseEnter = useCallback((name: MenuSubmenuName, e: React.MouseEvent<HTMLButtonElement>) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setTriggerRect(e.currentTarget.getBoundingClientRect());
    setActiveSubmenu(name);
  }, []);

  const handleTriggerMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveSubmenu(null);
    }, 150);
  }, []);

  const handleTriggerClick = useCallback((name: MenuSubmenuName, e: React.MouseEvent<HTMLButtonElement>) => {
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

  const handleOpenSearch = useCallback(() => setIsSearchOpen(true), [setIsSearchOpen]);

  const handleOpenFolder = useCallback((path: string) => {
    openFolderInExplorer(path);
    closeContextMenu();
  }, [openFolderInExplorer, closeContextMenu]);

  const handleCopyFolderFullPath = useCallback(async (path: string) => {
    const fullPath = await storage.getFolderAbsolutePath(path);
    navigator.clipboard.writeText(fullPath);
    addToast('Путь к папке скопирован', 'success');
    closeContextMenu();
  }, [addToast, closeContextMenu]);

  const handleCopyFolderPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    addToast(`Путь скопирован: ${path}`, 'success');
    closeContextMenu();
  }, [addToast, closeContextMenu]);

  if (!isPresent || !activeTarget) return null;

  const { x, y, type, item, folder } = activeTarget;

  // Viewport clamping
  const menuWidth = 240;
  const margin = 8;
  const menuHeight = panelHeight > 0 ? panelHeight : window.innerHeight - margin * 2;
  const clampedX = Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin));

  // Open toward the side that has room; if neither fits, scroll inside the larger one.
  const anchorY = Math.max(margin, Math.min(y, window.innerHeight - margin));
  const spaceBelow = window.innerHeight - anchorY - margin;
  const spaceAbove = anchorY - margin;
  let menuTop = anchorY;
  let menuMaxHeight = window.innerHeight - margin * 2;
  if (menuHeight > spaceBelow) {
    if (menuHeight <= spaceAbove) {
      menuTop = anchorY - menuHeight;
    } else if (spaceAbove > spaceBelow) {
      menuTop = margin;
      menuMaxHeight = spaceAbove;
    } else {
      menuMaxHeight = spaceBelow;
    }
  }

  // Submenu geometry calculation based on active trigger button rect
  let submenuWidth = 192;
  let submenuHeight = 120;
  if (activeSubmenu === 'explorer') {
    submenuWidth = 256;
    submenuHeight = 156;
  } else if (activeSubmenu === 'type') {
    submenuWidth = 176;
    submenuHeight = 116;
  } else if (activeSubmenu === 'more') {
    submenuWidth = 192;
    submenuHeight = 116;
  }

  const gap = 4;
  let submenuX = 0;
  let submenuY = 0;
  let submenuDirection: 'right' | 'left' = 'right';

  if (triggerRect) {
    const spaceRight = window.innerWidth - (triggerRect.right + gap + margin);
    const spaceLeft = triggerRect.left - gap - margin;
    const openRight = spaceRight >= submenuWidth || spaceRight >= spaceLeft;
    submenuX = openRight ? triggerRect.right + gap : triggerRect.left - submenuWidth - gap;
    // Never let a flyout leave the viewport on either axis.
    submenuX = Math.max(margin, Math.min(submenuX, window.innerWidth - submenuWidth - margin));
    submenuDirection = submenuX < triggerRect.left ? 'left' : 'right';
    // Align top with the trigger button (with a 4px optical inset)
    const idealY = triggerRect.top - 4;
    submenuY = Math.max(margin, Math.min(idealY, window.innerHeight - submenuHeight - margin));
  }

  // A flyout may be taller than the room left under its trigger: cap it to the viewport.
  const submenuMaxHeight = Math.max(96, window.innerHeight - submenuY - margin);

  return (
    <div
      ref={menuRef}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      onClick={isOpen ? (e) => e.stopPropagation() : undefined}
      style={{ left: `${clampedX}px`, top: `${menuTop}px` }}
      className="fixed z-50 motion-fade"
    >
      {/* Main Menu Container */}
      <div
        ref={panelRef}
        data-motion-state={phase}
        style={{ maxHeight: `${menuMaxHeight}px` }}
        className="w-60 overflow-y-auto scrollbar-thin rounded-xl bg-surface-elevated/95 backdrop-blur-xl border border-tint-8 shadow-2xl p-1 text-xs text-fg-tertiary flex flex-col gap-0.5 select-none motion-popover"
      >
        {type === 'item' && item && (
          <ItemMenuSections
            item={item}
            activeSubmenu={activeSubmenu}
            onReply={actions.handleReply}
            onOpenFocus={actions.handleOpenFocus}
            onTogglePin={actions.handleTogglePin}
            onCompleteTaskForever={actions.handleCompleteTaskForever}
            onAiDecompose={actions.handleAiDecompose}
            onCopyMarkdown={actions.handleCopyMarkdown}
            onDelete={actions.handleDelete}
            onTriggerMouseEnter={handleTriggerMouseEnter}
            onTriggerMouseLeave={handleTriggerMouseLeave}
            onTriggerClick={handleTriggerClick}
            onOtherItemMouseEnter={handleOtherItemMouseEnter}
          />
        )}

        {type === 'folder' && folder && (
          <FolderMenuSections
            folder={folder}
            activeSubmenu={activeSubmenu}
            onOpenFolderInfo={openFolderInfoModal}
            onCreateSubfolder={openCreateFolderModal}
            onDeleteFolder={deleteFolder}
            onClose={closeContextMenu}
            onTriggerMouseEnter={handleTriggerMouseEnter}
            onTriggerMouseLeave={handleTriggerMouseLeave}
            onTriggerClick={handleTriggerClick}
          />
        )}

        {type === 'feed' && (
          <FeedMenuSections
            currentFolder={currentFolder}
            onSaveItem={saveItem}
            onOpenFolder={openFolderInExplorer}
            onOpenSearch={handleOpenSearch}
            onClose={closeContextMenu}
          />
        )}
      </div>

      <MenuSubmenus
        type={type}
        item={item}
        folder={folder}
        triggerRect={triggerRect}
        activeSubmenu={activeSubmenu}
        submenuX={submenuX}
        submenuY={submenuY}
        submenuDirection={submenuDirection}
        submenuMaxHeight={submenuMaxHeight}
        onChangeType={actions.handleChangeType}
        onOpenInExplorer={actions.handleOpenInExplorer}
        onCopyFullPath={actions.handleCopyFullPath}
        onCopyRelativePath={actions.handleCopyRelativePath}
        onCopyLink={actions.handleCopyLink}
        onOpenFolder={handleOpenFolder}
        onCopyFolderFullPath={handleCopyFolderFullPath}
        onCopyFolderPath={handleCopyFolderPath}
        onSubmenuMouseEnter={handleSubmenuMouseEnter}
        onSubmenuMouseLeave={handleSubmenuMouseLeave}
      />
    </div>
  );
};
