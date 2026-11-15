// The folder dialog: its profile, plus triage, a new note, and its tags as filters.
import React, { useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { FolderProfile } from '../FolderProfile/FolderProfile';
import { Icon } from '../UI/icons/Icon';
interface FolderInfoModalDialogProps {
  targetFolder: string;
  presence: ReturnType<typeof usePresence>;
}

const FolderInfoModalDialog: React.FC<FolderInfoModalDialogProps> = ({ targetFolder, presence }) => {
  const {
    isFolderInfoModalOpen,
    closeFolderInfoModal,
    folders,
    setIsTriageModalOpen,
    openComposerModal,
    setActiveTagFilter,
  } = useApp();

  const folder = folders.find(meta => meta.path === targetFolder);
  const isInbox = targetFolder === DEFAULT_INBOX_FOLDER;

  const actions = (
    <>
      {isInbox && (
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          icon={<Icon name="action.sort" size="sm" tone="accent" />}
          onClick={() => {
            closeFolderInfoModal();
            setIsTriageModalOpen(true);
          }}
        >
          ИИ-Сортировка входящих
        </Button>
      )}
      <Button
        variant="secondary"
        size="sm"
        className="flex-1"
        icon={<Icon name="action.add" size="sm" tone="muted" />}
        onClick={() => {
          closeFolderInfoModal();
          openComposerModal({ folder: targetFolder });
        }}
      >
        Создать запись
      </Button>
    </>
  );

  return (
    <BaseModal
      presence={presence}
      isOpen={isFolderInfoModalOpen}
      onClose={closeFolderInfoModal}
      hideHeader
      ariaLabel={folder?.name || targetFolder}
      maxWidth="max-w-xl"
      maxHeight="max-h-[85vh]"
    >
      <FolderProfile
        folderPath={targetFolder}
        variant="modal"
        onClose={closeFolderInfoModal}
        onSelectTag={tag => {
          setActiveTagFilter(tag);
          closeFolderInfoModal();
        }}
        actions={actions}
      />
    </BaseModal>
  );
};

export const FolderInfoModal: React.FC = () => {
  const { isFolderInfoModalOpen, folderInfoTarget, currentFolder } = useApp();

  const presence = usePresence(isFolderInfoModalOpen);
  const target = folderInfoTarget || currentFolder || DEFAULT_INBOX_FOLDER;
  const [snapshot, setSnapshot] = useState(target);
  if (isFolderInfoModalOpen && snapshot !== target) setSnapshot(target);
  if (!presence.isPresent) return null;

  return <FolderInfoModalDialog key={snapshot} targetFolder={snapshot} presence={presence} />;
};
