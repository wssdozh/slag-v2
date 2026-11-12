// Modal shell for the log viewer: opens from the global hotkey and closes above the app.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { LogViewer } from './LogViewer';
import { BaseModal } from '../Modals/BaseModal';

export const LogModal: React.FC = () => {
  const { isLogViewerOpen, setIsLogViewerOpen } = useApp();

  return (
    <BaseModal
      isOpen={isLogViewerOpen}
      onClose={() => setIsLogViewerOpen(false)}
      hideHeader
      maxWidth="max-w-4xl"
      maxHeight="h-[82vh] max-h-[800px]"
      contentClassName="h-full flex flex-col"
      containerClassName="p-0 border border-white/[0.08]"
    >
      <LogViewer variant="modal" onClose={() => setIsLogViewerOpen(false)} />
    </BaseModal>
  );
};
