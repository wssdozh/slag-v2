// Moving a folder to another parent: a dialog over the profile, not an inline field.
import React, { useMemo, useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { Icon } from '../UI/icons/Icon';
import { Button } from '../UI/Button';
import { Select, type SelectOption } from '../UI/Select';
import { BaseModal } from './BaseModal';
import { buildFolderOptions } from '../../lib/vault/folderOptions';
import { folderPathUnder, isFolderPathFree, movableTargets, parentPathOf } from '../../lib/vault/folderPaths';

interface FolderMoveDialogProps {
  path: string;
  isOpen: boolean;
  presence: ReturnType<typeof usePresence>;
}

const FolderMoveDialog: React.FC<FolderMoveDialogProps> = ({ path, isOpen, presence }) => {
  const { folders, renameFolder, addToast, closeFolderMoveModal } = useApp();

  const folder = folders.find(meta => meta.path === path);
  const [target, setTarget] = useState(() => parentPathOf(path));

  const targetOptions = useMemo<SelectOption[]>(() => {
    const targets = movableTargets(folders, path).filter(option => option.path !== DEFAULT_INBOX_FOLDER);
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

  const commit = () => {
    if (!folder) {
      closeFolderMoveModal();
      return;
    }
    const nextPath = folderPathUnder(target, folder.name);
    if (nextPath === path) {
      closeFolderMoveModal();
      return;
    }
    if (!isFolderPathFree(folders, nextPath, path)) {
      addToast(`Папка «${nextPath}» уже существует`, 'error');
      return;
    }
    renameFolder(path, { ...folder, path: nextPath });
    closeFolderMoveModal();
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={closeFolderMoveModal}>
        Отмена
      </Button>
      <Button type="button" variant="primary" size="sm" onClick={commit}>
        Переместить
      </Button>
    </div>
  );

  return (
    <BaseModal
      presence={presence}
      isOpen={isOpen}
      onClose={closeFolderMoveModal}
      title="Переместить папку"
      subtitle={folder?.name || path}
      icon={<Icon name="action.folderMove" size="md" tone="inherit" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <span className="text-xs font-medium text-fg-secondary">Переместить в</span>
        <Select
          value={target}
          onChange={setTarget}
          options={targetOptions}
          aria-label="Новая родительская папка"
        />
      </div>
    </BaseModal>
  );
};

/** The move dialog for the folder whose `folderMoveTarget` the profile opened. */
export const FolderMoveModal: React.FC = () => {
  const { folderMoveTarget } = useApp();

  const isOpen = folderMoveTarget !== null;
  const presence = usePresence(isOpen);

  // Keep the dialog on screen through its exit transition.
  const [snapshot, setSnapshot] = useState(folderMoveTarget);
  if (folderMoveTarget && folderMoveTarget !== snapshot) setSnapshot(folderMoveTarget);

  if (!presence.isPresent || !snapshot) return null;

  return <FolderMoveDialog key={snapshot} path={snapshot} isOpen={isOpen} presence={presence} />;
};
