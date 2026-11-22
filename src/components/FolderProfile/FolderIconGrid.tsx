// Icon picker grid shared by the desktop popover and the phone sheet.
import React, { useState } from 'react';
import { Icon } from '../UI/icons/Icon';
import { FOLDER_ICON_CHOICES, folderIconName } from '../UI/icons/icons';
import type { FolderColor } from '../../types';
import { folderColorCss, folderHue } from '../../lib/vault/folderColor';

export interface FolderIconGridProps {
  value?: string;
  onSelect: (icon: string) => void;
  color?: FolderColor;
  onColor: (color?: FolderColor) => void;
}

const colorAt = (hue: number): FolderColor | undefined => hue < 0 ? undefined : `hue:${hue}`;

/** Shared icon picker content: a popover on desktop, a sheet section on the phone. */
export const FolderIconGrid: React.FC<FolderIconGridProps> = ({ value, onSelect, color, onColor }) => {
  const active = folderIconName(value);
  const [draftHue, setDraftHue] = useState<number | null>(null);
  const savedHue = folderHue(color) ?? -1;
  const hue = draftHue ?? savedHue;
  const preview = folderColorCss(colorAt(hue));
  const commit = (next: number) => {
    if (next !== savedHue) onColor(colorAt(next));
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <div className="relative flex h-10 items-center border-b border-subtle px-2.5">
        <div aria-hidden="true" className="folder-color-spectrum pointer-events-none absolute inset-x-2.5 h-1.5 rounded-full" />
        <input
          type="range"
          min={-1}
          max={360}
          step={1}
          value={hue}
          aria-label="Цвет иконки"
          aria-valuetext={hue < 0 ? 'Стандартный' : `Оттенок ${hue}°`}
          className="folder-color-slider relative h-full w-full cursor-pointer rounded-md focus-visible:outline focus-visible:outline-border-hover"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraftHue(hue);
          }}
          onPointerUp={(event) => {
            setDraftHue(null);
            commit(event.currentTarget.valueAsNumber);
          }}
          onPointerCancel={() => setDraftHue(null)}
          onBlur={() => setDraftHue(null)}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (draftHue !== null) setDraftHue(next);
            else commit(next);
          }}
        />
      </div>
      <div className="max-h-[min(15rem,45dvh)] overflow-y-auto overscroll-contain scrollbar-thin">
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
            <span style={{ color: preview }}><Icon name={key} size="md" tone="inherit" /></span>
          </button>
        );
      })}
        </div>
      </div>
    </div>
  );
};
