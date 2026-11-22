// Icon picker grid shared by the desktop popover and the phone sheet.
import React from 'react';
import { Icon } from '../UI/icons/Icon';
import { FOLDER_ICON_CHOICES, folderIconName } from '../UI/icons/icons';
import type { FolderColor } from '../../types';

export interface FolderIconGridProps {
  value?: string;
  onSelect: (icon: string) => void;
  color?: FolderColor;
  onColor: (color?: FolderColor) => void;
}

const shades = [
  [undefined, 'Стандартный'], ['blue', 'Синий'], ['green', 'Зелёный'],
  ['amber', 'Янтарный'], ['rose', 'Розовый'],
] as const;

/** Shared icon picker content: a popover on desktop, a sheet section on the phone. */
export const FolderIconGrid: React.FC<FolderIconGridProps> = ({ value, onSelect, color, onColor }) => {
  const active = folderIconName(value);
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-between gap-1 border-b border-subtle p-1" role="group" aria-label="Цвет иконки">
        {shades.map(([shade, label]) => (
          <button type="button" key={label} title={label} aria-label={`Цвет: ${label}`} aria-pressed={color === shade}
            onClick={() => onColor(shade)}
            className="flex size-8 items-center justify-center rounded-md bg-transparent hover:bg-tint-8 aria-pressed:bg-tint-12 focus-visible:bg-tint-14"
          >
            <span data-folder-color={shade} className="folder-icon-color size-3.5 rounded-full bg-current text-fg-secondary" />
          </button>
        ))}
      </div>
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
                ? 'bg-tint-12 text-fg-primary'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-tint-6'
            }`}
          >
            <span data-folder-color={color} className="folder-icon-color"><Icon name={key} size="md" tone="inherit" /></span>
          </button>
        );
      })}
      </div>
    </div>
  );
};
