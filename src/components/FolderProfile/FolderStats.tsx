// The folder's six counters, laid out as rows, an inline strip or a grid.
import React from 'react';
import type { FolderMediaData } from '../RightPanel/useFolderMedia';
import { FOLDER_STATS } from './folderStatsConfig';
import { Icon } from '../UI/icons/Icon';

export type FolderStatsVariant = 'rows' | 'inline' | 'grid';

export interface FolderStatsProps {
  mediaData: FolderMediaData;
  variant: FolderStatsVariant;
}

/**
 * The same six numbers, laid out for the container: the dock panel is narrow,
 * the modal is wide, the phone screen is tall. Values are computed in
 * `useFolderMedia` from the folder's own items, so every layout shows one truth.
 */
export const FolderStats: React.FC<FolderStatsProps> = ({ mediaData, variant }) => {
  if (variant === 'rows') {
    return (
      <div className="flex flex-col text-xs">
        {FOLDER_STATS.map(({ key, label, icon, count }) => {
          const value = count(mediaData);
          const hasItems = value > 0;
          return (
            <div
              key={key}
              data-testid={`folder-stat-${key}`}
              className="flex items-center justify-between py-1.5 border-b border-subtle last:border-b-0"
            >
              <span className={`flex items-center gap-2 ${hasItems ? 'text-fg-secondary' : 'text-fg-dim'}`}>
                <Icon name={icon} size="sm" tone="inherit" className={`w-3.5 h-3.5 shrink-0 ${hasItems ? 'text-fg-muted' : 'text-fg-dim'}`} />
                <span>{label}</span>
              </span>
              <span
                data-testid={`folder-stat-${key}-value`}
                className={`font-mono text-xs ${hasItems ? 'text-fg-primary font-medium' : 'text-fg-dim'}`}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-3 gap-x-2 gap-y-3">
        {FOLDER_STATS.map(({ key, label, icon, count }) => {
          const value = count(mediaData);
          const hasItems = value > 0;
          return (
            <div key={key} data-testid={`folder-stat-${key}`} className="flex flex-col items-center gap-0.5 text-center">
              <Icon name={icon} size="sm" tone="inherit" className={`w-3.5 h-3.5 ${hasItems ? 'text-fg-muted' : 'text-fg-dim'}`} />
              <span
                data-testid={`folder-stat-${key}-value`}
                className={`font-mono text-base font-semibold ${hasItems ? 'text-fg-primary' : 'text-fg-dim'}`}
              >
                {value}
              </span>
              <span className="text-3xs text-fg-muted">{label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-stretch">
      {FOLDER_STATS.map(({ key, label, count }, index) => {
        const value = count(mediaData);
        const hasItems = value > 0;
        return (
          <div
            key={key}
            data-testid={`folder-stat-${key}`}
            className={`flex-1 min-w-0 text-center py-1 ${index > 0 ? 'border-l border-subtle' : ''}`}
          >
            <span
              data-testid={`folder-stat-${key}-value`}
              className={`block font-mono text-base font-semibold ${hasItems ? 'text-fg-primary' : 'text-fg-dim'}`}
            >
              {value}
            </span>
            <span className="block text-3xs text-fg-muted truncate">{label}</span>
          </div>
        );
      })}
    </div>
  );
};
