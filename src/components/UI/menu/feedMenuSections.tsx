// Feed right-click entries: the three create actions plus folder and search jumps.
import React from 'react';
import { Icon } from '../icons/Icon';
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
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <Icon name="entity.note" size="sm" />
      <span>Новая заметка</span>
    </button>

    <button
      onClick={() => {
        onSaveItem({ type: 'task', title: 'Новая задача', content: '', folder: currentFolder });
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <Icon name="entity.task" size="sm" tone="warning" />
      <span>Новая таска</span>
    </button>

    <button
      onClick={() => {
        onSaveItem({ type: 'article', title: 'Новая статья', content: '', folder: currentFolder });
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <Icon name="entity.article" size="sm" tone="accent" />
      <span>Новая статья</span>
    </button>

    <div className="my-0.5 border-t border-tint-6" />

    <button
      onClick={() => {
        onOpenFolder(currentFolder);
        onClose();
      }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <Icon name="entity.folderOpen" size="sm" />
      <span>Открыть папку в проводнике</span>
    </button>

    <button
      onClick={() => {
        onOpenSearch();
        onClose();
      }}
      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-tint-6 hover:text-white transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon name="action.search" size="sm" />
        <span>Поиск</span>
      </div>
      <span className="text-3xs text-fg-muted font-mono">⌘K</span>
    </button>
  </>
);
