// Compact record counts in the dock, a six-counter grid on the phone.
import React from 'react';
import type { FolderMediaData } from '../RightPanel/useFolderMedia';
import { FOLDER_STATS } from './folderStatsConfig';
import { Icon } from '../UI/icons/Icon';

export type FolderStatsVariant = 'rows' | 'grid';

export interface FolderStatsProps {
  mediaData: FolderMediaData;
  variant: FolderStatsVariant;
}

/**
 * Counts come from the same folder records on both surfaces.
 */
export const FolderStats: React.FC<FolderStatsProps> = ({ mediaData, variant }) => {
  if (variant === 'rows') {
    const records = [
      ['notes', mediaData.notesCount, ['заметка', 'заметки', 'заметок']],
      ['tasks', mediaData.tasksCount, ['задача', 'задачи', 'задач']],
      ['articles', mediaData.articlesCount, ['статья', 'статьи', 'статей']],
    ] as const;
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-secondary">
        {records.map(([key, count, forms], index) => {
          const form = new Intl.PluralRules('ru').select(count);
          return (
            <React.Fragment key={key}>
              {index > 0 && <span aria-hidden="true">·</span>}
              <span data-testid={`folder-stat-${key}`} className="whitespace-nowrap">
                <span data-testid={`folder-stat-${key}-value`} className="tabular-nums">{count}</span>
                {' '}{forms[form === 'one' ? 0 : form === 'few' ? 1 : 2]}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

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
};
