import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { FolderMeta } from '../../types';
import { FOLDER_ICONS } from './folderIcons';
import { logger } from '../../lib/logger';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  MoreHorizontal
} from 'lucide-react';

const uiLog = logger.scope('UI');

interface TreeNode {
  name: string;
  fullPath: string;
  meta?: FolderMeta;
  children: TreeNode[];
}

export const FolderTree: React.FC = () => {
  const {
    folders,
    currentFolder,
    setCurrentFolder,
    items,
    moveItem,
    openContextMenu
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
    if (currentFolder && currentFolder !== 'Входящие') {
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

  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const buildTree = (): TreeNode[] => {
    const rootNodes: Record<string, TreeNode> = {};

    folders.forEach(folder => {
      if (folder.path === 'Входящие') return;

      const parts = folder.path.split('/');
      let currentPath = '';
      let parentNode: TreeNode | null = null;

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (index === 0) {
          if (!rootNodes[part]) {
            rootNodes[part] = {
              name: part,
              fullPath: currentPath,
              meta: folders.find(f => f.path === currentPath),
              children: [],
            };
          }
          parentNode = rootNodes[part];
        } else if (parentNode) {
          let existingChild = parentNode.children.find(c => c.name === part);
          if (!existingChild) {
            existingChild = {
              name: part,
              fullPath: currentPath,
              meta: folders.find(f => f.path === currentPath),
              children: [],
            };
            parentNode.children.push(existingChild);
          }
          parentNode = existingChild;
        }
      });
    });

    return Object.values(rootNodes);
  };

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPaths(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleDragOver = (e: React.DragEvent, path: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverPath !== path) setDragOverPath(path);
  };

  const handleDragLeave = () => {
    setDragOverPath(null);
  };

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    setDragOverPath(null);
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) {
      uiLog.info(`Drag-and-drop: Note dropped on folder tree node "${targetPath}"`, {
        itemId,
        targetFolder: targetPath,
      });
      moveItem(itemId, targetPath);
    }
  };

  const tree = buildTree();

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = !!expandedPaths[node.fullPath];
    const hasChildren = node.children.length > 0;
    const isSelected = currentFolder === node.fullPath;
    const isDragTarget = dragOverPath === node.fullPath;
    const itemCount = items.filter(
      i => i.folder === node.fullPath || i.folder.startsWith(node.fullPath + '/')
    ).length;

    // Resolve folder icon
    const iconKey = node.meta?.icon || 'Folder';
    const IconComponent = FOLDER_ICONS[iconKey] || Folder;

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'folder',
        folder: node.meta || { path: node.fullPath, name: node.name, description: '' },
      });
    };

    return (
      <div key={node.fullPath} className="flex flex-col select-none">
        <div
          onClick={() => {
            setCurrentFolder(node.fullPath);
            if (hasChildren && !isExpanded) {
              setExpandedPaths(prev => ({ ...prev, [node.fullPath]: true }));
            }
          }}
          onContextMenu={handleContextMenu}
          onDragOver={(e) => handleDragOver(e, node.fullPath)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.fullPath)}
          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
            isDragTarget
              ? 'bg-blue-500/20 text-white ring-1 ring-blue-500/40'
              : isSelected
              ? 'bg-white/[0.08] text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(node.fullPath, e)}
                className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}

            <IconComponent className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-400'}`} />
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {itemCount > 0 && (
              <span className="text-2xs font-mono text-zinc-500 group-hover:text-zinc-400 px-1">
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
                  folder: node.meta || { path: node.fullPath, name: node.name, description: '' },
                });
              }}
              title="Действия с папкой"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-opacity"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {tree.map(node => renderNode(node, 0))}
    </div>
  );
};
