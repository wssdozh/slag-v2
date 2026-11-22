// Keeps one ephemeral filter addressed to the current visible content panel.
import { useCallback, useEffect, useState } from 'react';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import type { TaskQuickFilterId } from '../../lib/tasks/taskQuickFilter';
import { getPanelComponent } from './dockPanelUtils';

function isVisibleContent(panel: IDockviewPanel | undefined): panel is IDockviewPanel {
  // Dockview emits active-panel change before refreshing the panel's own visibility flag.
  if (!panel || panel.group.activePanel !== panel || !panel.group.api.isVisible) return false;
  const component = getPanelComponent(panel);
  return component === 'feed' || component === 'calendar' || component === 'kanban';
}

export function useWorkspaceTaskFilter(api: DockviewApi | null, scope: string) {
  const [panelId, setPanelId] = useState<string>();
  const [selection, setSelection] = useState<{ panelId: string; scope: string; id: TaskQuickFilterId }>();

  useEffect(() => {
    if (!api) return;
    let lastContent: string | undefined;
    const sync = () => {
      const active = api.activePanel;
      if (isVisibleContent(active)) lastContent = active.id;
      const last = lastContent ? api.getPanel(lastContent) : undefined;
      const visible = isVisibleContent(last) ? [last] : api.panels.filter(isVisibleContent);
      const next = visible.length === 1 ? visible[0].id : undefined;
      setPanelId(next);
      setSelection(current => current?.panelId === next ? current : undefined);
    };
    let disposed = false;
    queueMicrotask(() => { if (!disposed) sync(); });
    const listeners = [api.onDidActivePanelChange(sync), api.onDidRemovePanel(sync),
      api.onDidAddPanel(sync), api.onDidMovePanel(sync), api.onDidMaximizedGroupChange(sync)];
    return () => {
      disposed = true;
      listeners.forEach(listener => listener.dispose());
    };
  }, [api]);

  // Drop stale selection even if we later return to a previous folder/vault.
  if (selection && selection.scope !== scope) setSelection(undefined);
  const activeFilter = selection?.scope === scope && selection.panelId === panelId ? selection.id : undefined;
  const toggleFilter = useCallback((id: TaskQuickFilterId) => {
    if (!panelId) return;
    setSelection(current => current?.panelId === panelId && current.scope === scope && current.id === id
      ? undefined : { panelId, scope, id });
  }, [panelId, scope]);
  return { panelId, activeFilter, toggleFilter };
}
