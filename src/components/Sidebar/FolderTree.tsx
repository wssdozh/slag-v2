import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { FolderMeta } from '../../types';
import { ChevronRight, ChevronDown, Folder, MoreHorizontal, Edit2, Trash2, FolderPlus } from 'lucide-react';

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
    openCreateFolderModal,
    openEditFolderModal,
    deleteFolder,
  } = useApp();

  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({
    'Проекты': true,
    'Личное': true,
  });

  const [activeMenuPath, setActiveMenuPath] = useState<string | null>(null);

  // Build tree from flat folder paths
  const buildTree = (): TreeNode[] => {
    const rootNodes: Record<string, TreeNode> = {};

    folders.forEach(folder => {
      if (folder.path === 'Входящие') return; // Handled separately as fixed inbox item

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

  const tree = buildTree();

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = !!expandedPaths[node.fullPath];
    const hasChildren = node.children.length > 0;
    const isSelected = currentFolder === node.fullPath;
    const itemCount = items.filter(
      i => i.folder === node.fullPath || i.folder.startsWith(node.fullPath + '/')
    ).length;

    return (
      <div key={node.fullPath} className="flex flex-col select-none">
        <div
          onClick={() => setCurrentFolder(node.fullPath)}
          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
            isSelected
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

            <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-400'}`} />
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {itemCount > 0 && (
              <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400 px-1">
                {itemCount}
              </span>
            )}

            {/* Folder context menu button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuPath(activeMenuPath === node.fullPath ? null : node.fullPath);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-opacity"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {activeMenuPath === node.fullPath && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1 w-44 rounded-lg bg-[#18181b] border border-white/[0.08] shadow-2xl p-1 z-30 text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    onClick={() => {
                      openCreateFolderModal(node.fullPath);
                      setActiveMenuPath(null);
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Создать подпапку</span>
                  </button>

                  {node.meta && (
                    <button
                      onClick={() => {
                        openEditFolderModal(node.meta!);
                        setActiveMenuPath(null);
                      }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Инфо и описание (ИИ)</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      deleteFolder(node.fullPath);
                      setActiveMenuPath(null);
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить папку</span>
                  </button>
                </div>
              )}
            </div>
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
