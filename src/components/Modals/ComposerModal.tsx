// The composer in a dialog: keeps its last options and folder through the exit.
import React, { useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Composer } from '../Feed/Composer';
import { Icon } from '../UI/icons/Icon';
import type { IconName } from '../UI/icons/icons';

export const ComposerModal: React.FC = () => {
  const { isComposerModalOpen, closeComposerModal, composerModalOptions, currentFolder } = useApp();

  const presence = usePresence(isComposerModalOpen);
  const [snapshot, setSnapshot] = useState({ open: isComposerModalOpen, session: 0, options: composerModalOptions, folder: currentFolder });
  if (snapshot.open !== isComposerModalOpen || (isComposerModalOpen && (snapshot.options !== composerModalOptions || snapshot.folder !== currentFolder))) {
    setSnapshot({
      open: isComposerModalOpen,
      session: snapshot.session + (isComposerModalOpen && !snapshot.open ? 1 : 0),
      options: isComposerModalOpen ? composerModalOptions : snapshot.options,
      folder: isComposerModalOpen ? currentFolder : snapshot.folder,
    });
  }
  if (!presence.isPresent) return null;
  const options = snapshot.options;

  const itemType = options?.type || 'task';
  const title = itemType === 'task' ? 'Новая задача' : itemType === 'article' ? 'Новая статья' : 'Новая заметка';
  const iconName: IconName = itemType === 'task' ? 'entity.task' : itemType === 'article' ? 'entity.article' : 'entity.note';

  return (
    <BaseModal
      presence={presence}
      isOpen={isComposerModalOpen}
      onClose={closeComposerModal}
      title={
        <div className="flex items-center gap-2">
          <Icon name={iconName} size="md" tone="accent" />
          <span className="text-sm font-medium text-fg-soft">{title}</span>
        </div>
      }
      maxWidth="max-w-2xl"
      containerClassName="!overflow-visible"
      contentClassName="px-4 pt-2 pb-3 !overflow-visible"
      closeOnBackdropClick={true}
    >
      <Composer
        key={`${snapshot.session}:${options?.folder || snapshot.folder}`}
        isModal
        isActive={isComposerModalOpen}
        initialType={options?.type}
        initialStatus={options?.status}
        initialFolder={options?.folder}
        initialDueDate={options?.dueDate}
        initialReminder={options?.reminder}
        onComplete={closeComposerModal}
        onCancel={closeComposerModal}
      />
    </BaseModal>
  );
};
