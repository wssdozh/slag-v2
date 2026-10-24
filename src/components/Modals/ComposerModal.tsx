import React from 'react';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Composer } from '../Feed/Composer';
import { CheckSquare, StickyNote, FileText } from 'lucide-react';

export const ComposerModal: React.FC = () => {
  const { isComposerModalOpen, closeComposerModal, composerModalOptions } = useApp();

  if (!isComposerModalOpen) return null;

  const itemType = composerModalOptions?.type || 'task';
  const title = itemType === 'task' ? 'Новая задача' : itemType === 'article' ? 'Новая статья' : 'Новая заметка';
  const Icon = itemType === 'task' ? CheckSquare : itemType === 'article' ? FileText : StickyNote;

  return (
    <BaseModal
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
      closeOnEsc={true}
    >
      <Composer
        isModal
        initialType={composerModalOptions?.type}
        initialStatus={composerModalOptions?.status}
        initialFolder={composerModalOptions?.folder}
        initialDueDate={composerModalOptions?.dueDate}
        initialReminder={composerModalOptions?.reminder}
        onComplete={closeComposerModal}
        onCancel={closeComposerModal}
      />
    </BaseModal>
  );
};
