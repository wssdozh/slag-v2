// Dock-width container for the folder profile, bound to the current folder.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { FolderProfile } from '../FolderProfile/FolderProfile';

/** Dock panel container: the same profile, laid out for a narrow column. */
export const FolderInfoPanel: React.FC = () => {
  const { currentFolder } = useApp();

  return (
    <aside className="w-full h-full flex flex-col bg-panel select-none overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <FolderProfile folderPath={currentFolder || DEFAULT_INBOX_FOLDER} variant="dock" />
      </div>
    </aside>
  );
};
