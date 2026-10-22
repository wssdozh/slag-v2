import React, { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { LogViewer } from './LogViewer';

export const LogModal: React.FC = () => {
  const { isLogViewerOpen, setIsLogViewerOpen } = useApp();
  const overlayRef = useRef<HTMLDivElement | null>(null);

  if (!isLogViewerOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      setIsLogViewerOpen(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      data-testid="log-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 sm:p-6 select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-4xl h-[82vh] max-h-[800px] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
        <LogViewer variant="modal" onClose={() => setIsLogViewerOpen(false)} />
      </div>
    </div>
  );
};
