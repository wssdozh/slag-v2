import React, { useMemo, useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import type { FolderMeta } from '../../types';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { Folder } from 'lucide-react';
import { Select, type SelectOption } from '../UI/Select';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import { folderPathUnder, sanitizeFolderName } from '../../lib/vault/folderPaths';

interface FolderModalDialogProps {
  parentPath: string | null;
  presence: ReturnType<typeof usePresence>;
}

/**
 * Creating a folder is the only thing this dialog does now. Renaming, icons,
 * description, moving and deleting belong to the folder profile, where the same
 * fields are visible next to the folder's records.
 */
const FolderModalDialog: React.FC<FolderModalDialogProps> = ({ parentPath, presence }) => {
  const { isFolderModalOpen, closeFolderModal, saveFolder, folders } = useApp();

  const [name, setName] = useState('');
  const [parent, setParent] = useState<string>(parentPath || '');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>('Folder');

  const parentOptions = useMemo<SelectOption[]>(() => {
    const targets = folders.filter(folder => folder.path !== DEFAULT_INBOX_FOLDER);
    return [
      { value: '', label: 'Корневой уровень (без родителя)', triggerLabel: 'Корень хранилища', mono: true },
      ...buildFolderOptions(targets)
        .filter(option => option.value !== DEFAULT_INBOX_FOLDER)
        .map(option => ({
          value: option.value,
          label: option.label,
          triggerLabel: option.triggerLabel,
          mono: true as const,
        })),
    ];
  }, [folders]);

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = sanitizeFolderName(name);
    if (!cleanName) return;

    const folderMeta: FolderMeta = {
      path: folderPathUnder(parent, cleanName),
      name: cleanName,
      description: description.trim(),
      icon: selectedIcon,
    };
    saveFolder(folderMeta);
  };

  const CurrentIconComp = FOLDER_ICONS[selectedIcon] || Folder;

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={closeFolderModal}>
        Отмена
      </Button>
      <Button type="submit" form="folder-create-form" variant="primary" size="sm" disabled={!name.trim()}>
        Создать
      </Button>
    </div>
  );

  return (
    <BaseModal
      presence={presence}
      isOpen={isFolderModalOpen}
      onClose={closeFolderModal}
      title={parentPath ? 'Новая подпапка' : 'Создать новую папку'}
      icon={<CurrentIconComp className="w-4 h-4" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      <form id="folder-create-form" onSubmit={handleSave} className="p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-fg-secondary">Название папки</label>
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Например: Проекты, Финансы, Идеи..."
            autoFocus
            className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-fg-primary placeholder-fg-dim outline-none ring-0 focus:border-white/20"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-fg-secondary">Иконка папки</label>
          <div className="grid grid-cols-8 gap-1.5 p-2 rounded-lg bg-black/30 border border-white/[0.06]">
            {Object.entries(FOLDER_ICONS).map(([key, IconComponent]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedIcon(key)}
                className={`p-1.5 rounded-md flex items-center justify-center motion-surface outline-none ring-0 cursor-pointer ${
                  selectedIcon === key
                    ? 'bg-white text-black'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-white/[0.06]'
                }`}
                title={key}
              >
                <IconComponent className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-fg-secondary">Родительская папка (опционально)</label>
          <Select
            value={parent}
            onChange={setParent}
            options={parentOptions}
            aria-label="Родительская папка"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-fg-secondary">Описание для ИИ-сортировки</label>
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="Опишите темы и содержание папки, чтобы ИИ сортировал сюда входящие заметки..."
            rows={2}
            className="w-full bg-black/40 border border-white/[0.08] rounded-lg p-2.5 text-xs text-fg-primary placeholder-fg-dim resize-none leading-relaxed outline-none ring-0 focus:border-white/20"
          />
        </div>
      </form>
    </BaseModal>
  );
};

export const FolderModal: React.FC = () => {
  const { isFolderModalOpen, folderModalParent } = useApp();

  const presence = usePresence(isFolderModalOpen);
  const [session, setSession] = useState(0);
  const [snapshot, setSnapshot] = useState<{ open: boolean; parent: string | null }>({
    open: isFolderModalOpen,
    parent: folderModalParent,
  });
  if (snapshot.open !== isFolderModalOpen) {
    setSnapshot({ open: isFolderModalOpen, parent: folderModalParent });
    if (isFolderModalOpen) setSession(previous => previous + 1);
  }
  if (!presence.isPresent) return null;

  return (
    <FolderModalDialog
      key={`${session}:${snapshot.parent || 'root'}`}
      parentPath={snapshot.parent}
      presence={presence}
    />
  );
};
