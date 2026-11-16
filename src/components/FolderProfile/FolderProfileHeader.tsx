// Folder header: name, icon, path, counters and the inline edit controls.
import React, { useEffect, useRef } from 'react';
import { Icon } from '../UI/icons/Icon';
import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { folderIconName } from '../UI/icons/icons';
import { MenuDropdown } from '../UI/MenuDropdown';
import { IconButton } from '../UI/IconButton';
import { FolderIconGrid } from './FolderIconGrid';
import { FolderActionsMenu } from './FolderActionsMenu';
import { recordCountLabel } from './folderStatsConfig';
import type { FolderProfileEdit } from './useFolderProfileEdit';

export type FolderProfileVariant = 'dock' | 'modal' | 'screen';

export interface FolderProfileHeaderProps {
  folder: FolderMeta | undefined;
  path: string;
  itemCount: number;
  variant: FolderProfileVariant;
  edit: FolderProfileEdit;
  onMove: () => void;
  onDelete: () => void;
  onClose?: () => void;
}

const iconButtonClass: Record<FolderProfileVariant, string> = {
  dock: 'w-8 h-8 rounded-lg',
  modal: 'w-8 h-8 rounded-lg',
  screen: 'w-11 h-11 rounded-xl',
};

const iconGlyphClass: Record<FolderProfileVariant, string> = {
  dock: 'w-4 h-4',
  modal: 'w-4 h-4',
  screen: 'w-5 h-5',
};

const nameClass: Record<FolderProfileVariant, string> = {
  dock: 'text-sm font-semibold',
  modal: 'text-sm font-semibold',
  screen: 'text-base font-bold',
};

const descriptionClass: Record<FolderProfileVariant, string> = {
  dock: 'text-xs leading-relaxed line-clamp-4',
  modal: 'text-ui leading-relaxed',
  screen: 'text-xs leading-relaxed',
};

/**
 * Title and AI description are one block: the name, how many records live here
 * and what the folder is for. Every piece edits in place — no edit mode, no
 * separate form, no second editor for the same fields.
 */
export const FolderProfileHeader: React.FC<FolderProfileHeaderProps> = ({
  folder,
  path,
  itemCount,
  variant,
  edit,
  onMove,
  onDelete,
  onClose,
}) => {
  const isSystem = path === DEFAULT_INBOX_FOLDER || folder?.isSystem === true;
  const isEditingName = edit.mode === 'name';
  const isEditingDescription = edit.mode === 'description';

  // Focus follows the mode instead of the mount: the row unfolds from zero height, and a
  // `scrollIntoView` here would drag the dock away from the header.
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (isEditingDescription) descriptionRef.current?.focus({ preventScroll: true });
  }, [isEditingDescription]);

  const folderIcon = folderIconName(folder?.icon);
  const TitleTag = variant === 'screen' ? 'h1' : 'div';

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-start gap-2.5 min-w-0">
        <MenuDropdown
          ariaLabel="Иконка папки"
          minWidth={196}
          align="start"
          trigger={
            <button
              type="button"
              title="Сменить иконку папки"
              aria-label="Сменить иконку папки"
              className={`${iconButtonClass[variant]} shrink-0 flex items-center justify-center text-fg-secondary hover:text-fg-primary hover:bg-tint-6 motion-surface outline-none ring-0 cursor-pointer`}
            >
              <Icon name={folderIcon} size="none" tone="inherit" className={iconGlyphClass[variant]} />
            </button>
          }
        >
          <FolderIconGrid value={folder?.icon} onSelect={edit.selectIcon} />
        </MenuDropdown>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {isEditingName ? (
            <input
              autoFocus
              value={edit.nameDraft}
              onChange={event => edit.updateNameDraft(event.target.value)}
              onBlur={edit.commitName}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  edit.cancel();
                  return;
                }
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.stopPropagation();
                  event.preventDefault();
                  edit.commitName();
                }
              }}
              aria-label="Название папки"
              className={`w-full bg-scrim-40 border border-tint-12 rounded-md px-2 py-1 text-fg-primary outline-none ring-0 focus:border-tint-25 ${nameClass[variant]}`}
            />
          ) : isSystem ? (
            <TitleTag className={`${nameClass[variant]} text-fg-primary truncate`}>
              {folder?.name || path}
            </TitleTag>
          ) : (
            <button
              type="button"
              onClick={edit.startRename}
              title="Переименовать папку"
              className="group/name flex items-center gap-1.5 min-w-0 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-tint-5 motion-surface outline-none ring-0 cursor-text"
            >
              <TitleTag className={`${nameClass[variant]} text-fg-primary truncate`}>
                {folder?.name || path}
              </TitleTag>
              <Icon name="action.edit" size="xs" tone="dim" className="opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
          <span className="text-2xs font-mono text-fg-muted truncate">
            {recordCountLabel(itemCount)}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {!isSystem && (
            <FolderActionsMenu onRename={edit.startRename} onMove={onMove} onDelete={onDelete} />
          )}
          {onClose && (
            <IconButton size="sm" title="Закрыть (Esc)" aria-label="Закрыть" onClick={onClose}>
              <Icon name="action.close" size="md" tone="inherit" />
            </IconButton>
          )}
        </div>
      </div>

      {/* Description and its editor are one stacked block: the open row grows exactly as
          the closed one shrinks, so the profile changes height in a single motion instead
          of the textarea popping in. */}
      <div className="flex flex-col min-w-0">
        <div className="motion-fold" data-expanded={!isEditingDescription} inert={isEditingDescription}>
          <button
            type="button"
            onClick={edit.startDescription}
            title="Изменить описание для ИИ"
            className={`group/desc w-full text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-tint-4 motion-surface outline-none ring-0 cursor-text ${descriptionClass[variant]} ${
              folder?.description ? 'text-fg-secondary' : 'text-fg-dim italic'
            }`}
          >
            {folder?.description || 'Описание для ИИ'}
          </button>
        </div>

        {isEditingDescription && (
          <div className="motion-fold-in">
            <textarea
              ref={descriptionRef}
              rows={3}
              value={edit.descriptionDraft}
              onChange={event => edit.updateDescriptionDraft(event.target.value)}
              onBlur={edit.commitDescription}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  edit.cancel();
                  return;
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.stopPropagation();
                  event.preventDefault();
                  edit.commitDescription();
                }
              }}
              aria-label="Описание папки для ИИ"
              placeholder="Опишите, какие заметки и темы должны попадать в эту папку…"
              className={`w-full bg-scrim-40 border border-tint-12 rounded-md p-2 text-fg-primary placeholder-fg-dim outline-none ring-0 resize-none focus:border-tint-25 ${descriptionClass[variant]}`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
