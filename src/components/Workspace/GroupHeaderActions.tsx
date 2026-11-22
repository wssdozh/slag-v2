// The `+` menu on a dock group: spawns another panel inside that same group.
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
import { Icon } from '../UI/icons/Icon';
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
        className="w-6 h-6 rounded-md text-fg-muted hover:text-fg-soft flex items-center justify-center transition-colors cursor-pointer"
        title="Добавить вкладку в эту группу"
      >
        <Icon name="action.add" size="sm" tone="inherit" />
      </button>

      {isPresent && (
        <div
          ref={menuRef}
          data-motion-state={phase}
          onTransitionEnd={onTransitionEnd}
          inert={!isOpen}
          className="absolute left-0 top-full mt-1 w-44 rounded-lg bg-surface-elevated border border-tint-12 shadow-2xl py-1 z-50 motion-popover"
        >
          <div className="px-2.5 py-1 text-3xs font-mono text-fg-muted uppercase tracking-wider border-b border-tint-4">
            Добавить вкладку
          </div>
          {PANELS_TO_ADD.map(item => {
            return (
              <button
                key={item.id}
                onClick={() => addPanel(item.id, item.title)}
                className="w-full px-2.5 py-1.5 text-left text-xs flex items-center gap-2 text-fg-tertiary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
              >
                <Icon name={item.icon} size="sm" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
