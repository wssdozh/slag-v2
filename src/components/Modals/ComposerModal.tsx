import React, { useState } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Composer } from '../Feed/Composer';
import { CheckSquare, StickyNote, FileText } from 'lucide-react';

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
  const Icon = itemType === 'task' ? CheckSquare : itemType === 'article' ? FileText : StickyNote;

  return (
    <BaseModal
      presence={presence}
      isOpen={isComposerModalOpen}
      onClose={closeComposerModal}
      title={
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-200">{title}</span>
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
