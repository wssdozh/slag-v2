import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { isDesktopApp, minimizeWindow, toggleMaximizeWindow, closeWindow } from '../../lib/platform/windowControls';

// ponytail: fixed top-right 34px controls matching dockview tab row. ceiling: windows 11 snap layout preview. upgrade: tauri-plugin-frame if native snap menu hover required
export const WindowControls: React.FC = () => {
  if (!isDesktopApp()) return null;

  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="fixed top-0 right-0 h-[34px] z-50 flex items-center pr-1 pl-2 select-none bg-panel border-b border-white/[0.06] pointer-events-auto"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          minimizeWindow();
        }}
        title="Свернуть"
        className="w-8 h-[26px] rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleMaximizeWindow();
        }}
        title="Развернуть"
        className="w-8 h-[26px] rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
      >
        <Square className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeWindow();
        }}
        title="Закрыть"
        className="w-8 h-[26px] rounded flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
