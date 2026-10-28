import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Composer } from '../Feed/Composer';
import { Sparkles, X } from 'lucide-react';
import { hideQuickComposer, listenQuickComposerFocus, notifyDataChanged } from '../../lib/windowControls';

export const QuickComposerWindow: React.FC = () => {
  const { currentFolder } = useApp();
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
      setSessionKey(Date.now());
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
    <div className="w-screen h-screen bg-transparent select-none overflow-hidden flex flex-col">
      <div className="w-full h-full bg-[#121215] border border-white/[0.12] rounded-2xl flex flex-col overflow-hidden">
        {/* Island Header */}
        <div
          data-tauri-drag-region
          className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/[0.04] cursor-move select-none shrink-0"
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-sm font-semibold text-zinc-100">Быстрая мысль</span>
            <span className="text-[11px] font-mono text-zinc-400 bg-white/[0.05] border border-white/[0.06] rounded px-2 py-0.5">
              {currentFolder || 'Входящие'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-mono pointer-events-none">Esc — закрыть</span>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Закрыть (Esc)"
              aria-label="Закрыть окно"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Island Body: Full Composer capabilities */}
        <div className="px-4 pt-2 pb-3 !overflow-visible flex-1 flex flex-col min-h-0">
          <Composer
            key={sessionKey}
            isModal
            initialFolder={currentFolder || 'Входящие'}
            onComplete={handleComplete}
            onCancel={handleClose}
          />
        </div>
      </div>
    </div>
  );
};
