import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { Button } from '../UI/Button';
import { MobileScreenHeader } from './MobileScreenHeader';
import { FolderProfile } from '../FolderProfile/FolderProfile';
import { ArrowUpDown, Plus } from 'lucide-react';

/** Phone container: the profile fills the screen, editing happens in place. */
export const MobileFolderInfoView: React.FC = () => {
  const {
    currentFolder,
    setMobileFolderInfoOpen,
    setActiveTagFilter,
    openNewNote,
    setIsTriageModalOpen,
  } = useApp();

  const isInbox = currentFolder === DEFAULT_INBOX_FOLDER;

  const actions = (
    <>
      <Button
        variant="secondary"
        size="md"
        className="flex-1"
        icon={<Plus className="w-3.5 h-3.5" />}
        onClick={() => {
          setMobileFolderInfoOpen(false);
          openNewNote(currentFolder);
        }}
      >
        Запись
      </Button>
      {isInbox && (
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          icon={<ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />}
          onClick={() => {
            setMobileFolderInfoOpen(false);
            setIsTriageModalOpen(true);
          }}
        >
          Сортировка
        </Button>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col text-fg-primary select-none overflow-hidden">
      <MobileScreenHeader onBack={() => setMobileFolderInfoOpen(false)} backLabel="Назад" />

      <div className="flex-1 overflow-y-auto pb-16">
        <FolderProfile
          folderPath={currentFolder}
          variant="screen"
          actions={actions}
          onSelectTag={tag => {
            setActiveTagFilter(tag);
            setMobileFolderInfoOpen(false);
          }}
        />
      </div>
    </div>
  );
};
