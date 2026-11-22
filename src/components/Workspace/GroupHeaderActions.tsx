// The `+` menu on a dock group: spawns another panel inside that same group.
import React, { useState, useRef } from 'react';
import type {
  IDockviewHeaderActionsProps,
} from 'dockview-react';
import { MenuDropdown } from '../UI/MenuDropdown';
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
  const seqRef = useRef(0);

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
    <MenuDropdown
      className="h-full px-0.5"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      minWidth={176}
      trigger={
        <button
          type="button"
          aria-expanded={isOpen}
          className="w-6 h-6 rounded-md text-fg-muted hover:text-fg-soft flex items-center justify-center transition-colors cursor-pointer"
          title="Добавить вкладку в эту группу"
        >
          <Icon name="action.add" size="sm" tone="inherit" />
        </button>
      }
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
    </MenuDropdown>
  );
};
