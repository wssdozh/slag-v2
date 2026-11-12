import React from 'react';
import { FolderOpen, Search, CheckSquare, FileText, StickyNote } from 'lucide-react';
import type { SlagItem, SlagItemType } from '../../../types';

export interface FeedMenuSectionsProps {
  currentFolder: string;
  onSaveItem: (item: Partial<SlagItem> & { title: string; content: string; type: SlagItemType }) => void;
  onOpenFolder: (folderPath: string) => Promise<void>;
  onOpenSearch: () => void;
  onClose: () => void;
}

export const FeedMenuSections: React.FC<FeedMenuSectionsProps> = ({
  currentFolder,
  onSaveItem,
  onOpenFolder,
  onOpenSearch,
  onClose,
}) => (
  <>
    <button
      onClick={() => {
        onSaveItem({ type: 'note', title: 'Быстрая заметка', content: '', folder: currentFolder });
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <StickyNote className="w-3.5 h-3.5 text-zinc-400" />
      <span>Новая заметка</span>
    </button>

    <button
      onClick={() => {
        onSaveItem({ type: 'task', title: 'Новая задача', content: '', folder: currentFolder });
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
      <span>Новая таска</span>
    </button>

    <button
      onClick={() => {
        onSaveItem({ type: 'article', title: 'Новая статья', content: '', folder: currentFolder });
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <FileText className="w-3.5 h-3.5 text-blue-400" />
      <span>Новая статья</span>
    </button>

    <div className="my-0.5 border-t border-white/[0.06]" />

    <button
      onClick={() => {
        onOpenFolder(currentFolder);
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
    >
      <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
      <span>Открыть папку в проводнике</span>
    </button>

    <button
      onClick={() => {
        onOpenSearch();
        onClose();
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
);
