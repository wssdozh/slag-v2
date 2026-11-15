// Icon picker grid shared by the desktop popover and the phone sheet.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { FOLDER_ICON_CHOICES, folderIconName } from '../UI/icons/icons';

export interface FolderIconGridProps {
  value?: string;
  onSelect: (icon: string) => void;
}

/** Shared icon picker content: a popover on desktop, a sheet section on the phone. */
export const FolderIconGrid: React.FC<FolderIconGridProps> = ({ value, onSelect }) => {
  const active = folderIconName(value);
  return (
    <div className="grid grid-cols-4 gap-1 p-1">
      {FOLDER_ICON_CHOICES.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            title={label}
            aria-label={`Иконка: ${label}`}
            aria-pressed={isActive}
            className={`w-9 h-9 rounded-lg flex items-center justify-center outline-none ring-0 cursor-pointer motion-surface ${
              isActive
                ? 'bg-white text-black'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-tint-6'
            }`}
          >
            <Icon name={key} size="md" tone="inherit" />
          </button>
        );
      })}
    </div>
  );
};
