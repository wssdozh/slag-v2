// Icon picker grid shared by the desktop popover and the phone sheet.
import React from 'react';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';

export interface FolderIconGridProps {
  value?: string;
  onSelect: (icon: string) => void;
}

/** Shared icon picker content: a popover on desktop, a sheet section on the phone. */
export const FolderIconGrid: React.FC<FolderIconGridProps> = ({ value, onSelect }) => (
  <div className="grid grid-cols-4 gap-1 p-1">
    {Object.entries(FOLDER_ICONS).map(([key, Icon]) => {
      const isActive = key === value;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          title={key}
          aria-label={`Иконка ${key}`}
          aria-pressed={isActive}
          className={`w-9 h-9 rounded-lg flex items-center justify-center outline-none ring-0 cursor-pointer motion-surface ${
            isActive
              ? 'bg-white text-black'
              : 'text-fg-secondary hover:text-fg-primary hover:bg-white/[0.06]'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      );
    })}
  </div>
);
