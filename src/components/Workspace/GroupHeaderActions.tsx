import React, { useState, useEffect, useRef } from 'react';
import type {
  IDockviewHeaderActionsProps,
} from 'dockview-react';
import { usePresence } from '../../hooks/ui/usePresence';
import {
  PANELS_TO_ADD,
  getPanelMinWidth,
  getPanelMaxWidth,
  syncAllGroupConstraints,
  wsLog,
} from './dockPanelUtils';
import { Plus } from 'lucide-react';

export const GroupHeaderActions: React.FC<IDockviewHeaderActionsProps> = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const { ref: menuRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, menuRef]);

  const addPanel = (panelId: string, title: string) => {
    setIsOpen(false);
    const containerApi = props.containerApi;
    if (!containerApi) return;

    seqRef.current += 1;
    const uniqueId = `panel_${panelId}_g${seqRef.current}_${props.group?.id || 'main'}`;
    wsLog.info(`Added panel tab to group: [${panelId}] "${title}"`, { uniqueId });

    const minW = getPanelMinWidth(panelId);
    const maxW = getPanelMaxWidth(panelId);

    try {
      containerApi.addPanel({
        id: uniqueId,
        component: panelId,
        title,
        minimumWidth: minW,
        maximumWidth: maxW,
        position: { referenceGroup: props.group },
      });
    } catch {
      containerApi.addPanel({
        id: uniqueId,
        component: panelId,
        title,
        minimumWidth: minW,
        maximumWidth: maxW,
      });
    }
    syncAllGroupConstraints(containerApi);
  };

  return (
    <div className="relative flex items-center h-full px-0.5 gap-0.5">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
        title="Добавить вкладку в эту группу"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {isPresent && (
        <div
          ref={menuRef}
          data-motion-state={phase}
          onTransitionEnd={onTransitionEnd}
          inert={!isOpen}
          className="absolute left-0 top-full mt-1 w-44 rounded-lg bg-surface-elevated border border-white/[0.12] shadow-2xl py-1 z-50 motion-popover"
        >
          <div className="px-2.5 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-white/[0.04]">
            Добавить вкладку
          </div>
          {PANELS_TO_ADD.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => addPanel(item.id, item.title)}
                className="w-full px-2.5 py-1.5 text-left text-xs flex items-center gap-2 text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 text-zinc-400" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
