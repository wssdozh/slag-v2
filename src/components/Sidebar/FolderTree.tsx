// Nested folder tree in the sidebar: expand, select, and drag — a note lands in a folder, a folder
// lands in a folder or between two rows.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Icon } from '../UI/icons/Icon';
import { folderIconName } from '../UI/icons/icons';
import { logger } from '../../lib/logger/logger';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { buildFolderTree, type FolderDropMode, type FolderNode } from '../../lib/vault/folderTree';

const uiLog = logger.scope('UI');

/** The notes drag as `text/plain`; a folder needs its own type so the two never read each other. */
const FOLDER_DRAG_TYPE = 'application/x-slag-folder';

type RowDropMode = Exclude<FolderDropMode, 'root-end'>;
interface DropHint {
  path: string;
  mode: RowDropMode;
}

/** The band of the row the pointer is in decides what a drop means. */
function modeAt(event: React.DragEvent<HTMLDivElement>): RowDropMode {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.height <= 0) return 'into';
  const ratio = (event.clientY - rect.top) / rect.height;
  if (ratio < 0.3) return 'before';
  if (ratio > 0.7) return 'after';
  return 'into';
}

const carriesFolder = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types).includes(FOLDER_DRAG_TYPE);

export const FolderTree: React.FC = () => {
  const {
    folders,
    currentFolder,
    setCurrentFolder,
    items,
    moveItem,
    moveFolder,
    openContextMenu,
  } = useApp();

  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({
    'Карьера': true,
    'Личное': true,
    'Проекты': true,
    'Будущее': true,
    'База знаний': true,
  });

  // Auto-expand parent folders when navigating to a nested folder (React pure adjustment pattern)
  const [prevFolder, setPrevFolder] = useState(currentFolder);
  if (prevFolder !== currentFolder) {
    setPrevFolder(currentFolder);
    if (currentFolder && currentFolder !== DEFAULT_INBOX_FOLDER) {
      const parts = currentFolder.split('/');
      if (parts.length > 1) {
        let pathAcc = '';
        const toExpand: Record<string, boolean> = {};
        for (let i = 0; i < parts.length - 1; i++) {
          pathAcc = pathAcc ? `${pathAcc}/${parts[i]}` : parts[i];
          if (!expandedPaths[pathAcc]) {
            toExpand[pathAcc] = true;
          }
        }
        if (Object.keys(toExpand).length > 0) {
          setExpandedPaths(prev => ({ ...prev, ...toExpand }));
        }
      }
    }
  }

  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [isRootDrop, setIsRootDrop] = useState(false);

  // The tree follows the list order: the inbox is drawn by the sidebar itself, not here.
  const tree = useMemo(
    () => buildFolderTree(folders.filter(folder => folder.path !== DEFAULT_INBOX_FOLDER)),
    [folders]
  );

  const expandFolder = useCallback((path: string) => {
    setExpandedPaths(prev => (prev[path] ? prev : { ...prev, [path]: true }));
  }, []);

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPaths(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const resetDrag = () => {
    setDropHint(null);
    setDraggingPath(null);
    setIsRootDrop(false);
  };

  // A drag that ends anywhere but on this tree — dropped on the feed, cancelled with Escape — has
  // no row to tell the hint is over, so the window does it while one is showing.
  useEffect(() => {
    if (!dropHint && !draggingPath && !isRootDrop) return;
    const finish = () => {
      setDropHint(null);
      setDraggingPath(null);
      setIsRootDrop(false);
    };
    window.addEventListener('dragend', finish);
    window.addEventListener('drop', finish);
    return () => {
      window.removeEventListener('dragend', finish);
      window.removeEventListener('drop', finish);
    };
  }, [dropHint, draggingPath, isRootDrop]);

  /** A dropped folder: the storage decides, this only unfolds where it landed. */
  const applyFolderMove = (movedPath: string, targetPath: string, mode: FolderDropMode) => {
    uiLog.info(`Drag-and-drop: folder "${movedPath}" ${mode} "${targetPath || 'root'}"`);
    if (moveFolder(movedPath, targetPath, mode) && mode === 'into') expandFolder(targetPath);
  };

  const handleRowDragStart = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    // The row carries a disclosure and an actions button; a drag that begins on them is not a move.
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(FOLDER_DRAG_TYPE, path);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingPath(path);
  };

  const handleRowDragOver = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    const isFolderDrag = carriesFolder(e.dataTransfer);
    const isNoteDrag = Array.from(e.dataTransfer.types).includes('text/plain');
    if (!isFolderDrag && !isNoteDrag) return;

    e.preventDefault();
    e.stopPropagation();
    setIsRootDrop(false);

    const forbidden = isFolderDrag && (path === draggingPath || Boolean(draggingPath && path.startsWith(`${draggingPath}/`)));
    e.dataTransfer.dropEffect = forbidden ? 'none' : 'move';

    // A note only ever lands inside a folder, so its band of the row does not matter.
    const mode: RowDropMode = forbidden || !isFolderDrag ? 'into' : modeAt(e);
    setDropHint(previous => (previous?.path === path && previous.mode === mode ? previous : { path, mode }));
  };

  const handleRowDrop = (e: React.DragEvent<HTMLDivElement>, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    const movedFolder = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
    const droppedNoteId = e.dataTransfer.getData('text/plain');
    const mode = movedFolder ? modeAt(e) : 'into';
    resetDrag();

    if (movedFolder) {
      applyFolderMove(movedFolder, path, mode);
      return;
    }
    if (droppedNoteId) {
      uiLog.info(`Drag-and-drop: note dropped on folder tree node "${path}"`, {
        itemId: droppedNoteId,
        targetFolder: path,
      });
      moveItem(droppedNoteId, path);
    }
  };

  const handleRootDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!carriesFolder(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHint(null);
    setIsRootDrop(true);
  };

  const handleRootDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const movedFolder = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
    if (!movedFolder) return;
    e.preventDefault();
    resetDrag();
    applyFolderMove(movedFolder, '', 'root-end');
  };

  const renderNode = (node: FolderNode, depth: number = 0) => {
    const isExpanded = !!expandedPaths[node.path];
    const hasChildren = node.children.length > 0;
    const isSelected = currentFolder === node.path;
    const isDragged = draggingPath === node.path;
    const isForbidden =
      draggingPath !== null && (node.path === draggingPath || node.path.startsWith(`${draggingPath}/`));
    const hint = dropHint?.path === node.path ? dropHint.mode : null;
    // "After" on an open folder means below its whole subtree, so the line belongs under the last
    // child rather than under the parent's row where nothing will land.
    const afterLastChild = hint === 'after' && hasChildren && isExpanded;
    const itemCount = items.filter(
      i => i.folder === node.path || i.folder.startsWith(node.path + '/')
    ).length;

    const iconName = folderIconName(node.meta?.icon);

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'folder',
        folder: node.meta || { path: node.path, name: node.name, description: '' },
      });
    };

    return (
      <div key={node.path} className="flex flex-col select-none">
        <div
          data-testid="folder-tree-row"
          data-folder-path={node.path}
          data-drop-hint={hint ?? undefined}
          draggable
          onClick={() => {
            setCurrentFolder(node.path);
            if (hasChildren && !isExpanded) {
              setExpandedPaths(prev => ({ ...prev, [node.path]: true }));
            }
          }}
          onDragStart={(e) => handleRowDragStart(e, node.path)}
          onDragEnd={resetDrag}
          onDragOver={(e) => handleRowDragOver(e, node.path)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHint(null);
          }}
          onDrop={(e) => handleRowDrop(e, node.path)}
          onContextMenu={handleContextMenu}
          className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
            hint === 'into'
              ? isForbidden
                ? 'bg-rose-500/10 text-fg-secondary ring-1 ring-rose-500/25'
                : 'bg-accent-subtle text-white ring-1 ring-accent/40'
              : isSelected
                ? 'bg-tint-8 text-white font-medium'
                : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-4'
          } ${isDragged ? 'opacity-40' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          {hint === 'before' && (
            <span
              className="pointer-events-none absolute right-1 -top-px h-px bg-accent"
              style={{ left: `${8 + depth * 14}px` }}
            />
          )}
          {hint === 'after' && !afterLastChild && (
            <span
              className="pointer-events-none absolute right-1 -bottom-px h-px bg-accent"
              style={{ left: `${8 + depth * 14}px` }}
            />
          )}

          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.path, e)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? `Свернуть папку ${node.name}` : `Развернуть папку ${node.name}`}
                className="p-0.5 text-fg-muted hover:text-fg-tertiary transition-colors shrink-0"
              >
                <Icon
                  name="nav.next"
                  size="sm"
                  tone="inherit"
                  className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${
                    isExpanded ? 'rotate-90 text-fg-tertiary' : 'text-fg-muted'
                  }`}
                />
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            <Icon name={iconName} size="sm" tone="inherit" className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-fg-soft' : 'text-fg-muted group-hover:text-fg-secondary'}`} />
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {itemCount > 0 && (
              <span
                key={itemCount}
                className="text-2xs font-mono text-fg-muted group-hover:text-fg-secondary px-1 motion-count"
              >
                {itemCount}
              </span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                openContextMenu({
                  x: rect.right + 4,
                  y: rect.top,
                  type: 'folder',
                  folder: node.meta || { path: node.path, name: node.name, description: '' },
                });
              }}
              title="Действия с папкой"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-fg-muted hover:text-fg-soft hover:bg-tint-10 transition-opacity"
            >
              <Icon name="action.more" size="sm" tone="inherit" />
            </button>
          </div>
        </div>

        {hasChildren && (
          <div
            className="motion-accordion"
            data-expanded={isExpanded}
            aria-hidden={!isExpanded}
          >
            <div className="motion-accordion-inner relative flex flex-col">
              {node.children.map(child => renderNode(child, depth + 1))}
              {afterLastChild && (
                <span
                  className="pointer-events-none absolute right-1 bottom-0 h-px bg-accent"
                  style={{ left: `${8 + (depth + 1) * 14}px` }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-testid="folder-tree"
      data-root-drop={isRootDrop ? 'true' : undefined}
      onDragOver={handleRootDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsRootDrop(false);
      }}
      onDrop={handleRootDrop}
      className={`flex flex-1 flex-col gap-0.5 py-1 min-h-8 rounded-lg transition-colors ${
        isRootDrop ? 'bg-tint-2 ring-1 ring-tint-8' : ''
      }`}
    >
      {tree.map(node => renderNode(node, 0))}
    </div>
  );
};
