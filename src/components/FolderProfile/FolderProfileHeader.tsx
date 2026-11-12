// Folder header: name, icon, path, counters and the inline edit controls.
import React, { useMemo } from 'react';
import { Folder, Pencil, X } from 'lucide-react';
import type { FolderMeta } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { MenuDropdown } from '../UI/MenuDropdown';
import { IconButton } from '../UI/IconButton';
import { Select, type SelectOption } from '../UI/Select';
import { Button } from '../UI/Button';
import { FolderIconGrid } from './FolderIconGrid';
import { FolderActionsMenu } from './FolderActionsMenu';
import { recordCountLabel } from './folderStatsConfig';
import type { FolderProfileEdit } from './useFolderProfileEdit';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import { movableTargets } from '../../lib/vault/folderPaths';

export type FolderProfileVariant = 'dock' | 'modal' | 'screen';

export interface FolderProfileHeaderProps {
  folder: FolderMeta | undefined;
  path: string;
  folders: FolderMeta[];
  itemCount: number;
  variant: FolderProfileVariant;
  edit: FolderProfileEdit;
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
  modal: 'text-[13px] leading-relaxed',
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
  folders,
  itemCount,
  variant,
  edit,
  onDelete,
  onClose,
}) => {
  const isSystem = path === DEFAULT_INBOX_FOLDER || folder?.isSystem === true;
  const isEditingName = edit.mode === 'name';
  const isEditingDescription = edit.mode === 'description';
  const isMoving = edit.mode === 'move';

  const IconComponent = (folder?.icon && FOLDER_ICONS[folder.icon]) || Folder;
  const TitleTag = variant === 'screen' ? 'h1' : 'div';

  const moveOptions = useMemo<SelectOption[]>(() => {
    const targets = movableTargets(folders, path).filter(target => target.path !== DEFAULT_INBOX_FOLDER);
    return [
      { value: '', label: 'Корень хранилища', triggerLabel: 'Корень хранилища', mono: true },
      ...buildFolderOptions(targets)
        .filter(option => option.value !== DEFAULT_INBOX_FOLDER)
        .map(option => ({
          value: option.value,
          label: option.label,
          triggerLabel: option.triggerLabel,
          mono: true as const,
        })),
    ];
  }, [folders, path]);

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
              className={`${iconButtonClass[variant]} shrink-0 flex items-center justify-center border border-white/[0.08] bg-white/[0.03] text-fg-secondary hover:text-fg-primary hover:bg-white/[0.07] motion-surface outline-none ring-0 cursor-pointer`}
            >
              <IconComponent className={iconGlyphClass[variant]} />
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
              className={`w-full bg-black/40 border border-white/[0.12] rounded-md px-2 py-1 text-fg-primary outline-none ring-0 focus:border-white/25 ${nameClass[variant]}`}
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
              className="group/name flex items-center gap-1.5 min-w-0 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-white/[0.05] motion-surface outline-none ring-0 cursor-text"
            >
              <TitleTag className={`${nameClass[variant]} text-fg-primary truncate`}>
                {folder?.name || path}
              </TitleTag>
              <Pencil className="w-3 h-3 text-fg-dim opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
          <span className="text-[11px] font-mono text-fg-muted truncate">
            {recordCountLabel(itemCount)}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {!isSystem && (
            <FolderActionsMenu onRename={edit.startRename} onMove={edit.startMove} onDelete={onDelete} />
          )}
          {onClose && (
            <IconButton size="sm" title="Закрыть (Esc)" aria-label="Закрыть" onClick={onClose}>
              <X className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      </div>

      {isMoving ? (
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-[11px] font-mono text-fg-muted">Переместить в</span>
          <Select
            value={edit.moveTarget}
            onChange={edit.updateMoveTarget}
            options={moveOptions}
            size="sm"
            aria-label="Новая родительская папка"
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={edit.cancel}>
              Отмена
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={edit.commitMove}>
              Переместить
            </Button>
          </div>
        </div>
      ) : isEditingDescription ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            autoFocus
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
            className={`w-full bg-black/40 border border-white/[0.12] rounded-md p-2 text-fg-primary placeholder-fg-dim outline-none ring-0 resize-none focus:border-white/25 ${descriptionClass[variant]}`}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={edit.startDescription}
          title="Изменить описание для ИИ"
          className={`group/desc text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-white/[0.04] motion-surface outline-none ring-0 cursor-text ${descriptionClass[variant]} ${
            folder?.description ? 'text-fg-secondary' : 'text-fg-dim italic'
          }`}
        >
          {folder?.description || 'Добавить описание для ИИ…'}
        </button>
      )}
    </div>
  );
};
