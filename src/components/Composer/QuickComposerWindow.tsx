// The transparent quick-capture window: hosts the composer and resets between invocations.
import React, { useState, useEffect, useCallback } from 'react';
import { Composer } from '../Feed/Composer';
import { Icon } from '../UI/icons/Icon';
import { hideQuickComposer, listenQuickComposerFocus, notifyDataChanged } from '../../lib/platform/windowControls';

export const QuickComposerWindow: React.FC = () => {
  const [sessionKey, setSessionKey] = useState<number>(() => Date.now());

  // Enable complete window transparency
  useEffect(() => {
    document.documentElement.classList.add('window-transparent');
    document.body.classList.add('window-transparent');
    const root = document.getElementById('root');
    if (root) root.classList.add('window-transparent');

    return () => {
      document.documentElement.classList.remove('window-transparent');
      document.body.classList.remove('window-transparent');
      if (root) root.classList.remove('window-transparent');
    };
  }, []);

  const handleClose = useCallback(() => {
    void hideQuickComposer();
  }, []);

  const handleComplete = useCallback(() => {
    void notifyDataChanged();
    void hideQuickComposer();
    // Prime fresh session for next invocation
    setSessionKey(Date.now());
  }, []);

  // Listen for global shortcut focus event from desktop Rust harness
  useEffect(() => {
    const unlisten = listenQuickComposerFocus(() => {
      // Trigger focus event so Composer immediately picks up any latest draft from storage/main window
      window.dispatchEvent(new Event('focus'));
    });
    return unlisten;
  }, []);

  // Native zero-overhead Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="w-screen h-screen bg-transparent select-none overflow-visible flex flex-col items-center justify-center p-2 cursor-default"
    >
      <div className="w-full bg-surface border border-tint-12 rounded-2xl flex flex-col overflow-visible shadow-2xl relative">
        {/* Island Header */}
        <div
          data-tauri-drag-region
          className="px-3.5 pt-2.5 pb-2 flex items-center justify-between border-b border-tint-4 cursor-move select-none shrink-0"
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <Icon name="system.ai" size="md" className="shrink-0" />
            <span className="text-sm font-semibold text-fg-primary">Быстрая мысль</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-2xs text-fg-muted font-mono pointer-events-none">Esc — закрыть</span>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg text-fg-secondary hover:text-fg-soft hover:bg-tint-6 transition-colors cursor-pointer"
              title="Закрыть (Esc)"
              aria-label="Закрыть окно"
            >
              <Icon name="action.close" size="sm" tone="inherit" />
            </button>
          </div>
        </div>

        {/* Island Body: Full Composer capabilities */}
        <div className="px-3 pt-2 pb-2.5 !overflow-visible flex flex-col min-h-0">
          <Composer
            key={sessionKey}
            isModal
            initialFolder="Входящие"
            onComplete={handleComplete}
            onCancel={handleClose}
          />
        </div>
      </div>
    </div>
  );
};
