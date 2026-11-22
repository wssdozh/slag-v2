// Desktop-only minimize/maximize/close cluster pinned to the window's top-right corner.
import React from 'react';
import { Icon } from './icons/Icon';
import { isDesktopApp, minimizeWindow, toggleMaximizeWindow, closeWindow } from '../../lib/platform/windowControls';

// ponytail: fixed top-right 34px controls matching dockview tab row. ceiling: windows 11 snap layout preview. upgrade: tauri-plugin-frame if native snap menu hover required
export const WindowControls: React.FC<{ ref?: React.Ref<HTMLDivElement> }> = ({ ref }) => {
  if (!isDesktopApp()) return null;

  return (
    <div
      ref={ref}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="fixed top-0 right-0 h-[34px] z-50 flex items-center pr-1 pl-2 select-none bg-panel border-b border-tint-6 pointer-events-auto"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          minimizeWindow();
        }}
        title="Свернуть"
        className="w-8 h-[26px] rounded flex items-center justify-center text-fg-secondary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
      >
        <Icon name="action.decrement" size="sm" tone="inherit" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleMaximizeWindow();
        }}
        title="Развернуть"
        className="w-8 h-[26px] rounded flex items-center justify-center text-fg-secondary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
      >
        <Icon name="system.windowMaximize" size="md" tone="inherit" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeWindow();
        }}
        title="Закрыть"
        className="w-8 h-[26px] rounded flex items-center justify-center text-fg-secondary hover:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
      >
        <Icon name="action.close" size="sm" tone="inherit" />
      </button>
    </div>
  );
};
